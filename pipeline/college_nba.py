"""
college_nba.py  -  NBA draft classes 2008-2026 and the college-to-NBA translation data.

RUN IT (update_college.py also calls it every night; it is cheap after the first run):
    .venv/bin/python pipeline/college_nba.py

SOURCES (no Basketball-Reference data anywhere in here)
  * Draft picks: NBA.com DraftHistory (stats.nba.com via nba_api), cached in pipeline/cache/college/nba/draft_history.csv
    and refreshed once a day.
  * NBA outcomes: NBA.com regular-season stats we already publish, read from the career index files that
    pipeline/build_indexes.py writes (data/careers/totals/p_NN.json and data/careers/pergame/p_NN.json).
    Nothing here re-downloads NBA seasons.
  * College stats: Bart Torvik T-Rank player files already in data/college/<season>/players.json.

MATCHING a pick to a college player: same normalized name, final college season ending in the draft year
(or up to 2 years before, for players who sat out), preferring the row whose Torvik NBA_PICK equals the pick.
Picks from non-D-I organizations (international clubs, G League, high school) have no college link.

OUTCOME LABELS (plain NBA.com counting stats, defined on every page):
  starter  = 2+ seasons with 2,000+ regular-season minutes
  rotation = 5,000+ career regular-season minutes (a "hit")
  played   = at least 1 NBA game
  none     = no NBA regular-season games yet

OUTPUT
  data/draft/history/index.json     classes list, hit rates by pick range, definitions
  data/draft/history/<year>.json    every pick of one class with college line and NBA outcome
  data/draft/translation.json       one row per matched drafted D-I player: final college season + NBA rookie/career
"""
import json, re, sys, time
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import college_fetch as cf

ROOT = cf.ROOT
CACHE = ROOT / "pipeline" / "cache" / "college" / "nba"
OUT = ROOT / "data" / "draft"
FIRST, LAST = 2008, 2026
SHARDS = 40
RANGES = [(1, 3), (4, 10), (11, 20), (21, 30), (31, 45), (46, 60)]
MATURE_LAST = 2020        # classes with 6+ NBA seasons played (through 2025-26) count in the hit-rate table
COL_KEYS = ["PTS", "REB", "AST", "STL", "BLK", "TOV", "MIN_PCT", "FG3_PCT", "FG3A_100", "FT_PCT", "TS", "USG", "BPM", "OBPM", "DBPM",
            "ORTG", "AST_PCT", "TOV_PCT", "ORB_PCT", "DRB_PCT", "STL_PCT", "BLK_PCT", "FTR", "AGE", "HT_IN"]


def draft_history():
    path = CACHE / "draft_history.csv"
    if not path.exists() or time.time() - path.stat().st_mtime > 20 * 3600:
        from nba_api.stats.endpoints import drafthistory
        CACHE.mkdir(parents=True, exist_ok=True)
        for a in range(3):
            try:
                drafthistory.DraftHistory(league_id="00", timeout=60).get_data_frames()[0].to_csv(path, index=False)
                break
            except Exception as e:                      # keep yesterday's copy if NBA.com is slow
                print("DraftHistory retry", a + 1, e)
                time.sleep(5)
    d = pd.read_csv(path)
    return d[d.SEASON.between(FIRST, LAST)].sort_values(["SEASON", "OVERALL_PICK"])


def nba_seasons():
    """PLAYER_ID -> list of season dicts (NBA.com totals + PIE/TS/USG from the per-game index)."""
    out = {}
    for i in range(SHARDS):
        tot = cf.expand(json.loads((ROOT / "data" / "careers" / "totals" / f"p_{i:02d}.json").read_text()))
        pg = {(r["PLAYER_ID"], r["SEASON"]): r for r in cf.expand(json.loads((ROOT / "data" / "careers" / "pergame" / f"p_{i:02d}.json").read_text()))}
        for r in tot:
            g = pg.get((r["PLAYER_ID"], r["SEASON"]), {})
            r["TS_PCT"], r["USG_PCT"], r["PIE"] = g.get("TS_PCT"), g.get("USG_PCT"), g.get("PIE")
            out.setdefault(r["PLAYER_ID"], []).append(r)
    for v in out.values():
        v.sort(key=lambda r: r["SEASON"])
    return out


def r1(x, nd=1):
    return None if x is None or pd.isna(x) else round(float(x), nd)


def line(rows):
    """Per-game summary of one or more NBA.com totals rows."""
    if not rows:
        return None
    s = lambda k: sum((r.get(k) or 0) for r in rows)
    gp, mn = s("GP"), s("MIN")
    if not gp:
        return None
    tsa = 2 * (s("FGA") + 0.44 * s("FTA"))
    return {"gp": gp, "min": round(mn), "mpg": r1(mn / gp), "ppg": r1(s("PTS") / gp), "rpg": r1(s("REB") / gp), "apg": r1(s("AST") / gp),
            "spg": r1(s("STL") / gp), "bpg": r1(s("BLK") / gp), "ts": r1(s("PTS") / tsa, 3) if tsa else None,
            "fg3": r1(s("FG3M") / s("FG3A"), 3) if s("FG3A") >= 50 else None, "pm": round(s("PLUS_MINUS")), "pts": s("PTS")}


def outcome(nid, year, seasons):
    rows = [r for r in seasons.get(nid, []) if int(r["SEASON"][:4]) >= year]
    if not rows:
        return {"tier": "none", "seasons": 0}
    car = line(rows)
    first = rows[0]["SEASON"]
    rookie = line([r for r in rows if r["SEASON"] == first])
    rookie["season"] = first
    big = [r for r in rows if (r["MIN"] or 0) >= 2000]
    tier = "starter" if len(big) >= 2 else "rotation" if car["min"] >= 5000 else "played"
    best = max(rows, key=lambda r: (r["PTS"] or 0) / max(r["GP"] or 1, 1) if (r["GP"] or 0) >= 40 else -1)
    q = [r for r in rows if (r["MIN"] or 0) >= 1000 and r.get("PIE") is not None]
    return {"tier": tier, "seasons": len(rows), "first": first, "last": rows[-1]["SEASON"], "career": car, "rookie": rookie,
            "best": {"season": best["SEASON"], "ppg": r1((best["PTS"] or 0) / best["GP"]), "gp": best["GP"]} if (best["GP"] or 0) >= 40 else None,
            "pie_peak": max((r["PIE"] for r in q), default=None), "big_seasons": len(big)}


def college_frame():
    frames = []
    for year in range(FIRST, LAST + 1):
        p = ROOT / "data" / "college" / cf.season_label(year) / "players.json"
        if p.exists():
            df = pd.DataFrame(cf.expand(json.loads(p.read_text())))
            df["YEAR"], df["SEASON"] = year, cf.season_label(year)
            frames.append(df)
    df = pd.concat(frames, ignore_index=True)
    df["NKEY"] = df.PLAYER_NAME.map(nkey)
    return df


def college_line(r):
    out = {"pid": int(r.PID), "season": r.SEASON, "year": int(r.YEAR), "team": r.TEAM_NAME, "team_id": r.TEAM_ID, "conf": r.CONF,
           "class": r.CLASS, "gp": None if pd.isna(r.GP) else int(r.GP)}
    for k in COL_KEYS:
        v = r.get(k)
        out[k.lower()] = None if v is None or pd.isna(v) else (round(float(v), 4) if abs(float(v)) < 2 else round(float(v), 1))
    return out


def nkey(name):
    k = cf.norm(name)
    return re.sub(r"\b([a-z]) (?=[a-z]\b)", r"\1", k)          # "d j white" -> "dj white"


def match(pick, col_by_name, col):
    """Torvik row of the player's final college season before the draft, or None."""
    last = nkey(pick.PLAYER_NAME).split(" ")[-1]
    win = col[col.YEAR.between(pick.SEASON - 2, pick.SEASON)]
    # 1) Torvik's own pick number + same last name (handles Wes/Wesley, Bam/Edrice, Cameron/Cam)
    c = win[(win.NBA_PICK == pick.OVERALL_PICK) & (win.NKEY.str.split(" ").str[-1] == last)]
    if c.PID.nunique() != 1:
        # 2) same full name in the window; skip if two different players share it
        c = col_by_name.get(nkey(pick.PLAYER_NAME))
        if c is None:
            return None
        c = c[c.YEAR.between(pick.SEASON - 2, pick.SEASON)]
        if c.PID.nunique() != 1:
            return None
    pid = c.PID.iloc[0]
    return win[win.PID == pid].sort_values("YEAR").iloc[-1]


def main():
    dh = draft_history()
    seasons = nba_seasons()
    col = college_frame()
    col_by_name = {k: g for k, g in col.groupby("NKEY")}
    years, trans, allpicks = [], [], []
    for year, g in dh.groupby("SEASON"):
        picks = []
        for p in g.itertuples():
            nid = int(p.PERSON_ID)
            o = outcome(nid, int(year), seasons)
            cr = match(p, col_by_name, col) if p.ORGANIZATION_TYPE == "College/University" else None
            pk = {"pick": int(p.OVERALL_PICK), "round": int(p.ROUND_NUMBER), "rpick": int(p.ROUND_PICK), "team": p.TEAM_ABBREVIATION,
                  "team_name": f"{p.TEAM_CITY} {p.TEAM_NAME}", "nba_id": nid, "name": p.PLAYER_NAME, "org": None if pd.isna(p.ORGANIZATION) else p.ORGANIZATION,
                  "org_type": None if pd.isna(p.ORGANIZATION_TYPE) else p.ORGANIZATION_TYPE, "in_nba_data": nid in seasons, "nba": o,
                  "college": college_line(cr) if cr is not None else None}
            picks.append(pk)
            allpicks.append((int(year), pk))
        ranked = sorted(picks, key=lambda x: -((x["nba"].get("career") or {}).get("min") or 0))
        for i, x in enumerate(ranked):
            x["redraft"] = i + 1 if (x["nba"].get("career") or {}).get("min") else None
        cnt = lambda t: sum(x["nba"]["tier"] in t for x in picks)
        summary = {"year": int(year), "picks": len(picks), "college": sum(x["org_type"] == "College/University" for x in picks),
                   "linked": sum(x["college"] is not None for x in picks), "played": cnt(("played", "rotation", "starter")),
                   "rotation": cnt(("rotation", "starter")), "starter": cnt(("starter",)),
                   "top": [{"name": x["name"], "nba_id": x["nba_id"], "pick": x["pick"], "min": x["nba"]["career"]["min"]} for x in ranked[:3] if x["redraft"]],
                   "mature": int(year) <= MATURE_LAST}
        years.append(summary)
        cf.write_json(OUT / "history" / f"{int(year)}.json", {"year": int(year), "summary": summary, "picks": picks})
        for x in picks:
            if x["college"]:
                c, o = x["college"], x["nba"]
                trans.append([x["nba_id"], x["name"], int(year), x["pick"], c["pid"], c["team"], c["team_id"], c["conf"], c["class"], c["season"]]
                             + [c[k.lower()] for k in COL_KEYS]
                             + [o["tier"], o["seasons"], (o.get("rookie") or {}).get("gp"), (o.get("rookie") or {}).get("mpg"), (o.get("rookie") or {}).get("ppg"),
                                (o.get("rookie") or {}).get("rpg"), (o.get("rookie") or {}).get("apg"), (o.get("rookie") or {}).get("ts"),
                                (o.get("career") or {}).get("gp"), (o.get("career") or {}).get("min"), (o.get("career") or {}).get("mpg"),
                                (o.get("career") or {}).get("ppg"), (o.get("career") or {}).get("rpg"), (o.get("career") or {}).get("apg"),
                                (o.get("career") or {}).get("ts"), (o.get("career") or {}).get("fg3"), (o.get("best") or {}).get("ppg"), o.get("pie_peak")])
    rates = []
    for lo, hi in RANGES:
        xs = [p for y, p in allpicks if y <= MATURE_LAST and lo <= p["pick"] <= hi]
        n = len(xs)
        f = lambda t: sum(p["nba"]["tier"] in t for p in xs)
        mins = sorted((p["nba"].get("career") or {}).get("min") or 0 for p in xs)
        rates.append({"range": f"{lo}-{hi}", "n": n, "played": f(("played", "rotation", "starter")), "rotation": f(("rotation", "starter")),
                      "starter": f(("starter",)), "median_min": mins[n // 2] if n else None})
    gen = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    last_nba = max(r["SEASON"] for v in seasons.values() for r in v)
    cf.write_json(OUT / "history" / "index.json", {
        "generated_at": gen, "first": FIRST, "last": LAST, "nba_through": last_nba, "mature_last": MATURE_LAST, "years": years, "hit_rates": rates,
        "definitions": {"starter": "2+ NBA seasons with 2,000+ regular-season minutes", "rotation": "5,000+ career NBA regular-season minutes",
                        "played": "at least 1 NBA regular-season game", "none": "no NBA regular-season games yet"},
        "sources": {"picks": "NBA.com DraftHistory", "nba": "NBA.com regular-season stats (LeagueDashPlayerStats)", "college": "Bart Torvik T-Rank"}})
    tcols = ["NBA_ID", "NAME", "DRAFT_YEAR", "PICK", "PID", "TEAM", "TEAM_ID", "CONF", "CLASS", "SEASON"] + [f"C_{k}" for k in COL_KEYS] + \
            ["TIER", "N_SEASONS", "R_GP", "R_MPG", "R_PPG", "R_RPG", "R_APG", "R_TS", "N_GP", "N_MIN", "N_MPG", "N_PPG", "N_RPG", "N_APG", "N_TS", "N_FG3", "N_BEST_PPG", "N_PIE_PEAK"]
    cf.write_json(OUT / "translation.json", {"generated_at": gen, "nba_through": last_nba, "cols": tcols, "rows": trans})
    lk = sum(y["linked"] for y in years); cl = sum(y["college"] for y in years)
    print(f"draft history {FIRST}-{LAST}: {len(allpicks)} picks, {cl} from colleges, {lk} linked to Torvik college stats; NBA stats through {last_nba}")


if __name__ == "__main__":
    main()
