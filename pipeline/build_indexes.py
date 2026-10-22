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
"""
import json
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"
SHARDS = 40
SIM_COLS = ["PLAYER_ID", "PLAYER_NAME", "TEAM_ABBREVIATION", "SEASON", "AGE", "GP", "MIN", "PTS", "REB", "AST", "STL", "BLK", "TOV", "PF",
            "FGA", "FG3A", "FG3M", "FTA", "FG3_PCT", "USG_PCT", "TS_PCT", "AST_PCT", "OREB_PCT", "DREB_PCT"]


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
    print(f"players {len(people)}, similar rows {len(sim)}, seasons {seasons[0]}..{seasons[-1]}")


if __name__ == "__main__":
    main()
