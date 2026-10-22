"""
fetch_schedule.py  -  downloads the season schedule (for the Playoff Odds simulator on the Tools page).
Source: NBA.com ScheduleLeagueV2 via nba_api.

RUN IT (from the nba-stats-app folder):
    .venv/bin/python pipeline/fetch_schedule.py            current season (data/meta.json "current_season")
    .venv/bin/python pipeline/fetch_schedule.py 2026-27    one season
(update_reports.py calls update_season() for the current season every night.)

Saves data/<season>/schedule.json:
  games: every REGULAR-SEASON game NBA.com has scheduled, as [gameId, date (ET), homeTeamId, awayTeamId]
         (NBA Cup knockout games whose teams aren't known yet are left out; the simulator fills each team up to 82
         games with "opponent not known yet" games, see js/pages/tools.js)
  model: two numbers measured from the most recent COMPLETE season's real games (data/<prior>/team_games.json + teams.json):
         home_edge = average home-team margin (points)
         margin_sd = standard deviation of game margins around (home point diff/game - away point diff/game + home_edge)
         carryover = how much of last season's point differential per game carries into the next season
                     (least-squares slope over every pair of consecutive complete seasons in data/)
         talent_sd = spread of next-season point differential that last season does NOT explain, after removing
                     game-to-game noise (sqrt(residual variance - margin_sd^2 / 82)); the simulator uses it as
                     the uncertainty of each team's true strength before games are played
"""
import json
import statistics
import sys
from datetime import datetime, timezone

from nba_api.stats.endpoints import ScheduleLeagueV2

from fetch_data import DATA_DIR
from fetch_more import nba_call


def model_numbers(season):
    """Home edge and game-to-game spread, measured from a complete season's real results."""
    games = json.loads((DATA_DIR / season / "team_games.json").read_text())
    teams = {t["TEAM_ID"]: t["PLUS_MINUS"] for t in json.loads((DATA_DIR / season / "teams.json").read_text())}
    home = [g for g in games if g["HOME"] == 1]
    away = {(g["GAME_ID"]): g for g in games if g["HOME"] == 0}
    margins, resid = [], []
    for g in home:
        a = away.get(g["GAME_ID"])
        if not a:
            continue
        margins.append(g["PLUS_MINUS"])
    edge = statistics.mean(margins)
    for g in home:
        a = away.get(g["GAME_ID"])
        if a:
            resid.append(g["PLUS_MINUS"] - (teams[g["TEAM_ID"]] - teams[a["TEAM_ID"]] + edge))
    return {"from_season": season, "games": len(margins), "home_edge": round(edge, 2), "margin_sd": round(statistics.pstdev(resid), 2)}


def carryover(done):
    """Year-to-year slope of team point differential per game, and the unexplained spread."""
    xs, ys = [], []
    for a, b in zip(done, done[1:]):
        A = {t["TEAM_ID"]: t["PLUS_MINUS"] for t in json.loads((DATA_DIR / a / "teams.json").read_text())}
        B = {t["TEAM_ID"]: t["PLUS_MINUS"] for t in json.loads((DATA_DIR / b / "teams.json").read_text())}
        for k in A.keys() & B.keys():
            xs.append(A[k]); ys.append(B[k])
    mx, my = statistics.mean(xs), statistics.mean(ys)
    slope = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sum((x - mx) ** 2 for x in xs)
    resid = statistics.pvariance([y - (my + slope * (x - mx)) for x, y in zip(xs, ys)])
    return {"pairs": len(xs), "seasons": f"{done[0]} to {done[-1]}", "carryover": round(slope, 3), "resid_var": resid}


def update_season(season):
    frame = nba_call(lambda: ScheduleLeagueV2(league_id="00", season=season, timeout=60), f"{season} schedule")
    reg = frame[frame["gameId"].str.startswith("002") & (frame["homeTeam_teamId"] > 0) & (frame["awayTeam_teamId"] > 0)]
    games = [[r.gameId, r.gameDateEst[:10], int(r.homeTeam_teamId), int(r.awayTeam_teamId)] for r in reg.itertuples()]
    meta = json.loads((DATA_DIR / "meta.json").read_text())
    done = [s["season"] for s in meta["seasons"] if not s.get("in_progress") and s["season"] < season]
    out = {
        "source": "NBA.com ScheduleLeagueV2 via nba_api",
        "season": season,
        "pulled_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "games": games,
        "model": None,
    }
    if done:
        m = model_numbers(max(done))
        c = carryover(sorted(done))
        m["carryover"] = c["carryover"]
        m["carryover_from"] = f"{c['pairs']} team-seasons, {c['seasons']}"
        m["talent_sd"] = round(max(c["resid_var"] - m["margin_sd"] ** 2 / 82, 1.0) ** 0.5, 2)
        out["model"] = m
    path = DATA_DIR / season / "schedule.json"
    path.write_text(json.dumps(out, separators=(",", ":")))
    print(f"  {season}: schedule {len(games)} regular-season games -> {path.relative_to(DATA_DIR.parent)}")


if __name__ == "__main__":
    seasons = sys.argv[1:] or [json.loads((DATA_DIR / "meta.json").read_text())["current_season"]]
    for s in seasons:
        update_season(s)
