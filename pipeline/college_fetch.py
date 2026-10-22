"""
college_fetch.py  -  builds the College (NCAA men's Division I) data files the website reads.

RUN IT (from the nba-college / nba-stats-app folder):
    .venv/bin/python pipeline/college_fetch.py                 # every season (2007-08 .. now)
    .venv/bin/python pipeline/college_fetch.py --seasons 2026  # one season (2026 = the 2025-26 season)
    .venv/bin/python pipeline/college_fetch.py --no-download   # rebuild from files already saved in pipeline/cache/college

SOURCES (all free and public; nothing is typed in by hand)
  1. Bart Torvik's T-Rank (barttorvik.com) bulk CSV files, which he publishes for public use:
        https://barttorvik.com/<YEAR>_team_results.csv        team ratings (AdjO, AdjD, Barthag, tempo, SOS, WAB, records)
        https://barttorvik.com/<YEAR>_fffinal.csv             team four factors + shooting splits (offense and defense)
        https://barttorvik.com/getadvstats.php?year=<YEAR>&csv=1   player stats incl. BPM (no header row; see PLAYER_COLS)
     <YEAR> = the year the season ENDS (2026 = 2025-26). We only use these CSV links (robots.txt asks bots to skip *.json).
  2. ESPN box scores, through the free `sportsdataverse` Python package (load_mbb_player_boxscore /
     load_mbb_team_boxscore). These add turnovers, fouls, starts, and home/away/neutral records.

OUTPUT
  data/college/meta.json                     seasons available + sources
  data/college/<season>/teams.json           one row per team
  data/college/<season>/players.json         one row per player (players with >= 5% of team minutes)
  data/college/careers/<pid % 100>.json      every season of every player, split into 100 small files
                                             (a player page loads only the one file it needs)

Percentages are stored as fractions (0.512 = 51.2%) like the NBA files, so the site formats them the same way.
"""
import argparse
import io
import json
import math
import re
import sys
import time
import unicodedata
from datetime import date, datetime, timezone
from pathlib import Path

import pandas as pd
import requests

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "pipeline" / "cache" / "college"
OUT = ROOT / "data" / "college"
FIRST_YEAR = 2008                 # Torvik's player files start with 2007-08
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/124 TheRudyReport/1.0 (+https://axelchenier.github.io/rudy-report/)"}

# Torvik's player CSV has no header row. Column order (67 columns), verified against the site:
PLAYER_COLS = ["name", "team", "conf", "gp", "min_pct", "ortg", "usg", "efg", "ts", "orb_pct", "drb_pct", "ast_pct", "tov_pct",
    "ftm", "fta", "ft_pct", "fg2m", "fg2a", "fg2_pct", "fg3m", "fg3a", "fg3_pct", "blk_pct", "stl_pct", "ftr", "cls", "ht", "num",
    "porpag", "adjoe", "pfr", "year", "pid", "hometown", "rec_rank", "ast_tov", "rim_m", "rim_a", "mid_m", "mid_a", "rim_pct",
    "mid_pct", "dunk_m", "dunk_a", "dunk_pct", "pick", "drtg", "adrtg", "dporpag", "stops", "bpm", "obpm", "dbpm", "gbpm", "mpg",
    "ogbpm", "dgbpm", "oreb", "dreb", "reb", "ast", "stl", "blk", "pts", "role", "fg3a_100", "dob"]

# Torvik school names that differ from ESPN's "location" names (from the sportsdataverse/hoopR crosswalk).
BART_ALIAS = {"Mississippi": "Ole Miss", "Connecticut": "UConn", "McNeese St.": "McNeese", "St. Thomas": "St. Thomas-Minnesota",
    "N.C. State": "NC State", "Nebraska Omaha": "Omaha", "Texas A&M Corpus Chris": "Texas A&M-Corpus Christi", "Seattle": "Seattle U",
    "Nicholls St.": "Nicholls", "Sam Houston St.": "Sam Houston", "Cal Baptist": "California Baptist", "Appalachian St.": "App State",
    "Miami FL": "Miami", "Illinois Chicago": "UIC", "Southeastern Louisiana": "SE Louisiana", "UMKC": "Kansas City", "Hawaii": "Hawai'i",
    "FIU": "Florida International", "Albany": "UAlbany", "LIU": "Long Island University", "Tennessee Martin": "UT Martin",
    "Penn": "Pennsylvania", "IU Indy": "IU Indianapolis", "Loyola MD": "Loyola Maryland", "Grambling St.": "Grambling",
    "USC Upstate": "South Carolina Upstate", "Louisiana Monroe": "UL Monroe"}


def season_label(year):            # 2026 -> "2025-26"
    return f"{year - 1}-{str(year)[2:]}"


def norm(s):
    """Lower-case, accent-free, punctuation-free key for matching names across sources."""
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower().replace("&", " and ")
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    s = re.sub(r"\b(state|saint)\b", "st", s)
    s = re.sub(r"\b(university|jr|sr|ii|iii|iv)\b", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()).strip("-")


def num(v, nd=None):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if math.isnan(f) or math.isinf(f):
        return None
    return round(f, nd) if nd is not None else f


def pct(v, nd=4):                   # Torvik percent (51.2) -> fraction (0.512)
    f = num(v)
    return None if f is None else round(f / 100, nd)


# ---------------------------------------------------------------- downloading
def download(year, force=False):
    CACHE.mkdir(parents=True, exist_ok=True)
    files = {f"{year}_team_results.csv": f"https://barttorvik.com/{year}_team_results.csv",
             f"{year}_fffinal.csv": f"https://barttorvik.com/{year}_fffinal.csv",
             f"{year}_players.csv": f"https://barttorvik.com/getadvstats.php?year={year}&csv=1"}
    for name, url in files.items():
        path = CACHE / name
        if path.exists() and path.stat().st_size > 1000 and not looks_html(path.read_text(errors="ignore")[:300]) and not force:
            continue
        for attempt in range(3):
            r = requests.get(url, headers=UA, timeout=60)
            if r.ok and not looks_html(r.text[:300]):
                path.write_text(r.text)
                break
            # barttorvik answers bursts with a "Verifying your browser" HTML page; wait and try again.
            print(f"  {name}: got an HTML page instead of CSV (attempt {attempt + 1}), waiting…", file=sys.stderr)
            time.sleep(20 * (attempt + 1))
        time.sleep(3)                                   # be polite: one request every few seconds


def looks_html(text):
    return text.lstrip().lower().startswith(("<!doctype", "<html"))


def read_csv(path, **kw):
    if not path.exists() or looks_html(path.read_text(errors="ignore")[:300]):
        return None
    return pd.read_csv(path, index_col=False, **kw)


# ---------------------------------------------------------------- ESPN box scores (sportsdataverse)
def espn_box(year):
    """Season aggregates from ESPN box scores: per player (TOV, PF, starts) and per team (records by site, PPG)."""
    cache_p, cache_t = CACHE / f"{year}_espn_players.csv", CACHE / f"{year}_espn_teams.csv"
    if cache_p.exists() and cache_t.exists():
        return pd.read_csv(cache_p), pd.read_csv(cache_t)
    try:
        import sportsdataverse.mbb as mbb
        pb = mbb.load_mbb_player_boxscore(seasons=[year], return_as_pandas=True)
        tb = mbb.load_mbb_team_boxscore(seasons=[year], return_as_pandas=True)
    except Exception as e:                                         # noqa: BLE001
        print(f"  ESPN box scores unavailable for {year}: {e}", file=sys.stderr)
        return None, None
    if pb is None or not len(pb) or tb is None or not len(tb):
        return None, None
    pb = pb[pb["season_type"] == 2]                                # 2 = regular season, 3 = postseason. Torvik counts both;
    tb = tb[tb["season_type"].isin([2, 3])]                        # we use regular season for TOV/PF rates (ratios are similar).
    pb = pb[(pb["did_not_play"] != True) & pb["minutes"].fillna(0).gt(0)]  # noqa: E712
    for c in ["turnovers", "fouls", "minutes"]:
        pb[c] = pd.to_numeric(pb[c], errors="coerce")
    players = pb.groupby(["athlete_id", "athlete_display_name", "team_id", "team_location"], as_index=False).agg(
        espn_gp=("game_id", "nunique"), espn_gs=("starter", "sum"), tov=("turnovers", "sum"), pf=("fouls", "sum"), espn_min=("minutes", "sum"))
    tb = tb.copy()
    tb["win"] = tb["team_score"] > tb["opponent_team_score"]
    rows = []
    for (tid, loc), g in tb.groupby(["team_id", "team_location"]):
        d = {"espn_id": int(tid), "espn_location": loc, "espn_name": g["team_display_name"].iloc[0], "gp": len(g),
             "ppg": g["team_score"].mean(), "opp_ppg": g["opponent_team_score"].mean()}
        for site in ["home", "away"]:
            s = g[g["team_home_away"] == site]
            d[f"{site}_w"], d[f"{site}_l"] = int(s["win"].sum()), int((~s["win"]).sum())
        rows.append(d)
    teams = pd.DataFrame(rows)
    players.to_csv(cache_p, index=False)
    teams.to_csv(cache_t, index=False)
    return players, teams


# ---------------------------------------------------------------- building one season
def build_season(year):
    tr = read_csv(CACHE / f"{year}_team_results.csv")
    ff = read_csv(CACHE / f"{year}_fffinal.csv")
    pl = None
    p_path = CACHE / f"{year}_players.csv"
    if p_path.exists() and not looks_html(p_path.read_text(errors="ignore")[:300]):
        pl = pd.read_csv(p_path, header=None, names=PLAYER_COLS, index_col=False, low_memory=False)
    if tr is None:
        print(f"  {year}: no team file, skipped", file=sys.stderr)
        return None
    tr.columns = [c.strip() for c in tr.columns]
    ff_by = {}
    if ff is not None:
        ff.columns = [c.strip() for c in ff.columns]
        cols = list(ff.columns)
        for _, r in ff.iterrows():
            v = list(r.values)
            # fffinal: TeamName then pairs (value, rank) in this order.
            keys = ["EFG", "EFG_D", "FTR", "FTR_D", "ORB", "ORB_D", "TOVR", "TOVR_D", "FG3", "FG3_D", "FG2", "FG2_D", "FT", "FT_D",
                    "FG3_RATE", "FG3_RATE_D", "ARATE", "ARATE_D"]
            ff_by[str(v[0]).strip()] = {k: v[1 + 2 * i] for i, k in enumerate(keys) if 1 + 2 * i < len(cols)}

    played = tr["record"].astype(str).str.match(r"^\d+-\d+$") & (tr["record"].astype(str) != "0-0")
    preseason = not played.any()

    espn_players, espn_teams = (None, None) if preseason else espn_box(year)
    espn_team_by = {}
    if espn_teams is not None:
        for _, r in espn_teams.iterrows():
            espn_team_by.setdefault(norm(r["espn_location"]), r)

    teams = []
    team_key = {}                                    # torvik team name -> (slug, espn row)
    for _, r in tr.iterrows():
        name = str(r["team"]).strip()
        w, l = (int(x) for x in str(r["record"]).split("-")) if re.match(r"^\d+-\d+$", str(r["record"])) else (None, None)
        e = espn_team_by.get(norm(BART_ALIAS.get(name, name)))
        f = ff_by.get(name, {})
        adjoe, adjde = num(r.get("adjoe"), 2), num(r.get("adjde"), 2)
        row = {
            "TEAM_ID": slug(name), "TEAM_NAME": name, "CONF": r.get("conf"), "TRANK": int(r["rank"]),
            "GP": (w + l) if w is not None else 0, "W": w, "L": l, "W_PCT": round(w / (w + l), 3) if w is not None and (w + l) else None,
            "CONF_REC": r.get("Con Rec."), "ADJOE": adjoe, "ADJDE": adjde,
            "ADJEM": round(adjoe - adjde, 2) if adjoe is not None and adjde is not None else None,
            "BARTHAG": num(r.get("barthag"), 4), "ADJT": num(r.get("adjt"), 1), "SOS": num(r.get("sos"), 4),
            "NCSOS": num(r.get("ncsos"), 4), "WAB": num(r.get("WAB"), 2),
            "PROJ_W": num(r.get("proj. W"), 1), "PROJ_L": num(r.get("Proj. L"), 1),
            "EFG": pct(f.get("EFG")), "EFG_D": pct(f.get("EFG_D")), "FTR": pct(f.get("FTR")), "FTR_D": pct(f.get("FTR_D")),
            "ORB": pct(f.get("ORB")), "ORB_D": pct(f.get("ORB_D")), "TOVR": pct(f.get("TOVR")), "TOVR_D": pct(f.get("TOVR_D")),
            "FG3_PCT": pct(f.get("FG3")), "FG3_PCT_D": pct(f.get("FG3_D")), "FG2_PCT": pct(f.get("FG2")), "FG2_PCT_D": pct(f.get("FG2_D")),
            "FT_PCT": pct(f.get("FT")), "FG3_RATE": pct(f.get("FG3_RATE")), "FG3_RATE_D": pct(f.get("FG3_RATE_D")),
            "ARATE": pct(f.get("ARATE")), "ARATE_D": pct(f.get("ARATE_D")),
        }
        if preseason:          # before any games, Torvik's file has 0-0 records and zero SOS/WAB: show them as blank
            row.update({"W": None, "L": None, "W_PCT": None, "CONF_REC": None, "SOS": None, "NCSOS": None, "WAB": None})
        if e is not None:
            row.update({"ESPN_ID": int(e["espn_id"]), "PTS": num(e["ppg"], 1), "OPP_PTS": num(e["opp_ppg"], 1),
                        "MARGIN": num(e["ppg"] - e["opp_ppg"], 1), "HOME_W": int(e["home_w"]), "HOME_L": int(e["home_l"]),
                        "AWAY_W": int(e["away_w"]), "AWAY_L": int(e["away_l"])})
            # ESPN has no separate "neutral" flag in this file: neutral-site games are listed as home/away.
        teams.append(row)
        team_key[name] = (row["TEAM_ID"], e)

    players = []
    if pl is not None and not preseason:
        espn_by = {}
        if espn_players is not None:
            for _, r in espn_players.iterrows():
                espn_by[(norm(r["team_location"]), norm(r["athlete_display_name"]))] = r
        season_mid = date(year, 2, 1)
        for _, r in pl.iterrows():
            if num(r["gp"]) in (None, 0) or (num(r["min_pct"]) or 0) < 5:
                continue
            tname = str(r["team"]).strip()
            gp = int(num(r["gp"]))
            dob = parse_dob(r["dob"])
            ht_in = parse_ht(r["ht"])
            e = espn_by.get((norm(BART_ALIAS.get(tname, tname)), norm(r["name"])))
            ast_g, ast_tov = num(r["ast"]), num(r["ast_tov"])
            tov_g = num(e["tov"] / e["espn_gp"], 2) if e is not None and e["espn_gp"] else (
                round(ast_g / ast_tov, 2) if ast_g and ast_tov else None)
            fgm = (num(r["fg2m"]) or 0) + (num(r["fg3m"]) or 0)
            fga = (num(r["fg2a"]) or 0) + (num(r["fg3a"]) or 0)
            p = {
                "PID": int(r["pid"]), "PLAYER_NAME": str(r["name"]).strip(), "TEAM_ID": slug(tname), "TEAM_NAME": tname,
                "CONF": r["conf"], "CLASS": none_if_nan(r["cls"]), "HT": none_if_nan(r["ht"]), "HT_IN": ht_in,
                "POS": none_if_nan(r["role"]), "NUM": none_if_nan(r["num"]), "HOMETOWN": none_if_nan(r["hometown"]),
                "DOB": dob.isoformat() if dob else None,
                "AGE": round((season_mid - dob).days / 365.25, 1) if dob else None,
                "GP": gp, "MIN": num(r["mpg"], 1), "MIN_PCT": pct(r["min_pct"], 3),
                "PTS": num(r["pts"], 1), "REB": num(r["reb"], 1), "OREB": num(r["oreb"], 1), "DREB": num(r["dreb"], 1),
                "AST": num(r["ast"], 1), "STL": num(r["stl"], 1), "BLK": num(r["blk"], 1), "TOV": num(tov_g, 1),
                "PF": num(e["pf"] / e["espn_gp"], 1) if e is not None and e["espn_gp"] else None,
                "GS": int(e["espn_gs"]) if e is not None else None,
                "FGM": round(fgm / gp, 1), "FGA": round(fga / gp, 1), "FG_PCT": round(fgm / fga, 3) if fga else None,
                "FG2M": per(r["fg2m"], gp), "FG2A": per(r["fg2a"], gp), "FG2_PCT": num(r["fg2_pct"], 3),
                "FG3M": per(r["fg3m"], gp), "FG3A": per(r["fg3a"], gp), "FG3_PCT": num(r["fg3_pct"], 3),
                "FTM": per(r["ftm"], gp), "FTA": per(r["fta"], gp), "FT_PCT": num(r["ft_pct"], 3),
                "FG3M_TOT": int(num(r["fg3m"]) or 0), "FG3A_TOT": int(num(r["fg3a"]) or 0), "FTA_TOT": int(num(r["fta"]) or 0),
                "FGA_TOT": int(fga), "PTS_TOT": round((num(r["pts"]) or 0) * gp),
                "ORTG": num(r["ortg"], 1), "DRTG": num(r["drtg"], 1), "USG": pct(r["usg"], 3), "EFG": pct(r["efg"], 3),
                "TS": pct(r["ts"], 3), "ORB_PCT": pct(r["orb_pct"], 3), "DRB_PCT": pct(r["drb_pct"], 3), "AST_PCT": pct(r["ast_pct"], 3),
                "TOV_PCT": pct(r["tov_pct"], 3), "BLK_PCT": pct(r["blk_pct"], 3), "STL_PCT": pct(r["stl_pct"], 3),
                "FTR": pct(r["ftr"], 3), "AST_TOV": num(r["ast_tov"], 2), "PORPAG": num(r["porpag"], 2), "DPORPAG": num(r["dporpag"], 2),
                "BPM": num(r["bpm"], 1), "OBPM": num(r["obpm"], 1), "DBPM": num(r["dbpm"], 1),
                "FG3A_100": num(r["fg3a_100"], 1), "PFR": num(r["pfr"], 1),
                "RIM_M": int(num(r["rim_m"]) or 0), "RIM_A": int(num(r["rim_a"]) or 0), "RIM_PCT": num(r["rim_pct"], 3),
                "MID_M": int(num(r["mid_m"]) or 0), "MID_A": int(num(r["mid_a"]) or 0), "MID_PCT": num(r["mid_pct"], 3),
                "DUNKS": int(num(r["dunk_m"]) or 0),
                "NBA_PICK": int(num(r["pick"])) if num(r["pick"]) else None,
                "ESPN_ID": int(e["athlete_id"]) if e is not None else None,
            }
            players.append(p)
    return {"year": year, "season": season_label(year), "teams": teams, "players": players, "preseason": preseason,
            "has_box": espn_players is not None}


def per(v, gp):
    f = num(v)
    return round(f / gp, 1) if f is not None and gp else None


def none_if_nan(v):
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    s = str(v).strip()
    return s or None


def parse_dob(v):
    s = none_if_nan(v)
    if not s:
        return None
    try:
        d = datetime.strptime(s[:10], "%Y-%m-%d").date()
        return d if 1950 < d.year < 2015 else None
    except ValueError:
        return None


def parse_ht(v):
    m = re.match(r"^(\d)-(\d{1,2})$", str(v or "").strip())
    return int(m[1]) * 12 + int(m[2]) if m else None


def columnar(rows):
    """[{a:1,b:2},…] -> {"cols":[a,b], "rows":[[1,2],…]}  (about half the file size; js/college/cdata.js expands it)."""
    cols = list(dict.fromkeys(k for r in rows for k in r))
    return {"cols": cols, "rows": [[r.get(c) for c in cols] for r in rows]}


def expand(obj):
    return [dict(zip(obj["cols"], r)) for r in obj["rows"]] if isinstance(obj, dict) and "cols" in obj else obj


def write_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, separators=(",", ":"), allow_nan=False))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seasons", help="e.g. 2026 or 2008-2026 (end years)")
    ap.add_argument("--no-download", action="store_true")
    ap.add_argument("--force", action="store_true", help="re-download files even if cached (use for the current season)")
    args = ap.parse_args()
    this_year = date.today().year + (1 if date.today().month >= 10 else 0)   # season that ends next spring
    years = list(range(FIRST_YEAR, this_year + 1))
    if args.seasons:
        a, _, b = args.seasons.partition("-")
        years = list(range(int(a), int(b or a) + 1))

    meta_path = OUT / "meta.json"
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {"seasons": []}
    by_season = {s["season"]: s for s in meta.get("seasons", [])}

    for y in years:
        print(f"{season_label(y)}…", flush=True)
        if not args.no_download:
            download(y, force=args.force or y == this_year)
        res = build_season(y)
        if not res:
            continue
        d = OUT / res["season"]
        write_json(d / "teams.json", res["teams"])
        write_json(d / "players.json", columnar(res["players"]))
        gp = max([t["GP"] for t in res["teams"]] or [0])
        by_season[res["season"]] = {"season": res["season"], "year": y, "teams": len(res["teams"]), "players": len(res["players"]),
                                    "max_team_games": gp, "has_box": res["has_box"], "preseason": res["preseason"],
                                    "in_progress": y == this_year and not res["preseason"]}
        print(f"  {len(res['teams'])} teams, {len(res['players'])} players, ESPN box scores: {res['has_box']}"
              f"{' (preseason ratings only)' if res['preseason'] else ''}")

    seasons = sorted(by_season.values(), key=lambda s: s["year"], reverse=True)
    played = [s for s in seasons if not s["preseason"]]
    # Default season = the newest season with games (the new one once it is ~3 weeks in).
    default = next((s["season"] for s in played if not s.get("in_progress") or s["max_team_games"] >= 8), played[0]["season"] if played else None)
    meta = {"source": "Bart Torvik T-Rank (barttorvik.com) bulk CSV files; ESPN box scores via the sportsdataverse Python package",
            "source_url": "https://barttorvik.com/", "pulled_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
            "default_season": default, "seasons": seasons}
    write_json(meta_path, meta)
    build_careers()
    print("done")


CAREER_COLS = ["PID", "PLAYER_NAME", "TEAM_ID", "TEAM_NAME", "CONF", "CLASS", "HT", "HT_IN", "POS", "DOB", "AGE", "GP", "GS", "MIN",
    "MIN_PCT", "PTS", "REB", "OREB", "DREB", "AST", "STL", "BLK", "TOV", "PF", "FGM", "FGA", "FG_PCT", "FG3M", "FG3A", "FG3_PCT",
    "FTM", "FTA", "FT_PCT", "ORTG", "DRTG", "USG", "EFG", "TS", "ORB_PCT", "DRB_PCT", "AST_PCT", "TOV_PCT", "BLK_PCT", "STL_PCT",
    "FTR", "PORPAG", "BPM", "OBPM", "DBPM", "NBA_PICK", "HOMETOWN"]


def build_careers():
    """Every player's seasons, grouped into 100 files by player id (pid % 100)."""
    shards = {}
    for d in sorted(OUT.glob("*-*/players.json")):
        season = d.parent.name
        for p in expand(json.loads(d.read_text())):
            keep = {k: p.get(k) for k in CAREER_COLS}
            shards.setdefault(p["PID"] % 100, {}).setdefault(str(p["PID"]), []).append({"SEASON": season, **keep})
    for k, v in shards.items():
        rows = [r for pid_rows in v.values() for r in sorted(pid_rows, key=lambda r: r["SEASON"])]
        write_json(OUT / "careers" / f"{k}.json", columnar(rows))


if __name__ == "__main__":
    main()
