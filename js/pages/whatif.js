// whatif.js - "What if he (or the team) shot X%?" sliders. Every output is a MODEL ESTIMATE:
// we change one shooting number, keep everything else the same, and recompute points, TS%, eFG%,
// then turn the points into a team net-rating change and Pythagorean wins (the same formula as the Standings page).
import { load } from "../data.js";
import { esc, modelBadge } from "../ui.js";
import { pyth } from "./standings.js";

const f1 = (v) => v.toFixed(1), pc = (v) => (100 * v).toFixed(1);
const sgn = (v, d = 1) => Math.abs(v) < 0.5 * 10 ** -d ? (0).toFixed(d) : `${v > 0 ? "+" : ""}${v.toFixed(d)}`;
const cls = (v) => v > 0.005 ? "pos" : v < -0.005 ? "neg" : "";

// Points and efficiency from per-game shooting numbers.
function shooting({ fg2a, fg2p, fg3a, fg3p, fta, ftp }) {
  const pts = 2 * fg2a * fg2p + 3 * fg3a * fg3p + fta * ftp;
  const fga = fg2a + fg3a;
  return { pts, ts: fga + fta ? pts / (2 * (fga + 0.44 * fta)) : 0, efg: fga ? (fg2a * fg2p + 1.5 * fg3a * fg3p) / fga : 0, fga };
}

function slider(id, label, min, max, step, value, unit = "") {
  return `<label class="wi-slider"><span>${label}</span><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}">
    <b id="${id}-v">${value}${unit}</b><button class="btn tiny" data-reset="${id}" data-value="${value}" title="Back to the real number">reset</button></label>`;
}

const METHOD = "Changes one shooting input and keeps everything else (other shots, defense, minutes, rebounds off misses) the same. " +
  "Points change = new points − real points. Team effect: points per game × 100 ÷ team possessions per game = net rating change, " +
  "then Pythagorean wins (exponent 13.91) from the team's points scored and allowed per game, over 82 games.";

export async function renderWhatIf(box, { season, playerId, teamId }) {
  const teams = await load("teams", season);
  let me, team, share = 1;
  if (playerId) {
    me = (await load("players", season)).find((p) => p.PLAYER_ID === playerId);
    team = teams.find((t) => t.TEAM_ID === me?.TEAM_ID);
    if (me && team) share = Math.min(1, me.GP / team.GP);     // he only affects the games he plays
  } else { team = teams.find((t) => t.TEAM_ID === teamId); me = team; }
  if (!me || !team) { box.innerHTML = `<p class="muted">Not enough data for ${season}.</p>`; return; }

  const real = { fg2a: me.FGA - me.FG3A, fg2p: me.FGA - me.FG3A > 0 ? (me.FGM - me.FG3M) / (me.FGA - me.FG3A) : 0,
    fg3a: me.FG3A, fg3p: me.FG3A ? me.FG3M / me.FG3A : 0, fta: me.FTA, ftp: me.FTA ? me.FTM / me.FTA : 0 };
  const base = shooting(real);
  const lg3 = teams.reduce((a, t) => a + t.FG3M, 0) / teams.reduce((a, t) => a + t.FG3A, 0);
  const lgFT = teams.reduce((a, t) => a + t.FTM, 0) / teams.reduce((a, t) => a + t.FTA, 0);
  const pf = team.PTS, pa = team.PTS - team.PLUS_MINUS;            // team points for / against per game
  const possPerGame = team.PACE * (team.MIN / 48);
  const baseWins = 82 * pyth(pf, pa);
  const who = playerId ? esc(me.PLAYER_NAME) : esc(team.TEAM_NAME);
  const small = (playerId ? me.GP < 10 : team.GP < 10);

  box.innerHTML = `
    <div class="card method"><b>${modelBadge(METHOD)} What if ${who} shot differently?</b>
      <p class="small">Move a slider to change one shooting number; everything else stays as it really was in ${season}.
        ${playerId ? `Team effects are spread over the ${me.GP} of ${team.GP} team games he played.` : ""}</p></div>
    ${small ? `<p class="callout">Only ${playerId ? me.GP : team.GP} games so far: the real numbers these sliders start from are a small sample.</p>` : ""}
    <div class="wi-grid">
      <div class="card">
        <h3>Shooting (per game)</h3>
        ${slider("wi-3p", "3P%", 0, 60, 0.1, f1(100 * real.fg3p), "%")}
        ${slider("wi-3a", "3PA per game", 0, Math.max(15, Math.ceil(real.fg3a * 2)), 0.1, f1(real.fg3a))}
        <label class="small wi-check"><input type="checkbox" id="wi-swap" checked> extra 3s replace 2-point shots (same total shots)</label>
        ${slider("wi-2p", "2P%", 20, 80, 0.1, f1(100 * real.fg2p), "%")}
        ${slider("wi-ft", "FT%", 30, 100, 0.1, f1(100 * real.ftp), "%")}
        ${slider("wi-fta", "FTA per game", 0, Math.max(12, Math.ceil(real.fta * 2)), 0.1, f1(real.fta))}
        <p class="small">Presets: <button class="btn tiny" id="wi-lg3">league-average 3P% (${pc(lg3)}%)</button>
          <button class="btn tiny" id="wi-lgft">league-average FT% (${pc(lgFT)}%)</button></p>
      </div>
      <div class="card"><h3>Result ${modelBadge(METHOD)}</h3><div id="wi-out"></div></div>
    </div>
    <p class="muted small">Real numbers: NBA.com/stats ${season} per-game totals. ${esc(METHOD)} This is a "what if" calculator, not a prediction.</p>`;

  // A slider shows a rounded number; while it sits at its starting spot we use the exact real value (no fake drift).
  const exact = { "wi-3p": 100 * real.fg3p, "wi-3a": real.fg3a, "wi-2p": 100 * real.fg2p, "wi-ft": 100 * real.ftp, "wi-fta": real.fta };
  const start = Object.fromEntries(Object.keys(exact).map((id) => [id, box.querySelector(`#${id}`).value]));
  const val = (id) => { const el = box.querySelector(`#${id}`); return el.value === start[id] ? exact[id] : Number(el.value); };
  const draw = () => {
    for (const id of ["wi-3p", "wi-3a", "wi-2p", "wi-ft", "wi-fta"]) box.querySelector(`#${id}-v`).textContent = box.querySelector(`#${id}`).value + (id.endsWith("p") || id === "wi-ft" ? "%" : "");
    const fg3a = val("wi-3a");
    const swap = box.querySelector("#wi-swap").checked;
    const fg2a = swap ? Math.max(0, real.fg2a - (fg3a - real.fg3a)) : real.fg2a;
    const now = shooting({ fg2a, fg2p: val("wi-2p") / 100, fg3a, fg3p: val("wi-3p") / 100, fta: val("wi-fta"), ftp: val("wi-ft") / 100 });
    const dPts = Math.abs(now.pts - base.pts) < 1e-9 ? 0 : now.pts - base.pts;
    const dTeam = dPts * share;                                   // per team game
    const dNet = 100 * dTeam / possPerGame;
    const wins = 82 * pyth(pf + dTeam, pa);
    const row = (label, a, b, fmtv, d) => `<tr><td class="left">${label}</td><td>${fmtv(a)}</td><td><b>${fmtv(b)}</b></td><td class="${cls(b - a)}">${sgn((b - a) * (d || 1), d === 100 ? 1 : 1)}</td></tr>`;
    box.querySelector("#wi-out").innerHTML = `<table class="data"><thead><tr><th class="left"></th><th>Real</th><th>What if</th><th>Change</th></tr></thead><tbody>
      ${row(playerId ? "Points per game" : "Team points per game", base.pts, now.pts, f1)}
      ${row("TS%", base.ts, now.ts, pc, 100)}
      ${row("eFG%", base.efg, now.efg, pc, 100)}
      ${row("Team net rating", team.NET_RATING, team.NET_RATING + dNet, (v) => sgn(v))}
      ${row("Team wins per 82 (Pythagorean)", baseWins, wins, f1)}
    </tbody></table>
    <p class="small muted">${Math.abs(dPts) < 0.05 ? "No change yet: move a slider." :
      `${sgn(dPts)} points per game ${playerId ? `for him` : ""} ≈ ${sgn(dNet)} team net rating ≈ ${sgn(wins - baseWins)} wins over 82 games (model estimate).`}</p>`;
  };
  box.querySelectorAll("input").forEach((i) => i.addEventListener("input", draw));
  box.querySelectorAll("[data-reset]").forEach((b) => b.addEventListener("click", () => { box.querySelector(`#${b.dataset.reset}`).value = b.dataset.value; draw(); }));
  box.querySelector("#wi-lg3").addEventListener("click", () => { box.querySelector("#wi-3p").value = (100 * lg3).toFixed(1); draw(); });
  box.querySelector("#wi-lgft").addEventListener("click", () => { box.querySelector("#wi-ft").value = (100 * lgFT).toFixed(1); draw(); });
  draw();
}
