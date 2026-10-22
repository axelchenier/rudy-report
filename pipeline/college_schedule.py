"""
college_schedule.py  -  recent results and upcoming NCAA men's D-I games for the College home page (#/college).

RUN IT (update_college.py runs it nightly; a few small ESPN requests):
    .venv/bin/python pipeline/college_schedule.py

Source: ESPN's public scoreboard (site.api.espn.com, groups=50 = Division I), one request per day:
  * results from the last 2 days and the schedule for the next 7 days;
  * out of season (no games in that window) it looks ahead up to 60 days for opening day and keeps the first 3 game days.
ESPN team ids are mapped to Torvik team slugs through the ESPN_ID column of the newest data/college/<season>/teams.json, so the
page can link teams and show T-Rank and a Model estimate (the Game Predictor's method) for each game.
OUTPUT: data/college/schedule.json (~20-150 KB; a game day has up to ~180 games).
"""
import json, sys, time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
import college_fetch as cf

URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard"
ET = ZoneInfo("America/New_York")


def espn_map():
    for d in sorted((cf.ROOT / "data" / "college").glob("20??-??"), reverse=True):
        p = d / "teams.json"
        if p.exists():
            rows = json.loads(p.read_text())
            m = {str(int(t["ESPN_ID"])): t["TEAM_ID"] for t in rows if t.get("ESPN_ID") is not None}
            if m:
                return m
    return {}


def day(d):
    for attempt in range(3):
        try:
            r = requests.get(URL, params={"dates": d.strftime("%Y%m%d"), "groups": 50, "limit": 400}, timeout=30,
                             headers={"User-Agent": "Mozilla/5.0 (rudy-report college schedule)"})
            r.raise_for_status()
            return r.json().get("events", [])
        except Exception as e:  # noqa: BLE001
            if attempt == 2:
                print(f"  {d}: {e}")
                return None
            time.sleep(2)


def game(e, m):
    c = e["competitions"][0]
    st = c["status"]["type"]
    side = {}
    for t in c["competitors"]:
        tm = t["team"]
        rank = (t.get("curatedRank") or {}).get("current")
        side[t["homeAway"]] = {"espn": tm.get("id"), "id": m.get(str(tm.get("id"))), "name": tm.get("location") or tm.get("shortDisplayName"),
                               "score": int(t["score"]) if st.get("state") != "pre" and str(t.get("score", "")).isdigit() else None,
                               "rank": rank if rank and rank < 99 else None}
    b = [n for x in c.get("broadcasts", []) for n in x.get("names", [])]
    return {"id": e["id"], "date": e["date"], "state": st.get("state"), "detail": st.get("shortDetail") or st.get("detail"),
            "neutral": bool(c.get("neutralSite")), "conf": bool(c.get("conferenceCompetition")), "tv": ", ".join(b[:2]) or None,
            "home": side.get("home"), "away": side.get("away")}


def main():
    m = espn_map()
    today = datetime.now(ET).date()
    days, games = [], []
    for k in range(-2, 8):
        d = today + timedelta(days=k)
        ev = day(d)
        if ev:
            days.append(str(d)); games += [game(e, m) for e in ev]
    upcoming = [g for g in games if g["state"] != "post"]
    if not upcoming:                                   # out of season: find opening day
        found = 0
        for k in range(8, 61):
            d = today + timedelta(days=k)
            ev = day(d)
            if ev:
                days.append(str(d)); games += [game(e, m) for e in ev]; found += 1
                if found == 3:
                    break
    seen, out = set(), []
    for g in sorted(games, key=lambda g: g["date"]):
        if g["id"] not in seen and g["home"] and g["away"]:
            seen.add(g["id"]); out.append(g)
    data = {"generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"), "today_et": str(today), "days": days, "games": out,
            "source": "ESPN scoreboard (site.api.espn.com), NCAA men's Division I"}
    cf.write_json(cf.ROOT / "data" / "college" / "schedule.json", data)
    print(f"schedule: {len(out)} games on {len(days)} days ({days[0] if days else '-'} to {days[-1] if days else '-'}); "
          f"{sum(1 for g in out if not (g['home']['id'] and g['away']['id']))} involve a non-D-I / unmatched team")


if __name__ == "__main__":
    main()
