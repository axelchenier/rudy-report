"""
fetch_data.py  -  downloads REAL NBA stats and saves them as JSON files for the website.

HOW TO RUN (from the nba-stats-app folder):
    .venv/bin/python pipeline/fetch_data.py

WHAT IT DOES, step by step:
  1. For each season in SEASONS, ask NBA.com/stats (through the free `nba_api` library) for:
       - player BASIC stats   (points, rebounds, ... per game)
       - player ADVANCED stats (true shooting %, usage %, ratings, ...)
       - team BASIC stats     (per game)
       - team ADVANCED stats  (offensive/defensive/net rating, pace, ...)
       - team stats PER 100 POSSESSIONS (so we can show "3-point attempts per 100 possessions")
  2. Glue (merge) the basic + advanced tables together, one row per player / per team.
  3. Save them to data/<season>/players.json and data/<season>/teams.json
     (+ players_totals.json, players_per36.json, teams_totals.json, teams_per100.json)
  4. Save data/meta.json with the list of seasons, the source, and today's date.

Nothing here is typed in by hand: every number comes straight from NBA.com.
"""

import json                      # to write .json files
import time                      # to pause between requests (NBA.com doesn't like being spammed)
from datetime import datetime, timezone
from pathlib import Path         # nicer way to handle folder/file paths

import pandas as pd              # pandas = spreadsheets inside Python
from nba_api.stats.endpoints import leaguedashplayerstats, leaguedashteamstats
from nba_api.stats.static import teams as static_teams   # team names + abbreviations (built into nba_api)

# ---------------------------------------------------------------------------
# SETTINGS - change these if you want different seasons.
# ---------------------------------------------------------------------------
# The last 10 completed regular seasons, newest first.
SEASONS = [f"{y}-{str(y + 1)[2:]}" for y in range(2025, 2015, -1)]   # "2025-26" ... "2016-17"
SEASON_TYPE = "Regular Season"
PAUSE_SECONDS = 1.0              # wait this long between requests
DATA_DIR = Path(__file__).resolve().parent.parent / "data"           # .../nba-stats-app/data

# Which columns to keep. (NBA.com sends ~80 columns; we keep the useful ones so files stay small.)
PLAYER_BASIC_COLS = ["PLAYER_ID", "PLAYER_NAME", "TEAM_ID", "TEAM_ABBREVIATION", "AGE", "GP", "W", "L", "MIN",
                     "PTS", "REB", "OREB", "DREB", "AST", "STL", "BLK", "TOV", "PF",
                     "FGM", "FGA", "FG_PCT", "FG3M", "FG3A", "FG3_PCT", "FTM", "FTA", "FT_PCT",
                     "PLUS_MINUS", "DD2", "TD3"]
PLAYER_ADV_COLS = ["PLAYER_ID", "OFF_RATING", "DEF_RATING", "NET_RATING", "AST_PCT", "AST_TO", "AST_RATIO",
                   "OREB_PCT", "DREB_PCT", "REB_PCT", "TM_TOV_PCT", "EFG_PCT", "TS_PCT", "USG_PCT",
                   "PACE", "PIE", "POSS"]
TEAM_BASIC_COLS = ["TEAM_ID", "TEAM_NAME", "GP", "W", "L", "W_PCT", "MIN",
                   "PTS", "REB", "OREB", "DREB", "AST", "STL", "BLK", "TOV", "PF",
                   "FGM", "FGA", "FG_PCT", "FG3M", "FG3A", "FG3_PCT", "FTM", "FTA", "FT_PCT", "PLUS_MINUS"]
TEAM_ADV_COLS = ["TEAM_ID", "OFF_RATING", "DEF_RATING", "NET_RATING", "AST_PCT", "AST_TO", "AST_RATIO",
                 "OREB_PCT", "DREB_PCT", "REB_PCT", "TM_TOV_PCT", "EFG_PCT", "TS_PCT", "PACE", "PIE", "POSS"]


def get_players(season, measure, per_mode="PerGame"):
    """Ask NBA.com for one table of player stats.
    measure  = 'Base' (basic) or 'Advanced'
    per_mode = 'PerGame' (averages), 'Totals' (whole-season sums) or 'Per36' (per 36 minutes)"""
    for attempt in range(3):                     # try up to 3 times in case NBA.com is slow
        try:
            result = leaguedashplayerstats.LeagueDashPlayerStats(
                season=season, season_type_all_star=SEASON_TYPE,
                measure_type_detailed_defense=measure, per_mode_detailed=per_mode, timeout=60)
            time.sleep(PAUSE_SECONDS)
            return result.get_data_frames()[0]
        except Exception as error:
            print(f"  ...problem ({error}); retrying")
            time.sleep(5)
    raise RuntimeError(f"Could not download player {measure} stats for {season}")


def get_teams(season, measure, per_mode="PerGame"):
    """Ask NBA.com for one table of team stats."""
    for attempt in range(3):
        try:
            result = leaguedashteamstats.LeagueDashTeamStats(
                season=season, season_type_all_star=SEASON_TYPE,
                measure_type_detailed_defense=measure, per_mode_detailed=per_mode, timeout=60)
            time.sleep(PAUSE_SECONDS)
            return result.get_data_frames()[0]
        except Exception as error:
            print(f"  ...problem ({error}); retrying")
            time.sleep(5)
    raise RuntimeError(f"Could not download team {measure} stats for {season}")


def save_json(rows, path):
    """Write a pandas table to a JSON file (a list of {column: value} objects)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    # Round decimals to keep files small; replace missing values (NaN) with null.
    rows = rows.round(4).astype(object).where(pd.notnull(rows), None)
    path.write_text(json.dumps(rows.to_dict(orient="records"), ensure_ascii=False))


def main():
    # Team abbreviations (like "MIN" for Minnesota) come from nba_api's built-in team list.
    abbrev = {t["id"]: t["abbreviation"] for t in static_teams.get_teams()}
    loaded = []

    for season in SEASONS:
        print(f"Season {season}:")

        # ---- PLAYERS: basic + advanced, joined on PLAYER_ID -----------------
        basic = get_players(season, "Base")[PLAYER_BASIC_COLS]
        adv = get_players(season, "Advanced")[PLAYER_ADV_COLS]
        players = basic.merge(adv, on="PLAYER_ID", how="left")
        players.insert(0, "SEASON", season)
        print(f"  players: {len(players)}")

        # ---- TEAMS: basic + advanced + per-100-possession shooting -----------
        tbasic = get_teams(season, "Base")[TEAM_BASIC_COLS]
        tadv = get_teams(season, "Advanced")[TEAM_ADV_COLS]
        t100 = get_teams(season, "Base", per_mode="Per100Possessions")[["TEAM_ID", "PTS", "FG3A", "FG3M", "FGA", "FTA", "AST", "TOV", "REB"]]
        t100 = t100.rename(columns={c: f"{c}_PER100" for c in t100.columns if c != "TEAM_ID"})
        teams = tbasic.merge(tadv, on="TEAM_ID").merge(t100, on="TEAM_ID")
        teams.insert(1, "TEAM_ABBREVIATION", teams["TEAM_ID"].map(abbrev))
        # 3-point attempt rate = share of all shots that were threes (calculated from the real numbers above)
        teams["FG3A_RATE"] = teams["FG3A"] / teams["FGA"]
        teams.insert(0, "SEASON", season)
        print(f"  teams: {len(teams)}")

        # ---- EXTRA VIEWS for the Basketball-Reference-style toggles -------------
        # Season totals and per-36-minute numbers for players (basic stats only),
        # season totals and per-100-possession numbers for teams.
        p_tot = get_players(season, "Base", "Totals")[PLAYER_BASIC_COLS]
        p_36 = get_players(season, "Base", "Per36")[PLAYER_BASIC_COLS]
        t_tot = get_teams(season, "Base", "Totals")[TEAM_BASIC_COLS]
        t_100 = get_teams(season, "Base", "Per100Possessions")[TEAM_BASIC_COLS]
        for table in (p_tot, p_36, t_tot, t_100):
            table.insert(0, "SEASON", season)
        for table in (t_tot, t_100):
            table.insert(2, "TEAM_ABBREVIATION", table["TEAM_ID"].map(abbrev))

        save_json(players, DATA_DIR / season / "players.json")          # per game + advanced
        save_json(teams, DATA_DIR / season / "teams.json")              # per game + advanced
        save_json(p_tot, DATA_DIR / season / "players_totals.json")
        save_json(p_36, DATA_DIR / season / "players_per36.json")
        save_json(t_tot, DATA_DIR / season / "teams_totals.json")
        save_json(t_100, DATA_DIR / season / "teams_per100.json")
        loaded.append({"season": season, "players": len(players), "teams": len(teams),
                       "max_team_games": int(teams["GP"].max())})

    # ---- META: what we loaded, from where, and when ---------------------------
    meta = {
        "source": "NBA.com/stats (LeagueDashPlayerStats & LeagueDashTeamStats) via the nba_api Python library",
        "source_url": "https://www.nba.com/stats",
        "season_type": SEASON_TYPE,
        "pulled_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "seasons": loaded,
    }
    # Keep any extra-source info that fetch_extras.py added earlier.
    old = DATA_DIR / "meta.json"
    if old.exists():
        meta["extras"] = json.loads(old.read_text()).get("extras", {})
    old.write_text(json.dumps(meta, indent=2))
    print("Done. Saved to", DATA_DIR)


if __name__ == "__main__":
    main()
