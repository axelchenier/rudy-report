"""
fetch_more.py  -  downloads the data behind the Standings page, game logs, and the
Clutch / Hustle / Tracking hubs.  All from NBA.com/stats via nba_api.

RUN IT (from the nba-stats-app folder):
    .venv/bin/python pipeline/fetch_more.py                 every season in data/meta.json
    .venv/bin/python pipeline/fetch_more.py 2025-26 2026-27 just these seasons
(update_reports.py calls update_season() for the current season every night, so you rarely need this.)

It saves, for each season:
  data/<season>/standings.json         LeagueStandingsV3: conference/division rank, home/road, L10, streak, points for/against
  data/<season>/team_gamelogs.json     LeagueGameLog (teams): every team's full box score for every game
  data/<season>/gamelogs/p_<NN>.json   LeagueGameLog (players): every player's box score for every game,
                                       split into 40 small files by PLAYER_ID % 40 so a player page
                                       only downloads the one small file it needs
  data/<season>/clutch_players.json    LeagueDashPlayerClutch (last 5 minutes, score within 5): totals + ratings
  data/<season>/clutch_teams.json      LeagueDashTeamClutch: same for teams
  data/<season>/hustle_players.json    LeagueHustleStatsPlayer (per game): deflections, contests, charges, ...
  data/<season>/hustle_teams.json      LeagueHustleStatsTeam
  data/<season>/tracking_more.json     LeagueDashPtStats (Passing, Rebounding, Defense, SpeedDistance)
                                       + LeagueDashPtDefend (shots defended within 6 feet)

Big tables are stored "compact": {"cols": [...names...], "rows": [[...], [...]]} which is about
half the size of a list of objects. The website turns them back into objects (data.js -> unpack()).
"""

import json
import sys
import time

import pandas as pd
from nba_api.stats.endpoints import (leaguestandingsv3, leaguegamelog, leaguedashplayerclutch, leaguedashteamclutch,
                                     leaguehustlestatsplayer, leaguehustlestatsteam, leaguedashptstats, leaguedashptdefend)

from fetch_data import SEASON_TYPE, DATA_DIR, save_json, PAUSE_SECONDS

SHARDS = 40               # player game logs are split into this many files


def nba_call(make_request, what):
    """Run one NBA.com request with up to 3 tries, then pause politely (about 1 request per second)."""
    for attempt in range(3):
        try:
            frame = make_request().get_data_frames()[0]
            time.sleep(PAUSE_SECONDS)
            return frame
        except Exception as error:
            print(f"  ...problem with {what} ({error}); retrying")
            time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"NBA.com request failed 3 times: {what}")


def save_compact(frame, path):
    """Save as {"cols": [...], "rows": [[...]]} (smaller than a list of objects)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    frame = frame.round(3).astype(object).where(pd.notnull(frame), None)
    path.write_text(json.dumps({"cols": list(frame.columns), "rows": frame.values.tolist()}, separators=(",", ":")))


# ---------------------------------------------------------------- standings
def standings(season):
    s = nba_call(lambda: leaguestandingsv3.LeagueStandingsV3(season=season, season_type=SEASON_TYPE, timeout=60), f"{season} standings")
    keep = ["TeamID", "TeamCity", "TeamName", "Conference", "Division", "PlayoffRank", "DivisionRank", "ClinchIndicator",
            "WINS", "LOSSES", "WinPCT", "HOME", "ROAD", "L10", "strCurrentStreak", "ConferenceGamesBack", "DivisionGamesBack",
            "ConferenceRecord", "DivisionRecord", "OT", "ThreePTSOrLess", "TenPTSOrMore", "PointsPG", "OppPointsPG", "DiffPointsPG",
            "TotalPoints", "OppTotalPoints"]
    s = s[[c for c in keep if c in s.columns]].copy()
    s["ClinchIndicator"] = s["ClinchIndicator"].fillna("").astype(str).str.replace(" - ", "", regex=False).str.strip()
    save_json(s, DATA_DIR / season / "standings.json")
    return len(s)


# ---------------------------------------------------------------- game logs
def game_log(season, kind):
    frame = nba_call(lambda: leaguegamelog.LeagueGameLog(season=season, season_type_all_star=SEASON_TYPE,
                                                         player_or_team_abbreviation=kind, timeout=90), f"{season} {kind} game log")
    frame["GAME_DATE"] = pd.to_datetime(frame["GAME_DATE"]).dt.strftime("%Y-%m-%d")
    return frame


BOX = ["MIN", "PTS", "FGM", "FGA", "FG3M", "FG3A", "FTM", "FTA", "OREB", "DREB", "REB", "AST", "STL", "BLK", "TOV", "PF", "PLUS_MINUS"]


def write_game_logs(season, teams=None, players=None):
    """Team and player game logs. Pass frames you already downloaded (update_reports.py does) to skip the download."""
    teams = game_log(season, "T") if teams is None else teams.copy()
    players = game_log(season, "P") if players is None else players.copy()
    for f in (teams, players):
        f["GAME_ID"] = f["GAME_ID"].astype(str)
        f["HOME"] = f["MATCHUP"].str.contains("vs.").astype(int)
        f["OPP"] = f["MATCHUP"].str.split().str[-1]          # "MIN vs. LAL" / "MIN @ LAL" -> "LAL"
    # Opponent's box score next to each team row (needed for possessions, ratings and "points allowed").
    opp = teams[["GAME_ID", "TEAM_ID", "PTS", "FGA", "FTA", "OREB", "DREB", "TOV", "FG3A"]].rename(
        columns=lambda c: c if c == "GAME_ID" else "OPP_" + c)
    t = teams.merge(opp, on="GAME_ID")
    t = t[t["TEAM_ID"] != t["OPP_TEAM_ID"]].drop(columns=["OPP_TEAM_ID"])
    t = t[["TEAM_ID", "TEAM_ABBREVIATION", "GAME_ID", "GAME_DATE", "HOME", "OPP", "WL"] + BOX +
          ["OPP_PTS", "OPP_FGA", "OPP_FTA", "OPP_OREB", "OPP_DREB", "OPP_TOV", "OPP_FG3A"]].sort_values(["GAME_DATE", "GAME_ID"])
    save_compact(t, DATA_DIR / season / "team_gamelogs.json")

    p = players[["PLAYER_ID", "PLAYER_NAME", "TEAM_ID", "TEAM_ABBREVIATION", "GAME_ID", "GAME_DATE", "HOME", "OPP", "WL"] + BOX]
    p = p.sort_values(["PLAYER_ID", "GAME_DATE"])
    folder = DATA_DIR / season / "gamelogs"
    for shard in range(SHARDS):
        save_compact(p[p["PLAYER_ID"] % SHARDS == shard], folder / f"p_{shard:02d}.json")
    return len(t), len(p)


# ---------------------------------------------------------------- clutch
CLUTCH_BASE = ["GP", "W", "L", "MIN", "PTS", "FGM", "FGA", "FG_PCT", "FG3M", "FG3A", "FG3_PCT", "FTM", "FTA", "FT_PCT",
               "REB", "AST", "TOV", "STL", "BLK", "PLUS_MINUS"]
CLUTCH_ADV = ["OFF_RATING", "DEF_RATING", "NET_RATING", "TS_PCT", "EFG_PCT"]


def clutch(season):
    common = dict(season=season, season_type_all_star=SEASON_TYPE, timeout=90)   # NBA.com default: last 5 min, margin <= 5
    pb = nba_call(lambda: leaguedashplayerclutch.LeagueDashPlayerClutch(per_mode_detailed="Totals", **common), f"{season} player clutch")
    pa = nba_call(lambda: leaguedashplayerclutch.LeagueDashPlayerClutch(measure_type_detailed_defense="Advanced", **common), f"{season} player clutch adv")
    players = pb[["PLAYER_ID", "PLAYER_NAME", "TEAM_ID", "TEAM_ABBREVIATION"] + CLUTCH_BASE].merge(
        pa[["PLAYER_ID"] + CLUTCH_ADV + ["USG_PCT"]], on="PLAYER_ID", how="left")
    save_json(players, DATA_DIR / season / "clutch_players.json")
    tb = nba_call(lambda: leaguedashteamclutch.LeagueDashTeamClutch(per_mode_detailed="Totals", **common), f"{season} team clutch")
    ta = nba_call(lambda: leaguedashteamclutch.LeagueDashTeamClutch(measure_type_detailed_defense="Advanced", **common), f"{season} team clutch adv")
    teams = tb[["TEAM_ID", "TEAM_NAME"] + CLUTCH_BASE].merge(ta[["TEAM_ID"] + CLUTCH_ADV], on="TEAM_ID", how="left")
    save_json(teams, DATA_DIR / season / "clutch_teams.json")
    return len(players), len(teams)


# ---------------------------------------------------------------- hustle
HUSTLE = ["CONTESTED_SHOTS", "CONTESTED_SHOTS_2PT", "CONTESTED_SHOTS_3PT", "DEFLECTIONS", "CHARGES_DRAWN", "SCREEN_ASSISTS",
          "SCREEN_AST_PTS", "LOOSE_BALLS_RECOVERED", "BOX_OUTS", "OFF_BOXOUTS", "DEF_BOXOUTS"]


def hustle(season):
    common = dict(season=season, season_type_all_star=SEASON_TYPE, per_mode_time="PerGame", timeout=90)
    p = nba_call(lambda: leaguehustlestatsplayer.LeagueHustleStatsPlayer(**common), f"{season} player hustle")
    p = p.rename(columns={"G": "GP"})
    p = p[["PLAYER_ID", "PLAYER_NAME", "TEAM_ID", "TEAM_ABBREVIATION", "GP", "MIN"] + [c for c in HUSTLE if c in p.columns]]
    save_json(p, DATA_DIR / season / "hustle_players.json")
    t = nba_call(lambda: leaguehustlestatsteam.LeagueHustleStatsTeam(**common), f"{season} team hustle")
    t = t[["TEAM_ID", "TEAM_NAME", "MIN"] + [c for c in HUSTLE if c in t.columns]]
    save_json(t, DATA_DIR / season / "hustle_teams.json")
    return len(p), len(t)


# ---------------------------------------------------------------- more tracking
TRACK = {
    "Passing": ["PASSES_MADE", "PASSES_RECEIVED", "SECONDARY_AST", "POTENTIAL_AST", "AST_POINTS_CREATED", "AST_TO_PASS_PCT"],
    "Rebounding": ["REB_CHANCES", "REB_CHANCE_PCT", "REB_CONTEST_PCT", "OREB_CHANCES", "DREB_CHANCES"],
    "Defense": ["DEF_RIM_FGM", "DEF_RIM_FGA", "DEF_RIM_FG_PCT"],
    "SpeedDistance": ["DIST_MILES", "DIST_MILES_OFF", "DIST_MILES_DEF", "AVG_SPEED", "AVG_SPEED_OFF", "AVG_SPEED_DEF"],
}


def tracking_more(season):
    merged = None
    for measure, cols in TRACK.items():
        f = nba_call(lambda: leaguedashptstats.LeagueDashPtStats(season=season, season_type_all_star=SEASON_TYPE, player_or_team="Player",
                                                                  pt_measure_type=measure, per_mode_simple="PerGame", timeout=90), f"{season} tracking {measure}")
        base = ["PLAYER_ID"] + (["PLAYER_NAME", "TEAM_ID", "TEAM_ABBREVIATION", "GP", "MIN"] if merged is None else [])
        f = f[base + [c for c in cols if c in f.columns]]
        merged = f if merged is None else merged.merge(f, on="PLAYER_ID", how="outer")
    d = nba_call(lambda: leaguedashptdefend.LeagueDashPtDefend(season=season, season_type_all_star=SEASON_TYPE, defense_category="Less Than 6Ft",
                                                               per_mode_simple="PerGame", timeout=90), f"{season} defended shots <6ft")
    d = d.rename(columns={"CLOSE_DEF_PERSON_ID": "PLAYER_ID", "FGM_LT_06": "D6_FGM", "FGA_LT_06": "D6_FGA",
                          "LT_06_PCT": "D6_FG_PCT", "NS_LT_06_PCT": "D6_NORMAL_FG_PCT", "PLUSMINUS": "D6_DIFF"})
    merged = merged.merge(d[["PLAYER_ID", "D6_FGM", "D6_FGA", "D6_FG_PCT", "D6_NORMAL_FG_PCT", "D6_DIFF"]], on="PLAYER_ID", how="left")
    save_json(merged, DATA_DIR / season / "tracking_more.json")
    return len(merged)


def update_season(season, team_log=None, player_log=None):
    """Everything above for one season. Raises on failure (so the nightly job exits nonzero)."""
    print(f"  {season}: standings {standings(season)} teams")
    print(f"  {season}: game logs {write_game_logs(season, team_log, player_log)} (team rows, player rows)")
    print(f"  {season}: clutch {clutch(season)}")
    print(f"  {season}: hustle {hustle(season)}")
    print(f"  {season}: tracking {tracking_more(season)} players")


def main():
    seasons = sys.argv[1:] or [s["season"] for s in json.loads((DATA_DIR / "meta.json").read_text())["seasons"]]
    failed = []
    for season in seasons:
        try:
            update_season(season)
        except Exception as error:
            print(f"  !! {season} failed: {error}")
            failed.append(season)
    if failed:
        print("FAILED seasons:", ", ".join(failed), file=sys.stderr)
        sys.exit(1)
    print("Done.")


if __name__ == "__main__":
    main()
