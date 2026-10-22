// college_predictor.js - College game predictor. A MODEL ESTIMATE from Torvik's adjusted efficiencies (AdjO, AdjD, AdjT);
// it is not a betting line and not anyone else's prediction. Method and back-test numbers are shown on the page.
import { esc } from "../ui.js";
import { collegeNav } from "./college.js";
import { loadCMeta, cload, CSEASONS, seasonInfo, TORVIK_CREDIT } from "../college/cdata.js";

// Constants fit on 2023-24 to 2025-26 D-I games (ESPN results vs end-of-season Torvik ratings):
export const HOME_EDGE = 3.0;   // points; observed home margin above the ratings: +2.9, +3.1, +2.9
export const SIGMA = 11.5;      // points; spread of real margins around the estimate (in-sample 10.6-10.8, widened for out-of-sample use)
export const TOTAL_ADJ = 2.0;   // points; the efficiency formula ran 1.7-2.8 points low on totals
const BACKTEST = "On all 5,752 home-listed 2025-26 D-I games, the favorite by this method won 75.8% (Brier score 0.164). That test uses end-of-season ratings, so it is optimistic: real pre-game accuracy is lower.";

const erf = (x) => { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; };
const cdf = (x) => 0.5 * (1 + erf(x / Math.SQRT2));

// Predict A vs B. venue: "a" (A at home), "b" (B at home) or "n" (neutral). avg = D-I averages of AdjO and AdjT for that season.
export function predictGame(A, B, venue, avg) {
  const tempo = A.ADJT * B.ADJT / avg.t;
  const h = venue === "a" ? HOME_EDGE / 2 : venue === "b" ? -HOME_EDGE / 2 : 0;
  const ptsA = A.ADJOE * B.ADJDE / avg.o * tempo / 100 + TOTAL_ADJ / 2 + h;
  const ptsB = B.ADJOE * A.ADJDE / avg.o * tempo / 100 + TOTAL_ADJ / 2 - h;
  const margin = ptsA - ptsB;
  return { tempo, ptsA, ptsB, margin, pA: cdf(margin / SIGMA), by10A: 1 - cdf((10 - margin) / SIGMA), by10B: cdf((-10 - margin) / SIGMA) };
}
export const seasonAverages = (teams) => ({ o: teams.reduce((s, t) => s + t.ADJOE, 0) / teams.length, t: teams.reduce((s, t) => s + t.ADJT, 0) / teams.length });

export async function collegePredictorPage(app, query = "") {
  await loadCMeta();
  const q = new URLSearchParams(query);
  const season = CSEASONS().includes(q.get("season")) ? q.get("season") : CSEASONS()[0];
  const teams = (await cload("teams", season)).filter((t) => t.ADJOE != null && t.ADJDE != null && t.ADJT != null).sort((a, b) => a.TEAM_NAME.localeCompare(b.TEAM_NAME));
  const byId = Object.fromEntries(teams.map((t) => [t.TEAM_ID, t]));
  const ranked = [...teams].sort((a, b) => a.TRANK - b.TRANK);
  const A = byId[q.get("a")] || ranked[0], B = byId[q.get("b")] || ranked[1];
  const venue = ["a", "b", "n"].includes(q.get("venue")) ? q.get("venue") : "n";
  const avg = seasonAverages(teams);
  const p = predictGame(A, B, venue, avg);
  const pre = seasonInfo(season).preseason;
  const opt = (sel) => teams.map((t) => `<option value="${esc(t.TEAM_ID)}" ${t === sel ? "selected" : ""}>${esc(t.TEAM_NAME)} (${t.TRANK})</option>`).join("");
  const fav = p.margin >= 0 ? A : B, dog = fav === A ? B : A, pf = fav === A ? p.pA : 1 - p.pA;
  const n1 = (v) => v == null ? "–" : Number(v).toFixed(1);
  const row = (label, a, b, better = "high", d = 1) => {
    const fa = a == null ? "–" : Number(a).toFixed(d), fb = b == null ? "–" : Number(b).toFixed(d);
    const aw = a != null && b != null && (better === "high" ? a > b : a < b), bw = a != null && b != null && a !== b && !aw;
    return `<tr><td class="left">${label}</td><td>${aw ? `<b>${fa}</b>` : fa}</td><td>${bw ? `<b>${fb}</b>` : fb}</td></tr>`;
  };
  const venueLabel = venue === "n" ? "Neutral site" : `at ${esc((venue === "a" ? A : B).TEAM_NAME)}`;

  app.innerHTML = `${collegeNav("predictor")}
    <div class="page-head"><div><h1>College Game Predictor <span class="model-badge">Model estimate</span></h1>
      <p class="sub">Pick two D-I teams and a venue. The estimate comes only from ${TORVIK_CREDIT} adjusted efficiencies; it's a model, not a fact or a betting line.</p></div>
      <label class="page-season">Ratings <select id="season">${CSEASONS().map((s) => `<option value="${s}" ${s === season ? "selected" : ""}>${s}${seasonInfo(s).preseason ? " (preseason projections)" : ""}</option>`).join("")}</select></label></div>
    ${pre ? `<div class="callout"><p>⏳ ${season} hasn't started, so these use <b>Torvik's preseason projected ratings</b>. Expect bigger misses than usual.</p></div>` : ""}
    <div class="toolbar">
      <label>Team A <select id="ta">${opt(A)}</select></label>
      <label>Team B <select id="tb">${opt(B)}</select></label>
      <div class="tabs">${[["a", "A at home"], ["n", "Neutral"], ["b", "B at home"]].map(([k, l]) => `<button data-v="${k}" class="${k === venue ? "active" : ""}">${l}</button>`).join("")}</div>
      <button class="btn" id="swap">⇄ Swap</button>
    </div>
    <div class="grid stat-cards" style="grid-template-columns:repeat(auto-fill,minmax(230px,1fr))">
      <div class="card stat-card"><div class="label">Estimated score <span class="model-badge">Model</span></div>
        <div class="value" style="font-size:22px">${esc(A.TEAM_NAME)} ${Math.round(p.ptsA)}, ${esc(B.TEAM_NAME)} ${Math.round(p.ptsB)}</div><div class="rank">${venueLabel} · ${n1(p.tempo)} possessions</div></div>
      <div class="card stat-card"><div class="label">Favorite <span class="model-badge">Model</span></div>
        <div class="value">${Math.abs(p.margin) < 0.05 ? "Even" : `${esc(fav.TEAM_NAME)} by ${Math.abs(p.margin).toFixed(1)}`}</div><div class="rank">estimated margin</div></div>
      <div class="card stat-card"><div class="label">Win probability <span class="model-badge">Model</span></div>
        <div class="value">${(pf * 100).toFixed(0)}%</div><div class="rank">${esc(fav.TEAM_NAME)} · ${esc(dog.TEAM_NAME)} ${((1 - pf) * 100).toFixed(0)}%</div></div>
      <div class="card stat-card"><div class="label">Win by 10+ <span class="model-badge">Model</span></div>
        <div class="value" style="font-size:22px">${(p.by10A * 100).toFixed(0)}% / ${(p.by10B * 100).toFixed(0)}%</div><div class="rank">${esc(A.TEAM_NAME)} / ${esc(B.TEAM_NAME)}</div></div>
    </div>
    <div class="card" style="margin-top:12px"><div style="display:flex;height:26px;border-radius:8px;overflow:hidden;font-size:12px;font-weight:600;color:#fff">
      <div style="width:${(p.pA * 100).toFixed(1)}%;background:var(--accent);display:flex;align-items:center;padding-left:8px">${esc(A.TEAM_NAME)} ${(p.pA * 100).toFixed(0)}%</div>
      <div style="flex:1;background:#5b6b8c;display:flex;align-items:center;justify-content:flex-end;padding-right:8px">${esc(B.TEAM_NAME)} ${((1 - p.pA) * 100).toFixed(0)}%</div></div></div>
    <div class="grid two-col">
      <div class="card"><h3>The inputs (Torvik, ${season})</h3><div class="table-wrap"><table class="data"><thead><tr><th class="left"></th>
        <th><a href="#/college/team/${esc(A.TEAM_ID)}?season=${season}">${esc(A.TEAM_NAME)}</a></th><th><a href="#/college/team/${esc(B.TEAM_ID)}?season=${season}">${esc(B.TEAM_NAME)}</a></th></tr></thead><tbody>
        ${row("T-Rank", A.TRANK, B.TRANK, "low", 0)}${row("Adj. offense (pts/100)", A.ADJOE, B.ADJOE)}${row("Adj. defense (pts/100 allowed)", A.ADJDE, B.ADJDE, "low")}
        ${row("Adj. efficiency margin", A.ADJEM, B.ADJEM)}${row("Adj. tempo (poss/40)", A.ADJT, B.ADJT)}
        ${A.W != null ? `<tr><td class="left">Record</td><td>${A.W}-${A.L}</td><td>${B.W}-${B.L}</td></tr>` : `<tr><td class="left">Torvik projected record</td><td>${n1(A.PROJ_W)}-${n1(A.PROJ_L)}</td><td>${n1(B.PROJ_W)}-${n1(B.PROJ_L)}</td></tr>`}
        </tbody></table></div><p class="muted small">D-I average that season: ${n1(avg.o)} points per 100 possessions, ${n1(avg.t)} possessions per 40 minutes.</p></div>
      <div class="card method"><h3>How it works <span class="model-badge">Model estimate</span></h3>
        <p>1. <b>Possessions</b> = A's tempo × B's tempo ÷ D-I average tempo.</p>
        <p>2. <b>Each team's points</b> = its adjusted offense × the opponent's adjusted defense ÷ D-I average efficiency × possessions ÷ 100, plus ${TOTAL_ADJ / 2} (the formula ran low on totals in past seasons).</p>
        <p>3. <b>Home court</b>: the home team gets +${HOME_EDGE / 2} and the visitor −${HOME_EDGE / 2} (a ${HOME_EDGE}-point swing, which is what home teams beat these ratings by in 2023-24 to 2025-26).</p>
        <p>4. <b>Win probability</b>: real margins scatter around the estimate like a bell curve with a spread (standard deviation) of ${SIGMA} points.</p>
        <p class="muted small">${BACKTEST} Ignores injuries, rest, travel and lineup changes. Ratings: ${TORVIK_CREDIT}.</p></div>
    </div>`;

  const go = (a, b, v, s = season) => { location.hash = `#/college/predictor?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}&venue=${v}&season=${s}`; };
  app.querySelector("#ta").addEventListener("change", (e) => go(e.target.value, B.TEAM_ID, venue));
  app.querySelector("#tb").addEventListener("change", (e) => go(A.TEAM_ID, e.target.value, venue));
  app.querySelector("#season").addEventListener("change", (e) => go(A.TEAM_ID, B.TEAM_ID, venue, e.target.value));
  app.querySelector("#swap").addEventListener("click", () => go(B.TEAM_ID, A.TEAM_ID, venue === "a" ? "b" : venue === "b" ? "a" : "n"));
  app.querySelectorAll("[data-v]").forEach((b) => b.addEventListener("click", () => go(A.TEAM_ID, B.TEAM_ID, b.dataset.v)));
}
