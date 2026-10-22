// college_tourney.js - College Tournament Simulator (MODEL ESTIMATE).
// Field: a real NCAA bracket (seeds/regions/results from ESPN, built by pipeline/college_bracket.py) or a model-seeded field
// (each conference's best T-Rank team + the best remaining teams, seeded 1-16 by T-Rank on an S-curve).
// Each game uses the Game Predictor's model (js/pages/college_predictor.js) on a neutral court; 20,000 simulated tournaments.
import { esc, renderTable } from "../ui.js";
import { collegeNav } from "./college.js";
import { loadCMeta, cload, CSEASONS, seasonInfo, TORVIK_CREDIT } from "../college/cdata.js";
import { predictGame, seasonAverages, SIGMA } from "./college_predictor.js";

const N_SIMS = 20000;
// Computed once (offline) on every real bracket in data/college/brackets with each season's end-of-season Torvik ratings.
const ALL_YEARS = "Across all 18 tournaments from 2008 to 2026 (1,133 games; 2020 was cancelled), the model's favorite won 75.2% (Brier score 0.168). When it gave the favorite 65-75%, favorites won 70%; at 75-85%, they won 87%.";
const ROUNDS = ["Round of 32", "Sweet 16", "Elite 8", "Final Four", "Title game", "Champion"];
const RSHORT = ["R32", "S16", "E8", "F4", "Final", "Champ"];
const BADGE = `<span class="model-badge">Model estimate</span>`;
const ORDER = [1, 16, 8, 9, 5, 12, 4, 13, 6, 11, 3, 14, 7, 10, 2, 15];
const MODEL_REGIONS = ["Region 1", "Region 4", "Region 2", "Region 3"];   // S-curve: #1 overall meets #4 overall's region in the semis
const cache = new Map();
const getJSON = (p) => { if (!cache.has(p)) cache.set(p, fetch(p).then((r) => { if (!r.ok) throw new Error(`Could not load ${p}`); return r.json(); })); return cache.get(p); };
const pct = (p) => p == null ? "–" : p >= 0.9995 ? ">99.9%" : p > 0 && p < 0.001 ? "<0.1%" : (p * 100).toFixed(1) + "%";
// Small seeded random-number generator, so the odds table is the same for everyone (and every reload).
const mulberry = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const state = { edits: {} };   // "<field key>" -> { swaps: {slot: TEAM_ID}, boost: {TEAM_ID: points} }

// Model-seeded field: best team in each conference (automatic bid), then the best remaining teams by T-Rank, to 64.
function modelField(teams) {
  const ranked = [...teams].sort((a, b) => a.TRANK - b.TRANK);
  const auto = new Map();
  for (const t of ranked) if (t.CONF && !/^ind/i.test(t.CONF) && !auto.has(t.CONF)) auto.set(t.CONF, t);
  const pick = new Set([...auto.values()].map((t) => t.TEAM_ID));
  for (const t of ranked) { if (pick.size >= 64) break; pick.add(t.TEAM_ID); }
  const field = ranked.filter((t) => pick.has(t.TEAM_ID)).slice(0, 64);
  const regions = [[], [], [], []];
  field.forEach((t, i) => { const line = Math.floor(i / 4), k = i % 4; regions[line % 2 ? 3 - k : k].push({ team_id: t.TEAM_ID, seed: line + 1, auto: auto.get(t.CONF) === t }); });
  // Region order [0, 3, 1, 2] so the semifinals are region 0 v 3 (overall #1 v #4) and 1 v 2.
  const order = [0, 3, 1, 2];
  return { regions: order.map((i) => MODEL_REGIONS[i]), teams: order.flatMap((r) => ORDER.map((s) => ({ ...regions[r][s - 1], region: MODEL_REGIONS[r] }))),
    autos: auto.size };
}

export async function collegeTourneyPage(app, query = "") {
  await loadCMeta();
  const q = new URLSearchParams(query);
  let idx = { years: [] };
  try { idx = await getJSON("data/college/brackets/index.json"); } catch { /* no real brackets saved */ }
  const mode = q.get("field") === "model" || !idx.years.length ? "model" : "real";
  const year = idx.years.includes(+q.get("year")) ? +q.get("year") : idx.years[0];
  const season = mode === "real" ? `${year - 1}-${String(year).slice(2)}` : (CSEASONS().includes(q.get("season")) ? q.get("season") : CSEASONS()[0]);
  const all = (await cload("teams", season)).filter((t) => t.ADJOE != null && t.ADJDE != null && t.ADJT != null);
  const byId = Object.fromEntries(all.map((t) => [t.TEAM_ID, t]));
  const avg = seasonAverages(all);
  const real = mode === "real" ? await getJSON(`data/college/brackets/${year}.json`) : null;
  const base = real || modelField(all);
  const fkey = mode === "real" ? `real-${year}` : `model-${season}`;
  const ed = state.edits[fkey] ||= { swaps: {}, boost: {} };
  // The 64 slots in bracket order, after any swaps the user made.
  const slots = base.teams.map((s, i) => ({ ...s, team_id: ed.swaps[i] || s.team_id, swapped: !!ed.swaps[i] }));
  const missing = slots.filter((s) => !byId[s.team_id]);
  if (missing.length) { app.innerHTML = `${collegeNav("tournament")}<p class="muted">Missing ratings for ${missing.map((m) => esc(m.team_id)).join(", ")}.</p>`; return; }
  const rated = (id) => { const t = byId[id], b = ed.boost[id] || 0; return b ? { ...t, ADJOE: t.ADJOE + b / 2, ADJDE: t.ADJDE - b / 2 } : t; };
  const T = slots.map((s) => rated(s.team_id));
  // Win-probability matrix (neutral court), computed once.
  const P = T.map((a) => T.map((b) => a === b ? 0.5 : predictGame(a, b, "n", avg).pA));
  const reach = simulate(P, N_SIMS, mulberry(20260322));
  const pre = seasonInfo(season).preseason;
  const actualWins = real ? Object.fromEntries(real.teams.map((t) => [t.team_id, t.wins])) : null;
  const rows = slots.map((s, i) => ({ i, team_id: s.team_id, TEAM_NAME: byId[s.team_id].TEAM_NAME, seed: s.seed, region: s.region, trank: byId[s.team_id].TRANK,
    adjem: T[i].ADJOE - T[i].ADJDE, swapped: s.swapped, boost: ed.boost[s.team_id] || 0, ...Object.fromEntries(reach[i].map((v, r) => [`p${r + 1}`, v / N_SIMS])),
    ew: reach[i].reduce((a, v) => a + v, 0) / N_SIMS, actual: actualWins && !s.swapped ? actualWins[s.team_id] ?? null : null }));
  const fav = [...rows].sort((a, b) => b.p6 - a.p6);
  let backtest = "";
  if (real && !Object.keys(ed.swaps).length && !Object.keys(ed.boost).length) {
    const slotOf = Object.fromEntries(slots.map((s, i) => [s.team_id, i]));
    let right = 0, brier = 0, n = 0;
    for (const g of real.results) {
      const a = slotOf[g.a], b = slotOf[g.b]; if (a == null || b == null || g.uncontested) continue;
      const p = P[a][b], aw = g.winner === g.a ? 1 : 0;
      right += (p >= 0.5) === !!aw ? 1 : 0; brier += (p - aw) ** 2; n++;
    }
    const ch = rows.find((r) => r.team_id === real.champion);
    backtest = `<p><b>Check against what happened (${year}):</b> in the ${n} real tournament games the model's favorite won ${right} (${(100 * right / n).toFixed(0)}%), Brier score ${(brier / n).toFixed(3)}.
      The champion, ${esc(ch?.TEAM_NAME || real.champion)}, had a ${pct(ch?.p6)} title chance here (rank ${fav.findIndex((r) => r.team_id === real.champion) + 1} of 64).
      These ratings are Torvik's <b>end-of-season</b> numbers, which already include the tournament games, so this look-back is optimistic.</p>`;
  }
  if (real) backtest += `<p><b>All years:</b> ${ALL_YEARS} The same end-of-season caveat applies.</p>`;

  const yearOpts = idx.years.map((y) => `<option value="real:${y}" ${mode === "real" && y === year ? "selected" : ""}>${y} NCAA bracket (actual field)</option>`).join("");
  const seasonOpts = CSEASONS().map((s) => `<option value="model:${s}" ${mode === "model" && s === season ? "selected" : ""}>Model-seeded field · ${s} ratings${seasonInfo(s).preseason ? " (preseason)" : ""}</option>`).join("");
  app.innerHTML = `${collegeNav("tournament")}
    <div class="page-head"><div><h1>Tournament Simulator ${BADGE}</h1>
      <p class="sub">${N_SIMS.toLocaleString()} simulated NCAA tournaments. Every game uses the <a href="#/college/predictor">Game Predictor</a>'s model on a neutral court, from ${TORVIK_CREDIT} ratings.</p></div>
      <label class="page-season">Field <select id="field">${yearOpts}${seasonOpts}</select></label></div>
    ${mode === "real" ? `<div class="callout"><p>The real ${year} field: seeds, regions and results from ESPN's scoreboard. ${real.first_four.length === (year >= 2011 ? 4 : 1) ? `First Four already played (${real.first_four.map((f) => `${esc(f.winner)} won the ${f.seed}-seed game`).join("; ")}).` : ""}
        Ratings: Torvik's ${season} end-of-season numbers.</p></div>`
      : `<div class="callout"><p>⚙ <b>Model-seeded field</b>, not a real bracket or anyone's projection: the best T-Rank team in each of ${base.autos} conferences gets the automatic bid, the best remaining teams fill the field to 64,
        and seeds 1-16 follow T-Rank on an S-curve (regions are numbered, not named).${pre ? ` ${season} hasn't tipped off, so these are <b>Torvik's preseason projections</b>.` : ""}</p></div>`}
    <div class="grid stat-cards" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr))">
      ${fav.slice(0, 4).map((r) => `<div class="card stat-card"><div class="label">${r.seed}-seed · ${esc(r.region)}</div>
        <div class="value" style="font-size:20px"><a href="#/college/team/${esc(r.team_id)}?season=${season}">${esc(r.TEAM_NAME)}</a></div>
        <div class="rank">${pct(r.p6)} to win it all · ${pct(r.p4)} Final Four</div></div>`).join("")}
    </div>
    <div class="toolbar" style="margin-top:12px">
      <button class="btn primary" id="sim1">🎲 Simulate one bracket</button>
      ${real ? `<button class="btn" id="actual">Show the real ${year} results</button>` : ""}
      <button class="btn" id="editbtn">✎ Edit the field / what if</button>
      ${Object.keys(ed.swaps).length || Object.keys(ed.boost).length ? `<button class="btn" id="reset">Reset edits</button>` : ""}
    </div>
    <div id="edit" class="card" hidden></div>
    <div id="one"></div>
    <h3 style="margin-top:16px">Each team's odds to reach each round ${BADGE}</h3>
    <div id="odds"></div>
    <div class="card method" style="margin-top:12px"><h3>How it works ${BADGE}</h3>
      <p>1. <b>Win chance for any pairing</b>: the Game Predictor's formula on a neutral court (adjusted offense × opponent's adjusted defense, tempo-adjusted),
        with real margins scattering around the estimate by a ${SIGMA}-point standard deviation.</p>
      <p>2. <b>Monte Carlo</b>: play the whole bracket ${N_SIMS.toLocaleString()} times, flipping a weighted coin for every game, and count how often each team reaches each round.
        A fixed random seed keeps this table the same on every visit; "Simulate one bracket" uses a fresh roll each time.</p>
      <p>3. <b>What it ignores</b>: injuries, travel and crowds (some "neutral" games aren't), hot streaks, and ratings changing during the tournament.
        Edits (swapping a team or adding points of rating) apply only in your browser.</p>
      ${backtest}
      <p class="muted small">Ratings: ${TORVIK_CREDIT}. ${real ? `Bracket: ${esc(real.source)}.` : ""}</p></div>`;

  const cols = [
    { key: "seed", label: "Seed", html: (r) => r.seed },
    { key: "TEAM_NAME", label: "Team", left: true, html: (r) => `<a href="#/college/team/${esc(r.team_id)}?season=${season}">${esc(r.TEAM_NAME)}</a>${r.swapped ? ` <span class="tag">swapped in</span>` : ""}${r.boost ? ` <span class="tag">${r.boost > 0 ? "+" : ""}${r.boost} rating</span>` : ""}` },
    { key: "region", label: "Region", left: true, html: (r) => esc(r.region) },
    { key: "trank", label: "T-Rank", html: (r) => r.trank },
    { key: "adjem", label: "AdjEM", html: (r) => (r.adjem > 0 ? "+" : "") + r.adjem.toFixed(1) },
    ...ROUNDS.map((l, k) => ({ key: `p${k + 1}`, label: RSHORT[k], title: `Chance to reach the ${l}${k === 5 ? " (win the title)" : ""}`, html: (r) => pct(r[`p${k + 1}`]) })),
    { key: "ew", label: "Exp. wins", title: "Average tournament wins", html: (r) => r.ew.toFixed(2) },
    ...(real ? [{ key: "actual", label: "Actual", title: `How far the team really went in ${year}`, left: true, html: (r) => r.actual == null ? "–" : r.actual === 6 ? "<b>Champion</b>" : r.actual === 0 ? "Lost R64" : `Lost in ${["", "R32", "S16", "E8", "F4", "Final"][r.actual]}` }] : []),
  ];
  renderTable(app.querySelector("#odds"), { rows, columns: cols, entity: "teams", sortKey: "p6", rank: false, pageSize: 64 });

  const names = slots.map((s, i) => ({ ...s, name: byId[s.team_id].TEAM_NAME }));
  app.querySelector("#sim1").addEventListener("click", () => {
    const res = simulateOne(P, Math.random);
    app.querySelector("#one").innerHTML = bracketHTML(base.regions, names, res, P, "One simulated tournament (a fresh roll each click)");
  });
  app.querySelector("#actual")?.addEventListener("click", () => {
    const slotOf = Object.fromEntries(slots.map((s, i) => [s.team_id, i]));
    const winners = new Map(real.results.map((g) => [[slotOf[g.a], slotOf[g.b]].sort((x, y) => x - y).join("-"), slotOf[g.winner]]));
    const res = playOut((a, b) => winners.get([a, b].sort((x, y) => x - y).join("-")) ?? (P[a][b] >= 0.5 ? a : b));
    app.querySelector("#one").innerHTML = bracketHTML(base.regions, names, res, P, `What really happened in ${year} (with the model's pre-game chance for each winner)`);
  });
  app.querySelector("#field").addEventListener("change", (e) => {
    const [m, v] = e.target.value.split(":");
    location.hash = m === "real" ? `#/college/tournament?year=${v}` : `#/college/tournament?field=model&season=${v}`;
  });
  app.querySelector("#reset")?.addEventListener("click", () => { delete state.edits[fkey]; collegeTourneyPage(app, query); });
  app.querySelector("#editbtn").addEventListener("click", () => {
    const box = app.querySelector("#edit");
    box.hidden = !box.hidden;
    if (box.hidden) return;
    const inField = new Set(slots.map((s) => s.team_id));
    const others = [...all].filter((t) => !inField.has(t.TEAM_ID)).sort((a, b) => a.TRANK - b.TRANK);
    box.innerHTML = `<h3>Edit the field / what if ${BADGE}</h3>
      <p class="muted small">Swap a team out (the new team takes its seed and spot), or give a team extra rating points (adjusted efficiency margin, split evenly
        between offense and defense) to ask “what if they were this much better?”. Changes stay in this browser tab.</p>
      <div class="toolbar"><label>Replace <select id="e-slot">${names.map((s, i) => `<option value="${i}">${s.seed} ${esc(s.name)} (${esc(s.region)})</option>`).join("")}</select></label>
        <label>with <select id="e-new">${others.map((t) => `<option value="${esc(t.TEAM_ID)}">${esc(t.TEAM_NAME)} (T-Rank ${t.TRANK})</option>`).join("")}</select></label>
        <button class="btn" id="e-swap">Swap</button></div>
      <div class="toolbar"><label>Team <select id="e-team">${names.map((s) => `<option value="${esc(s.team_id)}">${esc(s.name)}</option>`).join("")}</select></label>
        <label>Rating change <input type="range" id="e-pts" min="-10" max="10" step="0.5" value="0"> <b id="e-ptsv">0</b> pts/100</label>
        <button class="btn" id="e-boost">Apply and re-simulate</button></div>`;
    box.querySelector("#e-pts").addEventListener("input", (e) => { box.querySelector("#e-ptsv").textContent = (+e.target.value > 0 ? "+" : "") + e.target.value; });
    box.querySelector("#e-team").addEventListener("change", (e) => { const v = ed.boost[e.target.value] || 0; box.querySelector("#e-pts").value = v; box.querySelector("#e-ptsv").textContent = v; });
    box.querySelector("#e-swap").addEventListener("click", () => {
      const i = +box.querySelector("#e-slot").value, id = box.querySelector("#e-new").value;
      if (id === base.teams[i].team_id) delete ed.swaps[i]; else ed.swaps[i] = id;
      collegeTourneyPage(app, query);
    });
    box.querySelector("#e-boost").addEventListener("click", () => {
      const id = box.querySelector("#e-team").value, v = +box.querySelector("#e-pts").value;
      if (v) ed.boost[id] = v; else delete ed.boost[id];
      collegeTourneyPage(app, query);
    });
  });
}

// Play the 64-team bracket once. pick(a, b) returns the winner's slot. Returns rounds[r] = list of winners' slots (r = 0 is the field).
function playOut(pick) {
  const rounds = [[...Array(64).keys()]];
  for (let r = 0; r < 6; r++) {
    const prev = rounds[r], next = [];
    for (let i = 0; i < prev.length; i += 2) next.push(pick(prev[i], prev[i + 1]));
    rounds.push(next);
  }
  return rounds;
}
const simulateOne = (P, rand) => playOut((a, b) => rand() < P[a][b] ? a : b);
function simulate(P, n, rand) {
  const reach = Array.from({ length: 64 }, () => new Array(6).fill(0));
  for (let s = 0; s < n; s++) {
    const rounds = simulateOne(P, rand);
    for (let r = 1; r <= 6; r++) for (const t of rounds[r]) reach[t][r - 1]++;
  }
  return reach;
}

// Draw a played-out bracket: one block per region (Round of 64 -> Elite 8), then the Final Four and the final.
function bracketHTML(regions, names, rounds, P, title) {
  const game = (a, b, w) => {
    const line = (t) => `<div class="bk-team ${t === w ? "win" : ""}"><span class="bk-seed">${names[t].seed}</span> ${esc(names[t].name)}${t === w ? ` <span class="bk-p">${Math.round(P[t][t === a ? b : a] * 100)}%</span>` : ""}</div>`;
    const upset = names[w].seed > names[w === a ? b : a].seed;
    return `<div class="bk-game ${upset ? "upset" : ""}">${line(a)}${line(b)}</div>`;
  };
  const roundCol = (r, from, to, label) => {
    const list = rounds[r].slice(from, to), wins = rounds[r + 1];
    let html = "";
    for (let i = 0; i < list.length; i += 2) html += game(list[i], list[i + 1], wins.find((x) => x === list[i] || x === list[i + 1]));
    return `<div class="bk-col"><div class="bk-head">${label}</div><div class="bk-games">${html}</div></div>`;
  };
  const labels = ["Round of 64", "Round of 32", "Sweet 16", "Elite 8"];
  const regionBlock = (k) => `<div class="bk-region"><h4>${esc(regions[k])}</h4><div class="bk-cols">
    ${[0, 1, 2, 3].map((r) => roundCol(r, k * (16 >> r), (k + 1) * (16 >> r), labels[r])).join("")}</div></div>`;
  const champ = rounds[6][0];
  const upsets = rounds.slice(1).flatMap((w, r) => w.filter((t, i) => { const pair = rounds[r].slice(i * 2, i * 2 + 2); const o = pair.find((x) => x !== t); return names[t].seed > names[o].seed; }).map((t) => t)).length;
  return `<div class="card" style="margin-top:12px"><h3>${esc(title)} ${BADGE}</h3>
    <p><b>Champion: ${names[champ].seed}-seed ${esc(names[champ].name)}</b> · ${upsets} upsets (a worse seed winning, marked orange). The % is the model's chance for that winner before the game.</p>
    <div class="bracket-wrap">${[0, 1, 2, 3].map(regionBlock).join("")}
      <div class="bk-region"><h4>Final Four</h4><div class="bk-cols">${roundCol(4, 0, 4, "Semifinals")}${roundCol(5, 0, 2, "Championship")}</div></div></div></div>`;
}
