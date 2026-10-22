"""
college_transfer.py  -  fits the two numbers the College Transfer What-if (#/college/transfer) uses. Tiny output.

RUN IT (re-run after a new season is added; cheap):
    .venv/bin/python pipeline/college_transfer.py

1) Player -> team link. For every D-I team-season 2007-08 to now, sum over its players of BPM x MIN_PCT (Torvik's Min% is the
   share of the team's minutes, so a full roster sums to ~5.0) and compare with the team's AdjEM (likewise OBPM vs AdjO and
   DBPM vs AdjD). Torvik builds BPM to add up to team strength, so the fit is very tight; its slope converts "BPM x share of
   minutes" into points of adjusted efficiency.
2) Transfer carryover. For players who changed teams between seasons (40%+ of minutes before, 10%+ after), the straight-line
   fit of next-season BPM (and OBPM, DBPM) on this-season BPM, plus the median change in minutes share. The same fit for players
   who stayed is saved for comparison. These include normal year-to-year development, so they describe what transfers did.

OUTPUT: data/college/transfer_model.json
"""
import json, sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import college_fetch as cf


def main():
    team_rows, players = [], []
    for y in range(cf.FIRST_YEAR, 2100):
        s = cf.season_label(y)
        pf, tf = cf.ROOT / "data" / "college" / s / "players.json", cf.ROOT / "data" / "college" / s / "teams.json"
        if not pf.exists() or not tf.exists():
            if y > 2030: break
            continue
        d = json.loads(pf.read_text())
        p = pd.DataFrame(d["rows"], columns=d["cols"])
        if "BPM" not in p or p.dropna(subset=["BPM", "MIN_PCT"]).empty:
            continue                                          # preseason file: no stats yet
        p = p.dropna(subset=["BPM", "MIN_PCT"])
        p["Y"] = y
        players.append(p[["PID", "Y", "TEAM_ID", "BPM", "OBPM", "DBPM", "MIN_PCT"]])
        t = pd.DataFrame(json.loads(tf.read_text())).set_index("TEAM_ID")[["ADJEM", "ADJOE", "ADJDE"]]
        g = p.assign(c=p.BPM * p.MIN_PCT, co=p.OBPM * p.MIN_PCT, cd=p.DBPM * p.MIN_PCT).groupby("TEAM_ID")[["c", "co", "cd"]].sum()
        team_rows.append(t.join(g, how="inner"))
    m = pd.concat(team_rows).dropna()
    link = {}
    for a, b in [("c", "ADJEM"), ("co", "ADJOE"), ("cd", "ADJDE")]:
        sl, ic = np.polyfit(m[a], m[b], 1)
        resid = m[b] - (ic + sl * m[a])
        link[b] = {"slope": round(float(sl), 4), "intercept": round(float(ic), 3), "r": round(float(np.corrcoef(m[a], m[b])[0, 1]), 4), "rmse": round(float(np.sqrt((resid ** 2).mean())), 2)}
    A = pd.concat(players)
    nx = A.copy(); nx["Y"] -= 1
    j = A.merge(nx, on=["PID", "Y"], suffixes=("", "_n"))
    j = j[(j.MIN_PCT >= 0.4) & (j.MIN_PCT_n >= 0.1)]
    carry = {}
    for lab, sub in [("transfer", j[j.TEAM_ID != j.TEAM_ID_n]), ("stayed", j[j.TEAM_ID == j.TEAM_ID_n])]:
        c = {"n": int(len(sub)), "min_ratio": round(float((sub.MIN_PCT_n / sub.MIN_PCT).median()), 3)}
        for k in ["BPM", "OBPM", "DBPM"]:
            sl, ic = np.polyfit(sub[k], sub[k + "_n"], 1)
            c[k] = {"slope": round(float(sl), 3), "intercept": round(float(ic), 3)}
        carry[lab] = c
    out = {"generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"), "team_seasons": int(len(m)),
           "seasons": f"{cf.season_label(int(A.Y.min()))} to {cf.season_label(int(A.Y.max()))}", "link": link, "carryover": carry,
           "source": "Bart Torvik T-Rank player and team files (data/college/)"}
    cf.write_json(cf.ROOT / "data" / "college" / "transfer_model.json", out)
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
