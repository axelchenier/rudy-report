"""
college_freshness.py  -  data/college/freshness.json: when each College/Draft dataset was last rebuilt, and whether each step of
the latest nightly update_college.py run worked. The site's footer "Data freshness" line reads it (plus data/meta.json for NBA).

update_college.py calls write(steps) at the end of a run; running this file alone just refreshes the timestamps:
    .venv/bin/python pipeline/college_freshness.py
OUTPUT: data/college/freshness.json (~1-2 KB)
"""
import json, sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import college_fetch as cf

D = cf.ROOT / "data"
# key, label, file, timestamp field (None = file modification time)
ITEMS = [("college", "College stats & ratings (Torvik + ESPN)", "college/meta.json", "pulled_at_utc"),
         ("college_reports", "College reports", "college/reports/index.json", "generated_at"),
         ("schedule", "College schedule & scores (ESPN)", "college/schedule.json", "generated_at"),
         ("gamelogs", "College game logs (ESPN)", "college/gamelogs/index.json", None),
         ("leaders", "College leaders", "college/leaders.json", "generated_at"),
         ("draft_board", "2027 Draft model board", "draft/board.json", "generated_at"),
         ("draft_history", "Draft classes + college-to-NBA", "draft/history/index.json", "generated_at")]


def stamp(path, field):
    p = D / path
    if not p.exists():
        return None
    if field:
        try:
            v = json.loads(p.read_text()).get(field)
            if v:
                return v
        except Exception:  # noqa: BLE001
            pass
    newest = max([p.stat().st_mtime] + [x.stat().st_mtime for x in p.parent.rglob("*.json")] if field is None else [p.stat().st_mtime])
    return datetime.fromtimestamp(newest, timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def write(steps=None):
    old = {}
    f = D / "college" / "freshness.json"
    if f.exists():
        try:
            old = json.loads(f.read_text())
        except Exception:  # noqa: BLE001
            old = {}
    out = {"items": [{"key": k, "label": l, "updated_utc": stamp(p, fld)} for k, l, p, fld in ITEMS]}
    if steps is not None:
        out["last_run_utc"] = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        out["steps"] = steps            # [{"step": "...", "ok": true/false, "note": "..."}]
    else:
        out["last_run_utc"] = old.get("last_run_utc")
        out["steps"] = old.get("steps", [])
    cf.write_json(f, out)
    bad = [s["step"] for s in out["steps"] if not s.get("ok")]
    print(f"freshness: {len(out['items'])} datasets; last run {out['last_run_utc']}; failed steps: {', '.join(bad) or 'none'}")


if __name__ == "__main__":
    write()
