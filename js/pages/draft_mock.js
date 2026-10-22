// draft_mock.js - 2027 Mock Draft simulator (#/draft/mock). A scenario tool, every pick a MODEL ESTIMATE:
//   * Draft order: projected standings (Playoff Odds season simulation), one simulated 3-2-1 lottery (the NBA side's
//     js/lottery.js + js/sim.js, imported read-only), last season's real records, or the user's own order.
//   * Players: the Rudy Report Model Board (college stats only, data/draft/board.json). No scouting, no outside rankings.
//   * Team needs: the team's NBA.com team-stat ranks (last complete season) in ten areas; a pick's "fit" is how well the
//     prospect's D-I percentiles in those areas cover the team's weakest ranks. Score = board value + need weight × fit.
//   * The user can override any pick or swap teams; later picks re-fill automatically.
import { esc } from "../ui.js";
import { load, completeSeasons } from "../data.js";
import { seasonInputs } from "./tools.js";
import { simulate, rng } from "../sim.js";
import { draw, entriesFrom } from "../lottery.js";
import { draftNav, getJSON } from "./draft_nav.js";

const BADGE = `<span class="model-badge">Model estimate</span>`;
const num = (v, d = 1) => v == null ? "–" : Number(v).toFixed(d);
const chance = (p) => p == null ? "–" : p >= 0.995 ? ">99%" : p < 0.01 ? "<1%" : Math.round(p * 100) + "%";
// Need areas: [label, NBA.com team stat, higher-is-better?, prospect percentile keys (D-I, 100 = best)]
export const NEEDS = [
  ["3-point shooting", "FG3_PCT", true, ["FG3_PCT", "FT_PCT", "FG3A_100"]],
  ["Playmaking", "AST_PCT", true, ["AST_PCT"]],
  ["Ball security", "TM_TOV_PCT", false, ["TOV_PCT"]],
  ["Rim protection", "BLK", true, ["BLK_PCT"]],
  ["Steals / ball pressure", "STL", true, ["STL_PCT"]],
  ["Team defense", "DEF_RATING", false, ["DBPM"]],
  ["Defensive rebounding", "DREB_PCT", true, ["DRB_PCT"]],
  ["Offensive rebounding", "OREB_PCT", true, ["ORB_PCT"]],
  ["Half-court offense", "OFF_RATING", true, ["OBPM"]],
  ["Scoring efficiency", "TS_PCT", true, ["TS"]],
];
const SHORT = { FG3_PCT: "3PT%", AST_PCT: "Playmaking", TM_TOV_PCT: "Turnovers", BLK: "Rim prot.", STL: "Steals", DEF_RATING: "Defense",
  DREB_PCT: "Def. reb.", OREB_PCT: "Off. reb.", OFF_RATING: "Offense", TS_PCT: "Efficiency" };
const logit = (p) => { const q = Math.min(0.99, Math.max(0.01, p)); return Math.log(q / (1 - q)); };

// Rank 1-30 for each need stat; weight = how far into the bottom half the team ranks (rank 30 -> 1, rank <= 15 -> 0).
export function teamNeeds(teams) {
  const out = new Map();
  for (const t of teams) out.set(t.TEAM_ID, { abbr: t.TEAM_ABBREVIATION, name: t.TEAM_NAME, needs: [] });
  NEEDS.forEach(([label, stat, hib], k) => {
    const sorted = [...teams].sort((a, b) => hib ? b[stat] - a[stat] : a[stat] - b[stat]);
    sorted.forEach((t, i) => out.get(t.TEAM_ID).needs[k] = { label, stat, rank: i + 1, value: t[stat], w: Math.max(0, (i + 1 - 15.5) / 14.5) });
  });
  return out;
}
export function fitScore(p, needs) {
  let s = 0, wsum = 0;
  NEEDS.forEach(([, , , keys], k) => {
    const w = needs[k].w; if (!w) return;
    const vals = keys.map((x) => p.pct?.[x]).filter((v) => v != null);
    if (!vals.length) return;
    s += w * (vals.reduce((a, b) => a + b, 0) / vals.length / 100 - 0.5); wsum += w;
  });
  return wsum ? s / wsum : 0;          // -0.5 .. +0.5
}

// overrides: { TEAM_ID: prospect pid }. Keyed by team, so a user's pick follows the team through swaps, re-rolled lotteries and order changes.
const state = { source: "projected", order: null, overrides: {}, needW: 1, seed: 1 };

export async function draftMockPage(app) {
  let b;
  try { b = await getJSON("data/draft/board.json"); } catch { app.innerHTML = `${draftNav("mock")}<h1>Mock draft</h1><p class="muted">No Model Board yet.</p>`; return; }
  const ranksSeason = completeSeasons()[0];
  const [teams, inp] = await Promise.all([load("teams", ranksSeason), seasonInputs()]);
  const needs = teamNeeds(teams);
  const teamById = new Map(teams.map((t) => [t.TEAM_ID, t]));
  const P = b.prospects;

  // ---- draft orders (arrays of 30 TEAM_IDs, pick 1 first)
  const lastSeasonOrder = () => [...teams].sort((a, c) => a.W_PCT - c.W_PCT || a.PLUS_MINUS - c.PLUS_MINUS).map((t) => t.TEAM_ID);
  let projCache = null;
  const projectedOrder = () => {
    if (inp.missing) return lastSeasonOrder();
    if (!projCache) projCache = simulate(inp.prep, { n: 2000, seed: 2027 }).sort((a, c) => a.projW - c.projW).map((r) => ({ id: r.id, w: r.projW }));
    return projCache.map((x) => x.id);
  };
  const lotteryOrder = (seed) => {
    if (inp.missing) return lastSeasonOrder();
    const R = rng(seed * 7919 + 1); let ids;
    simulate(inp.prep, { n: 1, seed: (R() * 2 ** 31) | 0, onSeason: ({ wins, seeds, playIn }) => {
      const entries = entriesFrom(wins, seeds, playIn, R), order = draw(entries, R), inLot = new Set(order);
      const rest = [...Array(inp.prep.teams.length).keys()].filter((i) => !inLot.has(i)).sort((x, y) => wins[x] - wins[y] || R() - 0.5);
      ids = [...order, ...rest].map((i) => inp.prep.teams[i].id);
    } });
    return ids;
  };
  const setSource = (src) => {
    state.source = src;
    state.order = src === "lottery" ? lotteryOrder(state.seed) : src === "last" ? lastSeasonOrder() : projectedOrder();
  };
  if (!state.order) setSource(state.source);

  // ---- fill the draft: overrides first, otherwise best score for that team among players still available
  const run = () => {
    const taken = new Set(), picks = [];
    state.order.forEach((tid, k) => {
      const nd = needs.get(tid)?.needs || [];
      const score = (p) => logit(p.p_first) + state.needW * 2 * fitScore(p, nd);
      let pid = state.overrides[tid];
      if (pid && taken.has(pid)) { delete state.overrides[tid]; pid = null; }   // an earlier pick already took him
      const avail = P.filter((p) => !taken.has(p.pid)).map((p) => ({ p, s: score(p), fit: fitScore(p, nd) })).sort((a, c) => c.s - a.s);
      const choice = pid ? avail.find((x) => x.p.pid === pid) : avail[0];
      taken.add(choice.p.pid);
      picks.push({ pick: k + 1, tid, choice, avail: avail.slice(0, 30), manual: !!pid, top: nd.filter((n) => n.w > 0).sort((a, c) => c.w - a.w).slice(0, 3) });
    });
    return picks;
  };

  const draw_ = () => {
    const picks = run();
    const teamOpts = (tid) => state.order.map((id) => `<option value="${id}" ${id === tid ? "selected" : ""}>${esc(teamById.get(id)?.TEAM_ABBREVIATION || id)}</option>`).join("");
    app.querySelector("#mk-out").innerHTML = `<div class="table-wrap" style="max-height:none"><table class="data mock"><thead><tr>
      <th>Pick</th><th class="left" title="Change to swap two teams' picks">Team</th><th class="left" title="Bottom-half NBA.com team-stat ranks, ${esc(ranksSeason)}">Biggest needs (rank)</th>
      <th class="left">Pick ${BADGE}</th><th>Board #</th><th title="How well his D-I percentiles cover the team's weakest areas (-50 to +50)">Fit</th><th>1st-round chance</th><th class="left">College line</th></tr></thead>
      <tbody>${picks.map((x) => { const p = x.choice.p; return `<tr class="${x.manual ? "me" : ""}">
        <td><b>${x.pick}</b></td>
        <td class="left"><select class="mk-team" data-k="${x.pick - 1}" aria-label="Team at pick ${x.pick}">${teamOpts(x.tid)}</select></td>
        <td class="left small">${x.top.length ? x.top.map((n) => `<span title="${esc(n.label)}: NBA.com ${esc(n.stat)} = ${num(n.value, n.value < 2 ? 3 : 1)}, #${n.rank} of 30">${esc(SHORT[n.stat])} <span class="muted">#${n.rank}</span></span>`).join(" · ") : `<span class="muted">No bottom-half area</span>`}</td>
        <td class="left"><select class="mk-pick" data-tid="${x.tid}" aria-label="Player at pick ${x.pick}">
          <option value="">${x.manual ? "↺ Back to auto" : "Auto"}: ${esc(x.avail[0].p.player)}</option>
          ${x.avail.map((a) => `<option value="${a.p.pid}" ${x.manual && a.p.pid === p.pid ? "selected" : ""}>${esc(a.p.player)} (#${a.p.rank}, fit ${a.fit >= 0 ? "+" : ""}${Math.round(a.fit * 100)})</option>`).join("")}
          ${x.manual && !x.avail.some((a) => a.p.pid === p.pid) ? `<option value="${p.pid}" selected>${esc(p.player)}</option>` : ""}</select>
          <div class="small"><a href="#/draft/${p.pid}">${esc(p.player)}</a> · ${esc(p.team)} · ${esc(p.class_now || "")} · ${esc(p.ht || "")}${x.manual ? ` · <b>your pick</b>` : ""}</div></td>
        <td>${p.rank}</td><td>${x.choice.fit >= 0 ? "+" : ""}${Math.round(x.choice.fit * 100)}</td><td>${chance(p.p_first)}</td>
        <td class="left small">${num(p.pts)} / ${num(p.reb)} / ${num(p.ast)} · BPM ${num(p.bpm)} · TS ${p.ts == null ? "–" : (p.ts * 100).toFixed(1)}%</td></tr>`; }).join("")}</tbody></table></div>`;
    app.querySelectorAll(".mk-pick").forEach((s) => s.addEventListener("change", () => {
      const tid = +s.dataset.tid;
      if (s.value) state.overrides[tid] = +s.value; else delete state.overrides[tid];
      draw_();
    }));
    app.querySelectorAll(".mk-team").forEach((s) => s.addEventListener("change", () => {
      const k = +s.dataset.k, other = state.order.indexOf(+s.value);
      [state.order[k], state.order[other]] = [state.order[other], state.order[k]];
      state.source = "custom"; app.querySelector("#mk-src").value = "custom"; draw_();
    }));
    app.querySelector("#mk-n").textContent = Object.keys(state.overrides).length;
  };

  app.innerHTML = `${draftNav("mock")}
    <div class="page-head"><div><h1>2027 Mock Draft simulator ${BADGE}</h1>
      <p class="sub">Pick a draft order (or roll a lottery), choose how much team needs matter, and the first round fills itself from the Rudy Report Model Board. Override any pick or swap any two teams and the rest re-fills.</p></div></div>
    <div class="callout"><p>ℹ A scenario tool, not a prediction. Players come only from our college-stats Model Board: no scouting, no outside rankings, and incoming freshmen and international players aren't included, so real drafts will look different.</p></div>
    <div class="card toolbar sim-controls">
      <label>Draft order <select id="mk-src">
        <option value="projected" ${state.source === "projected" ? "selected" : ""}>Projected ${esc(inp.season || "")} standings, no lottery luck</option>
        <option value="lottery" ${state.source === "lottery" ? "selected" : ""}>One simulated 3-2-1 lottery</option>
        <option value="last" ${state.source === "last" ? "selected" : ""}>${esc(ranksSeason)} records, worst first (real)</option>
        <option value="custom" ${state.source === "custom" ? "selected" : ""}>My own order (swap teams in the table)</option></select></label>
      <button class="btn" id="mk-roll">🎱 Roll the lottery</button>
      <label>Team needs weight <input type="range" id="mk-w" min="0" max="3" step="0.25" value="${state.needW}"> <b id="mk-wv">${state.needW}</b></label>
      <button class="btn" id="mk-reset">Clear my picks (<span id="mk-n">0</span>)</button>
    </div>
    <div id="mk-out"></div>
    <div class="card method"><h3>How picks are filled ${BADGE}</h3>
      <p class="small"><b>Board value</b> = the Model Board's first-round chance on a log-odds scale (college stats, age and height; <a href="#/draft">method</a>).
        <b>Team needs</b> = each team's NBA.com rank (1-30) in ${esc(ranksSeason)} in ten areas: ${NEEDS.map(([l, s]) => `${esc(l)} (${esc(s)})`).join(", ")}.
        A bottom-half rank becomes a need, weighted from 0 (15th) to 1 (30th). <b>Fit</b> = how far above or below the D-I median the prospect's matching percentiles are, averaged with those weights (−50 to +50).
        Each pick takes the available player with the highest <i>board value + weight × 2 × fit</i>. Weight 0 = pure best available. Your own picks stay with the team (through swaps, re-rolled lotteries and order changes) unless an earlier pick takes that player.</p>
      <p class="small muted">Order options: “projected” sorts teams by average wins in 2,000 simulated seasons from the Playoff Odds model; “lottery” is one simulated season plus one drawing under the NBA's 3-2-1 rules (the same code as <a href="#/tools/lottery">Draft lottery</a>);
        picks 17-30 follow record. Traded picks, pick protections and the 2nd round aren't modeled. Team stats: NBA.com; college stats: Bart Torvik.</p></div>`;
  app.querySelector("#mk-src").addEventListener("change", (e) => { if (e.target.value !== "custom") setSource(e.target.value); else state.source = "custom"; draw_(); });
  app.querySelector("#mk-roll").addEventListener("click", () => { state.seed++; setSource("lottery"); app.querySelector("#mk-src").value = "lottery"; draw_(); });
  app.querySelector("#mk-w").addEventListener("input", (e) => { state.needW = +e.target.value; app.querySelector("#mk-wv").textContent = state.needW; draw_(); });
  app.querySelector("#mk-reset").addEventListener("click", () => { state.overrides = {}; draw_(); });
  draw_();
}
