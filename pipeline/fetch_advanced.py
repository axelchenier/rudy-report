"""
fetch_advanced.py  -  downloads the data behind shot charts, play types, lineups and on/off.
All from NBA.com/stats via nba_api.

RUN IT (from the nba-stats-app folder):
    .venv/bin/python pipeline/fetch_advanced.py                       every season in data/meta.json
    .venv/bin/python pipeline/fetch_advanced.py 2025-26               one season
    .venv/bin/python pipeline/fetch_advanced.py 2025-26 --only shots  one kind (shots, playtypes, lineups, onoff)
(update_reports.py calls update_season() for the current season every night.)

It saves, for each season:
  data/<season>/shots/p_<NN>.json   every shot (ShotChartDetail): player, x, y, made, zone, period;
                                    split into 40 files by PLAYER_ID % 40 (a player page loads one ~100 KB file)
  data/<season>/shot_zones.json     league average FG% and frequency per zone (ShotChartDetail "LeagueAverages")
                                    + every team's shots FOR and AGAINST, per zone and per hexagon (for team charts)
  data/<season>/playtypes.json      SynergyPlayTypes (Synergy data as shown on NBA.com): 11 play types,
                                    offense for players and teams, defense for teams and players
  data/<season>/lineups.json        LeagueDashLineups (Advanced): every team's 5-man lineups with 10+ minutes
                                    and 2-man combinations with 50+ minutes
  data/<season>/onoff.json          TeamPlayerOnOffSummary: team ratings with each player ON and OFF the floor

Hexagons: pointy-top hexagons of size 15 (1.5 feet) in NBA.com court coordinates (tenths of feet).
js/shots.js uses the exact same math so player and team charts line up.
"""

import json
import math
import sys
import time
from collections import defaultdict

import pandas as pd
from nba_api.stats.endpoints import shotchartdetail, synergyplaytypes, leaguedashlineups, teamplayeronoffsummary
from nba_api.stats.static import teams as static_teams

from fetch_data import SEASON_TYPE, DATA_DIR, save_json, PAUSE_SECONDS
from fetch_more import nba_call as _nba_call, save_compact, SHARDS

HEX = 15.0
PLAY_TYPES = ["Isolation", "Transition", "PRBallHandler", "PRRollman", "Postup", "Spotup", "Handoff", "Cut", "OffScreen", "OffRebound", "Misc"]


def nba_call(make, what, index=0):
    """Like fetch_more.nba_call but can return any result set (index)."""
    for attempt in range(3):
        try:
            frames = make().get_data_frames()
            time.sleep(PAUSE_SECONDS)
            return frames if index is None else frames[index]
        except Exception as error:
            print(f"  ...problem with {what} ({error}); retrying")
            time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"NBA.com request failed 3 times: {what}")


def hex_of(x, y):
    """Which hexagon (q, r) a court point falls in (axial coordinates, cube rounding)."""
    q = (math.sqrt(3) / 3 * x - y / 3) / HEX
    r = (2 / 3 * y) / HEX
    cx, cz = q, r
    cy = -cx - cz
    rx, ry, rz = round(cx), round(cy), round(cz)
    dx, dy, dz = abs(rx - cx), abs(ry - cy), abs(rz - cz)
    if dx > dy and dx > dz:
        rx = -ry - rz
    elif dy > dz:
        ry = -rx - rz
    else:
        rz = -rx - ry
    return int(rx), int(rz)


def team_ids():
    return [t["id"] for t in static_teams.get_teams()]


# ---------------------------------------------------------------- shots
def shots(season):
    frames, league = [], None
    for tid in team_ids():
        res = nba_call(lambda: shotchartdetail.ShotChartDetail(team_id=tid, player_id=0, season_nullable=season,
                       season_type_all_star=SEASON_TYPE, context_measure_simple="FGA", timeout=120), f"{season} shots team {tid}", None)
        frames.append(res[0])
        league = res[1] if league is None or len(res[1]) > len(league) else league
    s = pd.concat(frames, ignore_index=True)
    if s.empty:
        print(f"  {season}: no shots yet")
        return 0
    # Zones: the league-average table lists every (basic, area, range) combination -> give each a number.
    league = league.sort_values(["SHOT_ZONE_BASIC", "SHOT_ZONE_AREA", "SHOT_ZONE_RANGE"]).reset_index(drop=True)
    key = lambda b, a, r: f"{b}|{a}|{r}"
    zone_ix = {key(b, a, r): i for i, (b, a, r) in enumerate(zip(league.SHOT_ZONE_BASIC, league.SHOT_ZONE_AREA, league.SHOT_ZONE_RANGE))}
    s["Z"] = [zone_ix.get(key(b, a, r), -1) for b, a, r in zip(s.SHOT_ZONE_BASIC, s.SHOT_ZONE_AREA, s.SHOT_ZONE_RANGE)]
    lg_pct = league["FG_PCT"].tolist()

    out = s[["PLAYER_ID", "LOC_X", "LOC_Y", "SHOT_MADE_FLAG", "Z", "PERIOD"]].rename(
        columns={"LOC_X": "X", "LOC_Y": "Y", "SHOT_MADE_FLAG": "M", "PERIOD": "P"})
    for shard in range(SHARDS):
        save_compact(out[out["PLAYER_ID"] % SHARDS == shard], DATA_DIR / season / "shots" / f"p_{shard:02d}.json")

    # Team charts: shots FOR (by the team) and AGAINST (by its opponents in the same games).
    games = s.groupby("GAME_ID")["TEAM_ID"].unique().to_dict()
    teams = {}
    for side in ("for", "against"):
        agg = defaultdict(lambda: {"zones": defaultdict(lambda: [0, 0]), "hex": defaultdict(lambda: [0, 0, 0.0])})
        for gid, tid, x, y, m, z in zip(s.GAME_ID, s.TEAM_ID, s.LOC_X, s.LOC_Y, s.SHOT_MADE_FLAG, s.Z):
            if side == "for":
                owners = [tid]
            else:
                owners = [t for t in games[gid] if t != tid]
            for owner in owners:
                a = agg[int(owner)]
                a["zones"][int(z)][0] += 1
                a["zones"][int(z)][1] += int(m)
                h = a["hex"][hex_of(x, y)]
                h[0] += 1; h[1] += int(m); h[2] += lg_pct[z] if z >= 0 else 0
        for tid, a in agg.items():
            t = teams.setdefault(tid, {})
            t[side] = {"zones": {str(z): v for z, v in a["zones"].items()},
                       "hex": [[q, r, v[0], v[1], round(v[2], 2)] for (q, r), v in a["hex"].items()]}
    zones = [{"BASIC": b, "AREA": a, "RANGE": r, "FGA": int(fa), "FGM": int(fm), "FG_PCT": float(p)}
             for b, a, r, fa, fm, p in zip(league.SHOT_ZONE_BASIC, league.SHOT_ZONE_AREA, league.SHOT_ZONE_RANGE, league.FGA, league.FGM, league.FG_PCT)]
    (DATA_DIR / season / "shot_zones.json").write_text(json.dumps({"hex_size": HEX, "zones": zones, "teams": teams}, separators=(",", ":")))
    return len(s)


# ---------------------------------------------------------------- play types
def playtypes(season):
    rows = []
    for who, grouping in [("P", "offensive"), ("T", "offensive"), ("T", "defensive"), ("P", "defensive")]:
        for pt in PLAY_TYPES:
            f = nba_call(lambda: synergyplaytypes.SynergyPlayTypes(season=season, season_type_all_star=SEASON_TYPE,
                         player_or_team_abbreviation=who, play_type_nullable=pt, type_grouping_nullable=grouping,
                         per_mode_simple="Totals", timeout=90), f"{season} playtype {who} {pt} {grouping}")
            if f.empty:
                continue
            f = f.copy()
            f["WHO"], f["SIDE"] = who, "off" if grouping == "offensive" else "def"
            keep = ["WHO", "SIDE", "PLAY_TYPE", "TEAM_ID", "TEAM_ABBREVIATION", "GP", "POSS", "POSS_PCT", "PPP", "PERCENTILE",
                    "PTS", "FGM", "FGA", "FG_PCT", "EFG_PCT", "FT_POSS_PCT", "TOV_POSS_PCT", "SCORE_POSS_PCT"]
            if who == "P":
                keep[3:3] = ["PLAYER_ID", "PLAYER_NAME"]
            rows.append(f[[c for c in keep if c in f.columns]])
    if not rows:
        return 0
    df = pd.concat(rows, ignore_index=True)
    df["PLAYER_ID"] = df["PLAYER_ID"].astype("Int64")       # team rows have no player id
    save_compact(df, DATA_DIR / season / "playtypes.json")
    return len(df)


# ---------------------------------------------------------------- lineups + on/off
LINEUP_COLS = ["GROUP_ID", "GROUP_NAME", "TEAM_ID", "TEAM_ABBREVIATION", "GP", "W", "L", "MIN", "POSS", "OFF_RATING", "DEF_RATING",
               "NET_RATING", "PACE", "EFG_PCT", "TS_PCT", "AST_PCT", "TM_TOV_PCT", "OREB_PCT", "DREB_PCT", "REB_PCT"]


def lineups(season):
    rows = []
    for tid in team_ids():
        for n, min_minutes in [(5, 10), (2, 50)]:
            f = nba_call(lambda: leaguedashlineups.LeagueDashLineups(team_id_nullable=tid, season=season, group_quantity=n,
                         measure_type_detailed_defense="Advanced", season_type_all_star=SEASON_TYPE, timeout=90), f"{season} lineups {tid} {n}")
            if f.empty:
                continue
            f = f[f["MIN"] >= min_minutes][LINEUP_COLS].copy()
            f.insert(0, "N", n)
            rows.append(f)
    df = pd.concat(rows, ignore_index=True) if rows else pd.DataFrame(columns=["N"] + LINEUP_COLS)
    df["GROUP_ID"] = df["GROUP_ID"].str.strip("-")
    save_compact(df, DATA_DIR / season / "lineups.json")
    return len(df)


def onoff(season):
    rows = []
    for tid in team_ids():
        res = nba_call(lambda: teamplayeronoffsummary.TeamPlayerOnOffSummary(team_id=tid, season=season, season_type_all_star=SEASON_TYPE,
                       timeout=90), f"{season} on/off {tid}", None)
        for frame in res[1:3]:
            if not frame.empty:
                rows.append(frame[["TEAM_ID", "TEAM_ABBREVIATION", "VS_PLAYER_ID", "VS_PLAYER_NAME", "COURT_STATUS", "GP", "MIN",
                                   "PLUS_MINUS", "OFF_RATING", "DEF_RATING", "NET_RATING"]])
    if not rows:
        return 0
    df = pd.concat(rows, ignore_index=True).rename(columns={"VS_PLAYER_ID": "PLAYER_ID", "VS_PLAYER_NAME": "PLAYER_NAME"})
    save_json(df, DATA_DIR / season / "onoff.json")
    return len(df)


KINDS = {"shots": shots, "playtypes": playtypes, "lineups": lineups, "onoff": onoff}


def update_season(season, only=None):
    for name, fn in KINDS.items():
        if only and name not in only:
            continue
        print(f"  {season}: {name} {fn(season)}", flush=True)


def main():
    args = sys.argv[1:]
    only = None
    if "--only" in args:
        i = args.index("--only")
        only = args[i + 1].split(",")
        args = args[:i] + args[i + 2:]
    seasons = args or [s["season"] for s in json.loads((DATA_DIR / "meta.json").read_text())["seasons"]]
    failed = []
    for season in seasons:
        try:
            update_season(season, only)
        except Exception as error:
            print(f"  !! {season} failed: {error}", flush=True)
            failed.append(season)
    if failed:
        print("FAILED seasons:", ", ".join(failed), file=sys.stderr)
        sys.exit(1)
    print("Done.")


if __name__ == "__main__":
    main()
