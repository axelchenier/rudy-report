"""
build_history.py  -  turns the cached NBA.com history (1996-97 to 2015-16) into the site's season files.
All data is NBA.com/stats (downloaded earlier by pipeline/cache/download_history.py nba, via the same NBA.com
endpoints nba_api uses). NOTHING from Basketball-Reference is used here.

RUN IT (from the nba-stats-app folder):
    .venv/bin/python pipeline/build_history.py              every cached season
    .venv/bin/python pipeline/build_history.py 2005-06      one season

For each season it writes the same files fetch_data.py / fetch_extras.py / fetch_more.py write for recent seasons:
  players.json, players_totals.json, players_per36.json, teams.json, teams_totals.json, teams_per100.json   (dashboards, from the cache)
  team_games.json, opening_day.json, team_gamelogs.json, gamelogs/p_NN.json                                (game logs, from the cache)
  standings.json   (ONE live NBA.com request per season: LeagueStandingsV3. Old seasons lack season point totals,
                    so TotalPoints / OppTotalPoints are added up from that season's NBA.com team game log.)
and adds the season to data/meta.json with "era": "history".
Stats NBA.com did not track back then (player tracking, hustle, Synergy play types, lineups...) are simply not written;
the website shows "not tracked in this era" for them (js/data.js ERA).
"""
import json
import sys
from pathlib import Path

import pandas as pd

from fetch_data import DATA_DIR, save_json, PLAYER_BASIC_COLS, PLAYER_ADV_COLS, TEAM_BASIC_COLS, TEAM_ADV_COLS
import fetch_more

CACHE = Path(__file__).resolve().parent / "cache" / "history" / "nba"


def frame(season, name):
    return pd.DataFrame(json.loads((CACHE / season / f"{name}.json").read_text()))


def cols(f, wanted):
    for c in wanted:
        if c not in f.columns:
            f[c] = None
    return f[wanted].copy()


def build(season):
    tlog = frame(season, "gamelog_T")
    plog = frame(season, "gamelog_P")
    abbrev = dict(zip(tlog["TEAM_ID"], tlog["TEAM_ABBREVIATION"]))         # the season's own codes (SEA, NJN, VAN...)

    players = cols(frame(season, "players_Base_PerGame"), PLAYER_BASIC_COLS).merge(
        cols(frame(season, "players_Advanced_PerGame"), PLAYER_ADV_COLS), on="PLAYER_ID", how="left")
    players.insert(0, "SEASON", season)

    tbasic = cols(frame(season, "teams_Base_PerGame"), TEAM_BASIC_COLS)
    tadv = cols(frame(season, "teams_Advanced_PerGame"), TEAM_ADV_COLS)
    t100raw = frame(season, "teams_Base_Per100Possessions")
    t100 = t100raw[["TEAM_ID", "PTS", "FG3A", "FG3M", "FGA", "FTA", "AST", "TOV", "REB"]].rename(
        columns=lambda c: c if c == "TEAM_ID" else f"{c}_PER100")
    teams = tbasic.merge(tadv, on="TEAM_ID").merge(t100, on="TEAM_ID")
    teams.insert(1, "TEAM_ABBREVIATION", teams["TEAM_ID"].map(abbrev))
    teams["FG3A_RATE"] = teams["FG3A"] / teams["FGA"]
    teams.insert(0, "SEASON", season)

    p_tot = cols(frame(season, "players_Base_Totals"), PLAYER_BASIC_COLS)
    p_36 = cols(frame(season, "players_Base_Per36"), PLAYER_BASIC_COLS)
    t_tot = cols(frame(season, "teams_Base_Totals"), TEAM_BASIC_COLS)
    t_100 = cols(t100raw, TEAM_BASIC_COLS)
    for t in (p_tot, p_36, t_tot, t_100):
        t.insert(0, "SEASON", season)
    for t in (t_tot, t_100):
        t.insert(2, "TEAM_ABBREVIATION", t["TEAM_ID"].map(abbrev))

    out = DATA_DIR / season
    save_json(players, out / "players.json")
    save_json(teams, out / "teams.json")
    save_json(p_tot, out / "players_totals.json")
    save_json(p_36, out / "players_per36.json")
    save_json(t_tot, out / "teams_totals.json")
    save_json(t_100, out / "teams_per100.json")

    # Game logs (same shapes as fetch_extras.game_logs and fetch_more.write_game_logs).
    tg = tlog.copy()
    tg["HOME"] = tg["MATCHUP"].str.contains("vs.").astype(int)
    team_games = tg[["TEAM_ID", "TEAM_ABBREVIATION", "TEAM_NAME", "GAME_ID", "GAME_DATE", "MATCHUP", "HOME", "WL", "PTS", "PLUS_MINUS"]].copy()
    team_games.insert(0, "SEASON", season)
    save_json(team_games, out / "team_games.json")
    first = plog["GAME_DATE"].min()
    opening = plog[plog["GAME_DATE"] == first][["PLAYER_ID", "PLAYER_NAME", "TEAM_ID", "TEAM_ABBREVIATION", "GAME_DATE", "MATCHUP", "WL", "MIN", "PTS", "REB", "AST", "FG3M"]].copy()
    opening.insert(0, "SEASON", season)
    save_json(opening, out / "opening_day.json")
    fetch_more.write_game_logs(season, tlog, plog)

    # Standings: one NBA.com request, then season point totals from the game log if NBA.com doesn't have them.
    fetch_more.standings(season)
    st = json.loads((out / "standings.json").read_text())
    pts = tg.groupby("TEAM_ID")["PTS"].sum()
    opp = (tg["PTS"] - tg["PLUS_MINUS"]).groupby(tg["TEAM_ID"]).sum()
    for r in st:
        if r.get("TotalPoints") is None:
            r["TotalPoints"] = int(pts.get(r["TeamID"], 0))
            r["OppTotalPoints"] = int(round(opp.get(r["TeamID"], 0)))
    (out / "standings.json").write_text(json.dumps(st, ensure_ascii=False))
    return {"season": season, "players": len(players), "teams": len(teams), "max_team_games": int(teams["GP"].max()), "era": "history"}


def main():
    seasons = sys.argv[1:] or sorted(p.name for p in CACHE.iterdir() if p.is_dir())
    meta_path = DATA_DIR / "meta.json"
    built = []
    for s in seasons:
        print(f"{s} ...", flush=True)
        built.append(build(s))
        print(f"  {built[-1]}", flush=True)
    meta = json.loads(meta_path.read_text())
    keep = {x["season"]: x for x in meta["seasons"]}
    for b in built:
        keep[b["season"]] = b
    meta["seasons"] = sorted(keep.values(), key=lambda x: x["season"], reverse=True)
    meta.setdefault("extras", {})["history"] = "1996-97 to 2015-16: NBA.com/stats dashboards, game logs and standings (pipeline/build_history.py)"
    meta_path.write_text(json.dumps(meta, indent=2))
    print("Done.")


if __name__ == "__main__":
    main()
