// freshness.js - the "Data freshness" line in the site footer: when each section's data was last refreshed, so a missed
// nightly job is easy to spot. Reads data/meta.json (NBA), data/reports/index.json (NBA reports) and
// data/college/freshness.json (College/Draft datasets + the steps of the last nightly update_college.py run).
import { esc } from "./ui.js";

const get = (p) => fetch(p, { cache: "no-cache" }).then((r) => r.ok ? r.json() : null).catch(() => null);
const parse = (s) => { const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(s || ""); return m ? new Date(`${m[1]}T${m[2]}:00Z`) : null; };
const ago = (d) => {
  if (!d) return "unknown";
  const h = (Date.now() - d) / 36e5;
  return h < 1 ? `${Math.max(1, Math.round(h * 60))} min ago` : h < 36 ? `${Math.round(h)} h ago` : `${Math.round(h / 24)} days ago`;
};
// fresh = within ~a nightly cycle; late = one run missed; old = two or more.
const level = (d) => !d ? "old" : (Date.now() - d) / 36e5 < 30 ? "fresh" : (Date.now() - d) / 36e5 < 54 ? "late" : "old";
const dot = (d) => `<span class="fr-dot fr-${level(d)}" title="${{ fresh: "Refreshed in the last 30 hours", late: "Older than 30 hours: one nightly run may have been missed", old: "Older than 54 hours (or unknown)" }[level(d)]}"></span>`;

export async function renderFreshness() {
  const el = document.getElementById("freshness");
  if (!el) return;
  const [nba, nbaRep, col] = await Promise.all([get("data/meta.json"), get("data/reports/index.json"), get("data/college/freshness.json")]);
  const ci = Object.fromEntries((col?.items || []).map((x) => [x.key, x]));
  const rows = [
    ["NBA", "NBA current-season stats (NBA.com)", nba?.current_pulled_at_utc || nba?.pulled_at_utc],
    ["NBA", "NBA all seasons (full pull)", nba?.pulled_at_utc],
    ["NBA", "NBA reports", nbaRep?.generated_at],
    ...(col?.items || []).map((x) => [x.key.startsWith("draft") ? "Draft" : "College", x.label, x.updated_utc]),
  ].map(([g, l, s]) => ({ g, l, s, d: parse(s) }));
  const group = (g, key) => { const r = key ? rows.find((x) => x.l === key) : null; const d = r ? r.d : rows.filter((x) => x.g === g).map((x) => x.d).sort((a, b) => (a || 0) - (b || 0))[0]; return { g, d }; };
  const heads = [group("NBA", "NBA current-season stats (NBA.com)"), { g: "College", d: ci.college ? parse(ci.college.updated_utc) : null },
    { g: "Draft", d: parse(ci.draft_board?.updated_utc) }];
  const steps = col?.steps || [];
  const failed = steps.filter((s) => !s.ok);
  const run = col?.last_run_utc ? `College/Draft nightly run ${ago(parse(col.last_run_utc))}: ${failed.length ? `<b class="fr-bad">${failed.length} step${failed.length > 1 ? "s" : ""} failed</b>` : "all steps OK"}` : "College/Draft nightly run: not recorded yet";
  el.innerHTML = `<details class="fr"><summary>Data freshness: ${heads.map((h) => `${dot(h.d)}${h.g} ${ago(h.d)}`).join(" · ")} · ${run}</summary>
    <div class="table-wrap"><table class="data fr-table"><thead><tr><th class="left">Section</th><th class="left">Data</th><th class="left">Last refreshed (UTC)</th><th class="left">Age</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td class="left">${r.g}</td><td class="left">${dot(r.d)}${esc(r.l)}</td><td class="left">${esc(r.s || "–")}</td><td class="left">${ago(r.d)}</td></tr>`).join("")}</tbody></table></div>
    ${steps.length ? `<p class="small">Last College/Draft nightly run (${esc(col.last_run_utc)} UTC): ${steps.map((s) => `${s.ok ? "✓" : "✗"} ${esc(s.step)}${s.ok ? "" : ` <span class="fr-bad">(${esc(s.note || "failed")})</span>`}`).join(" · ")}</p>` : ""}
    <p class="small muted">Green = refreshed in the last 30 hours, amber = 30-54 hours (one nightly run may have been missed), red = older. Off-season datasets
      (e.g. game logs May-October) only change when there is something new.</p></details>`;
}
