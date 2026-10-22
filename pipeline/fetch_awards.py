"""
fetch_awards.py  -  NBA awards by season since 1996-97, from NBA.com/stats PlayerAwards (one request per player).

NBA.com has no league-wide awards list, only each player's awards, so this asks about players in order of how
likely they are to have won something (best seasons first) and STOPS as soon as every season 1996-97 on has its
MVP, Rookie of the Year, Defensive Player of the Year, Sixth Man, Most Improved and 15 All-NBA players.
Answers are cached in pipeline/cache/adv/ (git-ignored), so a stopped run resumes.

RUN IT (from the nba-stats-app folder):
    .venv/bin/python pipeline/fetch_awards.py --max-requests 300 --pause 4
    .venv/bin/python pipeline/fetch_awards.py --index-only        rebuild data/index/awards.json from cached answers (no requests)
Writes data/index/awards.json: {cols: [SEASON, AWARD, PLAYER_ID, PLAYER_NAME, TEAM, TEAM_NUMBER], rows: [...]}, season awards only
(no weekly/monthly awards), plus how complete each season is.
"""
import argparse
import json
import sys

from nba_api.stats.endpoints import playerawards

from fetch_data import DATA_DIR
from fetch_advanced import nba_call, RUN, BudgetUsedUp, _cache_path

KEEP = {"NBA Most Valuable Player": "MVP", "NBA Rookie of the Year": "ROY", "NBA Defensive Player of the Year": "DPOY",
        "NBA Sixth Man of the Year": "6MOY", "NBA Most Improved Player": "MIP", "NBA Clutch Player of the Year": "CPOY",
        "NBA Finals Most Valuable Player": "FMVP", "All-NBA": "ALL_NBA", "All-Defensive Team": "ALL_DEF", "All-Rookie Team": "ALL_ROOKIE",
        "NBA All-Star Most Valuable Player": "ASG_MVP", "NBA All-Star": "ALL_STAR"}
NEED = {"MVP": 1, "ROY": 1, "DPOY": 1, "6MOY": 1, "MIP": 1, "ALL_NBA": 15}


def candidates():
    """Every player since 1996-97, most likely award winners first (best per-game season, rookies who played a lot)."""
    d = json.loads((DATA_DIR / "index" / "player_seasons.json").read_text())
    rows = [dict(zip(d["cols"], r)) for r in d["rows"]]
    first, score = {}, {}
    for r in sorted(rows, key=lambda r: r["SEASON"]):
        gp = r["GP"] or 0
        if gp < 10:
            continue
        g = lambda k: (r[k] or 0) / gp
        s = g("PTS") + 1.0 * g("REB") + 1.4 * g("AST") + 3 * (g("STL") + g("BLK"))
        pid = r["PLAYER_ID"]
        if pid not in first:
            first[pid] = s + 8                         # rookie season counts extra (Rookie of the Year)
        score[pid] = max(score.get(pid, 0), s, first[pid])
    return [pid for pid, _ in sorted(score.items(), key=lambda kv: -kv[1])]


def parse(frames, seasons):
    out = []
    f = frames[0]
    for r in f.to_dict("records"):
        a = KEEP.get(r["DESCRIPTION"])
        if not a or r["SEASON"] not in seasons:
            continue
        num = r.get("ALL_NBA_TEAM_NUMBER")
        num = int(num) if isinstance(num, (int, float)) and num == num else (int(num) if isinstance(num, str) and num.strip().isdigit() else None)
        out.append([r["SEASON"], a, int(r["PERSON_ID"]), f"{r['FIRST_NAME']} {r['LAST_NAME']}".strip(), r["TEAM"] if isinstance(r.get("TEAM"), str) else "", num])
    return out


def complete(rows, seasons):
    have = {}
    for s, a, *_ in rows:
        have[(s, a)] = have.get((s, a), 0) + 1
    return {s: [a for a, n in NEED.items() if have.get((s, a), 0) < n] for s in seasons}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-requests", type=int)
    ap.add_argument("--pause", type=float, default=4.0)
    ap.add_argument("--index-only", action="store_true")
    a = ap.parse_args()
    meta = json.loads((DATA_DIR / "meta.json").read_text())
    seasons = sorted(s["season"] for s in meta["seasons"] if not s.get("in_progress"))
    RUN.update(budget=0 if a.index_only else a.max_requests, pause=a.pause, cache=True)
    rows, asked, stopped = [], 0, None
    for pid in candidates():
        if not any(complete(rows, seasons).values()):
            break
        if a.index_only and not _cache_path(f"awards {pid}").exists():
            continue
        try:
            frames = nba_call(lambda: playerawards.PlayerAwards(player_id=pid, timeout=60), f"awards {pid}", None)
        except BudgetUsedUp as e:
            stopped = str(e)
            break
        asked += 1
        rows.extend(parse(frames, set(seasons)))
    rows = sorted({tuple(r) for r in rows}, key=lambda r: (r[0], r[1], r[5] or 0, r[3]))
    missing = {s: m for s, m in complete(rows, seasons).items() if m}
    path = DATA_DIR / "index" / "awards.json"
    path.write_text(json.dumps({"source": "NBA.com PlayerAwards", "seasons": [seasons[0], seasons[-1]], "missing": missing,
                                "cols": ["SEASON", "AWARD", "PLAYER_ID", "PLAYER_NAME", "TEAM", "TEAM_NUMBER"], "rows": [[("" if isinstance(v, float) and v != v else v) for v in r] for r in rows]},
                               separators=(",", ":"), ensure_ascii=False, allow_nan=False))
    print(f"players checked {asked}, NBA.com requests {RUN['made']}, award rows {len(rows)}, seasons still incomplete {len(missing)}")
    if stopped:
        print(f"Stopped: {stopped}. Run again to continue.")
        sys.exit(3)


if __name__ == "__main__":
    main()
