"""
fetch_playoffs.py  -  playoff game logs (teams + players) and series results, from NBA.com/stats (LeagueGameLog, Playoffs).

RUN IT (from the nba-stats-app folder):
    .venv/bin/python pipeline/fetch_playoffs.py                 every finished season in data/meta.json that has no playoffs.json yet
    .venv/bin/python pipeline/fetch_playoffs.py 2024-25 --force one season again
    .venv/bin/python pipeline/fetch_playoffs.py --index-only    rebuild data/index/playoffs.json from the saved files (no requests)
    --max-requests N  stop cleanly after N requests (2 per season; answers are cached in pipeline/cache/adv/, so re-running resumes)
Run it once after each postseason (the nightly refresh doesn't, so the 2026-27 playoffs need a run in June 2027).

Writes:
  data/<season>/playoffs.json    {"teams": team game lines (same columns as team_gamelogs.json),
                                  "players": player game lines (same columns as gamelogs/p_NN.json)}
  data/index/playoffs.json       every series 1996-97 on: season, round (1-4), conference, both teams + regular-season seeds
                                 (standings.json PlayoffRank), wins, winner. Round and series come from NBA.com's game id:
                                 004 YY 00 R S G  (R = round, S = series, G = game).
"""
import argparse
import json
import sys

import pandas as pd
from nba_api.stats.endpoints import leaguegamelog

from fetch_data import DATA_DIR
from fetch_more import BOX, save_compact
import fetch_advanced
from fetch_advanced import nba_call, RUN, BudgetUsedUp

OPP_COLS = ["OPP_PTS", "OPP_FGA", "OPP_FTA", "OPP_OREB", "OPP_DREB", "OPP_TOV", "OPP_FG3A"]


def logs(season, kind):
    f = nba_call(lambda: leaguegamelog.LeagueGameLog(season=season, season_type_all_star="Playoffs", player_or_team_abbreviation=kind,
                                                     timeout=90), f"{season} playoffs {kind} game log")
    f = f.copy()
    if f.empty:
        return f
    f["GAME_ID"] = f["GAME_ID"].astype(str)
    f["GAME_DATE"] = pd.to_datetime(f["GAME_DATE"]).dt.strftime("%Y-%m-%d")
    f["HOME"] = f["MATCHUP"].str.contains("vs.").astype(int)
    f["OPP"] = f["MATCHUP"].str.split().str[-1]
    return f


def fetch_season(season):
    t, p = logs(season, "T"), logs(season, "P")
    if t.empty:
        print(f"  {season}: no playoff games (yet)")
        return 0
    opp = t[["GAME_ID", "TEAM_ID", "PTS", "FGA", "FTA", "OREB", "DREB", "TOV", "FG3A"]].rename(columns=lambda c: c if c == "GAME_ID" else "OPP_" + c)
    tt = t.merge(opp, on="GAME_ID")
    tt = tt[tt["TEAM_ID"] != tt["OPP_TEAM_ID"]].drop(columns=["OPP_TEAM_ID"])
    tt = tt[["TEAM_ID", "TEAM_ABBREVIATION", "GAME_ID", "GAME_DATE", "HOME", "OPP", "WL"] + BOX + OPP_COLS].sort_values(["GAME_DATE", "GAME_ID"])
    pp = p[["PLAYER_ID", "PLAYER_NAME", "TEAM_ID", "TEAM_ABBREVIATION", "GAME_ID", "GAME_DATE", "HOME", "OPP", "WL"] + BOX].sort_values(["GAME_ID", "TEAM_ID", "PLAYER_ID"])
    out = DATA_DIR / season / "playoffs.json"
    tmp_t, tmp_p = DATA_DIR / season / "_po_t.json", DATA_DIR / season / "_po_p.json"
    save_compact(tt, tmp_t); save_compact(pp, tmp_p)
    out.write_text(json.dumps({"source": "NBA.com LeagueGameLog (Playoffs)", "teams": json.loads(tmp_t.read_text()),
                               "players": json.loads(tmp_p.read_text())}, separators=(",", ":")))
    tmp_t.unlink(); tmp_p.unlink()
    print(f"  {season}: {len(tt) // 2} playoff games, {len(pp)} player lines -> {out.relative_to(DATA_DIR.parent)}", flush=True)
    return len(tt) // 2


def series_index(seasons):
    rows = []
    for season in sorted(seasons):
        f = DATA_DIR / season / "playoffs.json"
        if not f.exists():
            continue
        d = json.loads(f.read_text())["teams"]
        games = [dict(zip(d["cols"], r)) for r in d["rows"]]
        st = DATA_DIR / season / "standings.json"
        seeds = {s["TeamID"]: (s.get("PlayoffRank"), s.get("Conference")) for s in json.loads(st.read_text())} if st.exists() else {}
        by, eff = {}, {}
        for g in games:
            gid = g["GAME_ID"]
            if not gid.startswith("004"):            # 005... = Play-In games, not part of the bracket
                continue
            opp_id = next((x["TEAM_ID"] for x in games if x["GAME_ID"] == gid and x["TEAM_ID"] != g["TEAM_ID"]), None)
            key = frozenset((g["TEAM_ID"], opp_id))
            e = by.setdefault(key, {"teams": {}, "first": g["GAME_DATE"], "last": g["GAME_DATE"], "games": set(), "ids": []})
            e["games"].add(gid); e["ids"].append(gid); e["last"] = max(e["last"], g["GAME_DATE"]); e["first"] = min(e["first"], g["GAME_DATE"])
            w = e["teams"].setdefault(g["TEAM_ID"], {"abbr": g["TEAM_ABBREVIATION"], "w": 0})
            w["w"] += g["WL"] == "W"
        # Round = how many series a team had already played (old game ids, before 2001-02, don't carry the round).
        firsts = {}
        for key, e in by.items():
            for t in key:
                firsts.setdefault(t, []).append(e["first"])
        for key, e in by.items():
            t = next(iter(key))
            e["round"] = 1 + sum(d < e["first"] for d in firsts[t])
            newest = min(e["ids"])
            e["sid"] = int(newest[8]) if newest[5:7] == "00" and newest[7] in "1234" else 0
        order = sorted(by.items(), key=lambda kv: (kv[1]["round"], kv[1]["sid"], kv[1]["first"]))
        by = {}
        for n, (key, e) in enumerate(order):
            by[(e["round"], n)] = e
        for (rnd, sid), e in sorted(by.items()):
            ts = sorted(e["teams"].items(), key=lambda kv: -kv[1]["w"])
            if len(ts) != 2:
                continue
            (a, ea), (b, eb) = ts
            sa, sb = seeds.get(a, (None, None)), seeds.get(b, (None, None))
            if rnd == 1 and sa[0] and sb[0] and season >= "2020-21" and sa[0] + sb[0] != 9:
                # Play-In era: ranks 1-6 are the seeds; the Play-In team takes the slot it won (1v8, 2v7, ...)
                if sa[0] <= sb[0]: sb = (9 - sa[0], sb[1])
                else: sa = (9 - sb[0], sa[1])
                eff[a], eff[b] = sa, sb
            sa, sb = eff.get(a, sa), eff.get(b, sb)
            rows.append({"SEASON": season, "ROUND": rnd, "SERIES": e["sid"] if e["sid"] else sid, "CONF": sa[1] if rnd < 4 and sa[1] == sb[1] else ("Finals" if rnd == 4 else None),
                         "WIN_ID": a, "WIN": ea["abbr"], "WIN_SEED": sa[0], "WIN_W": ea["w"], "LOSE_ID": b, "LOSE": eb["abbr"], "LOSE_SEED": sb[0], "LOSE_W": eb["w"],
                         "GAMES": len(e["games"]), "FIRST": e["first"], "LAST": e["last"], "DONE": max(ea["w"], eb["w"]) >= (3 if rnd == 1 and season < "2002-03" else 4)})
    cols = list(rows[0].keys()) if rows else []
    path = DATA_DIR / "index" / "playoffs.json"
    path.write_text(json.dumps({"source": "NBA.com LeagueGameLog (Playoffs); seeds from NBA.com standings", "cols": cols,
                                "rows": [[r[c] for c in cols] for r in rows]}, separators=(",", ":")))
    print(f"  index: {len(rows)} series -> {path.relative_to(DATA_DIR.parent)}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("seasons", nargs="*")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--max-requests", type=int)
    ap.add_argument("--pause", type=float, default=2.5)
    ap.add_argument("--index-only", action="store_true")
    a = ap.parse_args()
    meta = json.loads((DATA_DIR / "meta.json").read_text())
    done = [s["season"] for s in meta["seasons"] if not s.get("in_progress")]
    seasons = a.seasons or done
    RUN.update(budget=a.max_requests, pause=a.pause, cache=not a.force)
    if not a.index_only:
        try:
            for s in seasons:
                if not a.force and (DATA_DIR / s / "playoffs.json").exists():
                    continue
                fetch_season(s)
        except BudgetUsedUp as stop:
            print(f"Stopped: {stop}. Run again to continue.")
            series_index([s["season"] for s in meta["seasons"]])
            sys.exit(3)
    series_index([s["season"] for s in meta["seasons"]])
    print(f"{RUN['made']} NBA.com requests made.")


if __name__ == "__main__":
    main()
