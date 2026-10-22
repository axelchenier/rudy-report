"""
college_bracket.py  -  the real NCAA men's tournament brackets (seeds, regions and results) for the Tournament Simulator.

RUN IT (once; it re-uses its cache, and only needs re-running after a new tournament):
    .venv/bin/python pipeline/college_bracket.py              # 2008-2026 (no 2020: cancelled)
    .venv/bin/python pipeline/college_bracket.py --years 2026

SOURCE
  ESPN's public scoreboard feed (site.api.espn.com, the same ESPN source the College section already uses), one request
  per tournament day. Seeds are ESPN's tournament seeds; regions come from ESPN's game notes ("East Region - 1st Round").
  Nothing is typed in by hand. Sports-Reference is NOT used.

OUTPUT
  data/college/brackets/<year>.json   64-team field (after the First Four) in bracket order + every game's result
  data/college/brackets/index.json    which years exist
"""
import argparse
import json
import re
import sys
import time
from datetime import date, timedelta
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "pipeline" / "cache" / "college" / "espn_tourney"
OUT = ROOT / "data" / "college" / "brackets"
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/124 TheRudyReport/1.0 (+https://axelchenier.github.io/rudy-report/)"}
URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates={d}&groups=50&limit=300"
# Standard bracket order inside a region (top to bottom): 1-16, 8-9, 5-12, 4-13, 6-11, 3-14, 7-10, 2-15.
ORDER = [1, 16, 8, 9, 5, 12, 4, 13, 6, 11, 3, 14, 7, 10, 2, 15]


def day_events(d: date):
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / f"{d:%Y%m%d}.json"
    if f.exists():
        return json.loads(f.read_text())
    for attempt in range(3):
        try:
            r = requests.get(URL.format(d=f"{d:%Y%m%d}"), headers=UA, timeout=30)
            r.raise_for_status()
            ev = r.json().get("events", [])
            f.write_text(json.dumps(ev))
            time.sleep(0.4)
            return ev
        except Exception as e:  # noqa: BLE001
            print(f"  retry {d}: {e}", file=sys.stderr)
            time.sleep(2 + attempt * 3)
    raise RuntimeError(f"ESPN scoreboard failed for {d}")


def season_label(year):
    return f"{year - 1}-{str(year)[2:]}"


ALIASES = {"ualbany": "albany", "liu brooklyn": "liu"}     # ESPN names whose ESPN id isn't in that season's Torvik file


def nkey(name):
    k = re.sub(r"[^a-z0-9 ]", "", name.lower().replace("&", " and ")).replace(" state", " st")
    return ALIASES.get(k, k)


def team_map(year):
    """ESPN team id -> our Torvik team row for that season; plus a name lookup for ids Torvik's file doesn't carry."""
    teams = json.loads((ROOT / "data" / "college" / season_label(year) / "teams.json").read_text())
    return {int(t["ESPN_ID"]): t for t in teams if t.get("ESPN_ID")}, {nkey(t["TEAM_NAME"]): t for t in teams}


def build(year):
    games = []
    d = date(year, 3, 12)
    while d <= date(year, 4, 10):
        for e in day_events(d):
            c = e["competitions"][0]
            note = " ".join(n.get("headline", "") for n in c.get("notes", []))
            if not re.match(r"\s*(ncaa )?men'?s basketball champ", note, re.I):      # not conference tournaments, NIT, CBI...
                continue
            status = c.get("status", {}).get("type", {})
            uncontested = status.get("name") == "STATUS_UNCONTESTED"      # 2021: VCU (COVID) -> Oregon advanced
            if status.get("completed") is not True and not uncontested:
                continue
            region = re.search(r"(\w+) Region", note, re.I)
            comp = []
            for t in c["competitors"]:
                comp.append({"espn": int(t["team"]["id"]), "name": t["team"].get("location") or t["team"]["displayName"],
                             "seed": (t.get("curatedRank") or {}).get("current"), "score": int(t.get("score") or 0), "win": bool(t.get("winner"))})
            games.append({"id": e["id"], "date": e["date"][:10], "note": note, "region": region.group(1).title() if region else None, "t": comp,
                          "uncontested": uncontested})
        d += timedelta(days=1)
    games = list({g["id"]: g for g in games}.values())
    games.sort(key=lambda g: g["date"])
    if len(games) < 63:
        print(f"{year}: only {len(games)} tournament games found, skipped")
        return None
    # First Four: same seed, same region, played before anyone's second game.
    # First Four / Opening Round: labeled as such, or (2011-15, when ESPN called it the "1st Round") two same-seed teams
    # playing before the round of 64 starts.
    ff = [g for g in games if re.search(r"first four|opening round", g["note"], re.I) or
          (g["t"][0]["seed"] == g["t"][1]["seed"] and not re.search(r"Final Four|National", g["note"], re.I))]
    ff = [g for g in ff if re.search(r"first four|opening round", g["note"], re.I) or g["date"] <= min(x["date"] for x in games if x not in ff)]
    for g in ff:                          # ESPN sometimes leaves one First Four team unseeded (99): it has its opponent's seed
        seeds = [t["seed"] for t in g["t"] if t["seed"] and t["seed"] <= 16]
        for t in g["t"]:
            if not t["seed"] or t["seed"] > 16:
                t["seed"] = seeds[0] if seeds else None
    main = [g for g in games if g not in ff]
    played = {}
    for g in main:                      # round = 1 + games this team already played (excluding the First Four)
        a, b = g["t"]
        g["round"] = max(played.get(a["espn"], 0), played.get(b["espn"], 0)) + 1
        for t in g["t"]:
            played[t["espn"]] = played.get(t["espn"], 0) + 1
    r1 = [g for g in main if g["round"] == 1]
    if len(r1) != 32:
        print(f"{year}: {len(r1)} first-round games (expected 32), skipped")
        return None
    tm, by_name = team_map(year)
    field, missing = {}, []
    for g in r1:
        for t in g["t"]:
            row = tm.get(t["espn"]) or by_name.get(nkey(t["name"]))
            if not row:
                missing.append(t["name"])
                continue
            field[t["espn"]] = {"team_id": row["TEAM_ID"], "name": row["TEAM_NAME"], "seed": t["seed"], "region": g["region"]}
    if missing or len(field) != 64:
        print(f"{year}: could not match {missing} to Torvik teams, skipped")
        return None
    # Regions and Final Four pairings (which regional champions met).
    regions = []
    for g in r1:
        if g["region"] not in regions:
            regions.append(g["region"])
    f4 = [g for g in main if g["round"] == 5]
    pairs = [[field[t["espn"]]["region"] for t in g["t"]] for g in f4]
    if len(pairs) == 2:
        regions = pairs[0] + pairs[1]           # bracket order: semifinal 1 = regions 0+1, semifinal 2 = regions 2+3
    teams = []
    for reg in regions:
        inreg = {v["seed"]: v for v in field.values() if v["region"] == reg}
        if sorted(inreg) != list(range(1, 17)):
            print(f"{year}: region {reg} seeds {sorted(inreg)} incomplete, skipped")
            return None
        teams += [inreg[s] for s in ORDER]
    wins = {}
    for g in main:
        w = next(t for t in g["t"] if t["win"])
        wins[w["espn"]] = max(wins.get(w["espn"], 0), g["round"])
    id_of = {k: v["team_id"] for k, v in field.items()}
    for k, v in field.items():
        v["wins"] = wins.get(k, 0)            # 0 = lost in the round of 64 ... 6 = national champion
    for g in ff:                          # 2008-10 "Opening Round" notes have no region: use the winner's region
        w = next(t for t in g["t"] if t["win"])
        g["region"] = g["region"] or next((x["region"] for x in r1 if any(t["espn"] == w["espn"] for t in x["t"])), None)
    first_four = [{"seed": g["t"][0]["seed"], "region": g["region"], "teams": [t["name"] for t in g["t"]],
                   "winner": next(t["name"] for t in g["t"] if t["win"]), "score": "-".join(str(t["score"]) for t in sorted(g["t"], key=lambda t: -t["score"]))} for g in ff]
    results = [{"round": g["round"], "date": g["date"], "region": g["region"],
                "a": id_of.get(g["t"][0]["espn"]), "b": id_of.get(g["t"][1]["espn"]), "sa": g["t"][0]["score"], "sb": g["t"][1]["score"],
                "winner": id_of.get(next(t for t in g["t"] if t["win"])["espn"]), **({"uncontested": True} if g["uncontested"] else {})} for g in main]
    champ = next(v for v in field.values() if v["wins"] == 6)
    out = {"year": year, "season": season_label(year), "regions": regions, "teams": teams, "first_four": first_four, "results": results,
           "champion": champ["team_id"], "source": "ESPN scoreboard (site.api.espn.com): seeds, regions and results"}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"{year}.json").write_text(json.dumps(out, separators=(",", ":")))
    print(f"{year}: 64 teams, {len(results)} games, {len(first_four)} First Four, champion {champ['name']}; regions {regions}")
    return year


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", default="2008-2026")
    a = ap.parse_args()
    lo, _, hi = a.years.partition("-")
    years = [y for y in range(int(lo), int(hi or lo) + 1) if y != 2020]
    done = [y for y in years if build(y)]
    old = sorted(int(p.stem) for p in OUT.glob("[0-9]*.json"))
    (OUT / "index.json").write_text(json.dumps({"years": sorted(set(old) | set(done), reverse=True),
                                                "source": "ESPN scoreboard (site.api.espn.com)"}))
    if not done:
        print("ERROR: no brackets built")
        sys.exit(1)


if __name__ == "__main__":
    main()
