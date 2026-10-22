"""
college_gamelogs.py  -  per-game box score lines for college players (the "Game log" on college player pages).

RUN IT:
    .venv/bin/python pipeline/college_gamelogs.py              # the last 2 finished seasons (add years for more)
    .venv/bin/python pipeline/college_gamelogs.py 2024 2025    # specific seasons (by ending year)
update_college.py runs it nightly for the current season only (cheap no-op before games start).

SOURCE: ESPN men's college basketball box scores via the free sportsdataverse package (load_mbb_player_boxscore),
the same ESPN data already used for turnovers/fouls/starts. Players are linked to Torvik's player ids through the
ESPN_ID column of data/college/<season>/players.json, so only D-I players in our college data get a game log.

OUTPUT: data/college/gamelogs/<season>/teams.json  (team game logs: {"cols": [...], "teams": {"<TEAM_ID>": [[DATE, TYPE, H/A, OPP, PTS, OPP_PTS, own box..., O_ opponent box...]]}})
        data/college/gamelogs/<season>/g_NN.json  (players split into 50 files by PID % 50)
  {"cols": [...], "players": {"<PID>": [[DATE yymmdd, TYPE 2=regular/3=postseason, H/A, OPP, TM_PTS, OPP_PTS, GS, MIN, PTS, ...], ...]}}
  OPP = Torvik TEAM_ID of a D-I opponent, or "~<ESPN name>" for a non-D-I opponent.
"""
import json, sys
from datetime import date
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import college_fetch as cf

OUT = cf.ROOT / "data" / "college" / "gamelogs"
SHARDS = 50
COLS = ["DATE", "TYPE", "HA", "OPP", "TM_PTS", "OPP_PTS", "GS", "MIN", "PTS", "REB", "OREB", "AST", "STL", "BLK",
        "TOV", "PF", "FGM", "FGA", "FG3M", "FG3A", "FTM", "FTA"]


def build(year, force=False):
    s = cf.season_label(year)
    pf = cf.ROOT / "data" / "college" / s / "players.json"
    tf = cf.ROOT / "data" / "college" / s / "teams.json"
    if not pf.exists():
        print(f"  {s}: no college player file, skipped"); return
    cache = cf.CACHE / f"{year}_espn_player_box.parquet"
    if force or not cache.exists():
        import sportsdataverse.mbb as mbb
        try:
            pb = mbb.load_mbb_player_boxscore(seasons=[year], return_as_pandas=True)
        except Exception as e:                                       # noqa: BLE001  (no file yet before the season starts)
            print(f"  {s}: ESPN box scores unavailable ({e})"); return
        if pb is None or not len(pb):
            print(f"  {s}: no games yet"); return
        pb.to_parquet(cache)
    pb = pd.read_parquet(cache)
    pb = pb[(pb["did_not_play"] != True) & pd.to_numeric(pb["minutes"], errors="coerce").fillna(0).gt(0)]  # noqa: E712
    players = cf.expand(json.loads(pf.read_text()))
    pid_of = {int(p["ESPN_ID"]): p["PID"] for p in players if p.get("ESPN_ID")}
    teams = json.loads(tf.read_text())
    team_of = {int(t["ESPN_ID"]): t["TEAM_ID"] for t in teams if t.get("ESPN_ID")}
    pb = pb[pb["athlete_id"].astype(int).isin(pid_of)]
    shards = [{} for _ in range(SHARDS)]
    num = lambda v: None if pd.isna(v) else int(v)
    for r in pb.sort_values("game_date").itertuples():
        pid = pid_of[int(r.athlete_id)]
        opp = team_of.get(int(r.opponent_team_id)) if not pd.isna(r.opponent_team_id) else None
        shards[pid % SHARDS].setdefault(str(pid), []).append([str(r.game_date)[2:10].replace("-", ""), int(r.season_type), "H" if r.home_away == "home" else "A",
            opp or f"~{r.opponent_team_location}", num(r.team_score), num(r.opponent_team_score),
            1 if r.starter else 0, round(float(r.minutes)), num(r.points), num(r.rebounds), num(r.offensive_rebounds), num(r.assists), num(r.steals),
            num(r.blocks), num(r.turnovers), num(r.fouls), num(r.field_goals_made), num(r.field_goals_attempted),
            num(r.three_point_field_goals_made), num(r.three_point_field_goals_attempted), num(r.free_throws_made), num(r.free_throws_attempted)])
    for i, rows in enumerate(shards):
        cf.write_json(OUT / s / f"g_{i:02d}.json", {"season": s, "source": "ESPN box scores via sportsdataverse", "cols": COLS, "players": rows})
    print(f"  {s}: {len(pb):,} player-games for {pb['athlete_id'].nunique():,} D-I players")


TCOLS = ["DATE", "TYPE", "HA", "OPP", "PTS", "OPP_PTS", "FGM", "FGA", "FG3M", "FG3A", "FTM", "FTA", "OREB", "DREB", "AST", "TOV", "STL", "BLK", "PF",
         "O_FGM", "O_FGA", "O_FG3M", "O_FG3A", "O_FTM", "O_FTA", "O_OREB", "O_DREB", "O_TOV"]


def build_teams(year, force=False):
    """Team game logs: one row per D-I team per game, with the opponent's box score for ratings."""
    s = cf.season_label(year)
    tf = cf.ROOT / "data" / "college" / s / "teams.json"
    if not tf.exists():
        return
    cache = cf.CACHE / f"{year}_espn_team_box.parquet"
    if force or not cache.exists():
        import sportsdataverse.mbb as mbb
        try:
            tb = mbb.load_mbb_team_boxscore(seasons=[year], return_as_pandas=True)
        except Exception as e:                                       # noqa: BLE001
            print(f"  {s}: ESPN team box scores unavailable ({e})"); return
        if tb is None or not len(tb):
            return
        tb.to_parquet(cache)
    tb = pd.read_parquet(cache)
    team_of = {int(t["ESPN_ID"]): t["TEAM_ID"] for t in json.loads(tf.read_text()) if t.get("ESPN_ID")}
    by_game = {(int(r.game_id), int(r.team_id)): r for r in tb.itertuples()}
    num = lambda v: None if v is None or pd.isna(v) else int(v)
    out = {}
    for r in tb.sort_values("game_date").itertuples():
        tid = team_of.get(int(r.team_id))
        if not tid or pd.isna(r.team_score):
            continue
        o = by_game.get((int(r.game_id), int(r.opponent_team_id)))
        opp = team_of.get(int(r.opponent_team_id)) or f"~{r.opponent_team_location}"
        g = lambda x, k: num(getattr(x, k)) if x is not None else None
        out.setdefault(tid, []).append([str(r.game_date)[2:10].replace("-", ""), int(r.season_type), "H" if r.team_home_away == "home" else "A", opp,
            num(r.team_score), num(r.opponent_team_score), g(r, "field_goals_made"), g(r, "field_goals_attempted"), g(r, "three_point_field_goals_made"),
            g(r, "three_point_field_goals_attempted"), g(r, "free_throws_made"), g(r, "free_throws_attempted"), g(r, "offensive_rebounds"), g(r, "defensive_rebounds"),
            g(r, "assists"), g(r, "total_turnovers"), g(r, "steals"), g(r, "blocks"), g(r, "fouls"),
            g(o, "field_goals_made"), g(o, "field_goals_attempted"), g(o, "three_point_field_goals_made"), g(o, "three_point_field_goals_attempted"),
            g(o, "free_throws_made"), g(o, "free_throws_attempted"), g(o, "offensive_rebounds"), g(o, "defensive_rebounds"), g(o, "total_turnovers")])
    cf.write_json(OUT / s / "teams.json", {"season": s, "source": "ESPN box scores via sportsdataverse", "cols": TCOLS, "teams": out})
    print(f"  {s}: team game logs for {len(out)} D-I teams")


def current_year():
    t = date.today()
    return t.year + 1 if t.month >= 7 else t.year


def update_current():
    """Nightly: rebuild the current season's logs (re-downloads ESPN's file; skipped before games exist)."""
    if date.today().month in (5, 6, 7, 8, 9, 10):         # no college games May-October
        return
    build(current_year(), force=True)
    build_teams(current_year(), force=True)
    write_index()


def main():
    years = [int(a) for a in sys.argv[1:]] or [current_year() - 2, current_year() - 1]
    for y in years:
        build(y)
        build_teams(y)
    write_index()


def write_index():
    seasons = sorted(p.name for p in OUT.iterdir() if p.is_dir()) if OUT.exists() else []
    cf.write_json(OUT / "index.json", {"seasons": seasons[::-1], "source": "ESPN box scores via sportsdataverse"})


if __name__ == "__main__":
    main()
