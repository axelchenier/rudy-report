"""
update_reports.py  -  refreshes the CURRENT season and writes the Daily / Weekly / Monthly reports.

RUN IT (from the nba-stats-app folder):
    .venv/bin/python pipeline/update_reports.py

Safe to run every day (for example from cron). Running it twice gives the same files ("idempotent").
If anything fails it prints "ERROR: ..." and exits with code 1, so cron can email you.

WHAT IT DOES
  1. Downloads the current season from NBA.com (via nba_api):
       - the season tables the website uses (players.json, teams.json, ...)  -> data/<season>/
       - every team game and every player game so far (LeagueGameLog)
       - which players are rookies (CommonAllPlayers)
  2. Builds three reports, all ending on the most recent date with completed games:
       Daily   = that one date            compared with the previous game day
       Weekly  = the last 7 days           compared with the 7 days before
       Monthly = the last 30 days          compared with the 30 days before
     If the comparison period has no games (season just started / offseason), the report compares
     against LAST SEASON's averages instead and says so.
  3. Saves them as JSON:
       data/reports/daily/<date>.json          (one per game day, kept forever)
       data/reports/weekly/latest.json         (rolling, rebuilt every run)
       data/reports/weekly/<date>.json         (archived copy: on Mondays, or with --archive)
       data/reports/monthly/latest.json        (rolling, rebuilt every run)
       data/reports/monthly/<date>.json        (archived copy: on the 1st of the month, or with --archive)
       data/reports/index.json                 (the list the website shows)

OPTIONS
  --archive        also save dated weekly + monthly copies today (used for the very first run)
  --no-refresh     don't download; rebuild reports from the files already saved (for testing)

Every number comes from NBA.com box scores. Team ratings (ORtg/DRtg/Net/Pace) for date ranges are
calculated from box scores with the standard possession estimate:
    possessions = FGA + 0.44 x FTA - OREB + TOV   (averaged between the two teams in each game)
"""

import json
import math
import sys
import time
import traceback
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd
from nba_api.stats.endpoints import leaguegamelog, commonallplayers

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_data import DATA_DIR, SEASON_TYPE, PAUSE_SECONDS, save_json, fetch_season   # noqa: E402

REPORTS_DIR = DATA_DIR / "reports"
CACHE_DIR = Path(__file__).resolve().parent / "cache"
SOURCES = ["NBA.com/stats box scores (LeagueGameLog) via nba_api",
           "NBA.com/stats season tables (LeagueDashPlayerStats / LeagueDashTeamStats) via nba_api"]
US_EASTERN = ZoneInfo("America/New_York")      # NBA game dates are US dates

# Minimums so one hot night doesn't top a list. (games in the period, minutes per game)
MINIMUMS = {"daily": (1, 20), "weekly": (2, 20), "monthly": (4, 20)}
SPAN_DAYS = {"daily": 1, "weekly": 7, "monthly": 30}


# ============================================================================
# Small helpers
# ============================================================================
def season_for(day):
    """The NBA season a date belongs to: Oct 2026 -> '2026-27', Feb 2027 -> '2026-27'."""
    start = day.year if day.month >= 8 else day.year - 1
    return f"{start}-{str(start + 1)[2:]}"


def previous_season(season):
    start = int(season[:4]) - 1
    return f"{start}-{str(start + 1)[2:]}"


def nba_call(make_request, what):
    """One NBA.com request, up to 3 tries, then a polite pause."""
    last_error = None
    for attempt in range(3):
        try:
            frame = make_request().get_data_frames()[0]
            time.sleep(PAUSE_SECONDS)
            return frame
        except Exception as error:          # network hiccup, timeout, rate limit...
            last_error = error
            print(f"  ...{what}: problem ({error}); retrying in 5s")
            time.sleep(5)
    raise RuntimeError(f"NBA.com request for {what} failed 3 times: {last_error}")


def r(x, digits=1):
    """Round for JSON; turns NaN into None."""
    if x is None or (isinstance(x, float) and (math.isnan(x) or math.isinf(x))):
        return None
    return round(float(x), digits)


def plural(n, word):
    return f"{n} {word}{'' if n == 1 else 's'}"


def fmt_date(d):
    return pd.Timestamp(d).strftime("%b %-d, %Y")


def game_score(row):
    """John Hollinger's Game Score: one number summing up a box-score line."""
    return (row.PTS + 0.4 * row.FGM - 0.7 * row.FGA - 0.4 * (row.FTA - row.FTM) + 0.7 * row.OREB
            + 0.3 * row.DREB + row.STL + 0.7 * row.AST + 0.7 * row.BLK - 0.4 * row.PF - row.TOV)


def stat_line(row):
    parts = [f"{int(row.PTS)} PTS", f"{int(row.REB)} REB", f"{int(row.AST)} AST"]
    if row.STL >= 3: parts.append(f"{int(row.STL)} STL")
    if row.BLK >= 3: parts.append(f"{int(row.BLK)} BLK")
    if row.FG3M >= 3: parts.append(f"{int(row.FG3M)} 3PM")
    return ", ".join(parts) + f" ({int(row.FGM)}-{int(row.FGA)} FG, {int(row.MIN)} min)"


# ============================================================================
# 1) Download
# ============================================================================
def game_log(season, kind):
    """kind 'T' = one row per team per game; 'P' = one row per player per game."""
    frame = nba_call(lambda: leaguegamelog.LeagueGameLog(season=season, season_type_all_star=SEASON_TYPE,
                                                         player_or_team_abbreviation=kind, timeout=60),
                     f"{season} {'team' if kind == 'T' else 'player'} game log")
    frame["GAME_DATE"] = pd.to_datetime(frame["GAME_DATE"]).dt.strftime("%Y-%m-%d")
    return frame


def refresh(season):
    """Download the current season and save everything. Returns (team_log, player_log, rookie_ids)."""
    print(f"Refreshing {season} from NBA.com ...")
    teams = game_log(season, "T")
    players = game_log(season, "P")
    if teams.empty:
        raise RuntimeError(f"NBA.com returned no {season} games yet (has the regular season started?)")
    CACHE_DIR.mkdir(exist_ok=True)
    teams.to_json(CACHE_DIR / f"gamelog_T_{season}.json", orient="records")
    players.to_json(CACHE_DIR / f"gamelog_P_{season}.json", orient="records")

    everyone = nba_call(lambda: commonallplayers.CommonAllPlayers(is_only_current_season=1, season=season, timeout=60), "player list")
    rookies = everyone[pd.to_numeric(everyone["FROM_YEAR"], errors="coerce") == int(season[:4])]["PERSON_ID"].tolist()
    (CACHE_DIR / f"rookies_{season}.json").write_text(json.dumps(rookies))

    # Season tables for the website (Players/Teams pages, Ask bar, season picker).
    summary = fetch_season(season)
    # Home/away + opening-day files the Ask bar uses (same format as fetch_extras.py makes).
    teams["HOME"] = teams["MATCHUP"].str.contains("vs.").astype(int)
    tg = teams[["TEAM_ID", "TEAM_ABBREVIATION", "TEAM_NAME", "GAME_ID", "GAME_DATE", "MATCHUP", "HOME", "WL", "PTS", "PLUS_MINUS"]].copy()
    tg.insert(0, "SEASON", season)
    save_json(tg, DATA_DIR / season / "team_games.json")
    first_day = players["GAME_DATE"].min()
    od = players[players["GAME_DATE"] == first_day][["PLAYER_ID", "PLAYER_NAME", "TEAM_ID", "TEAM_ABBREVIATION", "GAME_DATE", "MATCHUP", "WL", "MIN", "PTS", "REB", "AST", "FG3M"]].copy()
    od.insert(0, "SEASON", season)
    save_json(od, DATA_DIR / season / "opening_day.json")
    update_meta(season, summary)
    return teams, players, rookies


def update_meta(season, summary):
    """Put the in-progress season at the top of the season picker (data/meta.json)."""
    path = DATA_DIR / "meta.json"
    meta = json.loads(path.read_text())
    summary["in_progress"] = True
    seasons = [s for s in meta["seasons"] if s["season"] != season]
    for s in seasons:
        s.pop("in_progress", None)
    meta["seasons"] = [summary] + seasons
    meta["current_season"] = season
    # Until teams have ~20 games, the site opens on the last COMPLETE season by default.
    meta["default_season"] = season if summary["max_team_games"] >= 20 else seasons[0]["season"]
    meta["current_pulled_at_utc"] = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    path.write_text(json.dumps(meta, indent=2))


def load_cached(season):
    teams = pd.read_json(CACHE_DIR / f"gamelog_T_{season}.json", dtype={"GAME_ID": str, "GAME_DATE": str})
    players = pd.read_json(CACHE_DIR / f"gamelog_P_{season}.json", dtype={"GAME_ID": str, "GAME_DATE": str})
    rookies = json.loads((CACHE_DIR / f"rookies_{season}.json").read_text())
    return teams, players, rookies


def last_season_team_log(season):
    """Full team box scores for last season (downloaded once, then cached)."""
    path = CACHE_DIR / f"gamelog_T_{season}.json"
    if not path.exists():
        print(f"Downloading {season} team game log once (for last-season comparisons) ...")
        game_log(season, "T").to_json(path, orient="records")
    return pd.read_json(path, dtype={"GAME_ID": str, "GAME_DATE": str})


# ============================================================================
# 2) Calculations
# ============================================================================
def add_possessions(team_log):
    """Add OPP_PTS and possessions (standard estimate, averaged between both teams) to each team-game row."""
    t = team_log.copy()
    t["POSS_EST"] = t["FGA"] + 0.44 * t["FTA"] - t["OREB"] + t["TOV"]
    opp = t[["GAME_ID", "TEAM_ID", "PTS", "POSS_EST"]].rename(columns={"TEAM_ID": "OPP_ID", "PTS": "OPP_PTS", "POSS_EST": "OPP_POSS"})
    t = t.merge(opp, on="GAME_ID")
    t = t[t["TEAM_ID"] != t["OPP_ID"]].copy()
    t["POSS"] = (t["POSS_EST"] + t["OPP_POSS"]) / 2
    return t


def team_table(t):
    """One row per team for a set of team-games: record, ratings per 100 possessions, pace, 3PA/100."""
    if t.empty:
        return pd.DataFrame()
    g = t.groupby(["TEAM_ID", "TEAM_ABBREVIATION", "TEAM_NAME"]).agg(
        GP=("GAME_ID", "count"), W=("WL", lambda s: (s == "W").sum()), L=("WL", lambda s: (s == "L").sum()),
        PTS=("PTS", "sum"), OPP_PTS=("OPP_PTS", "sum"), POSS=("POSS", "sum"), MIN=("MIN", "sum"),
        FG3A=("FG3A", "sum"), FG3M=("FG3M", "sum"), FGA=("FGA", "sum"), FTA=("FTA", "sum")).reset_index()
    g["ORTG"] = 100 * g["PTS"] / g["POSS"]
    g["DRTG"] = 100 * g["OPP_PTS"] / g["POSS"]
    g["NET"] = g["ORTG"] - g["DRTG"]
    g["PACE"] = 48 * g["POSS"] / (g["MIN"] / 5)          # team MIN is 240 for a regular game (5 players x 48)
    g["FG3A_100"] = 100 * g["FG3A"] / g["POSS"]
    g["PPG"] = g["PTS"] / g["GP"]
    return g


def league_numbers(t):
    """League-wide averages for a set of team-games."""
    if t.empty:
        return None
    poss, minutes = t["POSS"].sum(), t["MIN"].sum()
    return {"PPG": t["PTS"].mean(), "PACE": 48 * poss / (minutes / 5), "ORTG": 100 * t["PTS"].sum() / poss,
            "FG3A_100": 100 * t["FG3A"].sum() / poss, "FG3_PCT": t["FG3M"].sum() / max(t["FG3A"].sum(), 1),
            "TS_PCT": t["PTS"].sum() / (2 * (t["FGA"].sum() + 0.44 * t["FTA"].sum()))}


def player_table(p):
    """One row per player for a set of player-games: per-game averages and true shooting %."""
    if p.empty:
        return pd.DataFrame()
    p = p.sort_values("GAME_DATE")
    g = p.groupby("PLAYER_ID").agg(
        PLAYER_NAME=("PLAYER_NAME", "last"), TEAM=("TEAM_ABBREVIATION", "last"), GP=("GAME_ID", "count"),
        MIN=("MIN", "mean"), PTS=("PTS", "mean"), REB=("REB", "mean"), AST=("AST", "mean"), STL=("STL", "mean"),
        BLK=("BLK", "mean"), FG3M=("FG3M", "mean"), TOV=("TOV", "mean"),
        PTS_SUM=("PTS", "sum"), FGA_SUM=("FGA", "sum"), FTA_SUM=("FTA", "sum")).reset_index()
    shots = g["FGA_SUM"] + 0.44 * g["FTA_SUM"]
    g["TS_PCT"] = (g["PTS_SUM"] / (2 * shots)).where(shots > 0)
    g["SHOTS_PG"] = shots / g["GP"]
    return g


def last_season_players(season):
    """Last season's official NBA.com per-game numbers (from our saved data)."""
    rows = pd.DataFrame(json.loads((DATA_DIR / season / "players.json").read_text()))
    rows = rows.rename(columns={"TEAM_ABBREVIATION": "TEAM"})
    rows["SHOTS_PG"] = rows["FGA"] + 0.44 * rows["FTA"]
    return rows


def person(row, extra=None):
    d = {"player": row.PLAYER_NAME, "player_id": int(row.PLAYER_ID), "team": row.TEAM}
    d.update(extra or {})
    return d


def team_ref(row):
    return {"team": row.TEAM_NAME, "abbr": row.TEAM_ABBREVIATION, "team_id": int(row.TEAM_ID)}


# ============================================================================
# 3) Building one report
# ============================================================================
def build_report(kind, end, teams_all, players_all, rookies, season, prior_season, last_players, last_teams_log):
    end_d = date.fromisoformat(end)
    days = SPAN_DAYS[kind]
    min_gp, min_min = MINIMUMS[kind]
    season_start = teams_all["GAME_DATE"].min()
    lowered = False

    # ---- Date windows ----
    if kind == "daily":
        start = end
        earlier = sorted(d for d in teams_all["GAME_DATE"].unique() if d < end)
        prior_range = (earlier[-1], earlier[-1]) if earlier else None
    else:
        start = (end_d - timedelta(days=days - 1)).isoformat()
        p_end = (end_d - timedelta(days=days)).isoformat()
        p_start = (end_d - timedelta(days=2 * days - 1)).isoformat()
        prior_range = (p_start, p_end) if (teams_all["GAME_DATE"].between(p_start, p_end)).any() else None

    tlog = add_possessions(teams_all)
    t_cur = tlog[tlog["GAME_DATE"].between(start, end)]
    p_cur = players_all[players_all["GAME_DATE"].between(start, end)]
    games_n = t_cur["GAME_ID"].nunique()
    team_gp = t_cur.groupby("TEAM_ID").size()
    # Early in the season nobody can have 4 games in "the last 30 days" yet, so the games minimum
    # is lowered to half of the most games any team has played in the period (at least 1).
    if len(team_gp) and min_gp > max(1, math.ceil(team_gp.max() * 0.5)):
        min_gp, lowered = max(1, math.ceil(team_gp.max() * 0.5)), True

    report = {
        "type": kind, "id": end, "season": season,
        "title": {"daily": f"Daily Report — {fmt_date(end)}", "weekly": f"Weekly Report — {fmt_date(start)} to {fmt_date(end)}",
                  "monthly": f"Monthly Report — {fmt_date(start)} to {fmt_date(end)}"}[kind],
        "range": {"start": max(start, season_start) if kind != "daily" else start, "end": end, "days": days,
                  "requested_start": start},
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "sources": SOURCES, "notes": [],
        "summary": {"games": int(games_n), "teams": int(t_cur["TEAM_ID"].nunique()), "players": int(p_cur["PLAYER_ID"].nunique()),
                    "max_team_games_in_period": int(team_gp.max()) if len(team_gp) else 0,
                    "season_games_so_far": int(tlog["GAME_ID"].nunique())},
    }
    if start < season_start:
        report["notes"].append(f"The {season} regular season started on {fmt_date(season_start)}, so this {kind} report only covers "
                               f"{fmt_date(season_start)} to {fmt_date(end)} ({games_n} games).")
    if kind != "daily" and team_gp.max() < 5:
        report["notes"].append(f"Small sample: no team has played more than {plural(int(team_gp.max()), 'game')} in this period. "
                               "Averages will move a lot over the next few weeks.")
    if kind == "daily" and tlog["GAME_ID"].nunique() < 50:
        report["notes"].append(f"Early season: only {tlog['GAME_ID'].nunique()} games have been played so far this season.")

    # ---- Games and scores ----
    games = []
    for gid, g in t_cur.groupby("GAME_ID"):
        home = g[g["MATCHUP"].str.contains("vs.")]
        away = g[~g["MATCHUP"].str.contains("vs.")]
        if home.empty or away.empty:
            continue
        h, a = home.iloc[0], away.iloc[0]
        ot = int(round((h.MIN - 240) / 25)) if h.MIN > 240 else 0
        games.append({"game_id": gid, "date": h.GAME_DATE, "home": h.TEAM_NAME, "home_abbr": h.TEAM_ABBREVIATION, "home_id": int(h.TEAM_ID),
                      "home_pts": int(h.PTS), "away": a.TEAM_NAME, "away_abbr": a.TEAM_ABBREVIATION, "away_id": int(a.TEAM_ID),
                      "away_pts": int(a.PTS), "ot": ot, "margin": int(abs(h.PTS - a.PTS))})
    games.sort(key=lambda x: (x["date"], x["game_id"]))
    report["games"] = games if kind == "daily" else []

    # ---- Top single-game performances (Game Score) ----
    pc = p_cur.copy()
    if not pc.empty:
        pc["GMSC"] = pc.apply(game_score, axis=1)
        pc["OPP"] = pc["MATCHUP"].str.split(" ").str[-1]
    top = pc.sort_values("GMSC", ascending=False).head(10) if not pc.empty else pc
    report["top_performers"] = [{"player": x.PLAYER_NAME, "player_id": int(x.PLAYER_ID), "team": x.TEAM_ABBREVIATION, "date": x.GAME_DATE,
                                 "opp": x.OPP, "wl": x.WL, "pts": int(x.PTS), "reb": int(x.REB), "ast": int(x.AST),
                                 "gmsc": r(x.GMSC), "line": stat_line(x)} for x in top.itertuples()]

    # ---- Notable stat lines ----
    notable = []
    for x in pc.itertuples() if not pc.empty else []:
        tags = []
        if x.PTS >= 30: tags.append(f"{int(x.PTS)}-point game")
        tens = sum(v >= 10 for v in (x.PTS, x.REB, x.AST, x.STL, x.BLK))
        if tens >= 3: tags.append("triple-double")
        if x.PTS >= 20 and x.REB >= 20: tags.append("20-20")
        if x.FG3M >= 5: tags.append(f"{int(x.FG3M)} threes")
        if x.BLK >= 5: tags.append(f"{int(x.BLK)} blocks")
        if x.STL >= 5: tags.append(f"{int(x.STL)} steals")
        if tags:
            notable.append({"player": x.PLAYER_NAME, "player_id": int(x.PLAYER_ID), "team": x.TEAM_ABBREVIATION, "date": x.GAME_DATE,
                            "opp": x.OPP, "tags": tags, "pts": int(x.PTS), "line": stat_line(x)})
    notable.sort(key=lambda n: (-len(n["tags"]), -n["pts"]))
    report["notable"] = notable[:40]
    report["notable_counts"] = {
        "30_point_games": sum(any(t.endswith("-point game") for t in n["tags"]) for n in notable),
        "triple_doubles": sum("triple-double" in n["tags"] for n in notable),
        "games_5_threes": sum(any(t.endswith(" threes") for t in n["tags"]) for n in notable),
        "twenty_twenty": sum("20-20" in n["tags"] for n in notable)}

    # ---- Standout team performances ----
    stand = []
    if not t_cur.empty:
        tc = t_cur.copy()
        tc["MARGIN"] = tc["PTS"] - tc["OPP_PTS"]
        tc["EFG"] = (tc["FGM"] + 0.5 * tc["FG3M"]) / tc["FGA"]
        tc["ORTG_G"] = 100 * tc["PTS"] / tc["POSS"]
        tc["OPP"] = tc["MATCHUP"].str.split(" ").str[-1]
        def add(label, row, value, detail):
            stand.append({"label": label, **team_ref(row), "date": row.GAME_DATE, "value": value, "detail": detail})
        x = tc.sort_values("MARGIN", ascending=False).iloc[0]; add("Biggest win", x, f"+{int(x.MARGIN)}", f"{int(x.PTS)}-{int(x.OPP_PTS)} vs {x.OPP}")
        x = tc.sort_values("PTS", ascending=False).iloc[0]; add("Most points", x, f"{int(x.PTS)}", f"vs {x.OPP} ({x.WL})")
        x = tc.sort_values("ORTG_G", ascending=False).iloc[0]; add("Best offensive rating (one game)", x, f"{x.ORTG_G:.1f}", f"points per 100 possessions vs {x.OPP}")
        x = tc.sort_values("FG3M", ascending=False).iloc[0]; add("Most 3-pointers", x, f"{int(x.FG3M)}", f"{int(x.FG3M)}-{int(x.FG3A)} vs {x.OPP}")
        x = tc.sort_values("EFG", ascending=False).iloc[0]; add("Best shooting (eFG%)", x, f"{100 * x.EFG:.1f}%", f"vs {x.OPP}")
        x = tc.sort_values("OPP_PTS").iloc[0]; add("Best defense (fewest points allowed)", x, f"{int(x.OPP_PTS)}", f"vs {x.OPP} ({x.WL})")
    report["team_standouts"] = stand

    # ---- Leaders over the period (weekly/monthly) ----
    players_cur = player_table(p_cur)
    q = players_cur[(players_cur["GP"] >= min_gp) & (players_cur["MIN"] >= min_min)] if not players_cur.empty else players_cur
    leaders = []
    if kind != "daily" and not q.empty:
        for key, lab in [("PTS", "Points per game"), ("REB", "Rebounds per game"), ("AST", "Assists per game"),
                         ("STL", "Steals per game"), ("BLK", "Blocks per game"), ("FG3M", "3-pointers made per game")]:
            rows = q.sort_values(key, ascending=False).head(5)
            leaders.append({"stat": key, "label": lab, "rows": [person(x, {"gp": int(x.GP), "value": r(getattr(x, key))}) for x in rows.itertuples()]})
        ts = q[q["SHOTS_PG"] >= 10].sort_values("TS_PCT", ascending=False).head(5)
        leaders.append({"stat": "TS_PCT", "label": "True shooting % (10+ shot attempts a game)",
                        "rows": [person(x, {"gp": int(x.GP), "value": r(x.TS_PCT, 3)}) for x in ts.itertuples()]})
    report["leaders"] = leaders
    report["qualifier"] = (f"Player lists need at least {plural(min_gp, 'game')} and {min_min} minutes per game in the period"
                           + (f" (normally {MINIMUMS[kind][0]} games; lowered because the season just started)." if lowered else "."))

    # ---- Hot / cold vs LAST SEASON's averages ----
    last = last_players[(last_players["GP"] >= 20) & (last_players["MIN"] >= 15)].set_index("PLAYER_ID")
    hc = []
    for x in q.itertuples() if not q.empty else []:
        if x.PLAYER_ID in last.index:
            L = last.loc[x.PLAYER_ID]
            hc.append(person(x, {"gp": int(x.GP), "min": r(x.MIN), "ppg": r(x.PTS), "prior_ppg": r(L.PTS),
                                 "delta": r(x.PTS - L.PTS), "ts": r(x.TS_PCT, 3), "prior_ts": r(L.TS_PCT, 3)}))
    hc.sort(key=lambda d: d["delta"], reverse=True)
    report["hot"] = hc[:8]
    report["cold"] = sorted(hc, key=lambda d: d["delta"])[:8]
    report["hot_cold_basis"] = f"Compared with each player's {prior_season} per-game average (players with 20+ games and 15+ minutes last season)."

    # ---- Teams in the period vs last season ----
    tt = team_table(t_cur)
    last_tt = team_table(add_possessions(last_teams_log)).set_index("TEAM_ID")
    team_rows = []
    for x in tt.itertuples() if not tt.empty else []:
        L = last_tt.loc[x.TEAM_ID] if x.TEAM_ID in last_tt.index else None
        team_rows.append({**team_ref(x), "gp": int(x.GP), "w": int(x.W), "l": int(x.L), "net": r(x.NET), "ortg": r(x.ORTG), "drtg": r(x.DRTG),
                          "pace": r(x.PACE), "fg3a100": r(x.FG3A_100), "ppg": r(x.PPG),
                          "last_net": r(L.NET) if L is not None else None, "last_pace": r(L.PACE) if L is not None else None,
                          "last_fg3a100": r(L.FG3A_100) if L is not None else None,
                          "last_record": f"{int(L.W)}-{int(L.L)}" if L is not None else None})
    team_rows.sort(key=lambda d: d["net"], reverse=True)
    report["teams"] = team_rows
    report["teams_basis"] = f"Last-season columns are {prior_season} full-season numbers, calculated the same way from box scores."

    # ---- Win/loss streaks (whole season up to the end date) ----
    streaks = []
    for tid, g in tlog[tlog["GAME_DATE"] <= end].sort_values("GAME_DATE").groupby("TEAM_ID"):
        results = g["WL"].tolist()
        n = 1
        while n < len(results) and results[-n - 1] == results[-1]:
            n += 1
        streaks.append({**team_ref(g.iloc[-1]), "type": results[-1], "n": n, "games": len(results)})
    streaks.sort(key=lambda s: (-s["n"], s["type"] != "W", s["team"]))
    report["streaks"] = [s for s in streaks if s["n"] >= 2][:12]

    # ---- Rookies ----
    rk = players_cur[players_cur["PLAYER_ID"].isin(rookies)] if not players_cur.empty else players_cur
    report["rookies"] = [person(x, {"gp": int(x.GP), "min": r(x.MIN), "ppg": r(x.PTS), "rpg": r(x.REB), "apg": r(x.AST), "ts": r(x.TS_PCT, 3)})
                         for x in rk.sort_values("PTS", ascending=False).head(8).itertuples()] if not rk.empty else []

    # ---- Efficiency outliers (volume scorers) ----
    lg = league_numbers(t_cur)
    vol = q[q["SHOTS_PG"] >= 12] if not q.empty else q
    report["efficiency"] = {
        "league_ts": r(lg["TS_PCT"], 3) if lg else None, "rule": "Players with 12+ shot attempts (FGA + 0.44 x FTA) per game",
        "high": [person(x, {"gp": int(x.GP), "ppg": r(x.PTS), "ts": r(x.TS_PCT, 3)}) for x in vol.sort_values("TS_PCT", ascending=False).head(5).itertuples()] if not vol.empty else [],
        "low": [person(x, {"gp": int(x.GP), "ppg": r(x.PTS), "ts": r(x.TS_PCT, 3)}) for x in vol.sort_values("TS_PCT").head(5).itertuples()] if not vol.empty else []}

    # ---- WHAT CHANGED vs the previous period (or last season) ----
    report["what_changed"] = what_changed(kind, start, end, prior_range, tlog, players_all, min_gp, min_min,
                                          last_players, last_tt, last_teams_log, prior_season, season_start, season)

    # ---- Plain-English trend sentences (rules only, every number from above) ----
    report["trends"] = trends(report, kind, prior_season, season_start, start, lg, last_teams_log)
    return report


def what_changed(kind, start, end, prior_range, tlog, players_all, min_gp, min_min, last_players, last_tt, last_teams_log, prior_season, season_start, season):
    """Compare this period with the one before it (or with last season when there is no 'before')."""
    out = {}
    cur_t = tlog[tlog["GAME_DATE"].between(start, end)]
    cur_p = players_all[players_all["GAME_DATE"].between(start, end)]
    if prior_range:
        ps, pe = prior_range
        out.update({"basis": "previous_period", "range": {"start": ps, "end": pe},
                    "label": {"daily": f"vs the previous game day ({fmt_date(ps)})",
                              "weekly": f"vs the previous 7 days ({fmt_date(ps)} to {fmt_date(pe)})",
                              "monthly": f"vs the previous 30 days ({fmt_date(ps)} to {fmt_date(pe)})"}[kind]})
        pri_t = tlog[tlog["GAME_DATE"].between(ps, pe)]
        pri_p = player_table(players_all[players_all["GAME_DATE"].between(ps, pe)])
        pri_teams = team_table(pri_t).set_index("TEAM_ID") if not pri_t.empty else pd.DataFrame()
        pri_league = league_numbers(pri_t)
        notes = []
        if ps < season_start or pri_t.groupby("TEAM_ID").size().max() < 3:
            notes.append(f"The comparison period is small ({pri_t['GAME_ID'].nunique()} games), so changes are noisy.")
        out["note"] = " ".join(notes) or None
    else:
        why = "This is the first game day of the season" if kind == "daily" else \
              f"The previous {SPAN_DAYS[kind]} days had no {season} games (offseason / season just started)"
        out.update({"basis": "last_season", "range": None, "label": f"vs last season's averages ({prior_season})",
                    "note": f"{why}, so this compares with {prior_season} full-season averages instead."})
        pri_p = last_players.copy()
        pri_teams = last_tt
        pri_league = league_numbers(add_possessions(last_teams_log))

    # League-wide averages
    cur_league = league_numbers(cur_t)
    league = []
    if cur_league and pri_league:
        for key, lab, digits in [("PPG", "Points per game (per team)", 1), ("PACE", "Pace (possessions per 48 min)", 1),
                                 ("ORTG", "Offensive rating (points per 100 poss.)", 1), ("FG3A_100", "3PA per 100 possessions", 1),
                                 ("FG3_PCT", "3-point %", 3), ("TS_PCT", "True shooting %", 3)]:
            league.append({"stat": key, "label": lab, "current": r(cur_league[key], digits), "prior": r(pri_league[key], digits),
                           "delta": r(cur_league[key] - pri_league[key], digits)})
    out["league"] = league

    # Players: risers / fallers in PPG and TS% (minimums in BOTH periods)
    cur = player_table(cur_p)
    rows = []
    if not cur.empty and not pri_p.empty:
        cq = cur[(cur["GP"] >= min_gp) & (cur["MIN"] >= min_min)].set_index("PLAYER_ID")
        if out["basis"] == "last_season":
            pq = pri_p[(pri_p["GP"] >= 20) & (pri_p["MIN"] >= 15)].set_index("PLAYER_ID")
        else:
            pq = pri_p[(pri_p["GP"] >= min_gp) & (pri_p["MIN"] >= min_min)].set_index("PLAYER_ID")
        for pid in cq.index.intersection(pq.index):
            c, p = cq.loc[pid], pq.loc[pid]
            rows.append({"player": c.PLAYER_NAME, "player_id": int(pid), "team": c.TEAM, "gp": int(c.GP), "prior_gp": int(p.GP),
                         "ppg": r(c.PTS), "prior_ppg": r(p.PTS), "ppg_delta": r(c.PTS - p.PTS),
                         "ts": r(c.TS_PCT, 3), "prior_ts": r(p.TS_PCT, 3),
                         "ts_delta": r(c.TS_PCT - p.TS_PCT, 3) if pd.notna(c.TS_PCT) and pd.notna(p.TS_PCT) else None,
                         "shots": r(c.SHOTS_PG), "prior_shots": r(p.SHOTS_PG)})
    out["players_compared"] = len(rows)
    out["ppg_risers"] = sorted(rows, key=lambda d: -d["ppg_delta"])[:6]
    out["ppg_fallers"] = sorted(rows, key=lambda d: d["ppg_delta"])[:6]
    ts_rows = [d for d in rows if d["ts_delta"] is not None and d["shots"] >= 8 and d["prior_shots"] >= 8]
    out["ts_risers"] = sorted(ts_rows, key=lambda d: -d["ts_delta"])[:6]
    out["ts_fallers"] = sorted(ts_rows, key=lambda d: d["ts_delta"])[:6]

    # Teams: record and net rating change
    ct = team_table(cur_t)
    teams = []
    for x in ct.itertuples() if not ct.empty else []:
        if len(pri_teams) and x.TEAM_ID in pri_teams.index:
            p = pri_teams.loc[x.TEAM_ID]
            teams.append({**team_ref(x), "record": f"{int(x.W)}-{int(x.L)}", "prior_record": f"{int(p.W)}-{int(p.L)}",
                          "net": r(x.NET), "prior_net": r(p.NET), "net_delta": r(x.NET - p.NET),
                          "pace": r(x.PACE), "prior_pace": r(p.PACE), "fg3a100": r(x.FG3A_100), "prior_fg3a100": r(p.FG3A_100)})
    teams.sort(key=lambda d: -d["net_delta"])
    out["teams"] = teams

    # Leader changes: who leads now vs who led before
    def leader(table, key, min_games, min_minutes, extra=None):
        if table is None or table.empty:
            return None
        t = table[(table["GP"] >= min_games) & (table["MIN"] >= min_minutes)]
        if extra is not None:
            t = t[extra(t)]
        if t.empty:
            return None
        x = t.sort_values(key, ascending=False).iloc[0]
        return {"player": x.PLAYER_NAME, "player_id": int(x.PLAYER_ID if "PLAYER_ID" in x else x.name), "team": x.TEAM, "value": r(x[key], 3 if key == "TS_PCT" else 1)}

    changes = []
    if kind == "daily":
        # Season-to-date leaders through this day vs through the previous game day.
        season_now = player_table(players_all[players_all["GAME_DATE"] <= end])
        season_before = player_table(players_all[players_all["GAME_DATE"] <= prior_range[1]]) if prior_range else None
        team_games_now = int(tlog[tlog["GAME_DATE"] <= end].groupby("TEAM_ID").size().max())
        mg_now = max(1, math.ceil(team_games_now * 0.5))
        pairs = [(season_now, mg_now), (season_before, mg_now if prior_range else 0)]
        out["leaders_note"] = (f"Season-to-date leaders through {fmt_date(end)} vs through {fmt_date(prior_range[1])}" if prior_range
                               else f"Season-to-date leaders vs {prior_season} leaders") + f" (at least {mg_now} game(s), 20+ min/game)."
        if not prior_range:
            lp = last_players[last_players["GP"] >= 58]
            pairs = [(season_now, mg_now), (lp, 58)]
    else:
        pairs = [(cur, min_gp), (pri_p if out["basis"] == "previous_period" else pri_p[pri_p["GP"] >= 58], min_gp if out["basis"] == "previous_period" else 58)]
        out["leaders_note"] = f"Leaders in this period vs {'the previous period' if out['basis'] == 'previous_period' else prior_season + ' (58+ games)'} (20+ min/game)."
    for key, lab in [("PTS", "Points per game"), ("REB", "Rebounds per game"), ("AST", "Assists per game"), ("TS_PCT", "True shooting % (10+ shots/game)")]:
        extra = (lambda t: t["SHOTS_PG"] >= 10) if key == "TS_PCT" else None
        now = leader(pairs[0][0], key, pairs[0][1], 20, extra)
        before = leader(pairs[1][0], key, pairs[1][1], 20, extra) if pairs[1][0] is not None else None
        if now:
            changes.append({"stat": key, "label": lab, "current": now, "prior": before,
                            "changed": bool(before and before["player_id"] != now["player_id"])})
    if not ct.empty:
        x = ct.sort_values("NET", ascending=False).iloc[0]
        now = {"team": x.TEAM_NAME, "team_id": int(x.TEAM_ID), "value": r(x.NET)}
        before = None
        if len(pri_teams):
            pt = pri_teams.sort_values("NET", ascending=False)
            y = pt.iloc[0]
            before = {"team": y.TEAM_NAME, "team_id": int(pt.index[0]), "value": r(y.NET)}
        changes.append({"stat": "NET", "label": "Best team net rating", "current": now, "prior": before,
                        "changed": bool(before and before["team_id"] != now["team_id"])})
    out["leaders"] = changes
    return out


def trends(rep, kind, prior_season, season_start, start, lg, last_teams_log):
    """Plain factual sentences built from numbers already in the report. No predictions."""
    s = []
    from_start = start <= season_start
    span_words = {"daily": "on " + fmt_date(rep["id"]), "weekly": "over the last 7 days", "monthly": "over the last 30 days"}[kind]
    pts = (lambda v: f"{int(v)}") if kind == "daily" else (lambda v: f"{v}")
    wcx = rep["what_changed"]
    if wcx["basis"] == "last_season":
        basis = f"{prior_season} average"
    elif kind == "daily":
        basis = f"on {fmt_date(wcx['range']['start'])}"
    else:
        basis = f"previous {SPAN_DAYS[kind]} days"
    for h in rep["hot"][:3]:
        if h["delta"] and h["delta"] >= 3:
            over = (f"over his first {h['gp']} games" if h["gp"] > 1 else "in his first game") if from_start and kind != "daily" else \
                   ("in this game" if kind == "daily" else f"over {h['gp']} games {span_words}")
            verb = "scored" if kind == "daily" or h["gp"] == 1 else "is averaging"
            s.append(f"{h['player']} {verb} {pts(h['ppg']) if h['gp'] > 1 else int(h['ppg'])} points {over}, {h['delta']} more than his {prior_season} average ({h['prior_ppg']}).")
    for c in rep["cold"][:2]:
        if c["delta"] and c["delta"] <= -4:
            verb = "scored" if kind == "daily" or c["gp"] == 1 else "is averaging"
            s.append(f"{c['player']} {verb} {pts(c['ppg']) if c['gp'] > 1 else int(c['ppg'])} points {span_words}, {abs(c['delta'])} fewer than his {prior_season} average ({c['prior_ppg']}).")
    nc = rep["notable_counts"]
    if nc["30_point_games"]:
        s.append(f"There {'was' if nc['30_point_games'] == 1 else 'were'} {nc['30_point_games']} 30-point game{'s' if nc['30_point_games'] != 1 else ''} {span_words}"
                 + (f", plus {nc['triple_doubles']} triple-double{'s' if nc['triple_doubles'] != 1 else ''}." if nc["triple_doubles"] else "."))
    wc = rep["what_changed"]
    for row in wc.get("league", []):
        if row["stat"] == "FG3A_100" and row["delta"] is not None:
            direction = "up" if row["delta"] > 0 else "down"
            s.append(f"League-wide, teams took {row['current']} 3-point attempts per 100 possessions {span_words}, {direction} {abs(row['delta'])} "
                     f"from {row['prior']} ({basis}).")
        if row["stat"] == "PACE" and row["delta"] is not None and abs(row["delta"]) >= 1:
            s.append(f"Pace was {row['current']} possessions per 48 minutes {span_words}, {'up' if row['delta'] > 0 else 'down'} {abs(row['delta'])} "
                     f"from {row['prior']} ({basis}).")
    if rep["teams"] and kind != "daily":
        best = rep["teams"][0]
        if best["last_net"] is not None:
            s.append(f"The {best['team']} have the best net rating {span_words} ({'+' if best['net'] > 0 else ''}{best['net']} in {plural(best['gp'], 'game')}, "
                     f"{best['w']}-{best['l']}); their {prior_season} net rating was {'+' if best['last_net'] > 0 else ''}{best['last_net']}.")
    for st in rep["streaks"][:2]:
        if st["n"] >= 3:
            s.append(f"The {st['team']} have {'won' if st['type'] == 'W' else 'lost'} {st['n']} straight.")
    if st_all := [x for x in rep["streaks"] if x["n"] == x["games"] and x["games"] >= 2]:
        unbeaten = [x["team"] for x in st_all if x["type"] == "W"]
        winless = [x["team"] for x in st_all if x["type"] == "L"]
        if unbeaten:
            s.append(f"Still unbeaten: {', '.join(unbeaten)}.")
        if winless:
            s.append(f"Still winless: {', '.join(winless)}.")
    for ch in wc.get("leaders", []):
        if ch["changed"] and ch["stat"] != "NET":
            v = (lambda x: f"{100 * x:.1f}%") if ch["stat"] == "TS_PCT" else (lambda x: f"{x}")
            if wcx["basis"] == "last_season":
                s.append(f"{ch['label']}: {ch['current']['player']} leads this period ({v(ch['current']['value'])}); "
                         f"the {prior_season} leader was {ch['prior']['player']} ({v(ch['prior']['value'])}).")
            else:
                s.append(f"New leader in {ch['label'].lower()}: {ch['current']['player']} ({v(ch['current']['value'])}) took over from {ch['prior']['player']} ({v(ch['prior']['value'])}).")
    if rep["rookies"]:
        rk = rep["rookies"][0]
        s.append(f"Top-scoring rookie {span_words}: {rk['player']} ({rk['team']}), {rk['ppg']} points per game in {rk['gp']} game{'s' if rk['gp'] != 1 else ''}.")
    if kind != "daily" and rep["summary"]["max_team_games_in_period"] < 5:
        s.append(f"Sample-size warning: teams have played at most {plural(rep['summary']['max_team_games_in_period'], 'game')} in this period.")
    return s


# ============================================================================
# 4) Saving + index
# ============================================================================
def write(report, kind, name):
    path = REPORTS_DIR / kind / f"{name}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=1))
    print(f"  wrote {path.relative_to(DATA_DIR.parent)}")


def rebuild_index():
    index = {"generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")}
    for kind in ("daily", "weekly", "monthly"):
        items = []
        for f in sorted((REPORTS_DIR / kind).glob("*.json"), reverse=True):
            rep = json.loads(f.read_text())
            items.append({"file": f"{kind}/{f.name}", "name": f.stem, "start": rep["range"]["start"], "end": rep["range"]["end"],
                          "games": rep["summary"]["games"], "title": rep["title"]})
        latest = [i for i in items if i["name"] == "latest"]
        index[kind] = latest + [i for i in items if i["name"] != "latest"]
    (REPORTS_DIR / "index.json").write_text(json.dumps(index, indent=1))


def main():
    args = sys.argv[1:]
    today_us = datetime.now(US_EASTERN).date()
    season = season_for(today_us)
    prior_season = previous_season(season)
    print(f"Today (US Eastern): {today_us}  ·  season {season}")

    if "--no-refresh" in args:
        teams_all, players_all, rookies = load_cached(season)
    else:
        teams_all, players_all, rookies = refresh(season)
    if teams_all.empty:
        raise RuntimeError(f"No {season} games found.")

    # Keep only finished games: both teams must have a row, with at least 48 minutes played.
    complete = teams_all.groupby("GAME_ID").filter(lambda g: len(g) == 2 and (g["MIN"] >= 240).all())["GAME_ID"].unique()
    teams_all = teams_all[teams_all["GAME_ID"].isin(complete)]
    players_all = players_all[players_all["GAME_ID"].isin(complete)]
    end = teams_all["GAME_DATE"].max()
    print(f"Most recent date with completed games: {end}")

    last_players = last_season_players(prior_season)
    last_teams_log = last_season_team_log(prior_season)

    args_common = (teams_all, players_all, rookies, season, prior_season, last_players, last_teams_log)
    daily = build_report("daily", end, *args_common)
    yesterday = (today_us - timedelta(days=1)).isoformat()
    if end < yesterday:
        daily["notes"].insert(0, f"No completed games on {fmt_date(yesterday)}. This is the most recent game day ({fmt_date(end)}).")
    write(daily, "daily", end)

    archive = "--archive" in args
    weekly = build_report("weekly", end, *args_common)
    write(weekly, "weekly", "latest")
    if archive or today_us.weekday() == 0:          # Monday
        write(weekly, "weekly", end)
    monthly = build_report("monthly", end, *args_common)
    write(monthly, "monthly", "latest")
    if archive or today_us.day == 1:
        write(monthly, "monthly", end)

    rebuild_index()
    print("Done.")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        traceback.print_exc()
        print(f"\nERROR: update_reports.py failed: {error}", file=sys.stderr)
        sys.exit(1)
