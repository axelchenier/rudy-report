"""
build_indexes.py  -  small combined files so pages don't have to download every season (now 1996-97 to today).
Only re-arranges data already in data/<season>/ (NBA.com). Run after any season's files change:
    .venv/bin/python pipeline/build_indexes.py
(update_reports.py runs it every night.)

Writes:
  data/index/players.json             every player: [PLAYER_ID, PLAYER_NAME (latest), career minutes, first season, last season]
                                      (the Ask bar's name finder)
  data/careers/<kind>/p_NN.json       every season row of every player, split into 40 files by PLAYER_ID % 40
                                      (kind = pergame / totals / per36; a player page loads 3 small files)
  data/index/similar.json             the inputs of the Similar Players tool for every player-season with 10+ minutes per game
  data/index/player_seasons.json      every player-season: season TOTALS (from players_totals.json) + per-game minutes and
                                      NBA.com advanced numbers (from players.json). The Ask bar's multi-season / all-time
                                      questions add these up instead of downloading two files for every season.
"""
import json
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"
SHARDS = 40
SIM_COLS = ["PLAYER_ID", "PLAYER_NAME", "TEAM_ABBREVIATION", "SEASON", "AGE", "GP", "MIN", "PTS", "REB", "AST", "STL", "BLK", "TOV", "PF",
            "FGA", "FG3A", "FG3M", "FTA", "FG3_PCT", "USG_PCT", "TS_PCT", "AST_PCT", "OREB_PCT", "DREB_PCT"]


SUMMABLE = ["GP", "PTS", "REB", "OREB", "DREB", "AST", "STL", "BLK", "TOV", "PF", "FGM", "FGA", "FG3M", "FG3A", "FTM", "FTA", "PLUS_MINUS", "DD2", "TD3"]
ADV = ["OFF_RATING", "DEF_RATING", "NET_RATING", "AST_PCT", "AST_TO", "AST_RATIO", "OREB_PCT", "DREB_PCT", "REB_PCT", "TM_TOV_PCT",
       "EFG_PCT", "TS_PCT", "USG_PCT", "PACE", "PIE", "POSS"]


def player_seasons(seasons):
    """One row per player-season (names: data/index/players.json): totals + per-game minutes/games + advanced (same numbers the Ask engine used to load)."""
    cols = ["SEASON", "PLAYER_ID", "TEAM_ID", "TEAM_ABBREVIATION", "MIN_TOT"] + SUMMABLE + ["PG_GP", "PG_MIN"] + ADV
    rows = []
    for s in seasons:
        tp, pp = DATA / s / "players_totals.json", DATA / s / "players.json"
        if not tp.exists() or not pp.exists():
            continue
        per = {r["PLAYER_ID"]: r for r in json.loads(pp.read_text())}
        for t in json.loads(tp.read_text()):
            g = per.get(t["PLAYER_ID"], {})
            row = {"SEASON": s, "PLAYER_ID": t["PLAYER_ID"], "PLAYER_NAME": t["PLAYER_NAME"], "TEAM_ID": t["TEAM_ID"],
                   "TEAM_ABBREVIATION": t["TEAM_ABBREVIATION"], "MIN_TOT": round(t["MIN"], 1) if t.get("MIN") is not None else None, "PG_GP": g.get("GP"), "PG_MIN": g.get("MIN")}
            for k in SUMMABLE:
                v = t.get(k)
                row[k] = int(round(v)) if isinstance(v, (int, float)) and k != "PLUS_MINUS" else v
            for k in ADV:
                row[k] = g.get(k)
            rows.append(row)
    return compact(rows, cols)


def compact(rows, cols=None):
    cols = cols or list(dict.fromkeys(k for r in rows for k in r))
    return {"cols": cols, "rows": [[r.get(c) for c in cols] for r in rows]}


def write(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, separators=(",", ":"), ensure_ascii=False))


def main():
    meta = json.loads((DATA / "meta.json").read_text())
    seasons = sorted(s["season"] for s in meta["seasons"])            # oldest first
    files = {"pergame": "players", "totals": "players_totals", "per36": "players_per36"}
    people, sim = {}, []
    for kind, name in files.items():
        shards = [[] for _ in range(SHARDS)]
        for s in seasons:
            path = DATA / s / f"{name}.json"
            if not path.exists():
                continue
            for r in json.loads(path.read_text()):
                r.setdefault("SEASON", s)
                shards[r["PLAYER_ID"] % SHARDS].append(r)
                if kind == "pergame":
                    e = people.setdefault(r["PLAYER_ID"], [r["PLAYER_ID"], r["PLAYER_NAME"], 0, s, s])
                    e[1], e[4] = r["PLAYER_NAME"], s
                    e[2] += round((r.get("MIN") or 0) * (r.get("GP") or 0))
                    if (r.get("MIN") or 0) >= 10:
                        sim.append(r)
        for i, rows in enumerate(shards):
            write(DATA / "careers" / kind / f"p_{i:02d}.json", compact(rows))
    write(DATA / "index" / "players.json", {"cols": ["PLAYER_ID", "PLAYER_NAME", "MINUTES", "FIRST", "LAST"], "rows": list(people.values())})
    for r in sim:
        for k in ("MIN", "PTS", "REB", "AST", "STL", "BLK", "TOV", "PF", "FGA", "FG3A", "FG3M", "FTA"):
            if r.get(k) is not None:
                r[k] = round(r[k], 1)
    write(DATA / "index" / "similar.json", compact(sim, SIM_COLS))
    write(DATA / "index" / "player_seasons.json", player_seasons(seasons))
    print(f"players {len(people)}, similar rows {len(sim)}, seasons {seasons[0]}..{seasons[-1]}")


if __name__ == "__main__":
    main()
