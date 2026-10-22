"""
fetch_extras.py  -  downloads the EXTRA data some Ask-page questions need.
Run it AFTER fetch_data.py:
    .venv/bin/python pipeline/fetch_extras.py

It saves, for every season in fetch_data.SEASONS:
  data/<season>/team_games.json      every team game: date, home or away, win/loss, points, +/-   (NBA.com game log)
  data/<season>/opening_day.json     every player's line on the season's FIRST game date            (NBA.com game log)
  data/<season>/players_tracking.json  player-tracking numbers: touches, time of possession,
                                       catch-and-shoot vs pull-up shooting, drives                   (NBA.com tracking)
  data/<season>/bbref_advanced.json  Basketball-Reference advanced stats: BPM, PER, Win Shares, VORP (Basketball-Reference.com)

Basketball-Reference asks visitors not to send more than 20 requests a minute.
We wait 4 seconds between pages (15 per minute) and save each page in pipeline/cache/
so re-running the script does NOT download it again.
"""

import json
import time
import unicodedata
from datetime import datetime, timezone
from io import StringIO
from pathlib import Path

import pandas as pd
import requests
from nba_api.stats.endpoints import leaguegamelog, leaguedashptstats

from fetch_data import SEASONS, SEASON_TYPE, DATA_DIR, save_json, PAUSE_SECONDS

CACHE_DIR = Path(__file__).resolve().parent / "cache"
BBREF_WAIT_SECONDS = 4.0          # 15 requests per minute, under Basketball-Reference's limit of 20


def nba_call(make_request):
    """Run one NBA.com request with up to 3 tries, then pause politely."""
    for attempt in range(3):
        try:
            frame = make_request().get_data_frames()[0]
            time.sleep(PAUSE_SECONDS)
            return frame
        except Exception as error:
            print(f"  ...problem ({error}); retrying")
            time.sleep(5)
    raise RuntimeError("NBA.com request failed 3 times")


def simple_name(name):
    """'Nikola Jokić' -> 'nikola jokic', 'Jaren Jackson Jr.' -> 'jaren jackson'  (so names from two websites match)."""
    name = unicodedata.normalize("NFKD", str(name)).encode("ascii", "ignore").decode().lower()
    name = name.replace(".", "").replace("'", "").replace("-", " ")
    words = [w for w in name.split() if w not in {"jr", "sr", "ii", "iii", "iv"}]
    return " ".join(words)


def game_logs(season):
    """Team game log -> home/away results. Player game log -> opening-day performances."""
    teams = nba_call(lambda: leaguegamelog.LeagueGameLog(season=season, season_type_all_star=SEASON_TYPE,
                                                          player_or_team_abbreviation="T", timeout=60))
    # In MATCHUP, "MIN vs. LAL" means a HOME game and "MIN @ LAL" means an AWAY game.
    teams["HOME"] = teams["MATCHUP"].str.contains("vs.").astype(int)
    team_games = teams[["TEAM_ID", "TEAM_ABBREVIATION", "TEAM_NAME", "GAME_ID", "GAME_DATE", "MATCHUP", "HOME", "WL", "PTS", "PLUS_MINUS"]].copy()
    team_games.insert(0, "SEASON", season)

    players = nba_call(lambda: leaguegamelog.LeagueGameLog(season=season, season_type_all_star=SEASON_TYPE,
                                                            player_or_team_abbreviation="P", timeout=60))
    opening_date = players["GAME_DATE"].min()           # opening day = first game date of the regular season
    opening = players[players["GAME_DATE"] == opening_date][
        ["PLAYER_ID", "PLAYER_NAME", "TEAM_ID", "TEAM_ABBREVIATION", "GAME_DATE", "MATCHUP", "WL", "MIN", "PTS", "REB", "AST", "FG3M"]].copy()
    opening.insert(0, "SEASON", season)
    return team_games, opening


def tracking(season):
    """Player-tracking stats (per game) from four NBA.com tracking tables, joined on PLAYER_ID."""
    keep = {
        "Possessions": ["TOUCHES", "TIME_OF_POSS", "AVG_SEC_PER_TOUCH", "AVG_DRIB_PER_TOUCH", "PTS_PER_TOUCH"],
        "CatchShoot": ["CATCH_SHOOT_FGA", "CATCH_SHOOT_FG_PCT", "CATCH_SHOOT_FG3A", "CATCH_SHOOT_FG3_PCT", "CATCH_SHOOT_EFG_PCT"],
        "PullUpShot": ["PULL_UP_FGA", "PULL_UP_FG_PCT", "PULL_UP_FG3A", "PULL_UP_FG3_PCT", "PULL_UP_EFG_PCT"],
        "Drives": ["DRIVES", "DRIVE_PTS", "DRIVE_FG_PCT", "DRIVE_PASSES_PCT"],
    }
    merged = None
    for measure, cols in keep.items():
        frame = nba_call(lambda: leaguedashptstats.LeagueDashPtStats(
            season=season, season_type_all_star=SEASON_TYPE, player_or_team="Player",
            pt_measure_type=measure, per_mode_simple="PerGame", timeout=60))
        frame = frame[["PLAYER_ID"] + cols]
        merged = frame if merged is None else merged.merge(frame, on="PLAYER_ID", how="outer")
    merged.insert(0, "SEASON", season)
    return merged


def bbref_advanced(season, nba_players):
    """Basketball-Reference advanced table for one season (BPM, PER, WS, VORP...)."""
    end_year = int(season[:4]) + 1                       # BBRef names seasons by the year they END: 2025-26 -> 2026
    url = f"https://www.basketball-reference.com/leagues/NBA_{end_year}_advanced.html"
    cached = CACHE_DIR / f"bbref_NBA_{end_year}_advanced.html"
    if not cached.exists():
        print(f"  downloading {url}")
        response = requests.get(url, timeout=60, headers={"User-Agent": "Mozilla/5.0 (student NBA stats project; low-volume)"})
        response.raise_for_status()
        CACHE_DIR.mkdir(exist_ok=True)
        cached.write_text(response.content.decode("utf-8"), encoding="utf-8")   # BBRef pages are UTF-8 (keeps names like Jokić correct)
        time.sleep(BBREF_WAIT_SECONDS)
    table = pd.read_html(StringIO(cached.read_text(encoding="utf-8")), attrs={"id": "advanced"})[0]
    table = table[table["Player"].notna() & (table["Player"] != "League Average") & table["Rk"].notna()]
    # A traded player has one row per team PLUS a combined row (team "2TM", "3TM"...). The combined row comes first.
    table = table.drop_duplicates(subset=["Player", "Age"], keep="first")
    table = table.rename(columns={"Player": "PLAYER_NAME", "Team": "TEAM", "Pos": "POS", "Age": "AGE", "G": "G", "MP": "MP",
                                  "PER": "PER", "WS": "WS", "WS/48": "WS_48", "OBPM": "OBPM", "DBPM": "DBPM", "BPM": "BPM", "VORP": "VORP"})
    table = table[["PLAYER_NAME", "TEAM", "POS", "AGE", "G", "MP", "PER", "WS", "WS_48", "OBPM", "DBPM", "BPM", "VORP"]].copy()
    for col in ["AGE", "G", "MP", "PER", "WS", "WS_48", "OBPM", "DBPM", "BPM", "VORP"]:
        table[col] = pd.to_numeric(table[col], errors="coerce")
    # Link each BBRef row to the NBA.com player id (by matching simplified names) so the site can link to player pages.
    ids = {simple_name(n): pid for n, pid in zip(nba_players["PLAYER_NAME"], nba_players["PLAYER_ID"])}
    table["PLAYER_ID"] = table["PLAYER_NAME"].map(lambda n: ids.get(simple_name(n)))
    table.insert(0, "SEASON", season)
    return table, url


def main():
    import sys
    bbref_only = "--bbref-only" in sys.argv      # re-build only the Basketball-Reference files (uses the cache)
    unmatched = 0
    for season in SEASONS:
        print(f"Season {season}:")
        if bbref_only:
            nba_players = pd.DataFrame(json.loads((DATA_DIR / season / "players.json").read_text()))
            bbref, url = bbref_advanced(season, nba_players)
            save_json(bbref, DATA_DIR / season / "bbref_advanced.json")
            unmatched += bbref["PLAYER_ID"].isna().sum()
            print(f"  bbref rows: {len(bbref)} (not matched: {bbref['PLAYER_ID'].isna().sum()})")
            continue
        team_games, opening = game_logs(season)
        save_json(team_games, DATA_DIR / season / "team_games.json")
        save_json(opening, DATA_DIR / season / "opening_day.json")
        print(f"  team games: {len(team_games)}, opening day {opening['GAME_DATE'].iloc[0]}: {len(opening)} player lines")

        track = tracking(season)
        save_json(track, DATA_DIR / season / "players_tracking.json")
        print(f"  tracking rows: {len(track)}")

        nba_players = pd.DataFrame(json.loads((DATA_DIR / season / "players.json").read_text()))
        try:
            bbref, url = bbref_advanced(season, nba_players)
            save_json(bbref, DATA_DIR / season / "bbref_advanced.json")
            unmatched += bbref["PLAYER_ID"].isna().sum()
            print(f"  bbref rows: {len(bbref)} (not matched to NBA.com id: {bbref['PLAYER_ID'].isna().sum()})")
        except Exception as error:
            print(f"  !! Basketball-Reference failed for {season}: {error}")

    meta_path = DATA_DIR / "meta.json"
    meta = json.loads(meta_path.read_text())
    if bbref_only and meta.get("extras"):
        print("Done (BBRef only). Unmatched:", unmatched)
        return
    meta["extras"] = {
        "pulled_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "nba_game_logs": "NBA.com/stats LeagueGameLog (team and player game logs)",
        "nba_tracking": "NBA.com/stats LeagueDashPtStats (Second Spectrum player tracking)",
        "bbref": "Basketball-Reference.com season advanced tables (BPM, OBPM, DBPM, PER, WS, VORP)",
        "bbref_url": "https://www.basketball-reference.com/",
    }
    meta_path.write_text(json.dumps(meta, indent=2))
    print("Done.  BBRef rows without an NBA.com match:", unmatched)


if __name__ == "__main__":
    main()
