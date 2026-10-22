// draft_history.js - NBA draft classes 2008-2026 (#/draft/history and #/draft/history?year=2016).
// Picks: NBA.com DraftHistory. NBA outcomes: NBA.com regular-season stats. College lines: Bart Torvik T-Rank.
// All built by pipeline/college_nba.py into data/draft/history/. No Basketball-Reference data, no model output here.
import { esc } from "../ui.js";
import { TORVIK_CREDIT } from "../college/cdata.js";
import { draftNav, getJSON, TIERS, tierTag, nbaLink, NBA_CREDIT } from "./draft_nav.js";

const num = (v, d = 1) => v == null ? "–" : Number(v).toFixed(d);
const pct = (v, d = 1) => v == null ? "–" : (v * 100).toFixed(d) + "%";
const int = (v) => v == null ? "–" : Number(v).toLocaleString();
const share = (a, n) => n ? Math.round(100 * a / n) + "%" : "–";
const state = { sort: "pick", round: "" };

function defs(ix) {
  return `<p class="muted small">Outcome labels use NBA.com regular-season minutes only: ${Object.entries(TIERS).map(([, [l, d]]) => `<b>${l}</b> = ${d}`).join("; ")}.
    “Re-draft” re-orders a class by career NBA minutes, a plain durability/role measure, not a judgment of talent. NBA stats through ${esc(ix.nba_through)}.</p>`;
}
const yearPicker = (ix, year) => `<label class="small muted">Class <select id="dh-year"><option value="">All classes</option>
  ${[...ix.years].reverse().map((y) => `<option value="${y.year}" ${y.year === year ? "selected" : ""}>${y.year}</option>`).join("")}</select></label>`;

function overview(app, ix) {
  const rates = ix.hit_rates;
  app.innerHTML = `${draftNav("history")}
    <div class="page-head"><div><h1>NBA draft classes ${ix.first}-${ix.last}</h1>
      <p class="sub">Every pick from NBA.com's draft history, linked to his college stats (when he played Division I) and his NBA career. Pick a class, or see how each pick range has turned out.</p></div>
      <div>${yearPicker(ix, null)}</div></div>
    <section class="report-section"><h2>What each pick range turned into</h2>
      <p class="muted small">Classes ${ix.first}-${ix.mature_last} only (every player has had 6+ NBA seasons). Share of picks reaching each level.</p>
      <div class="card"><div class="table-wrap" style="max-height:none"><table class="data"><thead><tr><th class="left">Picks</th><th>Players</th><th>Played</th><th>Rotation (5,000+ min)</th><th>Starter (2+ seasons of 2,000+ min)</th><th>Median career minutes</th><th class="left" style="min-width:160px">Rotation share</th></tr></thead>
        <tbody>${rates.map((r) => `<tr><td class="left"><b>${r.range}</b></td><td>${r.n}</td><td>${share(r.played, r.n)}</td><td><b>${share(r.rotation, r.n)}</b></td><td>${share(r.starter, r.n)}</td><td>${int(r.median_min)}</td>
          <td class="left"><div class="hbar"><div style="width:${100 * r.rotation / r.n}%"></div></div></td></tr>`).join("")}</tbody></table></div></div></section>
    <section class="report-section"><h2>Every class</h2>
      <div class="table-wrap" style="max-height:none"><table class="data"><thead><tr><th class="left">Class</th><th>Picks</th><th>From D-I</th><th>Played</th><th>Rotation</th><th>Starters</th><th class="left">Most career minutes</th></tr></thead>
      <tbody>${[...ix.years].reverse().map((y) => `<tr><td class="left"><a href="#/draft/history?year=${y.year}"><b>${y.year}</b></a>${y.mature ? "" : ` <span class="muted small" title="Fewer than 6 NBA seasons so far">in progress</span>`}</td>
        <td>${y.picks}</td><td>${y.college}</td><td>${y.played}</td><td>${y.rotation}</td><td>${y.starter}</td>
        <td class="left">${y.top.map((t) => `<a href="#/player/${t.nba_id}">${esc(t.name)}</a> <span class="muted small">#${t.pick}</span>`).join(", ") || "–"}</td></tr>`).join("")}</tbody></table></div></section>
    ${defs(ix)}
    <p class="muted small">Sources: ${NBA_CREDIT}; college stats ${TORVIK_CREDIT}. Built ${esc(ix.generated_at)}.</p>`;
  app.querySelector("#dh-year").addEventListener("change", (e) => { location.hash = e.target.value ? `#/draft/history?year=${e.target.value}` : "#/draft/history"; });
}

function classPage(app, ix, d) {
  const s = d.summary, picks = d.picks;
  const played = picks.filter((p) => p.nba.career);
  const top = [...played].sort((a, b) => b.nba.career.min - a.nba.career.min).slice(0, 5);
  const value = [...played].filter((p) => p.pick > 20).sort((a, b) => b.nba.career.min - a.nba.career.min).slice(0, 5);
  const scorers = [...played].filter((p) => p.nba.career.gp >= 50).sort((a, b) => b.nba.career.ppg - a.nba.career.ppg).slice(0, 5);
  const seasonsIn = Number(ix.nba_through.slice(0, 4)) - d.year + 1;
  const mini = (title, rows, f) => `<div class="card"><h3>${title}</h3>${rows.length ? `<ol class="mini-list">${rows.map((p) => `<li>${nbaLink(p.nba_id, esc(p.name), p.in_nba_data)} <span class="muted small">#${p.pick} · ${f(p)}</span></li>`).join("")}</ol>` : `<p class="muted small">No one yet.</p>`}</div>`;
  const ranges = [[1, 10], [11, 30], [31, 60]].map(([lo, hi]) => { const xs = picks.filter((p) => p.pick >= lo && p.pick <= hi); return { r: `${lo}-${hi}`, n: xs.length, rot: xs.filter((p) => ["rotation", "starter"].includes(p.nba.tier)).length, pl: xs.filter((p) => p.nba.tier !== "none").length }; });
  const draw = () => {
    let rows = picks.filter((p) => !state.round || String(p.round) === state.round);
    if (state.sort === "redraft") rows = [...rows].sort((a, b) => (a.redraft ?? 999) - (b.redraft ?? 999) || a.pick - b.pick);
    app.querySelector("#dh-table").innerHTML = `<div class="table-wrap" style="max-height:none"><table class="data"><thead><tr>
      <th>Pick</th><th class="left">Team</th><th class="left">Player</th><th class="left">From</th>
      <th title="Final college season before the draft (Torvik)">College PTS</th><th>REB</th><th>AST</th><th>BPM</th>
      <th>NBA seasons</th><th>GP</th><th>Minutes</th><th>PTS</th><th>REB</th><th>AST</th><th>TS%</th><th title="First NBA season">Rookie PTS</th><th class="left">Outcome</th><th title="Rank in this class by career NBA minutes">Re-draft</th></tr></thead>
      <tbody>${rows.map((p) => { const c = p.college, n = p.nba, k = n.career || {}; return `<tr>
        <td>${p.pick}${p.round === 2 ? ` <span class="muted small">R2</span>` : ""}</td><td class="left" title="${esc(p.team_name)}">${esc(p.team)}</td>
        <td class="left"><b>${nbaLink(p.nba_id, esc(p.name), p.in_nba_data)}</b></td>
        <td class="left">${c ? `<a href="#/college/player/${c.pid}" title="College stats">${esc(c.team)}</a> <span class="muted small">${esc(c.class || "")} ${esc(c.season)}</span>` : `<span class="muted">${esc(p.org || "–")}</span>`}</td>
        <td>${num(c?.pts)}</td><td>${num(c?.reb)}</td><td>${num(c?.ast)}</td><td>${num(c?.bpm)}</td>
        <td>${n.seasons || 0}</td><td>${int(k.gp)}</td><td>${int(k.min)}</td><td>${num(k.ppg)}</td><td>${num(k.rpg)}</td><td>${num(k.apg)}</td><td>${pct(k.ts)}</td><td>${num(n.rookie?.ppg)}</td>
        <td class="left">${tierTag(n.tier)}</td><td>${p.redraft ?? "–"}</td></tr>`; }).join("")}</tbody></table></div>`;
  };
  app.innerHTML = `${draftNav("history")}
    <p class="muted small"><a href="#/draft/history">← All classes</a></p>
    <div class="page-head"><div><h1>${d.year} NBA Draft class</h1>
      <p class="sub">${s.picks} picks · ${s.college} from colleges (${s.linked} linked to D-I college stats) · ${seasonsIn} NBA season${seasonsIn === 1 ? "" : "s"} so far (through ${esc(ix.nba_through)}).</p></div>
      <div>${yearPicker(ix, d.year)}</div></div>
    ${s.mature ? "" : `<div class="callout"><p>⏳ This class has played fewer than 6 NBA seasons, so careers are still being written and outcome labels will change.</p></div>`}
    <div class="grid stat-cards" style="grid-template-columns:repeat(auto-fill,minmax(160px,1fr))">
      <div class="card stat-card"><div class="label">Played in the NBA</div><div class="value">${s.played}</div><div class="rank">of ${s.picks} picks</div></div>
      <div class="card stat-card"><div class="label">Rotation players</div><div class="value">${s.rotation}</div><div class="rank">5,000+ career minutes</div></div>
      <div class="card stat-card"><div class="label">Starters</div><div class="value">${s.starter}</div><div class="rank">2+ seasons of 2,000+ min</div></div>
      ${ranges.map((r) => `<div class="card stat-card"><div class="label">Picks ${r.r}</div><div class="value">${r.rot}/${r.n}</div><div class="rank">reached rotation · ${r.pl} played</div></div>`).join("")}
    </div>
    <div class="grid three-col">
      ${mini("Longest careers (minutes)", top, (p) => `${int(p.nba.career.min)} min`)}
      ${mini("Best value: picks 21-60", value, (p) => `${int(p.nba.career.min)} min`)}
      ${mini("Top scorers (50+ games)", scorers, (p) => `${num(p.nba.career.ppg)} PTS/G`)}
    </div>
    <section class="report-section"><h2>Every pick</h2>
      <div class="toolbar"><label class="small muted">Order <select id="dh-sort"><option value="pick">Draft order</option><option value="redraft" ${state.sort === "redraft" ? "selected" : ""}>Re-draft by career minutes</option></select></label>
        <label class="small muted">Round <select id="dh-round"><option value="">Both</option><option value="1" ${state.round === "1" ? "selected" : ""}>1st</option><option value="2" ${state.round === "2" ? "selected" : ""}>2nd</option></select></label></div>
      <div id="dh-table"></div>
      <p class="muted small">Player names open our NBA player page (career stats by season); “↗” links go to NBA.com. School names open his college stats. College columns are his final D-I season before the draft. NBA columns are regular-season career per-game averages.</p></section>
    ${defs(ix)}
    <p class="muted small">Sources: ${NBA_CREDIT}; college stats ${TORVIK_CREDIT}. Picks matched to college players by name and season (and Torvik's pick number when names differ).</p>`;
  app.querySelector("#dh-year").addEventListener("change", (e) => { location.hash = e.target.value ? `#/draft/history?year=${e.target.value}` : "#/draft/history"; });
  app.querySelector("#dh-sort").addEventListener("change", (e) => { state.sort = e.target.value; draw(); });
  app.querySelector("#dh-round").addEventListener("change", (e) => { state.round = e.target.value; draw(); });
  draw();
}

export async function draftHistoryPage(app, query = "") {
  let ix;
  try { ix = await getJSON("data/draft/history/index.json"); }
  catch { app.innerHTML = `${draftNav("history")}<h1>Draft classes</h1><p class="muted">Not built yet. Run <code>.venv/bin/python pipeline/college_nba.py</code>.</p>`; return; }
  const year = Number(new URLSearchParams(query || "").get("year"));
  if (!year) return overview(app, ix);
  if (year < ix.first || year > ix.last) { app.innerHTML = `${draftNav("history")}<h1>No ${esc(year)} class here</h1><p class="muted">Classes ${ix.first}-${ix.last} are covered. <a href="#/draft/history">All classes →</a></p>`; return; }
  classPage(app, ix, await getJSON(`data/draft/history/${year}.json`));
}
