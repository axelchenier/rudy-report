"""
update_college.py  -  nightly job for the College section: refreshes Torvik ratings, downloads new ESPN games,
and writes the College Daily / Weekly / Monthly reports.

RUN IT (from the repo folder):
    .venv/bin/python pipeline/update_college.py

OPTIONS
  --no-refresh            don't download anything; rebuild from saved files (for testing)
  --season 2026 --as-of 2026-02-15
                          build reports for a PAST season "as of" a date, from ESPN box scores in the sportsdataverse
                          archive (used to test the in-season report design while the new season hasn't started)
  --out DIR               write reports somewhere else (default data/college/reports)

A normal run (no --season/--out) also rebuilds the 2027 Draft board (pipeline/college_draft.py -> data/draft/) and, from
mid-March to April, saves that year's NCAA bracket once the title game is final (pipeline/college_bracket.py --current), and rebuilds
the 2008-2026 draft classes / college-to-NBA data (pipeline/college_nba.py) and, November-April, the
current season's player game logs (pipeline/college_gamelogs.py).

Safe to run every day (idempotent). Errors print "ERROR: ..." and exit 1.

WHAT IT WRITES (data/college/reports/)
  index.json             list of reports + season status. Before the first game it says "preseason", gives the first
                         scheduled game day, and holds a recap of last season (champion, final T-Rank top 10, leaders,
                         best single games), all from real data.
  daily/<date>.json      one per game day (kept)              compared with the previous game day
  weekly/latest.json     last 7 days (rolling)               compared with the 7 days before
  monthly/latest.json    last 30 days (rolling)              compared with the 30 days before
  weekly/<date>.json, monthly/<date>.json   archived copies (Mondays / the 1st)
  trank_history.json     a snapshot of every team's T-Rank each run, so reports can show who rose and fell

SOURCES: ESPN scoreboard + box scores (site.api.espn.com, public JSON) for games; Bart Torvik's T-Rank CSV for ratings
(via pipeline/college_fetch.py); sportsdataverse's ESPN archive for past seasons.
Possessions = FGA − OREB + TOV + 0.475 × FTA (the usual college estimate), averaged between the two teams.
"""
import argparse
import json
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
import college_fetch as cf  # noqa: E402

ROOT = cf.ROOT
OUT_DEFAULT = ROOT / "data" / "college" / "reports"
ESPN_CACHE = cf.CACHE / "espn"
SB = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates={d}&groups=50&limit=500"
SUMMARY = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary?event={id}"
CENTRAL = ZoneInfo("America/Chicago")


def get_json(url, tries=3):
    for i in range(tries):
        try:
            r = requests.get(url, headers=cf.UA, timeout=30)
            if r.ok:
                return r.json()
        except requests.RequestException:
            pass
        time.sleep(3 * (i + 1))
    raise RuntimeError(f"could not download {url}")


# ---------------------------------------------------------------- ESPN games (current season)
def espn_day(d, refresh=True):
    """All D-I games on date d: (games list, player lines). Finished days are cached forever."""
    ESPN_CACHE.mkdir(parents=True, exist_ok=True)
    path = ESPN_CACHE / f"{d.isoformat()}.json"
    if path.exists():
        saved = json.loads(path.read_text())
        if saved.get("complete") or not refresh:
            return saved
    if not refresh:
        return {"games": [], "players": [], "teams": [], "complete": False}
    sb = get_json(SB.format(d=d.strftime("%Y%m%d")))
    games, teams, players = [], [], []
    all_final = True
    for ev in sb.get("events", []):
        comp = ev["competitions"][0]
        if ev["status"]["type"]["name"] not in ("STATUS_FINAL",):
            all_final = all_final and ev["status"]["type"]["name"] in ("STATUS_POSTPONED", "STATUS_CANCELED")
            continue
        c = {x["homeAway"]: x for x in comp["competitors"]}
        g = {"game_id": ev["id"], "date": d.isoformat(), "neutral": bool(comp.get("neutralSite")),
             "ot": max(0, (ev["status"].get("period") or 2) - 2)}
        for side in ("home", "away"):
            t = c[side]["team"]
            g[f"{side}_id"], g[f"{side}"], g[f"{side}_pts"] = int(t["id"]), t.get("location") or t.get("displayName"), int(c[side]["score"])
        games.append(g)
        summ = get_json(SUMMARY.format(id=ev["id"]))
        time.sleep(0.4)
        box = summ.get("boxscore", {})
        for tb in box.get("teams", []):
            stats = {s["name"]: s.get("displayValue") for s in tb.get("statistics", [])}
            row = {"game_id": ev["id"], "team_id": int(tb["team"]["id"])}
            for k, (a, b) in {"fg": ("fgm", "fga"), "threePointFieldGoalsMade-threePointFieldGoalsAttempted": ("fg3m", "fg3a"),
                              "freeThrowsMade-freeThrowsAttempted": ("ftm", "fta")}.items():
                key = "fieldGoalsMade-fieldGoalsAttempted" if k == "fg" else k
                m, _, at = str(stats.get(key, "0-0")).partition("-")
                row[a], row[b] = to_int(m), to_int(at)
            row["oreb"] = to_int(stats.get("offensiveRebounds"))
            row["tov"] = to_int(stats.get("totalTurnovers") or stats.get("turnovers"))
            teams.append(row)
        for tp in box.get("players", []):
            tid = int(tp["team"]["id"])
            st = tp["statistics"][0]
            keys = st.get("keys", [])
            for a in st.get("athletes", []):
                if a.get("didNotPlay") or not a.get("stats"):
                    continue
                v = dict(zip(keys, a["stats"]))
                fg = str(v.get("fieldGoalsMade-fieldGoalsAttempted", "0-0")).split("-")
                f3 = str(v.get("threePointFieldGoalsMade-threePointFieldGoalsAttempted", "0-0")).split("-")
                ft = str(v.get("freeThrowsMade-freeThrowsAttempted", "0-0")).split("-")
                players.append({"game_id": ev["id"], "date": d.isoformat(), "team_id": tid, "athlete_id": int(a["athlete"]["id"]),
                    "name": a["athlete"]["displayName"], "starter": bool(a.get("starter")), "min": to_int(v.get("minutes")),
                    "pts": to_int(v.get("points")), "reb": to_int(v.get("rebounds")), "ast": to_int(v.get("assists")),
                    "stl": to_int(v.get("steals")), "blk": to_int(v.get("blocks")), "tov": to_int(v.get("turnovers")),
                    "fgm": to_int(fg[0]), "fga": to_int(fg[-1]), "fg3m": to_int(f3[0]), "fg3a": to_int(f3[-1]),
                    "ftm": to_int(ft[0]), "fta": to_int(ft[-1])})
    day_over = d < datetime.now(CENTRAL).date()
    saved = {"games": games, "teams": teams, "players": players, "complete": bool(day_over and all_final), "scheduled": len(sb.get("events", []))}
    path.write_text(json.dumps(saved, separators=(",", ":")))
    return saved


def to_int(v):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return 0


def current_games(year, refresh=True, until=None):
    """Every finished D-I game of the season ending in `year`, as (games, players, team_box) DataFrames."""
    start = date(year - 1, 11, 1)
    end = until or (datetime.now(CENTRAL).date() - timedelta(days=0))
    games, players, teams = [], [], []
    d = start
    while d <= end:
        day = espn_day(d, refresh)
        games += day["games"]; players += day["players"]; teams += day["teams"]
        d += timedelta(days=1)
    return pd.DataFrame(games), pd.DataFrame(players), pd.DataFrame(teams)


def first_game_day(year):
    """The first date (from Nov 1) with D-I games on ESPN's schedule."""
    d = date(year - 1, 11, 1)
    for _ in range(20):
        sb = get_json(SB.format(d=d.strftime("%Y%m%d")))
        if sb.get("events"):
            return d.isoformat(), len(sb["events"])
        d += timedelta(days=1)
    return None, 0


# ---------------------------------------------------------------- past seasons (sportsdataverse archive)
def archive_games(year):
    import sportsdataverse.mbb as mbb
    tb = mbb.load_mbb_team_boxscore(seasons=[year], return_as_pandas=True)
    pb = mbb.load_mbb_player_boxscore(seasons=[year], return_as_pandas=True)
    tb["game_date"] = pd.to_datetime(tb["game_date"].astype(str)).dt.date.astype(str)
    pb["game_date"] = pd.to_datetime(pb["game_date"].astype(str)).dt.date.astype(str)
    home = tb[tb["team_home_away"] == "home"]
    games = pd.DataFrame({"game_id": home["game_id"].astype(str), "date": home["game_date"], "neutral": False, "ot": 0,
        "home_id": home["team_id"].astype(int), "home": home["team_location"], "home_pts": home["team_score"].astype(int),
        "away_id": home["opponent_team_id"].astype(int), "away": home["opponent_team_location"], "away_pts": home["opponent_team_score"].astype(int),
        "season_type": home["season_type"]})
    teams = pd.DataFrame({"game_id": tb["game_id"].astype(str), "team_id": tb["team_id"].astype(int),
        "fgm": tb["field_goals_made"], "fga": tb["field_goals_attempted"], "fg3m": tb["three_point_field_goals_made"],
        "fg3a": tb["three_point_field_goals_attempted"], "ftm": tb["free_throws_made"], "fta": tb["free_throws_attempted"],
        "oreb": tb["offensive_rebounds"], "tov": tb["total_turnovers"].fillna(tb["turnovers"])})
    pb = pb[(pb["did_not_play"] != True) & pb["minutes"].fillna(0).gt(0)]  # noqa: E712
    players = pd.DataFrame({"game_id": pb["game_id"].astype(str), "date": pb["game_date"], "team_id": pb["team_id"].astype(int),
        "athlete_id": pb["athlete_id"].astype(int), "name": pb["athlete_display_name"], "starter": pb["starter"].astype(bool),
        "min": pb["minutes"].astype(int), "pts": pb["points"], "reb": pb["rebounds"], "ast": pb["assists"], "stl": pb["steals"],
        "blk": pb["blocks"], "tov": pb["turnovers"], "fgm": pb["field_goals_made"], "fga": pb["field_goals_attempted"],
        "fg3m": pb["three_point_field_goals_made"], "fg3a": pb["three_point_field_goals_attempted"],
        "ftm": pb["free_throws_made"], "fta": pb["free_throws_attempted"]})
    for c in ["pts", "reb", "ast", "stl", "blk", "tov", "fgm", "fga", "fg3m", "fg3a", "ftm", "fta"]:
        players[c] = pd.to_numeric(players[c], errors="coerce").fillna(0).astype(int)
    for c in ["fgm", "fga", "fg3m", "fg3a", "ftm", "fta", "oreb", "tov"]:
        teams[c] = pd.to_numeric(teams[c], errors="coerce").fillna(0).astype(int)
    return games, players, teams


# ---------------------------------------------------------------- helpers
class Ctx:
    """Everything a report needs: games, player lines, team box, Torvik teams (now) and last season's players."""
    def __init__(self, year, games, players, teams):
        self.year, self.season = year, cf.season_label(year)
        self.games, self.players, self.teams = games, players, teams
        tv = load_json(ROOT / "data" / "college" / self.season / "teams.json") or []
        self.tv_by_norm = {cf.norm(cf.BART_ALIAS.get(t["TEAM_NAME"], t["TEAM_NAME"])): t for t in tv}
        self.tv_by_slug = {t["TEAM_ID"]: t for t in tv}
        prev = cf.expand(load_json(ROOT / "data" / "college" / cf.season_label(year - 1) / "players.json") or [])
        self.prev_by_espn = {p["ESPN_ID"]: p for p in prev if p.get("ESPN_ID")}
        cur = cf.expand(load_json(ROOT / "data" / "college" / self.season / "players.json") or [])
        self.cur_by_key = {(cf.norm(cf.BART_ALIAS.get(p["TEAM_NAME"], p["TEAM_NAME"])), cf.norm(p["PLAYER_NAME"])): p for p in cur}
        self.prev_by_key = {(cf.norm(cf.BART_ALIAS.get(p["TEAM_NAME"], p["TEAM_NAME"])), cf.norm(p["PLAYER_NAME"])): p for p in prev}
        names = {}
        if len(games):
            for _, g in games.iterrows():
                names[int(g["home_id"])] = g["home"]; names[int(g["away_id"])] = g["away"]
        self.team_name = names

    def torvik(self, espn_id):
        """Torvik row for an ESPN team id (by school name)."""
        return self.tv_by_norm.get(cf.norm(self.team_name.get(espn_id, "")))


def load_json(p):
    return json.loads(p.read_text()) if p.exists() else None


def gmsc(r):     # John Hollinger's Game Score (no fouls / split rebounds in this data: uses total rebounds)
    return round(r["pts"] + 0.4 * r["fgm"] - 0.7 * r["fga"] - 0.4 * (r["fta"] - r["ftm"]) + 0.5 * r["reb"] + r["stl"] + 0.7 * r["ast"] + 0.7 * r["blk"] - r["tov"], 1)


def line(r):
    parts = [f"{r['pts']} PTS", f"{r['reb']} REB", f"{r['ast']} AST"]
    if r["stl"] >= 3: parts.append(f"{r['stl']} STL")
    if r["blk"] >= 3: parts.append(f"{r['blk']} BLK")
    if r["fg3m"] >= 3: parts.append(f"{r['fg3m']} 3PM")
    return ", ".join(parts) + f" ({r['fgm']}-{r['fga']} FG, {r['min']} min)"


def window(df, start, end, col="date"):
    if not len(df):
        return df
    return df[(df[col] >= start.isoformat()) & (df[col] <= end.isoformat())]


def league_avgs(ctx, games, teams):
    if not len(games):
        return None
    tb = teams[teams["game_id"].isin(games["game_id"])]
    if not len(tb):
        return None
    poss = (tb["fga"] - tb["oreb"] + tb["tov"] + 0.475 * tb["fta"]).sum()
    pts = games["home_pts"].sum() + games["away_pts"].sum()
    return {"PPG": round(pts / (2 * len(games)), 1), "PACE": round(poss / max(len(tb), 1), 1),
            "ORTG": round(100 * pts / poss, 1) if poss else None,
            "EFG": round((tb["fgm"].sum() + 0.5 * tb["fg3m"].sum()) / max(tb["fga"].sum(), 1), 3),
            "FG3A_RATE": round(tb["fg3a"].sum() / max(tb["fga"].sum(), 1), 3),
            "FT_RATE": round(tb["fta"].sum() / max(tb["fga"].sum(), 1), 3),
            "MARGIN": round((games["home_pts"] - games["away_pts"]).abs().mean(), 1),
            "HOME_W_PCT": round(((games["home_pts"] > games["away_pts"]) & ~games["neutral"].astype(bool)).sum() /
                                max((~games["neutral"].astype(bool)).sum(), 1), 3)}


LEAGUE_LABELS = {"PPG": "Points per game (per team)", "PACE": "Possessions per game", "ORTG": "Points per 100 possessions",
                 "EFG": "Effective FG%", "FG3A_RATE": "3-point attempt rate", "FT_RATE": "Free throw rate (FTA/FGA)",
                 "MARGIN": "Average margin of victory", "HOME_W_PCT": "Home win % (non-neutral games)"}


def player_period(ctx, pl, min_games=1):
    if not len(pl):
        return pd.DataFrame()
    g = pl.groupby(["athlete_id"]).agg(name=("name", "last"), team_id=("team_id", "last"), gp=("game_id", "nunique"),
        min=("min", "mean"), pts=("pts", "mean"), reb=("reb", "mean"), ast=("ast", "mean"), stl=("stl", "mean"), blk=("blk", "mean"),
        fgm=("fgm", "sum"), fga=("fga", "sum"), fg3m=("fg3m", "sum"), fta=("fta", "sum"), ftm=("ftm", "sum"), pts_tot=("pts", "sum")).reset_index()
    g["ts"] = (g["pts_tot"] / (2 * (g["fga"] + 0.475 * g["fta"]))).where(g["fga"] + g["fta"] > 0)
    return g[g["gp"] >= min_games]


def pl_ref(ctx, r):
    """Player reference: name, ESPN id, team name, and the Torvik pid when we can match it (for links)."""
    team = ctx.team_name.get(int(r["team_id"]), "")
    key = (cf.norm(cf.BART_ALIAS.get(team, team)), cf.norm(r["name"]))
    tv = ctx.cur_by_key.get(key) or ctx.prev_by_espn.get(int(r["athlete_id"])) or ctx.prev_by_key.get(key)
    tt = ctx.torvik(int(r["team_id"]))
    return {"player": r["name"], "espn_id": int(r["athlete_id"]), "pid": tv["PID"] if tv else None,
            "team": tt["TEAM_NAME"] if tt else team, "team_slug": tt["TEAM_ID"] if tt else None}


def team_ref(ctx, espn_id):
    tt = ctx.torvik(int(espn_id))
    return {"team": tt["TEAM_NAME"] if tt else ctx.team_name.get(int(espn_id), str(espn_id)), "team_slug": tt["TEAM_ID"] if tt else None,
            "trank": tt["TRANK"] if tt else None}


# ---------------------------------------------------------------- one report
def build_report(ctx, kind, start, end, prev_start, prev_end, trank_hist):
    g = window(ctx.games, start, end)
    pl = window(ctx.players, start, end)
    gp_prev = window(ctx.games, prev_start, prev_end)
    pl_prev = window(ctx.players, prev_start, prev_end)
    title_dates = start.strftime("%b %-d, %Y") if start == end else f"{start.strftime('%b %-d, %Y')} to {end.strftime('%b %-d, %Y')}"
    rep = {"type": kind, "id": end.isoformat() if kind == "daily" else "latest", "season": ctx.season,
           "title": f"{kind.capitalize()} College Report — {title_dates}",
           "range": {"start": start.isoformat(), "end": end.isoformat()},
           "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
           "sources": ["ESPN box scores (site.api.espn.com)", "Bart Torvik T-Rank (barttorvik.com) for ratings and ranks"],
           "notes": [], "summary": {"games": int(len(g)), "teams": int(len(set(g["home_id"]) | set(g["away_id"]))) if len(g) else 0,
                                    "players": int(pl["athlete_id"].nunique()) if len(pl) else 0}}
    # games / scores
    games = []
    for _, r in g.sort_values(["date"]).iterrows():
        h, a = team_ref(ctx, r["home_id"]), team_ref(ctx, r["away_id"])
        games.append({"game_id": str(r["game_id"]), "date": r["date"], "home": h["team"], "home_slug": h["team_slug"], "home_rank": h["trank"],
                      "home_pts": int(r["home_pts"]), "away": a["team"], "away_slug": a["team_slug"], "away_rank": a["trank"],
                      "away_pts": int(r["away_pts"]), "neutral": bool(r["neutral"]), "ot": int(r["ot"]), "margin": abs(int(r["home_pts"]) - int(r["away_pts"]))})
    # ranked games (both teams in T-Rank top 50) for weekly/monthly; every game for daily
    rep["games"] = games if kind == "daily" else [x for x in games if (x["home_rank"] or 999) <= 25 and (x["away_rank"] or 999) <= 25][:60]
    rep["games_note"] = "Every D-I vs D-I game." if kind == "daily" else "Games between two T-Rank top-25 teams."
    # upsets by T-Rank
    ups = []
    for x in games:
        hw = x["home_pts"] > x["away_pts"]
        w, l = (("home", "away") if hw else ("away", "home"))
        wr, lr = x[f"{w}_rank"], x[f"{l}_rank"]
        if wr and lr and lr <= 75 and wr - lr >= 75:
            ups.append({**x, "winner": x[w], "winner_slug": x[f"{w}_slug"], "winner_rank": wr, "loser": x[l], "loser_slug": x[f"{l}_slug"],
                        "loser_rank": lr, "gap": wr - lr, "score": f"{max(x['home_pts'], x['away_pts'])}-{min(x['home_pts'], x['away_pts'])}"})
    rep["upsets"] = sorted(ups, key=lambda u: -u["gap"])[:10]
    rep["upsets_rule"] = "Winner ranked at least 75 spots below a top-75 loser in Torvik's current T-Rank."
    # top performers by Game Score
    if len(pl):
        pl = pl.copy(); pl["gmsc"] = pl.apply(gmsc, axis=1)
        opp = {}
        for _, r in g.iterrows():
            opp[(str(r["game_id"]), int(r["home_id"]))] = (int(r["away_id"]), r["home_pts"] > r["away_pts"])
            opp[(str(r["game_id"]), int(r["away_id"]))] = (int(r["home_id"]), r["away_pts"] > r["home_pts"])
        def perf(r):
            o = opp.get((str(r["game_id"]), int(r["team_id"])), (None, None))
            return {**pl_ref(ctx, r), "date": r["date"], "opp": team_ref(ctx, o[0])["team"] if o[0] else "", "wl": "W" if o[1] else "L",
                    "pts": int(r["pts"]), "reb": int(r["reb"]), "ast": int(r["ast"]), "gmsc": float(r["gmsc"]), "line": line(r)}
        rep["top_performers"] = [perf(r) for _, r in pl.sort_values("gmsc", ascending=False).head(15).iterrows()]
        tags = []
        for _, r in pl.iterrows():
            t = []
            if r["pts"] >= 30: t.append(f"{int(r['pts'])}-point game")
            dd = sum(int(r[k]) >= 10 for k in ["pts", "reb", "ast", "stl", "blk"])
            if dd >= 3: t.append("triple-double")
            elif r["pts"] >= 20 and r["reb"] >= 10: t.append("20-10 game")
            if r["fg3m"] >= 7: t.append(f"{int(r['fg3m'])} threes")
            if r["blk"] >= 7: t.append(f"{int(r['blk'])} blocks")
            if t: tags.append({**perf(r), "tags": t})
        rep["notable"] = sorted(tags, key=lambda x: -x["gmsc"])[:25]
        rep["notable_counts"] = {"30_point_games": int((pl["pts"] >= 30).sum()), "triple_doubles": int(sum(1 for x in tags if "triple-double" in x["tags"])),
                                 "twenty_ten": int(((pl["pts"] >= 20) & (pl["reb"] >= 10)).sum()), "games_7_threes": int((pl["fg3m"] >= 7).sum())}
    # leaders (weekly / monthly)
    min_g = {"daily": 1, "weekly": 2, "monthly": 5}[kind]
    per = player_period(ctx, pl, min_g)
    if len(per) and kind != "daily":
        per = per[per["min"] >= 20]
        rep["leaders"] = {k: [{**pl_ref(ctx, r), "gp": int(r["gp"]), "value": round(float(r[k]), 1 if k != "ts" else 3)}
                              for _, r in per.sort_values(k, ascending=False).head(10).iterrows()] for k in ["pts", "reb", "ast", "stl", "blk"]}
        rep["qualifier"] = f"Leaders need at least {min_g} games and 20 minutes per game in the period."
    # hot / cold vs last season (Torvik per-game points)
    if len(per):
        rows = []
        for _, r in per[per["min"] >= 20].iterrows():
            team = ctx.team_name.get(int(r["team_id"]), "")
            last = ctx.prev_by_espn.get(int(r["athlete_id"])) or ctx.prev_by_key.get((cf.norm(cf.BART_ALIAS.get(team, team)), cf.norm(r["name"])))
            if last and last.get("GP", 0) >= 10 and (last.get("MIN") or 0) >= 15 and last.get("PTS") is not None:
                rows.append({**pl_ref(ctx, r), "gp": int(r["gp"]), "ppg": round(float(r["pts"]), 1), "prior_ppg": last["PTS"],
                             "prior_team": last["TEAM_NAME"], "delta": round(float(r["pts"]) - last["PTS"], 1)})
        rep["hot"] = sorted(rows, key=lambda x: -x["delta"])[:10]
        rep["cold"] = sorted(rows, key=lambda x: x["delta"])[:10]
        rep["hot_cold_basis"] = f"Compared with each player's {cf.season_label(ctx.year - 1)} per-game scoring (Torvik, 10+ games and 15+ minutes). Transfers count: 'last season' may be another school."
        # freshmen
        fr = []
        for _, r in per.iterrows():
            team = ctx.team_name.get(int(r["team_id"]), "")
            tv = ctx.cur_by_key.get((cf.norm(cf.BART_ALIAS.get(team, team)), cf.norm(r["name"])))
            if tv and tv.get("CLASS") == "Fr":
                fr.append({**pl_ref(ctx, r), "gp": int(r["gp"]), "ppg": round(float(r["pts"]), 1), "rpg": round(float(r["reb"]), 1),
                           "apg": round(float(r["ast"]), 1), "ts": None if pd.isna(r["ts"]) else round(float(r["ts"]), 3)})
        rep["freshmen"] = sorted(fr, key=lambda x: -x["ppg"])[:10]
    # teams in the period
    trows = []
    if len(g):
        tb = ctx.teams[ctx.teams["game_id"].isin(g["game_id"])]
        long = pd.concat([pd.DataFrame({"game_id": g["game_id"], "team_id": g["home_id"], "pf": g["home_pts"], "pa": g["away_pts"]}),
                          pd.DataFrame({"game_id": g["game_id"], "team_id": g["away_id"], "pf": g["away_pts"], "pa": g["home_pts"]})])
        long = long.merge(tb[["game_id", "team_id", "fga", "oreb", "tov", "fta"]], on=["game_id", "team_id"], how="left")
        long["poss"] = long["fga"] - long["oreb"] + long["tov"] + 0.475 * long["fta"]
        for tid, x in long.groupby("team_id"):
            tr = team_ref(ctx, tid)
            if not tr["team_slug"]:
                continue
            poss = x["poss"].sum()
            trows.append({**tr, "gp": int(len(x)), "w": int((x["pf"] > x["pa"]).sum()), "l": int((x["pf"] < x["pa"]).sum()),
                          "margin": round(float((x["pf"] - x["pa"]).mean()), 1), "ppg": round(float(x["pf"].mean()), 1),
                          "ortg": round(100 * x["pf"].sum() / poss, 1) if poss else None, "drtg": round(100 * x["pa"].sum() / poss, 1) if poss else None})
        trows.sort(key=lambda t: -t["margin"])
        rep["teams_best"] = trows[:15] if kind != "daily" else []
        big = max(games, key=lambda x: x["margin"]) if games else None
        hi = max(games, key=lambda x: max(x["home_pts"], x["away_pts"])) if games else None
        rep["team_standouts"] = [s for s in [
            {"label": "Biggest win", **_winner(big), "value": f"+{big['margin']}"} if big else None,
            {"label": "Most points", **_winner(hi, by_pts=True), "value": str(max(hi["home_pts"], hi["away_pts"]))} if hi else None,
            {"label": "Overtime games", "team": "", "value": str(sum(1 for x in games if x["ot"]))}] if s]
    # what changed
    wc = {"label": {"daily": "vs the previous game day", "weekly": "vs the previous 7 days", "monthly": "vs the previous 30 days"}[kind],
          "range": {"start": prev_start.isoformat(), "end": prev_end.isoformat()}, "league": [], "risers": [], "fallers": [], "trank": []}
    cur, prev = league_avgs(ctx, g, ctx.teams), league_avgs(ctx, gp_prev, ctx.teams)
    if cur and prev:
        wc["league"] = [{"stat": k, "label": LEAGUE_LABELS[k], "current": cur[k], "prior": prev[k],
                         "delta": round(cur[k] - prev[k], 3 if isinstance(cur[k], float) and cur[k] < 2 else 1)} for k in cur if cur[k] is not None and prev[k] is not None]
        if len(gp_prev) < 30:
            wc["note"] = f"The comparison period has only {len(gp_prev)} games, so changes are noisy."
    elif cur:
        wc["note"] = "No games in the comparison period yet (season just started), so there's nothing to compare against."
    if kind != "daily":
        a, b = player_period(ctx, pl, max(1, min_g // 2)), player_period(ctx, pl_prev, max(1, min_g // 2))
        if len(a) and len(b):
            m = a.merge(b, on="athlete_id", suffixes=("", "_prev"))
            m = m[(m["min"] >= 20) & (m["min_prev"] >= 20)]
            m["delta"] = m["pts"] - m["pts_prev"]
            mk = lambda r: {**pl_ref(ctx, r), "ppg": round(float(r["pts"]), 1), "prior_ppg": round(float(r["pts_prev"]), 1), "delta": round(float(r["delta"]), 1)}
            wc["risers"] = [mk(r) for _, r in m.sort_values("delta", ascending=False).head(8).iterrows()]
            wc["fallers"] = [mk(r) for _, r in m.sort_values("delta").head(8).iterrows()]
    # T-Rank movers from saved snapshots
    snaps = sorted(trank_hist)
    before = [s for s in snaps if s <= prev_end.isoformat()]
    if snaps and before and before[-1] != snaps[-1]:
        old, new = trank_hist[before[-1]], trank_hist[snaps[-1]]
        mv = [{"team": ctx.tv_by_slug.get(k, {}).get("TEAM_NAME", k), "team_slug": k, "rank": new[k][0], "prior_rank": old[k][0],
               "move": old[k][0] - new[k][0]} for k in new if k in old]
        wc["trank"] = sorted(mv, key=lambda x: -x["move"])[:8] + sorted(mv, key=lambda x: x["move"])[:8]
        wc["trank_basis"] = f"T-Rank on {snaps[-1]} vs {before[-1]} (saved each night from barttorvik.com)."
    rep["what_changed"] = wc
    # plain-English trends (only facts from the numbers above)
    tr = []
    for u in rep["upsets"][:3]:
        tr.append(f"No. {u['winner_rank']} {u['winner']} beat No. {u['loser_rank']} {u['loser']} {u['score']} (T-Rank).")
    for h in rep.get("hot", [])[:3]:
        if h["delta"] >= 5:
            tr.append(f"{h['player']} ({h['team']}) is scoring {h['ppg']} per game, {h['delta']} more than last season ({h['prior_ppg']}).")
    for x in wc["league"]:
        if x["stat"] == "PPG" and abs(x["delta"]) >= 1:
            tr.append(f"Teams averaged {x['current']} points per game, {'up' if x['delta'] > 0 else 'down'} {abs(x['delta'])} from the previous period.")
    rep["trends"] = tr
    return rep


def _winner(x, by_pts=False):
    hw = x["home_pts"] > x["away_pts"]
    w, l = ("home", "away") if hw else ("away", "home")
    return {"team": x[w], "team_slug": x[f"{w}_slug"], "detail": f"{x[f'{w}_pts']}-{x[f'{l}_pts']} vs {x[l]} ({x['date']})"}


# ---------------------------------------------------------------- last season recap (for the preseason page)
def recap(year):
    games, players, teams = archive_games(year)
    season = cf.season_label(year)
    tv = load_json(ROOT / "data" / "college" / season / "teams.json") or []
    pls = cf.expand(load_json(ROOT / "data" / "college" / season / "players.json") or [])
    by_espn_team = {t.get("ESPN_ID"): t for t in tv if t.get("ESPN_ID")}
    post = games[games["season_type"] == 3].sort_values("date")
    champ = None
    if len(post):
        last_day = post["date"].max()
        fin = post[post["date"] == last_day]
        if len(fin) == 1:
            f = fin.iloc[0]
            hw = f["home_pts"] > f["away_pts"]
            w, l = (f["home_id"], f["away_id"]) if hw else (f["away_id"], f["home_id"])
            champ = {"date": last_day, "winner": by_espn_team.get(int(w), {}).get("TEAM_NAME", f["home"] if hw else f["away"]),
                     "winner_slug": by_espn_team.get(int(w), {}).get("TEAM_ID"), "loser": by_espn_team.get(int(l), {}).get("TEAM_NAME", f["away"] if hw else f["home"]),
                     "loser_slug": by_espn_team.get(int(l), {}).get("TEAM_ID"), "score": f"{max(f['home_pts'], f['away_pts'])}-{min(f['home_pts'], f['away_pts'])}"}
    top = sorted(tv, key=lambda t: t["TRANK"])[:10]
    qual = [p for p in pls if (p.get("MIN_PCT") or 0) >= 0.4]
    lead = {k: [{"player": p["PLAYER_NAME"], "pid": p["PID"], "team": p["TEAM_NAME"], "team_slug": p["TEAM_ID"], "value": p[k]}
                for p in sorted([p for p in qual if p.get(k) is not None], key=lambda p: -p[k])[:5]] for k in ["PTS", "REB", "AST", "BPM"]}
    pl = players.copy(); pl["gmsc"] = pl.apply(gmsc, axis=1)
    name = {}
    for _, g in games.iterrows():
        name[int(g["home_id"])] = g["home"]; name[int(g["away_id"])] = g["away"]
    by_espn_p = {p["ESPN_ID"]: p for p in pls if p.get("ESPN_ID")}
    best = []
    for _, r in pl.sort_values("pts", ascending=False).head(10).iterrows():
        tvp = by_espn_p.get(int(r["athlete_id"]))
        tt = by_espn_team.get(int(r["team_id"]))
        best.append({"player": r["name"], "pid": tvp["PID"] if tvp else None, "team": tt["TEAM_NAME"] if tt else name.get(int(r["team_id"]), ""),
                     "team_slug": tt["TEAM_ID"] if tt else None, "date": r["date"], "pts": int(r["pts"]), "line": line(r)})
    return {"season": season, "champion": champ, "champion_rule": "Winner of the season's final game (the national championship game).",
            "trank_top10": [{"team": t["TEAM_NAME"], "team_slug": t["TEAM_ID"], "trank": t["TRANK"], "rec": f"{t['W']}-{t['L']}",
                             "adjem": t["ADJEM"], "adjoe": t["ADJOE"], "adjde": t["ADJDE"]} for t in top],
            "leaders": lead, "best_games": best, "games": int(len(games))}


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-refresh", action="store_true")
    ap.add_argument("--season", type=int)
    ap.add_argument("--as-of")
    ap.add_argument("--out")
    args = ap.parse_args()
    out = Path(args.out) if args.out else OUT_DEFAULT
    today = datetime.now(CENTRAL).date()
    this_year = today.year + (1 if today.month >= 7 else 0)
    year = args.season or this_year
    archive = year < this_year

    if not args.no_refresh and not archive:
        cf.download(year, force=True)
        res = cf.build_season(year)
        if res:
            d = cf.OUT / res["season"]
            cf.write_json(d / "teams.json", res["teams"])
            cf.write_json(d / "players.json", cf.columnar(res["players"]))
            # keep meta.json in step (same as college_fetch.py)
            meta = load_json(cf.OUT / "meta.json")
            for s in meta["seasons"]:
                if s["season"] == res["season"]:
                    s.update({"teams": len(res["teams"]), "players": len(res["players"]), "preseason": res["preseason"], "has_box": res["has_box"],
                              "max_team_games": max([t["GP"] for t in res["teams"]] or [0]), "in_progress": not res["preseason"]})
            meta["pulled_at_utc"] = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
            played = [s for s in meta["seasons"] if not s["preseason"]]
            meta["default_season"] = next((s["season"] for s in played if not s.get("in_progress") or s["max_team_games"] >= 8), played[0]["season"])
            cf.write_json(cf.OUT / "meta.json", meta)
            cf.build_careers()

    if archive:
        games, players, teams = archive_games(year)
        asof = date.fromisoformat(args.as_of) if args.as_of else date.fromisoformat(games["date"].max())
        games, players = games[games["date"] <= asof.isoformat()], players[players["date"] <= asof.isoformat()]
    else:
        games, players, teams = current_games(year, refresh=not args.no_refresh, until=today - timedelta(days=1))
        asof = today - timedelta(days=1)

    out.mkdir(parents=True, exist_ok=True)
    hist_path = out / "trank_history.json"
    hist = load_json(hist_path) or {}
    tv = load_json(ROOT / "data" / "college" / cf.season_label(year) / "teams.json") or []
    if not archive and tv:
        hist = {k: v for k, v in hist.items() if k[:4] in (str(year - 1), str(year))}
        hist[today.isoformat()] = {t["TEAM_ID"]: [t["TRANK"], t["ADJEM"]] for t in tv}
        cf.write_json(hist_path, hist)

    index = load_json(out / "index.json") or {}
    index.update({"generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"), "season": cf.season_label(year)})
    if not len(games):
        first, n = (None, 0) if archive else first_game_day(year)
        index.update({"status": "preseason", "first_game_day": first, "first_day_games": n, "daily": [], "weekly": [], "monthly": []})
        try:
            index["recap"] = recap(year - 1)
        except Exception as e:  # noqa: BLE001
            print(f"  (no recap: {e})", file=sys.stderr)
        cf.write_json(out / "index.json", index)
        print(f"Preseason: no {cf.season_label(year)} games yet. First game day on ESPN's schedule: {first} ({n} games). Recap of {cf.season_label(year - 1)} written.")
        return

    ctx = Ctx(year, games, players, teams)
    days = sorted(games["date"].unique())
    last = date.fromisoformat(days[-1])
    index["status"] = "in_season"
    index.pop("recap", None)
    # daily: (re)build every game day that has no report yet, plus the last one
    daily_dir = out / "daily"
    daily_dir.mkdir(parents=True, exist_ok=True)
    built = []
    for i, d in enumerate(days):
        p = daily_dir / f"{d}.json"
        if p.exists() and d != days[-1] and not archive:
            continue
        if archive and d != days[-1]:
            continue
        dd = date.fromisoformat(d)
        prev = date.fromisoformat(days[i - 1]) if i else dd - timedelta(days=1)
        rep = build_report(ctx, "daily", dd, dd, prev, prev, hist)
        cf.write_json(p, rep)
        built.append(d)
    daily_list = []
    for p in sorted(daily_dir.glob("*.json"), reverse=True):
        r = load_json(p)
        daily_list.append({"file": f"daily/{p.name}", "name": p.stem, "games": r["summary"]["games"], "title": r["title"]})
    index["daily"] = daily_list
    for kind, n in [("weekly", 7), ("monthly", 30)]:
        start = last - timedelta(days=n - 1)
        rep = build_report(ctx, kind, start, last, start - timedelta(days=n), start - timedelta(days=1), hist)
        (out / kind).mkdir(parents=True, exist_ok=True)
        cf.write_json(out / kind / "latest.json", rep)
        if (kind == "weekly" and today.weekday() == 0) or (kind == "monthly" and today.day == 1):
            cf.write_json(out / kind / f"{last.isoformat()}.json", rep)
        lst = [{"file": f"{kind}/latest.json", "name": "latest", "games": rep["summary"]["games"], "title": rep["title"]}]
        for p in sorted((out / kind).glob("20*.json"), reverse=True):
            r = load_json(p)
            lst.append({"file": f"{kind}/{p.name}", "name": p.stem, "games": r["summary"]["games"], "title": r["title"]})
        index[kind] = lst
    cf.write_json(out / "index.json", index)
    print(f"In season: {len(games)} games through {days[-1]}. Built daily {built[-3:]}, weekly and monthly.")


def run():
    steps = []                                  # what worked in this run -> data/college/freshness.json (footer "Data freshness")

    def step(name, fn):
        try:
            fn()
            steps.append({"step": name, "ok": True})
        except Exception as e:  # noqa: BLE001  - one failed step shouldn't stop the others
            print(f"WARNING: {name} failed: {e}")
            steps.append({"step": name, "ok": False, "note": str(e)[:200]})

    try:
        main()
        steps.append({"step": "College stats & ratings", "ok": True})
    except Exception as e:  # noqa: BLE001
        steps.append({"step": "College stats & ratings", "ok": False, "note": str(e)[:200]})
        _freshness(steps)
        raise
    # Rebuild the 2027 Draft board from the freshest stats (skipped for archive/test runs).
    if "--season" not in sys.argv and "--out" not in sys.argv:
        import college_draft, college_bracket, college_nba, college_gamelogs, college_leaders, college_schedule
        step("2027 Draft board", college_draft.main)
        # Save this year's real NCAA bracket for the Tournament Simulator once the tournament is over
        # (no network and instant outside mid-March..April, or once data/college/brackets/<year>.json exists).
        step("NCAA bracket", college_bracket.update_current)
        # Draft classes 2008-2026 + college-to-NBA data (NBA.com DraftHistory, refreshed daily; NBA careers from data/careers/).
        step("Draft classes + college-to-NBA", college_nba.main)
        # College player game logs for the current season (ESPN box scores; no-op May-October).
        step("College game logs", college_gamelogs.update_current)
        # All-time (2007-08+) single-season and career leaderboards (local data only, ~90 KB).
        step("College leaders", college_leaders.main)
        # Recent results + next 7 days of D-I games for the College home page (ESPN scoreboard, ~10 small requests).
        step("College schedule", college_schedule.main)
        _freshness(steps)
        if not steps[1]["ok"]:                  # as before: a broken Draft board fails the run (the other steps only warn)
            raise RuntimeError(f"2027 Draft board failed: {steps[1].get('note')}")


def _freshness(steps):
    try:
        import college_freshness
        college_freshness.write(steps)
    except Exception as e:  # noqa: BLE001
        print(f"WARNING: freshness file failed: {e}")


if __name__ == "__main__":
    try:
        run()
    except Exception as e:  # noqa: BLE001
        import traceback
        traceback.print_exc()
        print(f"ERROR: {e}")
        sys.exit(1)
