// college_transfer.js - College Transfer What-if (#/college/transfer?season=2025-26&pid=123&to=duke). MODEL ESTIMATE.
// Move one player from his team to another team in the same season and estimate how both teams' adjusted offense,
// adjusted defense, Barthag, T-Rank and record would change. Method (fit in pipeline/college_transfer.py on every D-I
// team-season since 2007-08): a team's AdjEM tracks the sum of its players' Torvik BPM x share of minutes almost exactly
// (r = 0.9997), so moving minutes and BPM between rosters moves AdjO/AdjD by the fitted slopes.
import { esc, modelBadge } from "../ui.js";
import { loadCMeta, cload, playedSeasons } from "../college/cdata.js";
import { collegeNav } from "./college.js";
import { barthag, log5 } from "./college_whatif.js";

const f1 = (v) => v == null ? "–" : Number(v).toFixed(1);
const sg = (v, d = 1) => (v > 0.05 ? "+" : v < -0.05 ? "−" : "±") + Math.abs(v).toFixed(d);
const pc = (v) => v == null ? "–" : Math.round(v * 100) + "%";
const B = modelBadge("Transfer what-if: a model estimate. See the assumptions below.");
const state = { mode: "asis", min: null };

// Minute-weighted bench stats (players outside the top 5 by minutes share), the "replacement" for minutes a team gives up.
function bench(roster) {
  const b = [...roster].sort((a, c) => c.MIN_PCT - a.MIN_PCT).slice(5).filter((p) => p.MIN_PCT > 0);
  const w = b.reduce((a, p) => a + p.MIN_PCT, 0);
  return w ? { O: b.reduce((a, p) => a + p.OBPM * p.MIN_PCT, 0) / w, D: b.reduce((a, p) => a + p.DBPM * p.MIN_PCT, 0) / w } : { O: 0, D: 0 };
}

export function transferEffect({ player, from, to, minNew, statsNew, model }) {
  const kO = model.link.ADJOE.slope, kD = model.link.ADJDE.slope;
  // Origin team: his minutes go to its bench (minute-weighted bench OBPM/DBPM).
  const bA = bench(from.filter((p) => p.PID !== player.PID));
  const dOA = player.MIN_PCT * (bA.O - player.OBPM), dDA = player.MIN_PCT * (bA.D - player.DBPM);
  // New team: he takes minNew; the same minutes come off the end of its bench first (fewest minutes upward).
  let left = minNew; const cut = [];
  for (const p of [...to].sort((a, c) => a.MIN_PCT - c.MIN_PCT)) {
    if (left <= 1e-6) break;
    const take = Math.min(p.MIN_PCT, left); if (take <= 0) continue;
    cut.push({ p, take }); left -= take;
  }
  const dOB = minNew * statsNew.O - cut.reduce((a, x) => a + x.take * x.p.OBPM, 0);
  const dDB = minNew * statsNew.D - cut.reduce((a, x) => a + x.take * x.p.DBPM, 0);
  return { from: { dO: kO * dOA, dD: kD * dDA }, to: { dO: kO * dOB, dD: kD * dDB }, cut, benchA: bA };
}

export async function collegeTransferPage(app, query = "") {
  await loadCMeta();
  const qp = new URLSearchParams(query || "");
  const seasons = playedSeasons();
  const season = seasons.includes(qp.get("season")) ? qp.get("season") : seasons[0];
  const [players, teams, model] = await Promise.all([cload("players", season), cload("teams", season), fetch("data/college/transfer_model.json").then((r) => r.json())]);
  const ok = players.filter((p) => p.BPM != null && p.OBPM != null && p.DBPM != null && p.MIN_PCT != null);
  const byTeam = new Map(); ok.forEach((p) => { if (!byTeam.has(p.TEAM_ID)) byTeam.set(p.TEAM_ID, []); byTeam.get(p.TEAM_ID).push(p); });
  const tById = new Map(teams.map((t) => [t.TEAM_ID, t]));
  const label = (p) => `${p.PLAYER_NAME} (${p.TEAM_NAME})`;
  const byLabel = new Map(ok.map((p) => [label(p), p]));
  let player = ok.find((p) => p.PID === +qp.get("pid")) || [...ok].sort((a, b) => b.BPM * b.MIN_PCT - a.BPM * a.MIN_PCT)[0];
  const ranked = [...teams].filter((t) => t.ADJOE != null).sort((a, b) => a.TRANK - b.TRANK);
  let dest = tById.get(qp.get("to")) || ranked.find((t) => t.TRANK >= 100 && t.TEAM_ID !== player.TEAM_ID) || ranked[0];
  if (dest.TEAM_ID === player.TEAM_ID) dest = ranked.find((t) => t.TEAM_ID !== player.TEAM_ID);
  const co = model.carryover.transfer;

  app.innerHTML = `${collegeNav("transfer")}
    <div class="page-head"><div><h1>Transfer what-if ${B}</h1>
      <p class="sub">Move a college player to another team and see how both teams' adjusted efficiency, T-Rank and record would change. Built on Bart Torvik's player BPM and team ratings.</p></div>
      <div><label class="small muted">Season <select id="tr-season">${seasons.map((s) => `<option ${s === season ? "selected" : ""}>${s}</option>`).join("")}</select></label></div></div>
    <div class="card toolbar sim-controls">
      <label>Player <input type="search" id="tr-player" list="tr-names" value="${esc(label(player))}" style="min-width:240px;max-width:calc(100vw - 110px)"><datalist id="tr-names">${ok.filter((p) => p.MIN_PCT >= 0.1).map((p) => `<option value="${esc(label(p))}">`).join("")}</datalist></label>
      <label>Moves to <select id="tr-to" style="max-width:calc(100vw - 120px)">${[...teams].sort((a, b) => a.TEAM_NAME.localeCompare(b.TEAM_NAME)).map((t) => `<option value="${esc(t.TEAM_ID)}" ${t.TEAM_ID === dest.TEAM_ID ? "selected" : ""}>${esc(t.TEAM_NAME)} (#${t.TRANK})</option>`).join("")}</select></label>
      <label>Production <select id="tr-mode"><option value="asis" ${state.mode === "asis" ? "selected" : ""}>Exactly as he played</option><option value="carry" ${state.mode === "carry" ? "selected" : ""}>Typical transfer carryover</option></select></label>
      <label>Share of minutes at new team <input type="range" id="tr-min" min="0" max="100" step="1"> <b id="tr-minv"></b></label>
    </div>
    <div id="tr-out"></div>
    <div class="card method"><h3>How it works and what it assumes ${B}</h3>
      <p class="small"><b>The link.</b> Torvik's Box Plus/Minus is built so a team's players add up to the team: across ${model.team_seasons.toLocaleString()} D-I team-seasons (${esc(model.seasons)}),
        AdjEM = ${model.link.ADJEM.slope.toFixed(3)} × Σ(BPM × share of minutes) ${model.link.ADJEM.intercept >= 0 ? "+" : "−"} ${Math.abs(model.link.ADJEM.intercept).toFixed(2)}, correlation r = ${model.link.ADJEM.r.toFixed(4)} (typical miss ${model.link.ADJEM.rmse} points).
        The same fit on offense and defense: AdjO moves ${model.link.ADJOE.slope.toFixed(3)} per point of Σ(OBPM × minutes share) (r = ${model.link.ADJOE.r.toFixed(2)}); AdjD moves ${model.link.ADJDE.slope.toFixed(3)} per point of Σ(DBPM × minutes share) (r = ${model.link.ADJDE.r.toFixed(2)}).
        “Share of minutes” is Torvik's Min% (a full roster adds up to about 500%, five players on the floor).</p>
      <p class="small"><b>The move.</b> The old team gives his minutes to its bench (the minute-weighted OBPM/DBPM of its players outside the top five by minutes).
        The new team gives him the minutes on the slider, taken from the end of its bench first (fewest minutes upward). Everything else (other players, schedule, the other 360 teams) stays as it really was.</p>
      <p class="small"><b>Production.</b> “Exactly as he played” keeps his OBPM/DBPM. “Typical transfer carryover” uses what ${co.n.toLocaleString()} real transfers (40%+ of minutes before) did the next season:
        OBPM → ${co.OBPM.intercept.toFixed(2)} + ${co.OBPM.slope.toFixed(2)} × OBPM, DBPM → ${co.DBPM.intercept.toFixed(2)} + ${co.DBPM.slope.toFixed(2)} × DBPM, and a minutes share of ${pc(co.min_ratio)} of his old one
        (players who stayed: BPM slope ${model.carryover.stayed.BPM.slope.toFixed(2)}, minutes ${pc(model.carryover.stayed.min_ratio)}). Big numbers shrink toward average, a bit more for transfers.</p>
      <p class="small"><b>Record.</b> Barthag = AdjO<sup>11.5</sup> ÷ (AdjO<sup>11.5</sup> + AdjD<sup>11.5</sup>); expected wins = games × log5 chance against Torvik's strength of schedule; the change is added to the real record.
        Estimated T-Rank = Barthag order among all teams (with both changed teams updated).</p>
      <p class="small muted"><b>Not modeled:</b> position fit and lineup overlap, usage (two high-usage scorers don't simply add up), coaching, eligibility and transfer rules, and BPM's own limits as a box-score estimate.
        Torvik's BPM already adjusts for team and schedule strength, so a mid-major player's BPM is carried over as is.</p></div>`;

  const minSlider = app.querySelector("#tr-min");
  const resetMin = () => { const m = state.mode === "carry" ? player.MIN_PCT * co.min_ratio : player.MIN_PCT; minSlider.value = Math.round(100 * Math.min(1, m)); };
  resetMin();
  const go = () => {
    const from = byTeam.get(player.TEAM_ID) || [], to = byTeam.get(dest.TEAM_ID) || [];
    const minNew = +minSlider.value / 100;
    app.querySelector("#tr-minv").textContent = `${minSlider.value}%`;
    const statsNew = state.mode === "carry" ? { O: co.OBPM.intercept + co.OBPM.slope * player.OBPM, D: co.DBPM.intercept + co.DBPM.slope * player.DBPM } : { O: player.OBPM, D: player.DBPM };
    const fx = transferEffect({ player, from, to, minNew, statsNew, model });
    const A = tById.get(player.TEAM_ID), D_ = dest;
    const nA = { o: A.ADJOE + fx.from.dO, d: A.ADJDE + fx.from.dD }, nB = { o: D_.ADJOE + fx.to.dO, d: D_.ADJDE + fx.to.dD };
    const others = teams.filter((t) => t.ADJOE != null && t.TEAM_ID !== A.TEAM_ID && t.TEAM_ID !== D_.TEAM_ID).map((t) => barthag(t.ADJOE, t.ADJDE));
    const rank = (b, other) => 1 + others.filter((x) => x > b).length + (other > b ? 1 : 0);
    const card = (t, n, otherB, role) => {
      const b0 = barthag(t.ADJOE, t.ADJDE), b1 = barthag(n.o, n.d);
      const e0 = t.SOS != null ? log5(b0, t.SOS) * t.GP : null, e1 = t.SOS != null ? log5(b1, t.SOS) * t.GP : null;
      const dW = e0 != null ? e1 - e0 : null, nW = dW != null ? Math.min(t.GP, Math.max(0, t.W + dW)) : null;
      const r0 = rank(b0, barthag(role === "from" ? D_.ADJOE : A.ADJOE, role === "from" ? D_.ADJDE : A.ADJDE)), r1 = rank(b1, otherB);
      const row = (l, a, c, f, hib = true) => { const ch = c - a; const col = Math.abs(ch) < 0.05 && f !== pcB ? "var(--muted)" : (ch > 0) === hib ? "var(--good)" : "var(--bad)"; return `<tr><td class="left">${l}</td><td>${f(a)}</td><td><b>${f(c)}</b></td><td style="color:${col}">${f === pcB ? (ch >= 0 ? "+" : "−") + Math.abs(ch).toFixed(3) : sg(ch)}</td></tr>`; };
      return `<div class="card"><h3>${role === "from" ? "Without him" : "With him"}: <a href="#/college/team/${esc(t.TEAM_ID)}?season=${season}">${esc(t.TEAM_NAME)}</a></h3>
        <div class="table-wrap"><table class="data"><thead><tr><th class="left"></th><th>Real</th><th>What if</th><th>Change</th></tr></thead><tbody>
          ${row("Adj. offense", t.ADJOE, n.o, f1)}${row("Adj. defense (lower = better)", t.ADJDE, n.d, f1, false)}${row("Adj. efficiency margin", t.ADJOE - t.ADJDE, n.o - n.d, f1)}
          ${row("Barthag", b0, b1, pcB)}
          <tr><td class="left">Estimated T-Rank</td><td>#${r0}</td><td><b>#${r1}</b></td><td style="color:${r1 < r0 ? "var(--good)" : r1 > r0 ? "var(--bad)" : "var(--muted)"}">${r1 === r0 ? "–" : (r1 < r0 ? "▲" : "▼") + Math.abs(r1 - r0)}</td></tr>
          ${nW != null ? `<tr><td class="left">Record (${t.GP} games)</td><td>${t.W}-${t.L}</td><td><b>≈${Math.round(nW)}-${t.GP - Math.round(nW)}</b></td><td>${sg(dW)} W</td></tr>` : ""}
        </tbody></table></div></div>`;
    };
    const pcB = (v) => v.toFixed(3);
    const bA1 = barthag(nA.o, nA.d), bB1 = barthag(nB.o, nB.d);
    app.querySelector("#tr-out").innerHTML = `
      <div class="callout"><p><b><a href="#/college/player/${player.PID}">${esc(player.PLAYER_NAME)}</a></b> (${esc(player.TEAM_NAME)}, ${esc(player.CLASS || "")}, ${esc(player.POS || "")}) in ${season}:
        ${f1(player.PTS)} PTS, BPM ${f1(player.BPM)} (OBPM ${f1(player.OBPM)}, DBPM ${f1(player.DBPM)}), ${pc(player.MIN_PCT)} of minutes, usage ${pc(player.USG)}.
        ${state.mode === "carry" ? `With typical transfer carryover: OBPM ${f1(statsNew.O)}, DBPM ${f1(statsNew.D)}.` : ""}</p></div>
      ${player.TEAM_ID === dest.TEAM_ID ? `<p class="muted">Pick a different team.</p>` : `<div class="grid two-col">${card(A, nA, bB1, "from")}${card(D_, nB, bA1, "to")}</div>
      <div class="card" style="margin-top:12px"><h3>Where his minutes come from at ${esc(D_.TEAM_NAME)}</h3>
        ${fx.cut.length ? `<p class="small">${fx.cut.map((x) => `<a href="#/college/player/${x.p.PID}">${esc(x.p.PLAYER_NAME)}</a> −${Math.round(100 * x.take)} pts of minutes share (BPM ${f1(x.p.BPM)})`).join(" · ")}</p>` : `<p class="muted small">No minutes given (slider at 0).</p>`}
        <p class="muted small">At ${esc(A.TEAM_NAME)}, his ${pc(player.MIN_PCT)} share goes to the bench (bench OBPM ${f1(fx.benchA.O)}, DBPM ${f1(fx.benchA.D)}).</p></div>`}`;
    history.replaceState(null, "", `#/college/transfer?season=${season}&pid=${player.PID}&to=${dest.TEAM_ID}`);
  };
  app.querySelector("#tr-season").addEventListener("change", (e) => { location.hash = `#/college/transfer?season=${e.target.value}`; });
  app.querySelector("#tr-player").addEventListener("change", (e) => { const p = byLabel.get(e.target.value); if (p) { player = p; resetMin(); go(); } });
  app.querySelector("#tr-to").addEventListener("change", (e) => { dest = tById.get(e.target.value); go(); });
  app.querySelector("#tr-mode").addEventListener("change", (e) => { state.mode = e.target.value; resetMin(); go(); });
  minSlider.addEventListener("input", go);
  go();
}
