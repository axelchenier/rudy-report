// college_whatif.js - "What if" sliders on College team pages (MODEL ESTIMATE).
// Change a team's adjusted offense / defense or its (or its opponents') 3-point % and see Barthag, an estimated T-Rank,
// expected record against the same strength of schedule, and the win chance against the best other team.
// Everything starts from Bart Torvik's numbers for that season; only the slider values are hypothetical.
import { esc, modelBadge } from "../ui.js";
import { predictGame, seasonAverages } from "./college_predictor.js";

const EXP = 11.5;                                   // Torvik's Barthag exponent (reproduces his Barthag to ±0.0003)
export const barthag = (o, d) => o ** EXP / (o ** EXP + d ** EXP);
export const log5 = (a, b) => (a - a * b) / (a + b - 2 * a * b);   // chance team A (Barthag a) beats a team of Barthag b
const METHOD = "Changes one thing and holds everything else fixed. See 'How it works' below.";
const f1 = (v) => v == null ? "–" : Number(v).toFixed(1);
const sg = (v, d = 1) => (v > 0 ? "+" : v < 0 ? "−" : "±") + Math.abs(v).toFixed(d);

// Field-goal attempts per possession from Torvik's four factors: possessions = FGA − OREB + TOV + 0.475·FTA,
// with OREB ≈ ORB% × missed FGA and FG% = eFG% − ½·(3PA/FGA)·3P%.
function fgaPerPoss(efg, rate3, pct3, tov, orb, ftr) {
  const fg = efg - 0.5 * rate3 * pct3;
  return (1 - tov) / (1 - orb * (1 - fg) + 0.475 * ftr);
}

export function renderCollegeWhatIf(box, t, all, season, preseason) {
  if (t.ADJOE == null || t.ADJDE == null) { box.innerHTML = ""; return; }
  const hasShoot = t.FG3_PCT != null && t.EFG != null && t.FG3_RATE != null && t.TOVR != null && t.ORB != null && t.FTR != null;
  const hasDef = t.FG3_PCT_D != null && t.EFG_D != null && t.FG3_RATE_D != null && t.TOVR_D != null && t.ORB_D != null && t.FTR_D != null;
  const avg3 = all.filter((x) => x.FG3_PCT != null).reduce((s, x, _, a) => s + x.FG3_PCT / a.length, 0);
  const others = all.filter((x) => x.TEAM_ID !== t.TEAM_ID && x.ADJOE != null && x.ADJDE != null);
  const otherB = others.map((x) => barthag(x.ADJOE, x.ADJDE));
  const rankOf = (b) => 1 + otherB.filter((x) => x > b).length;
  const best = [...others].sort((a, b) => barthag(b.ADJOE, b.ADJDE) - barthag(a.ADJOE, a.ADJDE))[0];
  const avg = seasonAverages(all.filter((x) => x.ADJT != null && x.ADJOE != null));
  // Schedule strength: Torvik's SOS (average opponent Barthag) for played seasons; for preseason, the opponent strength
  // that reproduces Torvik's projected record.
  const games = preseason ? (t.PROJ_W ?? 0) + (t.PROJ_L ?? 0) : t.GP;
  const b0 = barthag(t.ADJOE, t.ADJDE);
  let sos = t.SOS;
  if (preseason && games) {                           // solve log5(b0, s) = projected win % for s (bisection)
    const target = Math.min(0.995, Math.max(0.005, t.PROJ_W / games));
    let lo = 0.001, hi = 0.999;
    for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (log5(b0, m) > target) lo = m; else hi = m; }
    sos = (lo + hi) / 2;
  }
  const slider = (id, label, min, max, step, value, unit = "") => `<label class="wi-slider"><span>${label}</span>
    <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}"><b id="${id}-v">${f1(value)}${unit}</b>
    <button class="btn tiny" data-reset="${id}" title="Back to the real value">real</button></label>`;
  const real = { "cw-o": t.ADJOE, "cw-d": t.ADJDE, "cw-3": hasShoot ? 100 * t.FG3_PCT : null, "cw-3d": hasDef ? 100 * t.FG3_PCT_D : null };

  box.innerHTML = `<h2>What if… ${modelBadge(METHOD)}</h2>
    <p class="muted small">Move a slider to change one of ${esc(t.TEAM_NAME)}'s ${season} numbers and see how its rating, estimated T-Rank and record would change.
      The starting values are Torvik's real numbers; the results are a model estimate.</p>
    <div class="wi-grid">
      <div class="card"><h3>Change</h3>
        ${slider("cw-o", "Adj. offense", f1(t.ADJOE - 15), f1(t.ADJOE + 15), 0.1, f1(t.ADJOE))}
        ${slider("cw-d", "Adj. defense", f1(t.ADJDE - 15), f1(t.ADJDE + 15), 0.1, f1(t.ADJDE))}
        <p class="muted small" style="margin:-4px 0 8px">Points scored / allowed per 100 possessions against an average D-I team (lower defense = better).</p>
        ${hasShoot ? slider("cw-3", "3P%", f1(100 * t.FG3_PCT - 10), f1(100 * t.FG3_PCT + 10), 0.1, f1(100 * t.FG3_PCT), "%") : ""}
        ${hasDef ? slider("cw-3d", "Opp. 3P%", f1(100 * t.FG3_PCT_D - 10), f1(100 * t.FG3_PCT_D + 10), 0.1, f1(100 * t.FG3_PCT_D), "%") : ""}
        ${hasShoot ? `<p class="small">Presets: <button class="btn tiny" id="cw-avg3">D-I average 3P% (${f1(100 * avg3)}%)</button>
          <button class="btn tiny" id="cw-plus5">+5 offense &amp; −5 defense</button> <button class="btn tiny" id="cw-reset">reset all</button></p>`
          : `<p class="muted small">${preseason ? "Preseason ratings have no shooting splits yet, so only offense and defense can change." : "No shooting splits for this team."}</p>`}
      </div>
      <div class="card"><h3>Result ${modelBadge(METHOD)}</h3><div id="cw-out"></div></div>
    </div>
    <div class="card method" style="margin-top:12px"><h3>How it works ${modelBadge(METHOD)}</h3>
      <p><b>3P% → offense:</b> 3-point attempts per possession come from Torvik's four factors (${hasShoot ? `${f1(100 * fgaPerPoss(t.EFG, t.FG3_RATE, t.FG3_PCT, t.TOVR, t.ORB, t.FTR) * t.FG3_RATE)} per 100 possessions for ${esc(t.TEAM_NAME)}` : "shot attempts per possession, 3-point rate"}).
        Each extra point of 3P% adds 3 × that ÷ 100 points per 100 possessions to adjusted offense. Opponents' 3P% changes adjusted defense the same way.
        It ignores the offensive rebounds a team would lose on fewer misses, and treats a raw shooting change as an adjusted one.</p>
      <p><b>Rating:</b> Barthag (chance to beat an average D-I team) = AdjO<sup>11.5</sup> ÷ (AdjO<sup>11.5</sup> + AdjD<sup>11.5</sup>), Torvik's formula.
        <b>Estimated T-Rank</b> = where that Barthag would sit among every other team's real Barthag (other teams don't change).</p>
      <p><b>Record:</b> ${preseason ? `the opponent strength that reproduces Torvik's projected ${f1(t.PROJ_W)}-${f1(t.PROJ_L)} record` : `${games} games against opponents as strong as Torvik's strength of schedule (average opponent Barthag ${f1(100 * sos)})`},
        each won with the log5 chance. On real 2018-19, 2024-25 and 2025-26 records this “expected wins” missed by about 2 wins per team on average, with no bias,
        so the change in expected wins is added to the real record. Win chance vs ${esc(best.TEAM_NAME)} uses the <a href="#/college/predictor">Game Predictor</a> (neutral court).</p></div>`;

  const out = box.querySelector("#cw-out");
  const val = (id) => box.querySelector(`#${id}`) ? +box.querySelector(`#${id}`).value : null;
  // Sliders hold rounded values, so changes are measured from each slider's starting position (real numbers stay exact).
  const start = Object.fromEntries(Object.keys(real).map((id) => [id, val(id)]));
  const delta = (id) => val(id) - start[id];
  function draw() {
    let o = t.ADJOE + delta("cw-o"), d = t.ADJDE + delta("cw-d");
    const notes = [];
    if (hasShoot) {
      const pp3 = fgaPerPoss(t.EFG, t.FG3_RATE, t.FG3_PCT, t.TOVR, t.ORB, t.FTR) * t.FG3_RATE;
      const dPts = 3 * pp3 * delta("cw-3");
      o += dPts; if (Math.abs(dPts) > 0.05) notes.push(`3P% ${sg(delta("cw-3"))} pts → offense ${sg(dPts)}`);
    }
    if (hasDef) {
      const pp3d = fgaPerPoss(t.EFG_D, t.FG3_RATE_D, t.FG3_PCT_D, t.TOVR_D, t.ORB_D, t.FTR_D) * t.FG3_RATE_D;
      const dPts = 3 * pp3d * delta("cw-3d");
      d += dPts; if (Math.abs(dPts) > 0.05) notes.push(`opp. 3P% ${sg(delta("cw-3d"))} pts → defense ${sg(dPts)}`);
    }
    const b1 = barthag(o, d), r0 = rankOf(b0), r1 = rankOf(b1);
    const e0 = sos != null && games ? log5(b0, sos) * games : null, e1 = sos != null && games ? log5(b1, sos) * games : null;
    const W = preseason ? t.PROJ_W : t.W, L = preseason ? t.PROJ_L : t.L;
    const dW = e0 != null ? e1 - e0 : null;
    const nW = W != null && dW != null ? Math.min(games, Math.max(0, W + dW)) : null;
    const me = { ...t, ADJOE: o, ADJDE: d }, vs0 = best.ADJT && t.ADJT ? predictGame(t, best, "n", avg).pA : null, vs1 = best.ADJT && t.ADJT ? predictGame(me, best, "n", avg).pA : null;
    const row = (label, a, b, fmtv, better = "high") => {
      const ch = b - a, good = better === "high" ? ch > 0.0001 : ch < -0.0001, bad = better === "high" ? ch < -0.0001 : ch > 0.0001;
      return `<tr><td class="left">${label}</td><td>${fmtv(a)}</td><td><b>${fmtv(b)}</b></td><td style="color:${good ? "var(--good)" : bad ? "var(--bad)" : "var(--muted)"}">${Math.abs(ch) < 0.0001 ? "–" : (ch > 0 ? "▲" : "▼")}</td></tr>`;
    };
    out.innerHTML = `<div class="table-wrap"><table class="data"><thead><tr><th class="left"></th><th>Real</th><th>What if</th><th></th></tr></thead><tbody>
      ${row("Adj. offense", t.ADJOE, o, f1)}${row("Adj. defense", t.ADJDE, d, f1, "low")}${row("Adj. efficiency margin", t.ADJOE - t.ADJDE, o - d, (v) => sg(v))}
      ${row("Barthag", b0, b1, (v) => v.toFixed(3))}${row("Estimated T-Rank", r0, r1, (v) => "#" + v, "low")}
      ${e0 != null ? row(preseason ? "Projected wins" : "Expected wins (model)", preseason ? W : e0, preseason ? nW : e1, f1) : ""}
      ${nW != null && !preseason ? `<tr><td class="left">Record</td><td>${W}-${L}</td><td><b>≈${Math.round(nW)}-${games - Math.round(nW)}</b></td><td></td></tr>` : ""}
      ${vs0 != null ? row(`Win chance vs ${esc(best.TEAM_NAME)}`, vs0, vs1, (v) => Math.round(v * 100) + "%") : ""}
      </tbody></table></div>
      <p class="small" style="margin-top:8px">${Math.abs(o - t.ADJOE) + Math.abs(d - t.ADJDE) < 0.005 ? "Move a slider to see the change."
        : `${esc(t.TEAM_NAME)} would rate about <b>#${r1}</b> instead of #${r0}${dW != null ? ` and win about <b>${Math.abs(dW).toFixed(1)} ${dW >= 0 ? "more" : "fewer"}</b> games${preseason ? " than projected" : ""} against the same schedule` : ""}.`}
        ${notes.length ? `<span class="muted">(${notes.join("; ")})</span>` : ""}</p>
      <p class="muted small">Estimated T-Rank uses Barthag order; on the real numbers it gives #${r0} (Torvik's own T-Rank: #${t.TRANK}).</p>`;
    for (const id of Object.keys(real)) { const el = box.querySelector(`#${id}-v`); if (el) el.textContent = f1(val(id)) + (id.startsWith("cw-3") ? "%" : ""); }
  }
  const set = (id, v) => { const el = box.querySelector(`#${id}`); if (el && v != null) el.value = v; };
  box.querySelectorAll("input[type=range]").forEach((el) => el.addEventListener("input", draw));
  box.querySelectorAll("[data-reset]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); set(b.dataset.reset, start[b.dataset.reset]); draw(); }));
  box.querySelector("#cw-avg3")?.addEventListener("click", () => { set("cw-3", 100 * avg3); draw(); });
  box.querySelector("#cw-plus5")?.addEventListener("click", () => { set("cw-o", start["cw-o"] + 5); set("cw-d", start["cw-d"] - 5); draw(); });
  box.querySelector("#cw-reset")?.addEventListener("click", () => { for (const [id, v] of Object.entries(start)) set(id, v); draw(); });
  draw();
}
