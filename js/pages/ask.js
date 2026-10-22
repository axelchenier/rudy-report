// ask.js - the home page: a big "Ask a question" search bar (StatMuse-style).
// Flow: question -> parser.js (rules) -> intent -> engine.js -> headline + tables.
import { load, loadAllSeasons, loadPlayerIndex, currentSeason, SEASONS, META, completeSeasons } from "../data.js";
import { STATS } from "../stats.js";
import { esc, renderTable } from "../ui.js";
import { buildNameIndex } from "../ask/names.js";
import { parseQuestion } from "../ask/parser.js";
import { answer } from "../ask/engine.js";
import { AI_ENABLED, askAI } from "../ask/ai.js";
import { collegeAnswer } from "../ask/college.js";
import { playoffAnswer } from "../ask/playoffs.js";

// Clickable example questions (the first five are Axel's own test questions).
const EXAMPLES = [
  "Who leads the league in box plus minus?",
  "Who has the highest average points on opening days?",
  "What team has had the best home court advantage in the past 5 years?",
  "Will Anthony Edwards and LaMelo Ball be a good pairing?",
  "Who leads the league in points in the past 10 years?",
  "Which teams take the most threes per 100 possessions?",
  "Top 10 players in true shooting with at least 50 games",
  "Players averaging 25 points and 5 assists",
  "Compare Anthony Edwards and Shai Gilgeous-Alexander",
  "Timberwolves net rating",
  "Best defensive rating among teams in 2023-24",
  "Best offense in college basketball",
  "Top college scorers",
  "Top 2027 draft prospects",
  "Who won the 2016 Finals?",
  "Hit rate for picks 11-20",
  "Who was drafted 5th in 2019?",
  "Duke vs UNC prediction",
  "Most triple doubles in the past 5 years",
];

let nameIndex = null;           // built once: every player and team name we know
async function getIndex() {
  if (!nameIndex) nameIndex = buildNameIndex((await loadPlayerIndex()).map((r) => ({ PLAYER_ID: r.PLAYER_ID, PLAYER_NAME: r.PLAYER_NAME, MIN: r.MINUTES, GP: 1 })), await load("teams", completeSeasons()[0]));
  return nameIndex;
}

export async function askPage(app, query = "") {
  const q = new URLSearchParams(query).get("q") || "";
  app.innerHTML = `
    <section class="ask-hero">
      <h1>Ask the <span>numbers</span>.</h1>
      <p class="sub">Real NBA stats from ${SEASONS()[SEASONS().length - 1]} to ${SEASONS()[0]}. Type a question in plain English.</p>
      <form class="ask-form" id="ask-form" role="search">
        <input id="ask-input" type="search" autocomplete="off" placeholder="e.g. Who leads the league in assists?" value="${esc(q)}" aria-label="Ask a question">
        <button class="btn primary" type="submit">Ask</button>
      </form>
      <div class="chips">${EXAMPLES.map((e) => `<button class="chip" data-q="${esc(e)}">${esc(e)}</button>`).join("")}</div>
    </section>
    <section id="answer" class="answer" aria-live="polite"></section>
    ${builderHTML()}
    <details class="panel card" id="sql-panel"><summary>SQL mode (for power users)</summary>
      <p class="muted small">Runs real SQL in your browser with DuckDB. Tables: <code>players</code> (per game + advanced),
        <code>player_totals</code>, <code>teams</code>, <code>bbref</code> (Basketball-Reference BPM only: SEASON, PLAYER_ID, PLAYER_NAME, TEAM, BPM) — every loaded season, with a <code>SEASON</code> column.
        The first run downloads DuckDB (~10 MB).</p>
      <textarea class="sql" id="sql">SELECT PLAYER_NAME, TEAM_ABBREVIATION, GP, PTS, AST, TS_PCT
FROM players
WHERE SEASON = '${currentSeason()}' AND GP >= 50
ORDER BY PTS DESC
LIMIT 10;</textarea>
      <p><button class="btn primary" id="run-sql">Run SQL</button></p>
      <div id="sql-out"></div>
    </details>`;

  const go = (text) => { location.hash = `#/ask?q=${encodeURIComponent(text)}`; };
  app.querySelector("#ask-form").addEventListener("submit", (e) => { e.preventDefault(); const t = app.querySelector("#ask-input").value.trim(); if (t) go(t); });
  app.querySelectorAll(".chip").forEach((c) => c.addEventListener("click", () => go(c.dataset.q)));
  wireBuilder(app);
  wireSQL(app);
  if (q) await showAnswer(app.querySelector("#answer"), q);
  else app.querySelector("#ask-input").focus();
}

// PER, Win Shares and VORP are Basketball-Reference stats. We only use BBRef's (credited) BPM column, so these questions
// are answered with NBA.com's PIE (Player Impact Estimate) instead, and the answer says so.
const BBREF_ONLY = /player efficiency rating|\bPER\b|win[ -]?shares?|\bws\/48\b|\bvorp\b|value over replacement( player)?/gi;
const BBREF_ONLY_CASE = (m) => m === "per" || m === "Per" ? null : m;      // "per game" is not PER

async function showAnswer(box, question) {
  box.innerHTML = `<p class="muted">Thinking…</p>`;
  let swapNote = "";
  const hits = (question.match(BBREF_ONLY) || []).filter(BBREF_ONLY_CASE);
  if (hits.length) {
    question = question.replace(BBREF_ONLY, (m) => BBREF_ONLY_CASE(m) ? "PIE" : m);
    swapNote = `<p class="callout">${esc(hits[0])} is a Basketball-Reference stat that The Rudy Report doesn't carry (we only use their credited BPM column).
      Here is NBA.com's <b>PIE</b> (Player Impact Estimate) instead, or try <a href="#/ask?q=${encodeURIComponent(question.replace(/PIE/g, "BPM"))}">the same question with BPM</a>.</p>`;
  }
  // "past N years" / "all time" use COMPLETE seasons only; the in-progress season is used for "this season".
  const ctx = { index: await getIndex(), seasons: completeSeasons(), current: META.current_season, season: currentSeason() };
  let intent = parseQuestion(question, ctx);
  // College questions ("college", "NCAA", a college team or player) are answered from the College data; NBA stays the default.
  // NBA playoff / championship questions ("who won the 2016 finals", "how many titles do the Spurs have").
  const college = await playoffAnswer(question).catch((e) => { console.warn(e); return null; })
    || await collegeAnswer(question, intent).catch((e) => { console.warn(e); return null; });
  if (college) {
    const r = college.result;
    box.innerHTML = `<p class="headline">${r.headline}</p>
      <div class="interpreted">${college.tags.map((t) => `<span class="tag">${t}</span>`).join("")}</div>${r.html || ""}
      ${r.tables.map((t, i) => `<div id="ans-table-${i}"></div>`).join("")}
      <ul class="muted small">${r.notes.map((n) => `<li>${n}</li>`).join("")}</ul>
      <p class="muted small">Source: ${r.sources.map(esc).join(" · ")}. ${r.footer || ""}</p>`;
    r.tables.forEach((t, i) => renderTable(box.querySelector(`#ans-table-${i}`), { pageSize: 25, ...t }));
    return;
  }
  if (intent.type === "unknown" && AI_ENABLED) {
    try { intent = { ...intent, ...(await askAI(question, Object.keys(STATS))).intent }; } catch (e) { console.warn(e); }
  }
  const result = intent.type === "unknown" ? null : await answer(intent);
  if (!result) {
    box.innerHTML = `<div class="card"><p class="headline">${intent.reason ? esc(intent.reason) : "I couldn't understand that one yet."}</p>
      <p class="muted">This site answers questions with simple rules (no paid AI), so it knows patterns like:</p>
      <ul class="muted"><li>“Who leads the league in <i>stat</i>?” / “Top 10 teams by <i>stat</i> in 2023-24”</li>
        <li>“Players averaging 25 points and 5 assists” / “… with at least 50 games”</li>
        <li>“Compare <i>player</i> and <i>player</i>” / “<i>Team</i> net rating”</li>
        <li>“Best home court advantage in the past 5 years” / “highest points on opening day”</li>
        <li>“Will <i>player</i> and <i>player</i> be a good pairing?”</li></ul>
      <p class="muted">Try an example above, or use the question builder below.</p></div>`;
    document.querySelector("#builder")?.setAttribute("open", "");
    return;
  }
  const tags = interpretTags(intent);
  box.innerHTML = `${swapNote}
    <p class="headline">${result.headline}</p>
    <div class="interpreted">${tags.map((t) => `<span class="tag">${t}</span>`).join("")}</div>
    ${result.html || ""}
    ${result.tables.map((t, i) => `${t.title ? `<h3 style="margin-top:14px">${esc(t.title)}</h3>` : ""}<div id="ans-table-${i}"></div>`).join("")}
    <ul class="muted small">${result.notes.map((n) => `<li>${n}</li>`).join("")}</ul>
    <p class="muted small">Source: ${result.sources.map(esc).join(" · ")}. ${esc(META.season_type)}. Data pulled ${esc(META.extras?.pulled_at_utc || META.pulled_at_utc)}.</p>`;
  result.tables.forEach((t, i) => renderTable(box.querySelector(`#ans-table-${i}`), { pageSize: 25, ...t }));
}

// Little grey tags showing HOW the question was understood (so people can trust / fix it).
function interpretTags(intent) {
  const t = [];
  const types = { leaders: "Leaderboard", lookup: "Lookup", compare: "Comparison", home: "Home vs road", opening: "Opening day", fit: "Fit report" };
  t.push(types[intent.type]);
  if (intent.entity) t.push(intent.entity === "players" ? "Players" : "Teams");
  if (intent.stat) t.push(`Stat: ${STATS[intent.stat].name}`);
  for (const f of intent.filters || []) t.push(`${STATS[f.stat].label} ${f.op === "<=" ? "≤" : "≥"} ${STATS[f.stat].fmt === "pct" ? (f.value * 100).toFixed(1) + "%" : f.value}`);
  if (intent.minGP) t.push(`Min ${intent.minGP} games`);
  if (intent.team) t.push(`Team: ${intent.team.name}`);
  t.push(`Seasons: ${intent.seasons.length === 1 ? intent.seasons[0] : `${intent.seasons[intent.seasons.length - 1]}–${intent.seasons[0]}`}`);
  return t.map(esc);
}

// ---------------- Question builder (works without typing a sentence) ----------------
function builderHTML() {
  const opts = (keys) => keys.map((k) => `<option value="${k}">${esc(STATS[k].name)}</option>`).join("");
  const statKeys = Object.keys(STATS).filter((k) => STATS[k].words?.length);
  return `<details class="panel card" id="builder"><summary>Question builder</summary>
    <div class="builder" style="margin-top:8px">Show top
      <input type="number" id="b-n" value="10" min="1" max="100" style="width:64px">
      <select id="b-entity"><option value="players">players</option><option value="teams">teams</option></select> by
      <select id="b-stat">${opts(statKeys)}</select>
      <select id="b-order"><option value="desc">highest first</option><option value="asc">lowest first</option></select>
      in <select id="b-season">${SEASONS().map((s) => `<option ${s === currentSeason() ? "selected" : ""}>${s}</option>`).join("")}</select>
      where <select id="b-fstat"><option value="">(no filter)</option>${opts(statKeys)}</select>
      <select id="b-op"><option value=">=">≥</option><option value="<=">≤</option></select>
      <input type="number" id="b-val" step="any" style="width:80px" placeholder="value">
      <button class="btn primary" id="b-go">Show</button>
    </div><p class="muted small">For percentages type the percent (e.g. 40 for 40%).</p></details>`;
}
function wireBuilder(app) {
  app.querySelector("#b-go").addEventListener("click", async () => {
    const $ = (id) => app.querySelector(id).value;
    const fstat = $("#b-fstat"), raw = parseFloat($("#b-val"));
    const filters = fstat && !Number.isNaN(raw) ? [{ stat: fstat, op: $("#b-op"), value: STATS[fstat].fmt === "pct" ? raw / 100 : raw }] : [];
    const intent = { type: "leaders", entity: $("#b-entity"), stat: $("#b-stat"), order: $("#b-order"), limit: +$("#b-n") || 10,
      filters, seasons: [$("#b-season")], minGP: filters.some((f) => f.stat === "GP") ? filters.find((f) => f.stat === "GP").value : undefined };
    const box = app.querySelector("#answer");
    const result = await answer(intent);
    box.innerHTML = `<p class="headline">${result.headline}</p><div class="interpreted">${interpretTags(intent).map((t) => `<span class="tag">${t}</span>`).join("")}</div>
      ${result.tables.map((t, i) => `<div id="ans-table-${i}"></div>`).join("")}<ul class="muted small">${result.notes.map((n) => `<li>${n}</li>`).join("")}</ul>`;
    result.tables.forEach((t, i) => renderTable(box.querySelector(`#ans-table-${i}`), { pageSize: 25, ...t }));
    box.scrollIntoView({ behavior: "smooth" });
  });
}

// ---------------- SQL mode ----------------
function wireSQL(app) {
  app.querySelector("#run-sql").addEventListener("click", async () => {
    const out = app.querySelector("#sql-out");
    out.innerHTML = `<p class="muted">Loading DuckDB and running…</p>`;
    try {
      const { runSQL } = await import("../ask/sql.js");
      const rows = await runSQL(app.querySelector("#sql").value);
      const cols = Object.keys(rows[0] || {}).map((key) => ({ key, left: typeof rows[0][key] === "string",
        html: (r) => typeof r[key] === "number" && !Number.isInteger(r[key]) ? r[key].toFixed(3) : esc(r[key]) }));
      renderTable(out, { rows, columns: cols, entity: "players", rank: false, pageSize: 50 });
    } catch (err) {
      out.innerHTML = `<p style="color:var(--bad)">${esc(err.message)}</p>`;
    }
  });
}
