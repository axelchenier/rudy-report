"""
college_draft.py  -  builds the 2027 NBA Draft section: the "Rudy Report Model Board" and one report per prospect.

RUN IT (after pipeline/college_fetch.py or update_college.py; update_college.py also calls it every night):
    .venv/bin/python pipeline/college_draft.py

WHAT IT IS (and isn't)
  * Every number on a prospect page is a real college stat from Bart Torvik's T-Rank CSVs (data/college/...),
    or an official NBA Draft Combine measurement (stats.nba.com via nba_api) for players who attended a combine.
  * The board order is a MODEL ESTIMATE made here: a logistic regression fit on 2007-08..2022-23 college seasons,
    predicting whether a player was later picked in the first round (and, separately, drafted at all), using only
    box-score/advanced stats, age, height and team strength. It is NOT a scouting ranking and not anyone else's ranking.
  * Strengths/weaknesses are rules: a stat in the top 10% (or bottom 15%) of qualified D-I players that season.
  * Comparisons are statistical similarity to the final college season of past drafted players, not projections.
  * Prospects = players on a 2026-27 D-I roster (Torvik's 2027 file) with college stats. Incoming freshmen
    have no college stats yet, so they join the board once they play (this script re-runs nightly).

OUTPUT
  data/draft/board.json                 the board + model description + back-test
  data/draft/prospects/<pid>.json       one report per board prospect
"""
import json, math, sys, time
from datetime import date, datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import college_fetch as cf

OUT = cf.ROOT / "data" / "draft"
DRAFT_YEAR = 2027
DRAFT_DAY = date(2027, 6, 24)          # approximate; the league hasn't announced the date. Used only for "age at draft".
TRAIN_LAST_YEAR = 2023                 # train on seasons ending 2008..2023 (later players may not have been drafted YET)
BOARD_SIZE = 150

# Model features: (key, label). FT_ADJ = free-throw % shrunk toward average for small samples.
FEATURES = [("AGE", "Age (Feb 1 of the season)"), ("HT_IN", "Height"), ("BPM", "Box Plus/Minus"), ("OBPM", "Offensive BPM"), ("DBPM", "Defensive BPM"),
            ("USG", "Usage"), ("TS", "True shooting %"), ("AST_PCT", "Assist rate"), ("TOV_PCT", "Turnover rate"),
            ("ORB_PCT", "Off. rebound rate"), ("DRB_PCT", "Def. rebound rate"), ("STL_PCT", "Steal rate"), ("BLK_PCT", "Block rate"),
            ("FT_ADJ", "Free-throw % (shrunk)"), ("FG3A_100", "3PA per 100 poss."), ("MIN_PCT", "Share of team minutes"),
            ("TEAM_ADJEM", "Team strength (AdjEM)")]
FKEYS = [k for k, _ in FEATURES]
SIM_KEYS = ["AGE", "HT_IN", "BPM", "OBPM", "DBPM", "USG", "TS", "AST_PCT", "TOV_PCT", "ORB_PCT", "DRB_PCT", "STL_PCT", "BLK_PCT", "FT_ADJ", "FG3A_100"]

# Percentile stats for reports: key, label, higher_is_better, format, minimum-attempts rule
PCT_STATS = [("PTS", "Points per game", True, "num", None), ("REB", "Rebounds per game", True, "num", None),
    ("AST", "Assists per game", True, "num", None), ("BPM", "Box Plus/Minus", True, "num", None),
    ("OBPM", "Offensive BPM", True, "num", None), ("DBPM", "Defensive BPM", True, "num", None),
    ("ORTG", "Offensive rating", True, "num", None), ("USG", "Usage rate", True, "pct1", None),
    ("TS", "True shooting %", True, "pct", None), ("EFG", "Effective FG%", True, "pct", None),
    ("AST_PCT", "Assist rate", True, "pct1", None), ("TOV_PCT", "Turnover rate", False, "pct1", None),
    ("AST_TOV", "Assist/turnover ratio", True, "num2", None), ("ORB_PCT", "Offensive rebound rate", True, "pct1", None),
    ("DRB_PCT", "Defensive rebound rate", True, "pct1", None), ("STL_PCT", "Steal rate", True, "pct1", None),
    ("BLK_PCT", "Block rate", True, "pct1", None), ("FT_PCT", "Free-throw %", True, "pct", ("FTA_TOT", 40)),
    ("FG3_PCT", "3-point %", True, "pct", ("FG3A_TOT", 60)), ("FG3A_100", "3-point attempts per 100 possessions", True, "num", None),
    ("RIM_PCT", "Finishing at the rim", True, "pct", ("RIM_A", 40)), ("MID_PCT", "Mid-range %", True, "pct", ("MID_A", 40)),
    ("FTR", "Free-throw rate (FTA/FGA)", True, "pct1", None), ("HT_IN", "Height", True, "ht", None)]
STRENGTH_SKIP = {"ORTG", "EFG", "OBPM", "DBPM"}   # shown in the table but not turned into strength/weakness sentences
WEAK_SKIP = {"FG3A_100", "USG", "FTR", "MID_PCT", "PTS", "REB", "AST", "ORB_PCT", "BLK_PCT", "DRB_PCT", "STL_PCT", "AST_PCT"}  # role stats, not weaknesses
QUAL = 0.4                             # qualified = 40%+ of team minutes (Torvik's default)


def load_season(year):
    s = cf.season_label(year)
    p = OUT.parent / "college" / s / "players.json"
    if not p.exists():
        return None
    pl = pd.DataFrame(cf.expand(json.loads(p.read_text())))
    if pl.empty:
        return None
    tm = pd.DataFrame(json.loads((OUT.parent / "college" / s / "teams.json").read_text()))[["TEAM_ID", "ADJEM", "TRANK"]]
    pl = pl.merge(tm.rename(columns={"ADJEM": "TEAM_ADJEM", "TRANK": "TEAM_TRANK"}), on="TEAM_ID", how="left")
    pl["YEAR"], pl["SEASON"] = year, s
    lg_ft = (pl["FT_PCT"] * pl["FTA_TOT"]).sum() / max(pl["FTA_TOT"].sum(), 1)
    pl["FT_ADJ"] = (pl["FT_PCT"].fillna(0) * pl["FTA_TOT"].fillna(0) + lg_ft * 30) / (pl["FTA_TOT"].fillna(0) + 30)
    return pl


def fit_logit(X, y, l2=1.0, iters=60):
    """Plain L2-regularised logistic regression by Newton's method (no extra dependencies)."""
    Xb = np.hstack([np.ones((len(X), 1)), X])
    w = np.zeros(Xb.shape[1])
    R = np.eye(Xb.shape[1]) * l2; R[0, 0] = 0
    for _ in range(iters):
        p = 1 / (1 + np.exp(-Xb @ w))
        g = Xb.T @ (p - y) + R @ w
        H = (Xb * (p * (1 - p))[:, None]).T @ Xb + R
        step = np.linalg.solve(H, g)
        w -= step
        if np.abs(step).max() < 1e-8:
            break
    return w


def predict(w, X):
    return 1 / (1 + np.exp(-(w[0] + X @ w[1:])))


def auc(y, s):
    order = np.argsort(s); y = np.asarray(y)[order]
    n1 = y.sum(); n0 = len(y) - n1
    ranks = np.arange(1, len(y) + 1)
    return float((ranks[y == 1].sum() - n1 * (n1 + 1) / 2) / (n1 * n0))


def fmt_val(v, kind):
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return "–"
    return {"num": f"{v:.1f}", "num2": f"{v:.2f}", "pct": f"{v * 100:.1f}%", "pct1": f"{v * 100:.1f}%",
            "ht": f"{int(v) // 12}-{int(v) % 12}"}[kind]


def ordinal(n):
    return f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"


def clean(v):
    if v is None:
        return None
    if isinstance(v, (np.floating, float)):
        return None if math.isnan(v) else round(float(v), 4)
    if isinstance(v, np.integer):
        return int(v)
    return v


def combine_measurements():
    """Official NBA Draft Combine measurements (2025 and 2026 combines) for prospects who went and returned to school."""
    try:
        from nba_api.stats.endpoints import draftcombinestats
    except ImportError:
        return {}
    out = {}
    for season in ["2025-26", "2026-27"]:
        try:
            d = draftcombinestats.DraftCombineStats(season_all_time=season, league_id="00", timeout=60).get_data_frames()[0]
        except Exception as e:  # network trouble: just skip combine data
            print(f"  combine {season}: {e}", file=sys.stderr)
            continue
        for _, r in d.iterrows():
            out[cf.norm(r["PLAYER_NAME"])] = {k: clean(r.get(k)) for k in ["SEASON", "POSITION", "HEIGHT_WO_SHOES", "HEIGHT_W_SHOES", "WEIGHT",
                "WINGSPAN", "STANDING_REACH", "HAND_LENGTH", "HAND_WIDTH", "STANDING_VERTICAL_LEAP", "MAX_VERTICAL_LEAP",
                "LANE_AGILITY_TIME", "THREE_QUARTER_SPRINT"]}
        time.sleep(1)
    return out


def main():
    meta = json.loads((cf.OUT / "meta.json").read_text())
    played = [s for s in meta["seasons"] if not s["preseason"] and s["players"]]
    stats_year = played[0]["year"]                      # latest season with player stats
    roster_year = meta["seasons"][0]["year"]            # newest season (rosters for 2026-27)

    # ---------------- history
    seasons = {y: load_season(y) for y in range(cf.FIRST_YEAR, stats_year + 1)}
    seasons = {y: d for y, d in seasons.items() if d is not None}
    hist = pd.concat(seasons.values(), ignore_index=True)
    hist["DRAFTED"] = hist["NBA_PICK"].notna().astype(int)
    hist["FIRST_RD"] = (hist["NBA_PICK"].fillna(99) <= 30).astype(int)

    # Standardise every feature within its own season (so eras with different pace/3PT rates compare fairly).
    def zscore(df, keys, base_mask):
        out = df.copy()
        for y, g in df.groupby("YEAR"):
            b = g[base_mask(g)]
            for k in keys:
                mu, sd = b[k].mean(), b[k].std() or 1
                out.loc[g.index, "Z_" + k] = ((g[k].fillna(mu) - mu) / sd).clip(-4, 4)
        return out
    base = lambda g: (g["MIN_PCT"] >= 0.1) & (g["GP"] >= 5)
    hist = zscore(hist, list(dict.fromkeys(FKEYS + SIM_KEYS)), base)
    pool = hist[base(hist)].copy()
    ZK = ["Z_" + k for k in FKEYS]

    train = pool[pool["YEAR"] <= TRAIN_LAST_YEAR]
    # back-test: fit on seasons through 2018, test on 2019..2023
    bt_tr, bt_te = train[train["YEAR"] <= 2018], train[train["YEAR"] > 2018]
    w1_bt = fit_logit(bt_tr[ZK].values, bt_tr["FIRST_RD"].values)
    s_te = predict(w1_bt, bt_te[ZK].values)
    hits, total = 0, 0
    for y, g in bt_te.assign(S=s_te).groupby("YEAR"):
        top = g.sort_values("S", ascending=False).drop_duplicates("PID").head(30)
        hits += int(top["FIRST_RD"].sum()); total += 30
    backtest = {"train": "2007-08 to 2017-18", "test": "2018-19 to 2022-23", "auc_first_round": round(auc(bt_te["FIRST_RD"].values, s_te), 3),
                "top30_hit_rate": round(hits / total, 3),
                "text": f"Fit on 2007-08 to 2017-18 and tested on 2018-19 to 2022-23: the model's top 30 college players each season included "
                        f"{hits / total * 100:.0f}% eventual first-round picks, and it ranked a random eventual first-rounder above a random "
                        f"non-first-rounder {auc(bt_te['FIRST_RD'].values, s_te) * 100:.0f}% of the time (AUC)."}
    w1 = fit_logit(train[ZK].values, train["FIRST_RD"].values)
    w2 = fit_logit(train[ZK].values, train["DRAFTED"].values)
    coefs = [{"key": k, "label": l, "weight": round(float(w1[i + 1]), 3)} for i, (k, l) in enumerate(FEATURES)]

    # ---------------- prospects
    cur = hist[hist["YEAR"] == stats_year].copy()
    roster_path = cf.CACHE / f"{roster_year}_players.csv"
    roster = None
    if roster_year != stats_year and roster_path.exists() and not cf.looks_html(roster_path.read_text(errors="ignore")[:300]):
        roster = pd.read_csv(roster_path, header=None, names=cf.PLAYER_COLS, index_col=False, low_memory=False)
    if roster is not None:
        rmap = {int(r["pid"]): r for _, r in roster.iterrows() if pd.notna(r["pid"])}
        cur = cur[cur["PID"].isin(rmap)].copy()          # still in college in 2026-27
        cur["NOW_TEAM"] = cur["PID"].map(lambda p: str(rmap[p]["team"]).strip())
        cur["NOW_CLASS"] = cur["PID"].map(lambda p: rmap[p]["cls"])
    else:
        cur["NOW_TEAM"], cur["NOW_CLASS"] = cur["TEAM_NAME"], cur["CLASS"]
    cur = cur[cur["NBA_PICK"].isna() & (cur["GP"] >= 8) & (cur["MIN_PCT"] >= 0.15)].copy()
    cur["P_FIRST"] = predict(w1, cur[ZK].values)
    cur["P_DRAFTED"] = predict(w2, cur[ZK].values)
    board = cur.sort_values("P_FIRST", ascending=False).head(BOARD_SIZE).reset_index(drop=True)

    # percentile pools (qualified players in the stats season)
    q = hist[(hist["YEAR"] == stats_year) & (hist["MIN_PCT"] >= QUAL)]

    # comparison pool: each drafted player's LAST college season (z-scored within its season)
    drafted_last = pool[pool["NBA_PICK"].notna() & (pool["YEAR"] < stats_year + (0 if roster is None else 1))]
    drafted_last = drafted_last.sort_values("YEAR").drop_duplicates("PID", keep="last")
    SZ = ["Z_" + k for k in SIM_KEYS]
    D = drafted_last[SZ].values

    combine = combine_measurements()
    (OUT / "prospects").mkdir(parents=True, exist_ok=True)
    for old in (OUT / "prospects").glob("*.json"):
        old.unlink()

    rows = []
    for i, r in board.iterrows():
        pid = int(r["PID"])
        # percentiles
        pcts = []
        for key, label, hib, kind, rule in PCT_STATS:
            v = r.get(key)
            if v is None or (isinstance(v, float) and math.isnan(v)):
                continue
            pool_q = q
            ok = True
            if rule:
                pool_q = q[q[rule[0]] >= rule[1]]
                ok = (r.get(rule[0]) or 0) >= rule[1]
            vals = pool_q[key].dropna().values
            if not len(vals):
                continue
            p = float((vals < v).mean() * 100 + (vals == v).mean() * 50)
            if not hib:
                p = 100 - p
            pcts.append({"key": key, "label": label, "value": clean(v), "shown": fmt_val(v, kind), "pctile": round(p), "enough": ok,
                         "rule": f"min {rule[1]} {'FTA' if rule[0] == 'FTA_TOT' else '3PA' if rule[0] == 'FG3A_TOT' else 'attempts'}" if rule else None,
                         "lower_better": not hib})
        strengths = [f"{x['label']}: {x['shown']} ({ordinal(x['pctile'])} percentile)" for x in sorted(pcts, key=lambda x: -x["pctile"])
                     if x["pctile"] >= 90 and x["enough"] and x["key"] not in STRENGTH_SKIP][:6]
        weaknesses = [f"{x['label']}: {x['shown']} ({ordinal(x['pctile'])} percentile{', lower is better' if x['lower_better'] else ''})"
                      for x in sorted(pcts, key=lambda x: x["pctile"]) if x["pctile"] <= 15 and x["enough"] and x["key"] not in WEAK_SKIP | STRENGTH_SKIP][:5]
        # model drivers: weight x z-score
        z = np.array([r["Z_" + k] for k in FKEYS])
        contrib = sorted([{"label": l, "value": clean(r[k]), "effect": round(float(w1[j + 1] * z[j]), 3)} for j, (k, l) in enumerate(FEATURES)],
                         key=lambda x: -abs(x["effect"]))
        # similar drafted players
        d = np.sqrt(((D - np.array([r[k] for k in SZ])) ** 2).mean(axis=1))
        comps = []
        for j in np.argsort(d)[:6]:
            c = drafted_last.iloc[j]
            comps.append({"pid": int(c["PID"]), "player": c["PLAYER_NAME"], "team": c["TEAM_NAME"], "team_slug": c["TEAM_ID"], "season": c["SEASON"],
                          "class": c["CLASS"], "age": clean(c["AGE"]), "ht": c["HT"], "pick": int(c["NBA_PICK"]), "draft_year": int(c["YEAR"]),
                          "pts": clean(c["PTS"]), "bpm": clean(c["BPM"]), "ts": clean(c["TS"]), "usg": clean(c["USG"]),
                          "similarity": round(max(0.0, 100 * (1 - float(d[j]) / 2)), 1)})
        dob = r.get("DOB")
        age_draft = None
        if isinstance(dob, str) and dob:
            try:
                b = date.fromisoformat(dob[:10]); age_draft = round((DRAFT_DAY - b).days / 365.25, 1)
            except ValueError:
                pass
        cm = combine.get(cf.norm(r["PLAYER_NAME"]))
        base_row = {"rank": i + 1, "pid": pid, "player": r["PLAYER_NAME"], "team": r["NOW_TEAM"], "team_slug": cf.slug(r["NOW_TEAM"]),
                    "stats_team": r["TEAM_NAME"], "stats_team_slug": r["TEAM_ID"], "conf": r["CONF"], "class_now": r["NOW_CLASS"],
                    "class_stats": r["CLASS"], "ht": r["HT"], "role": r["POS"], "age_draft": age_draft, "gp": int(r["GP"]),
                    "min": clean(r["MIN"]), "pts": clean(r["PTS"]), "reb": clean(r["REB"]), "ast": clean(r["AST"]), "bpm": clean(r["BPM"]),
                    "ts": clean(r["TS"]), "usg": clean(r["USG"]), "p_first": round(float(r["P_FIRST"]), 3), "p_drafted": round(float(r["P_DRAFTED"]), 3),
                    "combine": bool(cm), "top_comp": comps[0]["player"] if comps else None}
        rows.append(base_row)
        rep = {**base_row, "dob": dob, "hometown": r.get("HOMETOWN"), "stats_season": r["SEASON"],
               "season_line": {k: clean(r.get(k)) for k in ["GP", "MIN", "MIN_PCT", "PTS", "REB", "AST", "STL", "BLK", "TOV", "FG_PCT", "FG3M", "FG3A", "FG3_PCT",
                                                            "FT_PCT", "FTA_TOT", "FG3A_TOT", "TS", "EFG", "USG", "ORTG", "DRTG", "BPM", "OBPM", "DBPM", "PORPAG",
                                                            "RIM_M", "RIM_A", "RIM_PCT", "DUNKS", "TEAM_TRANK", "TEAM_ADJEM"]},
               "percentiles": pcts, "pctile_pool": f"{len(q)} qualified D-I players in {cf.season_label(stats_year)} (40%+ of team minutes)",
               "strengths": strengths, "weaknesses": weaknesses, "drivers": contrib[:6], "comps": comps, "combine_data": cm}
        cf.write_json(OUT / "prospects" / f"{pid}.json", rep)

    out = {"draft_year": DRAFT_YEAR, "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
           "stats_season": cf.season_label(stats_year), "roster_season": cf.season_label(roster_year),
           "eligible_pool": int(len(cur)), "model": {"name": "Rudy Report Model Board", "target": "Chance of being a first-round pick (and of being drafted at all)",
            "train": f"{len(train):,} D-I player-seasons, {cf.season_label(cf.FIRST_YEAR)} to {cf.season_label(TRAIN_LAST_YEAR)} ({int(train['FIRST_RD'].sum()):,} by later first-round picks)",
            "features": coefs, "backtest": backtest,
            "comps_pool": f"Final college seasons of {len(drafted_last):,} drafted players ({cf.season_label(cf.FIRST_YEAR)} to {drafted_last['SEASON'].max()})"},
           "prospects": rows}
    cf.write_json(OUT / "board.json", out)
    print(f"Draft board: {len(rows)} prospects from {len(cur)} returning players ({cf.season_label(stats_year)} stats). "
          f"Back-test top-30 hit rate {backtest['top30_hit_rate']:.0%}, AUC {backtest['auc_first_round']}. Combine matches: {sum(r['combine'] for r in rows)}.")


if __name__ == "__main__":
    main()
