// draft_translation.js - College → NBA (#/draft/translation?x=C_PTS&y=R_PPG).
// How drafted D-I players' final college seasons (Bart Torvik) related to what they did in the NBA (NBA.com regular-season stats).
// Correlations and medians are plain descriptive statistics of real players. The fitted lines and the "beyond draft slot"
// column are fits made here, labeled Model estimate. Data: data/draft/translation.json from pipeline/college_nba.py.
import { esc } from "../ui.js";
import { TORVIK_CREDIT } from "../college/cdata.js";
import { draftNav, getJSON, tierTag, nbaLink, NBA_CREDIT } from "./draft_nav.js";

const BADGE = `<span class="model-badge">Model estimate</span>`;
const f1 = (v) => v == null ? "–" : Number(v).toFixed(1);
const fp = (v) => v == null ? "–" : (v * 100).toFixed(1) + "%";
const f3 = (v) => v == null ? "–" : Number(v).toFixed(3);
const fi = (v) => v == null ? "–" : Math.round(v).toLocaleString();
// College inputs (final D-I season before the draft). `ok` = sample rule for noisy stats.
export const CX = {
  C_PTS: ["College points/game", f1], C_REB: ["College rebounds/game", f1], C_AST: ["College assists/game", f1], C_STL: ["College steals/game", f1],
  C_BLK: ["College blocks/game", f1], C_TS: ["College true shooting %", fp], C_USG: ["College usage rate", fp], C_BPM: ["College Box Plus/Minus (Torvik)", f1],
  C_OBPM: ["College offensive BPM", f1], C_DBPM: ["College defensive BPM", f1], C_ORTG: ["College offensive rating", f1], C_AST_PCT: ["College assist rate", fp],
  C_TOV_PCT: ["College turnover rate", fp], C_ORB_PCT: ["College off. rebound rate", fp], C_DRB_PCT: ["College def. rebound rate", fp],
  C_STL_PCT: ["College steal rate", fp], C_BLK_PCT: ["College block rate", fp], C_FG3_PCT: ["College 3-point % (3+ 3PA/100)", fp, (r) => r.C_FG3A_100 >= 3],
  C_FG3A_100: ["College 3PA per 100 poss.", f1], C_FT_PCT: ["College free-throw %", fp], C_FTR: ["College free-throw rate", fp],
  C_AGE: ["Age in final college season", f1], C_HT_IN: ["Height (inches)", f1], C_MIN_PCT: ["Share of team minutes", fp], PICK: ["Draft pick (1-60)", (v) => v ?? "–"],
};
// NBA outcomes (NBA.com regular season). `ok` = minimum games so per-game numbers mean something; `mature` = needs a finished-ish career.
export const NY = {
  R_PPG: ["Rookie points/game", f1, (r) => r.R_GP >= 20], R_MPG: ["Rookie minutes/game", f1, (r) => r.R_GP >= 20], R_TS: ["Rookie true shooting %", fp, (r) => r.R_GP >= 20],
  N_MIN: ["Career NBA minutes", fi, null, true], N_GP: ["Career NBA games", fi, null, true], N_SEASONS: ["NBA seasons played", (v) => v ?? 0, null, true],
  N_MPG: ["Career minutes/game", f1, (r) => r.N_GP >= 50], N_PPG: ["Career points/game", f1, (r) => r.N_GP >= 50], N_RPG: ["Career rebounds/game", f1, (r) => r.N_GP >= 50],
  N_APG: ["Career assists/game", f1, (r) => r.N_GP >= 50], N_TS: ["Career true shooting %", fp, (r) => r.N_GP >= 50], N_FG3: ["Career NBA 3-point % (50+ 3PA)", fp, (r) => r.N_FG3 != null],
  N_BEST_PPG: ["Best season points/game (40+ games)", f1, (r) => r.N_BEST_PPG != null], N_PIE_PEAK: ["Peak PIE, NBA.com (1,000+ min season)", f3, (r) => r.N_PIE_PEAK != null],
};
const PAIRS = [["C_PTS", "R_PPG"], ["C_PTS", "N_PPG"], ["C_REB", "N_RPG"], ["C_AST", "N_APG"], ["C_TS", "R_TS"], ["C_TS", "N_TS"], ["C_FG3_PCT", "N_FG3"],
  ["C_FT_PCT", "N_FG3"], ["C_USG", "N_PPG"], ["C_BPM", "N_MIN"], ["C_AGE", "N_MIN"], ["PICK", "N_MIN"]];
const SAME_UNIT = { "C_PTS>R_PPG": 1, "C_PTS>N_PPG": 1, "C_REB>N_RPG": 1, "C_AST>N_APG": 1, "C_TS>R_TS": 1, "C_TS>N_TS": 1, "C_FG3_PCT>N_FG3": 1 };
const TIER_COLOR = { starter: "var(--good)", rotation: "var(--accent)", played: "var(--muted)", none: "var(--bad)" };

export const unpack = (t) => t.rows.map((r) => Object.fromEntries(t.cols.map((c, i) => [c, r[i]])));
const yval = (r, y) => (NY[y][3] ? (r[y] ?? 0) : r[y]);
// Pairs (x, y) for the chosen stats, following each stat's sample rule; `mature` keeps only classes with 6+ NBA seasons.
export function pairs(rows, x, y, { mature = NY[y][3], matureLast = 2020, range = null } = {}) {
  return rows.filter((r) => (!mature || r.DRAFT_YEAR <= matureLast) && (!range || (r.PICK >= range[0] && r.PICK <= range[1]))
    && r[x] != null && (!CX[x][2] || CX[x][2](r)) && (NY[y][3] || (yval(r, y) != null && (!NY[y][2] || NY[y][2](r)))))
    .map((r) => ({ r, x: r[x], y: yval(r, y) }));
}
export function fit(ps) {
  const n = ps.length; if (n < 3) return null;
  const mx = ps.reduce((s, p) => s + p.x, 0) / n, my = ps.reduce((s, p) => s + p.y, 0) / n;
  let sxy = 0, sxx = 0, syy = 0; ps.forEach((p) => { sxy += (p.x - mx) * (p.y - my); sxx += (p.x - mx) ** 2; syy += (p.y - my) ** 2; });
  if (!sxx || !syy) return null;
  const b = sxy / sxx; return { n, r: sxy / Math.sqrt(sxx * syy), b, a: my - b * mx };
}
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const rCell = (r) => r == null ? "–" : `<span class="rbar" style="--w:${Math.abs(r) * 100}%;--c:${r >= 0 ? "var(--good)" : "var(--bad)"}">${r >= 0 ? "+" : "−"}${Math.abs(r).toFixed(2)}</span>`;

function scatter(ps, x, y, fl) {
  const W = 640, H = 380, L = 56, R = 14, T = 12, B = 44;
  const xs = ps.map((p) => p.x), ys = ps.map((p) => p.y);
  let [x0, x1] = [Math.min(...xs), Math.max(...xs)], [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  if (x0 === x1) x1 = x0 + 1; if (y0 === y1) y1 = y0 + 1;
  const sx = (v) => L + (v - x0) / (x1 - x0) * (W - L - R), sy = (v) => H - B - (v - y0) / (y1 - y0) * (H - T - B);
  const ticks = (a, b2) => Array.from({ length: 5 }, (_, i) => a + (b2 - a) * i / 4);
  const fx = CX[x][1], fy = NY[y][1];
  return `<svg viewBox="0 0 ${W} ${H}" class="tr-scatter" role="img" aria-label="${esc(CX[x][0])} vs ${esc(NY[y][0])}">
    ${ticks(y0, y1).map((v) => `<line x1="${L}" x2="${W - R}" y1="${sy(v)}" y2="${sy(v)}" class="grid-line"/><text x="${L - 6}" y="${sy(v) + 4}" text-anchor="end" class="axis">${fy(v)}</text>`).join("")}
    ${ticks(x0, x1).map((v) => `<text x="${sx(v)}" y="${H - B + 16}" text-anchor="middle" class="axis">${fx(v)}</text>`).join("")}
    <text x="${(L + W - R) / 2}" y="${H - 6}" text-anchor="middle" class="axis-title">${esc(CX[x][0])}</text>
    <text transform="translate(12 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle" class="axis-title">${esc(NY[y][0])}</text>
    ${ps.map((p) => `<a href="${p.r.N_GP ? `#/player/${p.r.NBA_ID}` : `#/draft/history?year=${p.r.DRAFT_YEAR}`}"><circle cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="3.6" fill="${TIER_COLOR[p.r.TIER]}" fill-opacity=".7">
      <title>${esc(p.r.NAME)} (${p.r.DRAFT_YEAR} #${p.r.PICK}, ${esc(p.r.TEAM)}): ${fx(p.x)} → ${fy(p.y)}</title></circle></a>`).join("")}
    ${fl ? `<line x1="${sx(x0)}" y1="${sy(fl.a + fl.b * x0)}" x2="${sx(x1)}" y2="${sy(fl.a + fl.b * x1)}" class="fit-line"/>` : ""}
  </svg>`;
}

export async function draftTranslationPage(app, query = "") {
  let t;
  try { t = await getJSON("data/draft/translation.json"); }
  catch { app.innerHTML = `${draftNav("translation")}<h1>College → NBA</h1><p class="muted">Not built yet. Run <code>.venv/bin/python pipeline/college_nba.py</code>.</p>`; return; }
  const rows = unpack(t);
  const qp = new URLSearchParams(query || "");
  const st = { x: CX[qp.get("x")] ? qp.get("x") : "C_PTS", y: NY[qp.get("y")] ? qp.get("y") : "R_PPG", range: "", q: "" };
  const mature = rows.filter((r) => r.DRAFT_YEAR <= 2020);
  // Career minutes vs draft slot: fit minutes = a + b·ln(pick); what's left over is "minutes beyond what the slot usually gives".
  const slot = fit(mature.map((r) => ({ x: Math.log(r.PICK), y: r.N_MIN ?? 0 })));
  mature.forEach((r) => { r.BEYOND = (r.N_MIN ?? 0) - (slot.a + slot.b * Math.log(r.PICK)); });
  const predictors = Object.keys(CX).filter((k) => k !== "PICK").map((k) => {
    const ok = mature.filter((r) => r[k] != null && (!CX[k][2] || CX[k][2](r)));
    const a = fit(ok.map((r) => ({ x: r[k], y: r.N_MIN ?? 0 }))), b = fit(ok.map((r) => ({ x: r[k], y: r.BEYOND })));
    return { k, n: ok.length, r: a?.r, rb: b?.r };
  }).sort((p, q) => Math.abs(q.r ?? 0) - Math.abs(p.r ?? 0));
  const pairRows = PAIRS.map(([x, y]) => {
    const ps = pairs(rows, x, y), fl = fit(ps);
    const ratio = SAME_UNIT[`${x}>${y}`] ? median(ps.filter((p) => p.x > 0).map((p) => p.y / p.x)) : null;
    return { x, y, n: ps.length, r: fl?.r, ratio };
  });

  const drawPlot = () => {
    const range = st.range ? st.range.split("-").map(Number) : null;
    const ps = pairs(rows, st.x, st.y, { range }), fl = fit(ps);
    app.querySelector("#tr-plot").innerHTML = ps.length < 3 ? `<p class="muted">Not enough players for this pair.</p>` : `
      <div class="tr-stats"><span><b>${ps.length}</b> players</span><span>correlation r = <b>${fl ? fl.r.toFixed(2) : "–"}</b></span>
        ${fl ? `<span>${BADGE} best-fit line: ${esc(NY[st.y][0])} ≈ ${fl.a.toFixed(fl.a > 100 ? 0 : 3)} ${fl.b >= 0 ? "+" : "−"} ${Math.abs(fl.b).toFixed(Math.abs(fl.b) > 100 ? 0 : 3)} × ${esc(CX[st.x][0].toLowerCase())}</span>` : ""}</div>
      <div class="tr-wrap">${scatter(ps, st.x, st.y, fl)}</div>
      <p class="muted small">Dots: <span style="color:var(--good)">●</span> starter <span style="color:var(--accent)">●</span> rotation <span style="color:var(--muted)">●</span> played <span style="color:var(--bad)">●</span> no NBA games. Hover a dot for the player; click to open his NBA page.
        ${NY[st.y][3] ? "Career totals: classes 2008-2020 only (6+ NBA seasons), players who never played count as 0." : NY[st.y][2] ? `Only players meeting the minimum (${st.y.startsWith("R_") ? "20+ rookie games" : "50+ career games, or the stated attempt minimum"}).` : ""}
        The line is a straight-line fit (${BADGE}); r near 0 means the college number told you little.</p>`;
    history.replaceState(null, "", `#/draft/translation?x=${st.x}&y=${st.y}`);
  };
  const drawTable = () => {
    const q = st.q.trim().toLowerCase();
    const list = (q ? rows.filter((r) => r.NAME.toLowerCase().includes(q) || String(r.TEAM).toLowerCase().includes(q)) : [...rows].sort((a, b) => (b.N_MIN ?? 0) - (a.N_MIN ?? 0))).slice(0, 40);
    app.querySelector("#tr-table").innerHTML = `<div class="table-wrap" style="max-height:none"><table class="data"><thead><tr><th class="left">Player</th><th>Draft</th><th class="left">College season</th>
      <th>PTS</th><th>REB</th><th>AST</th><th>TS%</th><th>BPM</th><th>Rookie G</th><th>Rookie PTS</th><th>Rookie TS%</th><th>Career G</th><th>Minutes</th><th>PTS</th><th>REB</th><th>AST</th><th>TS%</th><th class="left">Outcome</th></tr></thead>
      <tbody>${list.map((r) => `<tr><td class="left"><b>${r.N_GP ? nbaLink(r.NBA_ID, esc(r.NAME), true) : esc(r.NAME)}</b></td><td><a href="#/draft/history?year=${r.DRAFT_YEAR}">${r.DRAFT_YEAR}</a> #${r.PICK}</td>
        <td class="left"><a href="#/college/player/${r.PID}">${esc(r.TEAM)}</a> <span class="muted small">${esc(r.CLASS || "")} ${esc(r.SEASON)}</span></td>
        <td>${f1(r.C_PTS)}</td><td>${f1(r.C_REB)}</td><td>${f1(r.C_AST)}</td><td>${fp(r.C_TS)}</td><td>${f1(r.C_BPM)}</td>
        <td>${r.R_GP ?? "–"}</td><td>${f1(r.R_PPG)}</td><td>${fp(r.R_TS)}</td><td>${fi(r.N_GP)}</td><td>${fi(r.N_MIN)}</td><td>${f1(r.N_PPG)}</td><td>${f1(r.N_RPG)}</td><td>${f1(r.N_APG)}</td><td>${fp(r.N_TS)}</td>
        <td class="left">${tierTag(r.TIER)}</td></tr>`).join("") || `<tr><td colspan="18" class="muted">No drafted D-I player matches.</td></tr>`}</tbody></table></div>`;
  };

  app.innerHTML = `${draftNav("translation")}
    <div class="page-head"><div><h1>College → NBA</h1>
      <p class="sub">How the final college seasons of ${rows.length} drafted Division I players (classes 2008-2026) lined up with what they did in the NBA. Real college stats (Torvik) against real NBA.com results.</p></div></div>
    <section class="report-section"><h2>Does it carry over? Stat by stat</h2>
      <div class="card"><div class="table-wrap" style="max-height:none"><table class="data"><thead><tr><th class="left">College stat</th><th class="left">NBA result</th><th>Players</th><th class="left">Correlation r</th><th title="Median of NBA ÷ college for each player">Typical NBA ÷ college</th><th></th></tr></thead>
        <tbody>${pairRows.map((p) => `<tr><td class="left">${esc(CX[p.x][0])}</td><td class="left">${esc(NY[p.y][0])}</td><td>${p.n}</td><td class="left">${rCell(p.r)}</td>
          <td>${p.ratio == null ? "–" : Math.round(p.ratio * 100) + "%"}</td><td><button class="linkish" data-x="${p.x}" data-y="${p.y}">plot</button></td></tr>`).join("")}</tbody></table></div>
        <p class="muted small">r runs from −1 to +1; ±0.1 is noise, ±0.3 is a real but loose link, ±0.6+ is strong. “Typical NBA ÷ college” is the median player's ratio (e.g. 50% = a 16-point college scorer typically scored about 8 a game as an NBA rookie). Rookie numbers need 20+ games, career per-game numbers 50+ games; career minutes use classes 2008-2020.</p></div></section>
    <section class="report-section"><h2>Explore any pair</h2>
      <div class="toolbar"><label class="small muted">College <select id="tr-x">${Object.entries(CX).map(([k, [l]]) => `<option value="${k}" ${k === st.x ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
        <label class="small muted">NBA <select id="tr-y">${Object.entries(NY).map(([k, [l]]) => `<option value="${k}" ${k === st.y ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
        <label class="small muted">Picks <select id="tr-range"><option value="">All 60</option><option>1-10</option><option>11-30</option><option>31-60</option></select></label></div>
      <div class="card" id="tr-plot"></div></section>
    <section class="report-section"><h2>Which college numbers pointed to a long NBA career?</h2>
      <p class="muted small">Classes 2008-2020 (${mature.length} players). Left: correlation with career NBA minutes. Right: correlation with minutes <i>beyond what that draft slot usually produced</i>
        (minutes minus a fitted curve of minutes on pick number, ${BADGE}), i.e. what the stat told you that NBA teams' draft order didn't already price in.</p>
      <div class="card"><div class="table-wrap" style="max-height:none"><table class="data"><thead><tr><th class="left">College stat</th><th>Players</th><th class="left">r with career minutes</th><th class="left">r with minutes beyond draft slot ${BADGE}</th></tr></thead>
        <tbody>${predictors.map((p) => `<tr><td class="left">${esc(CX[p.k][0])}</td><td>${p.n}</td><td class="left">${rCell(p.r)}</td><td class="left">${rCell(p.rb)}</td></tr>`).join("")}</tbody></table></div>
        <p class="muted small">For reference, draft pick itself: r = ${fit(mature.map((r) => ({ x: r.PICK, y: r.N_MIN ?? 0 }))).r.toFixed(2)} with career minutes (log-pick fit r = ${slot.r.toFixed(2)}). Correlation is not cause; a stat can matter only because teams already drafted on it.</p></div></section>
    <section class="report-section"><h2>Every drafted D-I player</h2>
      <div class="toolbar"><input type="search" id="tr-q" placeholder="Search player or school…"></div>
      <div id="tr-table"></div><p class="muted small">Top 40 by career NBA minutes; search to find anyone. Outcome labels: see <a href="#/draft/history">Draft classes</a>.</p></section>
    <p class="muted small">Sources: college ${TORVIK_CREDIT} (final D-I season before the draft); ${NBA_CREDIT}. No Basketball-Reference data. NBA stats through ${esc(t.nba_through)}; built ${esc(t.generated_at)}.</p>`;
  app.querySelector("#tr-x").addEventListener("change", (e) => { st.x = e.target.value; drawPlot(); });
  app.querySelector("#tr-y").addEventListener("change", (e) => { st.y = e.target.value; drawPlot(); });
  app.querySelector("#tr-range").addEventListener("change", (e) => { st.range = e.target.value; drawPlot(); });
  app.querySelector("#tr-q").addEventListener("input", (e) => { st.q = e.target.value; drawTable(); });
  app.querySelectorAll("button[data-x]").forEach((b) => b.addEventListener("click", () => {
    st.x = b.dataset.x; st.y = b.dataset.y; app.querySelector("#tr-x").value = st.x; app.querySelector("#tr-y").value = st.y; drawPlot();
    app.querySelector("#tr-plot").scrollIntoView({ behavior: "smooth", block: "center" });
  }));
  drawPlot(); drawTable();
}
