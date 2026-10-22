// draft.js - 2027 NBA Draft: the "Rudy Report Model Board" and per-prospect reports.
// Displays data/draft/*.json from pipeline/college_draft.py. Stats are real (Torvik T-Rank CSVs, NBA Draft Combine);
// the board order and chances are a MODEL ESTIMATE made by this site. No scouting opinions, no one else's rankings.
import { esc } from "../ui.js";
import { draftNav, tierTag, nbaLink } from "./draft_nav.js";
import { unpack } from "./draft_translation.js";
import { careerOf, TORVIK_CREDIT } from "../college/cdata.js";

const cache = new Map();
const getJSON = (path) => { if (!cache.has(path)) cache.set(path, fetch(path).then((r) => { if (!r.ok) throw new Error(`Could not load ${path}`); return r.json(); })); return cache.get(path); };
const num = (v, d = 1) => v == null ? "–" : Number(v).toFixed(d);
const pct = (v, d = 1) => v == null ? "–" : (v * 100).toFixed(d) + "%";
const chance = (p) => p == null ? "–" : p >= 0.995 ? ">99%" : p < 0.01 ? "<1%" : Math.round(p * 100) + "%";
const BADGE = `<span class="model-badge">Model estimate</span>`;
const ftin = (v) => v == null ? "–" : `${Math.floor(v / 12)}' ${(v % 12).toFixed(2).replace(/\.?0+$/, "")}"`;
const state = { q: "", conf: "", cls: "" };

function methodNote(b) {
  const m = b.model, top = [...m.features].sort((x, y) => Math.abs(y.weight) - Math.abs(x.weight)).slice(0, 6);
  return `<div class="card method"><h3>How the Model Board works ${BADGE}</h3>
    <p>This is <b>The Rudy Report's own statistical model</b>, not a scouting ranking and not anyone else's big board. It answers one question:
      <i>historically, how often did college players with this statistical profile become first-round picks?</i></p>
    <p><b>Model:</b> logistic regression fit on ${esc(m.train)}. Inputs (each standardized within its season): ${m.features.map((f) => esc(f.label)).join(", ")}.
      Biggest weights: ${top.map((f) => `${esc(f.label)} (${f.weight > 0 ? "+" : ""}${f.weight.toFixed(2)})`).join(", ")}. Younger, taller, higher-usage, more efficient players on stronger teams score higher.</p>
    <p><b>Back-test:</b> ${esc(m.backtest.text)}</p>
    <p><b>Who's here:</b> players on a ${esc(b.roster_season)} D-I roster with ${esc(b.stats_season)} college stats (${b.eligible_pool.toLocaleString()} players, 8+ games, 15%+ of team minutes);
      the top ${b.prospects.length} are shown. <b>Incoming freshmen and international players have no college stats yet, so they are not on the board</b>; freshmen join once they've played.
      Measurements and athletic tests are official NBA Draft Combine results (stats.nba.com) for the few who went to a combine and returned to school.</p>
    <p class="muted small">It can't see injuries, film, interviews, wingspan for most players, or anything not in a box score. Built ${esc(b.generated_at)}. Stats: ${TORVIK_CREDIT}.</p></div>`;
}

export async function draftBoardPage(app, query = "") {
  let b;
  try { b = await getJSON("data/draft/board.json"); }
  catch { app.innerHTML = `${draftNav("board")}<h1>2027 NBA Draft</h1><p class="muted">No board yet. Run <code>.venv/bin/python pipeline/college_draft.py</code>.</p>`; return; }
  const confs = [...new Set(b.prospects.map((p) => p.conf))].sort();
  const draw = () => {
    const q = state.q.toLowerCase();
    const rows = b.prospects.filter((p) => (!q || p.player.toLowerCase().includes(q) || p.team.toLowerCase().includes(q)) && (!state.conf || p.conf === state.conf) && (!state.cls || p.class_now === state.cls));
    app.querySelector("#board").innerHTML = rows.length ? `<div class="table-wrap" style="max-height:none"><table class="data"><thead><tr>
      <th>#</th><th class="left">Player</th><th class="left">2026-27 team</th><th class="left">Class</th><th class="left">Ht</th><th>Age at draft</th>
      <th>PTS</th><th>REB</th><th>AST</th><th>BPM</th><th>TS%</th><th title="Model estimate">1st-round chance</th><th title="Model estimate">Drafted chance</th><th class="left">Most similar drafted player</th></tr></thead>
      <tbody>${rows.map((p) => `<tr><td>${p.rank}</td>
        <td class="left"><a href="#/draft/${p.pid}"><b>${esc(p.player)}</b></a>${p.combine ? ` <span class="tag" title="Has official NBA Draft Combine measurements">combine</span>` : ""}</td>
        <td class="left">${p.team_slug ? `<a href="#/college/team/${esc(p.team_slug)}">${esc(p.team)}</a>` : esc(p.team)} <span class="muted small">${esc(p.conf)}</span></td>
        <td class="left">${esc(p.class_now || "")}</td><td class="left">${esc(p.ht || "–")}</td><td>${num(p.age_draft)}</td>
        <td>${num(p.pts)}</td><td>${num(p.reb)}</td><td>${num(p.ast)}</td><td>${num(p.bpm)}</td><td>${pct(p.ts)}</td>
        <td><b>${chance(p.p_first)}</b></td><td>${chance(p.p_drafted)}</td><td class="left muted">${esc(p.top_comp || "")}</td></tr>`).join("")}</tbody></table></div>`
      : `<p class="muted">No prospects match.</p>`;
  };
  app.innerHTML = `${draftNav("board")}
    <div class="page-head"><div><h1>2027 NBA Draft · Rudy Report Model Board ${BADGE}</h1>
      <p class="sub">College prospects ranked by a statistical model's chance of being a first-round pick. ${esc(b.stats_season)} stats, ${esc(b.roster_season)} teams. Click a player for the full report.</p></div></div>
    <div class="callout"><p>ℹ This order is <b>our model's estimate</b> from college stats, age and height. It is not a scouting ranking, a mock draft or any outlet's big board. Method below.</p></div>
    <div class="toolbar"><input type="search" id="q" placeholder="Search player or team…" value="${esc(state.q)}">
      <select id="conf"><option value="">All conferences</option>${confs.map((c) => `<option ${c === state.conf ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
      <select id="cls"><option value="">All classes</option>${["Fr", "So", "Jr", "Sr"].map((c) => `<option ${c === state.cls ? "selected" : ""}>${c}</option>`).join("")}</select></div>
    <div id="board"></div>
    ${methodNote(b)}`;
  app.querySelector("#q").addEventListener("input", (e) => { state.q = e.target.value; draw(); });
  app.querySelector("#conf").addEventListener("change", (e) => { state.conf = e.target.value; draw(); });
  app.querySelector("#cls").addEventListener("change", (e) => { state.cls = e.target.value; draw(); });
  draw();
}

// "What similar past players became": real NBA.com outcomes of the most similar drafted players (pipeline/college_nba.py),
// plus one similarity-weighted summary, labeled Model estimate.
function nbaOutcomes(p, outcomes) {
  const shown = p.comps.map((c) => ({ c, o: outcomes.get(c.pid) }));
  const nn = (p.nn_outcomes || []).map(([pid, sim]) => ({ o: outcomes.get(pid), sim })).filter((x) => x.o);
  const med = (xs) => { const s2 = [...xs].sort((a, b2) => a - b2); return s2.length ? s2[Math.floor(s2.length / 2)] : null; };
  const cnt = (t) => nn.filter((x) => t.includes(x.o.TIER)).length;
  const wsum = nn.reduce((a, x) => a + x.sim, 0);
  const wshare = (t) => wsum ? nn.reduce((a, x) => a + (t.includes(x.o.TIER) ? x.sim : 0), 0) / wsum : null;
  const ppg = nn.filter((x) => x.o.N_GP >= 50).map((x) => x.o.N_PPG);
  return `<section class="report-section"><h2>What similar past players became in the NBA</h2>
    <p class="muted small">Real NBA.com regular-season results of the drafted players whose final college seasons looked most like his. History, not a forecast.</p>
    <div class="table-wrap"><table class="data"><thead><tr><th class="left">Player</th><th>Drafted</th><th>NBA seasons</th><th>GP</th><th>Minutes</th><th>PTS</th><th>REB</th><th>AST</th><th>TS%</th><th>Rookie PTS</th><th class="left">Outcome</th></tr></thead>
    <tbody>${shown.map(({ c, o }) => `<tr><td class="left">${o && o.N_GP ? nbaLink(o.NBA_ID, esc(c.player), true) : esc(c.player)}</td>
      <td>${o ? `<a href="#/draft/history?year=${o.DRAFT_YEAR}">${o.DRAFT_YEAR}</a> #${o.PICK}` : `${c.draft_year} · #${c.pick}`}</td>
      ${o ? `<td>${o.N_SEASONS}</td><td>${o.N_GP ?? 0}</td><td>${o.N_MIN ? o.N_MIN.toLocaleString() : 0}</td><td>${num(o.N_PPG)}</td><td>${num(o.N_RPG)}</td><td>${num(o.N_APG)}</td><td>${pct(o.N_TS)}</td><td>${num(o.R_PPG)}</td><td class="left">${tierTag(o.TIER)}</td>`
        : `<td colspan="9" class="muted left">Not matched to NBA.com draft history</td>`}</tr>`).join("")}</tbody></table></div>
    ${nn.length ? `<div class="grid two-col" style="margin-top:12px">
      <div class="card"><h3>His ${nn.length} closest matches drafted 2008-2020</h3>
        <p>${cnt(["played", "rotation", "starter"])} played in the NBA, <b>${cnt(["rotation", "starter"])}</b> became rotation players (5,000+ minutes) and <b>${cnt(["starter"])}</b> starters (2+ seasons of 2,000+ minutes).
          Median career: ${(med(nn.map((x) => x.o.N_MIN ?? 0)) ?? 0).toLocaleString()} minutes${ppg.length ? `; ${num(med(ppg))} points a game among the ${ppg.length} who played 50+ games` : ""}.</p>
        <p class="small">${nn.map((x) => `${x.o.N_GP ? nbaLink(x.o.NBA_ID, esc(x.o.NAME), true) : esc(x.o.NAME)} ${tierTag(x.o.TIER)}`).join(" · ")}</p></div>
      <div class="card"><h3>Similarity-weighted outcome ${BADGE}</h3>
        <div class="grid stat-cards" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr))">
          <div class="card stat-card"><div class="label">Reached rotation</div><div class="value">${Math.round(100 * wshare(["rotation", "starter"]))}%</div></div>
          <div class="card stat-card"><div class="label">Became a starter</div><div class="value">${Math.round(100 * wshare(["starter"]))}%</div></div></div>
        <p class="muted small">Share of those ${nn.length} past players reaching each level, each counted by how similar he is (closer matches count more). Only drafted players are in the pool, so this assumes he gets drafted, and it can't see anything outside the box score.</p></div>
    </div>` : ""}
    <p class="muted small">Sources: NBA.com Draft History and regular-season stats; college seasons from Torvik. <a href="#/draft/translation">How college stats carried over →</a></p></section>`;
}

export async function draftProspectPage(app, pid) {
  const [b, p] = await Promise.all([getJSON("data/draft/board.json"), getJSON(`data/draft/prospects/${pid}.json`).catch(() => null)]);
  if (!p) { app.innerHTML = `${draftNav("board")}<h1>Prospect not found</h1><p class="muted">This player isn't on the current board. <a href="#/college/player/${esc(pid)}">College stats page →</a></p>`; return; }
  const s = p.season_line, c = p.combine_data;
  const bar = (x) => `<tr><td class="left">${esc(x.label)}${x.lower_better ? ` <span class="muted small">(lower is better)</span>` : ""}</td><td>${esc(x.shown)}</td>
    <td style="width:45%"><div style="background:var(--panel-2);border-radius:6px;height:14px;position:relative">
      <div style="width:${x.pctile}%;height:100%;border-radius:6px;background:${x.pctile >= 80 ? "var(--good)" : x.pctile <= 20 ? "var(--bad)" : "var(--accent)"};opacity:${x.enough ? 1 : .35}"></div></div></td>
    <td><b>${x.pctile}</b>${x.enough ? "" : ` <span class="muted small" title="Below the attempt minimum (${esc(x.rule)})">*</span>`}</td></tr>`;
  let outcomes = null;
  try { outcomes = new Map(unpack(await getJSON("data/draft/translation.json")).map((r) => [r.PID, r])); } catch { /* section hidden */ }
  let career = [];
  try { career = (await careerOf(Number(pid))).sort((a, b2) => a.SEASON < b2.SEASON ? -1 : 1); } catch { /* careers optional */ }
  const sline = (k, f = num) => f(s[k]);
  app.innerHTML = `${draftNav("board")}
    <p class="muted small"><a href="#/draft">← Model Board</a></p>
    <div class="page-head"><div><h1>${esc(p.player)}</h1>
      <p class="sub">${esc(p.team)} · ${esc(p.conf)} · ${esc(p.class_now || "")} in ${esc(b.roster_season)} · ${esc(p.ht || "–")} · ${esc(p.role || "")}
        ${p.age_draft ? ` · ${num(p.age_draft)} years old at the 2027 draft (approx.)` : ""}${p.hometown ? ` · from ${esc(p.hometown)}` : ""}
        · <a href="#/college/player/${p.pid}">full college stats →</a></p></div></div>
    <div class="grid stat-cards" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr))">
      <div class="card stat-card"><div class="label">Model Board rank ${BADGE}</div><div class="value">#${p.rank}</div><div class="rank">of ${b.prospects.length} shown</div></div>
      <div class="card stat-card"><div class="label">First-round chance ${BADGE}</div><div class="value">${chance(p.p_first)}</div><div class="rank">historical rate for this profile</div></div>
      <div class="card stat-card"><div class="label">Drafted chance ${BADGE}</div><div class="value">${chance(p.p_drafted)}</div><div class="rank">any of 60 picks</div></div>
      <div class="card stat-card"><div class="label">${esc(p.stats_season)} line</div><div class="value" style="font-size:20px">${num(s.PTS)} / ${num(s.REB)} / ${num(s.AST)}</div><div class="rank">PTS / REB / AST in ${s.GP} games at ${esc(p.stats_team)}</div></div>
      <div class="card stat-card"><div class="label">Box Plus/Minus</div><div class="value">${num(s.BPM)}</div><div class="rank">OBPM ${num(s.OBPM)} · DBPM ${num(s.DBPM)}</div></div>
    </div>
    <div class="grid two-col">
      <div class="card"><h3>Statistical strengths</h3>${p.strengths.length ? `<ul class="trends">${p.strengths.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p class="muted small">No stat in the top 10% of qualified D-I players.</p>`}
        <h3 style="margin-top:12px">Statistical weaknesses</h3>${p.weaknesses.length ? `<ul class="trends">${p.weaknesses.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p class="muted small">No skill stat in the bottom 15% of qualified D-I players.</p>`}
        <p class="muted small">Rules, not opinions: a strength is a stat in the top 10% of ${esc(p.pctile_pool)}; a weakness is in the bottom 15% (role stats such as rebounding, blocks or 3-point volume aren't counted as weaknesses). Shooting needs enough attempts to count.</p></div>
      <div class="card"><h3>Why the model rates him here ${BADGE}</h3>${`<div class="table-wrap"><table class="data"><thead><tr><th class="left">Input</th><th>Value</th><th>Push</th></tr></thead><tbody>
        ${p.drivers.map((d) => `<tr><td class="left">${esc(d.label)}</td><td>${d.label.includes("%") || d.label.includes("rate") || d.label.includes("Usage") || d.label.includes("minutes") ? pct(d.value) : d.label === "Height" ? `${Math.floor(d.value / 12)}-${d.value % 12}` : num(d.value)}</td>
          <td><span class="delta ${d.effect > 0 ? "up" : "down"}">${d.effect > 0 ? "▲ up" : "▼ down"} ${Math.abs(d.effect).toFixed(1)}</span></td></tr>`).join("")}</tbody></table></div>`}
        <p class="muted small">The six inputs that moved his score most (model weight × how far he is from the D-I average, in log-odds).</p></div>
    </div>
    <section class="report-section"><h2>Percentiles among D-I players</h2><p class="muted small">${esc(p.pctile_pool)}. 100 = best. * = below the attempt minimum, shown faded.</p>
      <div class="card"><div class="table-wrap" style="max-height:none"><table class="data"><thead><tr><th class="left">Stat</th><th>${esc(p.stats_season)}</th><th class="left">Percentile</th><th></th></tr></thead>
        <tbody>${p.percentiles.map(bar).join("")}</tbody></table></div></div></section>
    <section class="report-section"><h2>Most similar drafted players</h2>
      <p class="muted small">Final college seasons of past drafted players whose numbers look most like his (age, height, BPM, usage, shooting, rebounding, passing, defense rates; each compared within its own season). Statistical similarity only. It is not a projection of how his career will go.</p>
      <div class="table-wrap"><table class="data"><thead><tr><th class="left">Player</th><th class="left">Season</th><th class="left">Class</th><th>Age</th><th class="left">Ht</th><th>PTS</th><th>BPM</th><th>TS%</th><th>USG</th><th>Drafted</th><th>Similarity</th></tr></thead>
      <tbody>${p.comps.map((x) => `<tr><td class="left"><a href="#/college/player/${x.pid}">${esc(x.player)}</a> <span class="muted small">${esc(x.team)}</span></td><td class="left">${esc(x.season)}</td>
        <td class="left">${esc(x.class || "")}</td><td>${num(x.age)}</td><td class="left">${esc(x.ht || "")}</td><td>${num(x.pts)}</td><td>${num(x.bpm)}</td><td>${pct(x.ts)}</td><td>${pct(x.usg)}</td>
        <td>${x.draft_year} · pick ${x.pick}</td><td><b>${num(x.similarity, 0)}</b></td></tr>`).join("")}</tbody></table></div>
      <p class="muted small">Similarity: 100 = identical on every input; 0 = on average two standard deviations apart. Pool: ${esc(b.model.comps_pool)}.</p></section>
    ${outcomes ? nbaOutcomes(p, outcomes) : ""}
    ${c ? `<section class="report-section"><h2>NBA Draft Combine (${esc(c.SEASON)})</h2><div class="grid stat-cards">
      ${[["Height (no shoes)", ftin(c.HEIGHT_WO_SHOES)], ["Wingspan", ftin(c.WINGSPAN)], ["Standing reach", ftin(c.STANDING_REACH)], ["Weight", c.WEIGHT ? `${num(c.WEIGHT, 0)} lb` : "–"],
        ["Max vertical", c.MAX_VERTICAL_LEAP ? `${c.MAX_VERTICAL_LEAP}"` : "–"], ["Lane agility", c.LANE_AGILITY_TIME ? `${c.LANE_AGILITY_TIME}s` : "–"], ["3/4 sprint", c.THREE_QUARTER_SPRINT ? `${c.THREE_QUARTER_SPRINT}s` : "–"],
        ["Hand length × width", c.HAND_LENGTH ? `${c.HAND_LENGTH}" × ${c.HAND_WIDTH}"` : "–"]].map(([l, v]) => `<div class="card stat-card"><div class="label">${l}</div><div class="value" style="font-size:20px">${v}</div></div>`).join("")}
      </div><p class="muted small">Official measurements from the NBA Draft Combine (stats.nba.com). He attended and returned to school. Matched by name.</p></section>` : ""}
    ${career.length ? `<section class="report-section"><h2>College career</h2><div class="table-wrap"><table class="data"><thead><tr><th class="left">Season</th><th class="left">Team</th><th class="left">Class</th><th>G</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>TS%</th><th>USG</th><th>BPM</th></tr></thead>
      <tbody>${career.map((r) => `<tr><td class="left">${esc(r.SEASON)}</td><td class="left"><a href="#/college/team/${esc(r.TEAM_ID)}?season=${esc(r.SEASON)}">${esc(r.TEAM_NAME)}</a></td><td class="left">${esc(r.CLASS || "")}</td>
        <td>${r.GP}</td><td>${num(r.MIN)}</td><td>${num(r.PTS)}</td><td>${num(r.REB)}</td><td>${num(r.AST)}</td><td>${pct(r.TS)}</td><td>${pct(r.USG)}</td><td>${num(r.BPM)}</td></tr>`).join("")}</tbody></table></div></section>` : ""}
    <p class="muted small">Stats: ${TORVIK_CREDIT}. Model numbers are The Rudy Report's estimates; see <a href="#/draft">the method</a>.</p>`;
}
