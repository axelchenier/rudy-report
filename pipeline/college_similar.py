"""
college_similar.py  -  "Most similar college seasons" for every qualified D-I player-season since 2007-08 (college player pages).

RUN IT (update_college.py runs it nightly; local data only, ~30 s):
    .venv/bin/python pipeline/college_similar.py

Method (the same profile as the 2027 Draft board's comps, pipeline/college_draft.py): 15 stats - age, height, BPM, OBPM, DBPM,
usage, TS%, assist/turnover/offensive-rebound/defensive-rebound/steal/block rates, free-throw % (shrunk toward average for small
samples) and 3PA per 100 possessions - each turned into a z-score within its own season (so eras compare fairly), then the
root-mean-square distance between two player-seasons. Similarity = 100 x (1 - distance / 2). Only qualified seasons (40%+ of team
minutes, 15+ games) are compared; the player's own other seasons are left out.
OUTPUT: data/college/similar/<season>.json  {"cols", "names": {pid: name}, "players": {pid: [[pid, team#, year, class#, sim, nba_pick], ...]}}\n        data/college/similar/index.json (team and class tables). ~8 MB in all (~450 KB per season).
"""
import json, sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import college_fetch as cf
import college_draft as cd

K = 5


def main():
    frames = [d for d in (cd.load_season(y) for y in range(cf.FIRST_YEAR, 2100) if (cf.ROOT / "data" / "college" / cf.season_label(y)).exists()) if d is not None and "BPM" in d and d["GP"].notna().any()]
    H = pd.concat(frames, ignore_index=True)
    keys = cd.SIM_KEYS
    for y, g in H.groupby("YEAR"):
        b = g[(g.MIN_PCT >= 0.1) & (g.GP >= 5)]
        for k in keys:
            mu, sd = b[k].mean(), b[k].std() or 1
            H.loc[g.index, "Z_" + k] = ((g[k].fillna(mu) - mu) / sd).clip(-4, 4)
    Q = H[(H.MIN_PCT >= 0.4) & (H.GP >= 15)].reset_index(drop=True)
    Z = Q[["Z_" + k for k in keys]].to_numpy(np.float32)
    sq = (Z ** 2).sum(1)
    pid = Q.PID.to_numpy()
    nz = lambda v: None if v is None or (isinstance(v, float) and np.isnan(v)) else v
    info = [[int(a), nz(b), nz(c), nz(d), nz(e), nz(f), None if pd.isna(g) else int(g)] for a, b, c, d, e, f, g in
            zip(Q.PID, Q.PLAYER_NAME, Q.TEAM_ID, Q.TEAM_NAME, Q.SEASON, Q.CLASS, Q.NBA_PICK)]
    out = {}
    for s0 in range(0, len(Q), 2000):
        blk = Z[s0:s0 + 2000]
        d2 = np.maximum(0, sq[s0:s0 + 2000, None] + sq[None, :] - 2 * blk @ Z.T) / len(keys)
        d2[pid[s0:s0 + 2000, None] == pid[None, :]] = np.inf          # not his own seasons
        idx = np.argpartition(d2, K, axis=1)[:, :K]
        for i in range(len(blk)):
            r = s0 + i
            js = idx[i][np.argsort(d2[i, idx[i]])]
            comps = []
            for j in js:
                c = info[j]
                sim = round(max(0.0, 100 * (1 - float(np.sqrt(d2[i, j])) / 2)), 1)
                comps.append(c[:6] + [sim, c[6]])
            out.setdefault(info[r][4], {})[str(info[r][0])] = comps
    d = cf.ROOT / "data" / "college" / "similar"
    d.mkdir(exist_ok=True)
    for f in d.glob("*.json"):
        f.unlink()
    teams = sorted({(c[2], c[3]) for c in info if c[2]})
    tix = {t[0]: i for i, t in enumerate(teams)}
    CLS = ["Fr", "So", "Jr", "Sr"]
    cols = ["PID", "TEAM", "YEAR", "CLASS", "SIMILARITY", "NBA_PICK"]
    for season, players in out.items():
        names, rows = {}, {}
        for p0, comps in players.items():
            rows[p0] = []
            for c in comps:
                names[str(c[0])] = c[1]
                rows[p0].append([c[0], tix.get(c[2]), int(c[4][:4]) + 1, CLS.index(c[5]) if c[5] in CLS else None, c[6], c[7]])
        cf.write_json(d / f"{season}.json", {"season": season, "cols": cols, "names": names, "players": rows})
    cf.write_json(d / "index.json", {"seasons": sorted(out), "stats": keys, "qualify": "40%+ of team minutes and 15+ games", "k": K,
                                     "classes": CLS, "teams": [list(t) for t in teams],
                                     "note": "TEAM = index into teams [[id, name]]; YEAR = season end year (2019 = 2018-19); CLASS = index into classes"})
    print(f"similar: {len(Q):,} qualified player-seasons in {len(out)} seasons")


if __name__ == "__main__":
    main()
