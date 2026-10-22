"""
college_leaders.py  -  all-time (2007-08 onward) college leaderboards for #/college/leaders. Small output (~100 KB).

RUN IT (update_college.py runs it nightly; reads only data/college/, no downloads):
    .venv/bin/python pipeline/college_leaders.py

  * Single-season leaders: top 25 per stat among qualified players (40%+ of team minutes and 15+ games, Torvik's leaderboard
    rule), plus the same list for freshmen only. Shooting percentages need attempt minimums (listed in the file).
  * Career leaders: every season of a player (Torvik player id, so transfers are combined), 2007-08 onward only. Points and
    3-pointers are exact season totals; rebounds, assists, steals and blocks are per-game averages x games (rounded per game,
    so within a few of the true total).
OUTPUT: data/college/leaders.json
"""
import json, sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import college_fetch as cf

TOP = 25
# key, label, format, minimum rule (column, value) or None, lower_is_better
SEASON_STATS = [("PTS", "Points per game", "num", None, False), ("REB", "Rebounds per game", "num", None, False), ("AST", "Assists per game", "num", None, False),
    ("STL", "Steals per game", "num", None, False), ("BLK", "Blocks per game", "num", None, False), ("BPM", "Box Plus/Minus", "num", None, False),
    ("OBPM", "Offensive BPM", "num", None, False), ("DBPM", "Defensive BPM", "num", None, False), ("PORPAG", "Points over replacement per game (PRPG!)", "num", None, False),
    ("ORTG", "Offensive rating (20%+ usage)", "num", ("USG", 0.2), False), ("TS", "True shooting % (200+ FGA)", "pct", ("FGA_TOT", 200), False),
    ("FG3_PCT", "3-point % (100+ 3PA)", "pct", ("FG3A_TOT", 100), False), ("FT_PCT", "Free-throw % (100+ FTA)", "pct", ("FTA_TOT", 100), False),
    ("FG3M_TOT", "3-pointers made (season)", "int", None, False), ("PTS_TOT", "Points (season total)", "int", None, False),
    ("USG", "Usage rate", "pct", None, False), ("AST_PCT", "Assist rate", "pct", None, False), ("BLK_PCT", "Block rate", "pct", None, False),
    ("STL_PCT", "Steal rate", "pct", None, False), ("DRB_PCT", "Defensive rebound rate", "pct", None, False), ("ORB_PCT", "Offensive rebound rate", "pct", None, False)]
CAREER_STATS = [("PTS", "Points", "exact"), ("FG3M", "3-pointers made", "exact"), ("REB", "Rebounds", "approx"), ("AST", "Assists", "approx"),
    ("STL", "Steals", "approx"), ("BLK", "Blocks", "approx"), ("GP", "Games played", "exact"), ("PORPAG_TOT", "Total points over replacement (PRPG! × games)", "approx")]


def main():
    frames = []
    for y in range(cf.FIRST_YEAR, 2100):
        p = cf.ROOT / "data" / "college" / cf.season_label(y) / "players.json"
        if not p.exists():
            if y > 2030: break
            continue
        d = json.loads(p.read_text())
        df = pd.DataFrame(d["rows"], columns=d["cols"])
        if "BPM" not in df or df["GP"].isna().all():
            continue
        df["SEASON"] = cf.season_label(y)
        frames.append(df)
    A = pd.concat(frames, ignore_index=True)
    q = A[(A.MIN_PCT >= 0.4) & (A.GP >= 15)]
    row = lambda r, k: [int(r.PID), r.PLAYER_NAME, r.TEAM_NAME, r.TEAM_ID, r.SEASON, r.CLASS, None if pd.isna(r[k]) else round(float(r[k]), 4)]
    single = {}
    for k, label, fmt, rule, low in SEASON_STATS:
        if k not in q:
            continue
        pool = q.dropna(subset=[k])
        if rule:
            pool = pool[pool[rule[0]] >= rule[1]]
        out = {"label": label, "fmt": fmt}
        for tag, sub in [("all", pool), ("fr", pool[pool.CLASS == "Fr"])]:
            top = sub.sort_values(k, ascending=low).head(TOP)
            out[tag] = [row(r, k) for _, r in top.iterrows()]
        single[k] = out
    # Careers (all seasons, no minutes filter)
    A = A.copy()
    for k in ["REB", "AST", "STL", "BLK", "PORPAG"]:
        A[k + "_T"] = A[k].fillna(0) * A.GP.fillna(0)
    g = A.sort_values("SEASON").groupby("PID").agg(name=("PLAYER_NAME", "last"), team=("TEAM_NAME", "last"), team_id=("TEAM_ID", "last"),
        first=("SEASON", "first"), last=("SEASON", "last"), seasons=("SEASON", "nunique"), schools=("TEAM_ID", "nunique"),
        GP=("GP", "sum"), PTS=("PTS_TOT", "sum"), FG3M=("FG3M_TOT", "sum"), REB=("REB_T", "sum"), AST=("AST_T", "sum"),
        STL=("STL_T", "sum"), BLK=("BLK_T", "sum"), PORPAG_TOT=("PORPAG_T", "sum"))
    career = {}
    for k, label, kind in CAREER_STATS:
        top = g.sort_values(k, ascending=False).head(TOP)
        career[k] = {"label": label, "kind": kind, "rows": [[int(pid), r["name"], r.team, r.team_id, r["first"], r["last"], int(r.seasons), int(r.schools), round(float(r[k]), 1)] for pid, r in top.iterrows()]}
    out = {"generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"), "seasons": f"{A.SEASON.min()} to {A.SEASON.max()}",
           "qualify": "40%+ of team minutes and 15+ games", "single_cols": ["PID", "PLAYER_NAME", "TEAM_NAME", "TEAM_ID", "SEASON", "CLASS", "VALUE"],
           "career_cols": ["PID", "PLAYER_NAME", "TEAM_NAME", "TEAM_ID", "FIRST", "LAST", "SEASONS", "SCHOOLS", "VALUE"], "single": single, "career": career,
           "source": "Bart Torvik T-Rank player files (data/college/)"}
    cf.write_json(cf.ROOT / "data" / "college" / "leaders.json", out)
    print(f"leaders: {len(single)} single-season stats, {len(career)} career stats, seasons {out['seasons']}")


if __name__ == "__main__":
    main()
