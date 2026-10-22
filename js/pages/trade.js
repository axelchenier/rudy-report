// trade.js - Trade what-if (Tools page, #/tools/trade). Stats only: no salaries, no CBA salary-matching rules.
// Pick two teams and a season, tick the players each team sends, and see a MODEL ESTIMATE of how each team's
// net rating and wins would change if the players had spent that season on the other team.
//   Impact per player = Box Plus/Minus (Basketball-Reference's credited BPM column, the only BBRef number we use),
//   weighted by the minutes he played per team game (NBA.com). Minutes a player leaves behind are filled at
//   replacement level (BPM -2.0) and minutes he takes on his new team push out replacement-level minutes.
//   Net rating -> wins: a straight line fitted to that season's 30 teams (NBA.com W% vs net rating).
import { load, META, completeSeasons, dataStatus, seasonGames } from "../data.js";
import { esc, modelBadge } from "../ui.js";

const REPL = -2.0;
const sgn = (v, d = 1) => `<span class="${v > 0.05 ? "pos" : v < -0.05 ? "neg" : ""}">${v > 0 ? "+" : ""}${v.toFixed(d)}</span>`;

function fitWins(teams) {      // least squares: W_PCT = a + b * NET_RATING
  const n = teams.length, mx = teams.reduce((s, t) => s + t.NET_RATING, 0) / n, my = teams.reduce((s, t) => s + t.W_PCT, 0) / n;
  const b = teams.reduce((s, t) => s + (t.NET_RATING - mx) * (t.W_PCT - my), 0) / teams.reduce((s, t) => s + (t.NET_RATING - mx) ** 2, 0);
  const r2 = 1 - teams.reduce((s, t) => s + (t.W_PCT - (my + b * (t.NET_RATING - mx))) ** 2, 0) / teams.reduce((s, t) => s + (t.W_PCT - my) ** 2, 0);
  return { b, r2 };
}

export async function tradeTool(box, params) {
  const seasons = completeSeasons().filter((s) => dataStatus("bpm", s).ok);
  const season = seasons.includes(params.get("season")) ? params.get("season") : (seasons.includes(META.default_season) ? META.default_season : seasons[0]);
  const [players, teams, bpmRows] = await Promise.all([load("players", season), load("teams", season), load("bbref_advanced", season).catch(() => [])]);
  const bpm = new Map(bpmRows.map((b) => [b.PLAYER_ID, b.BPM]));
  const list = [...teams].sort((a, b) => a.TEAM_NAME.localeCompare(b.TEAM_NAME));
  const pick = (k, dflt) => teams.find((t) => t.TEAM_ID === +params.get(k)) || teams.find((t) => t.TEAM_ABBREVIATION === dflt) || list[0];
  const A = pick("a", "MIN"), B0 = pick("b", "DAL"), B = B0.TEAM_ID === A.TEAM_ID ? list.find((t) => t.TEAM_ID !== A.TEAM_ID) : B0;
  const fit = fitWins(teams), games = seasonGames(season);
  const roster = (t) => players.filter((p) => p.TEAM_ID === t.TEAM_ID).map((p) => ({ ...p, BPM: bpm.get(p.PLAYER_ID), M: (p.MIN * p.GP) / t.GP }))
    .sort((a, b) => b.M - a.M);
  const rA = roster(A), rB = roster(B);
  let out = new Set((params.get("out") || "").split(",").map(Number).filter((id) => rA.concat(rB).some((p) => p.PLAYER_ID === id)));
  if (!params.get("out")) out = new Set([rA[2]?.PLAYER_ID, rB[2]?.PLAYER_ID].filter(Boolean));   // a starting example: each team's 3rd-most-used player

  const opt = (sel) => list.map((t) => `<option value="${t.TEAM_ID}" ${t.TEAM_ID === sel.TEAM_ID ? "selected" : ""}>${esc(t.TEAM_NAME)}</option>`).join("");
  const rosterHTML = (r, side) => r.map((p) => `<label><input type="checkbox" data-side="${side}" value="${p.PLAYER_ID}" ${out.has(p.PLAYER_ID) ? "checked" : ""}>
    ${esc(p.PLAYER_NAME)} <span class="muted small">${p.M.toFixed(1)} min/team game · BPM ${p.BPM == null ? "–" : (p.BPM > 0 ? "+" : "") + p.BPM.toFixed(1)}</span></label>`).join("");
  box.innerHTML = `
    <div class="page-head"><div><h1>Trade what-if <span class="muted small">stats only</span></h1>
      <p class="sub">${esc(season)} · what if these players had spent the season on the other team? ${modelBadge("BPM × minutes, replacement level -2.0; wins from this season's W% vs net rating line")}
        No salaries or trade rules: this says nothing about whether the trade is legal.</p></div></div>
    <div class="card toolbar sim-controls">
      <label>Season <select id="tr-season">${seasons.map((s) => `<option ${s === season ? "selected" : ""}>${s}</option>`).join("")}</select></label>
      <label>Team A <select id="tr-a">${opt(A)}</select></label>
      <label>Team B <select id="tr-b">${opt(B)}</select></label>
    </div>
    <div class="lb-grid trade-grid">
      <div class="card"><h3>${esc(A.TEAM_ABBREVIATION)} sends <span class="muted small">(tick players)</span></h3><div class="lb-roster">${rosterHTML(rA, "a")}</div></div>
      <div class="card"><h3>${esc(B.TEAM_ABBREVIATION)} sends <span class="muted small">(tick players)</span></h3><div class="lb-roster">${rosterHTML(rB, "b")}</div></div>
    </div>
    <div id="tr-out"></div>
    <div class="card method"><b>${modelBadge("")} How the estimate works.</b>
      <p class="small">Box Plus/Minus estimates a player's points per 100 possessions above a league-average player. A team's net rating moves by roughly
      Σ (BPM − replacement) × (minutes per team game ÷ 48) for the players coming in, minus the same for the players going out. Replacement level is BPM ${REPL.toFixed(1)}
      (the level Basketball-Reference uses for VORP): the minutes a departing player leaves are assumed to go to a replacement-level player, and the minutes an
      arriving player takes are assumed to come from one. Each player keeps the minutes per team game he actually played that season (missed games included).
      Net rating is turned into wins with a straight line fitted to ${esc(season)}'s ${teams.length} teams: each point of net rating ≈ ${(fit.b * games).toFixed(1)} wins over ${games} games (R² ${fit.r2.toFixed(2)}).
      It ignores fit, role and usage changes, coaching, and injuries after the trade; treat it as a rough size of the swing, not a forecast.</p>
      <p class="muted small">Data: NBA.com/stats (minutes, games, team net rating and record) and Box Plus/Minus from <a href="https://www.basketball-reference.com/" rel="noopener">Basketball-Reference.com</a> (the only Basketball-Reference column on this site).</p></div>`;

  const go = (extra = {}) => {
    const p = new URLSearchParams({ season, a: A.TEAM_ID, b: B.TEAM_ID, out: [...out].join(",") || "0", ...extra });
    location.hash = `#/tools/trade?${p}`;
  };
  box.querySelector("#tr-season").addEventListener("change", (e) => { location.hash = `#/tools/trade?season=${e.target.value}&a=${A.TEAM_ID}&b=${B.TEAM_ID}`; });
  box.querySelector("#tr-a").addEventListener("change", (e) => { location.hash = `#/tools/trade?season=${season}&a=${e.target.value}&b=${B.TEAM_ID}`; });
  box.querySelector("#tr-b").addEventListener("change", (e) => { location.hash = `#/tools/trade?season=${season}&a=${A.TEAM_ID}&b=${e.target.value}`; });
  box.querySelectorAll(".lb-roster input").forEach((c) => c.addEventListener("change", () => {
    if (c.checked) out.add(+c.value); else out.delete(+c.value);
    history.replaceState(null, "", `#/tools/trade?${new URLSearchParams({ season, a: A.TEAM_ID, b: B.TEAM_ID, out: [...out].join(",") || "0" })}`);
    draw();
  }));

  const value = (p) => ((p.BPM ?? REPL) - REPL) * p.M / 48;
  function draw() {
    const sA = rA.filter((p) => out.has(p.PLAYER_ID)), sB = rB.filter((p) => out.has(p.PLAYER_ID));
    const el = box.querySelector("#tr-out");
    if (!sA.length && !sB.length) { el.innerHTML = `<p class="muted">Tick at least one player to move.</p>`; return; }
    const sum = (ps) => ps.reduce((s, p) => s + value(p), 0);
    const team = (t, gets, sends) => {
      const d = sum(gets) - sum(sends), net = t.NET_RATING + d, w = t.W_PCT + fit.b * d;
      const wins = Math.max(0, Math.min(games, w * games));
      const prod = (k) => gets.reduce((s, p) => s + p[k] * p.GP / t.GP, 0) - sends.reduce((s, p) => s + p[k] * p.GP / t.GP, 0);
      return `<div class="card"><h3>${esc(t.TEAM_NAME)}</h3>
        <p>Net rating ${t.NET_RATING > 0 ? "+" : ""}${t.NET_RATING.toFixed(1)} → <b>${net > 0 ? "+" : ""}${net.toFixed(1)}</b> (${sgn(d)}) ${modelBadge("")}</p>
        <p>Record ${t.W}-${t.L} → about <b>${Math.round(wins)}-${games - Math.round(wins)}</b> (${sgn(wins - t.W_PCT * games)} wins)</p>
        ${Math.abs(fit.b * d * games) > 12 ? `<p class="callout small">A swing this big is outside what the simple line was fitted on: real teams lose some of a star's value to fit and diminishing returns, so read it as an upper bound.</p>` : ""}
        <p class="small muted">Minutes per team game: ${sgn(gets.reduce((s, p) => s + p.M, 0) - sends.reduce((s, p) => s + p.M, 0))} ·
          box-score production per team game moved: PTS ${sgn(prod("PTS"))}, REB ${sgn(prod("REB"))}, AST ${sgn(prod("AST"))}, 3PM ${sgn(prod("FG3M"))}</p></div>`;
    };
    const row = (p, from, to) => `<tr><td class="left"><a href="#/player/${p.PLAYER_ID}?season=${season}">${esc(p.PLAYER_NAME)}</a></td><td class="left">${esc(from)} → ${esc(to)}</td>
      <td>${p.GP}</td><td>${p.MIN.toFixed(1)}</td><td>${p.M.toFixed(1)}</td><td>${p.PTS.toFixed(1)}</td><td>${p.REB.toFixed(1)}</td><td>${p.AST.toFixed(1)}</td>
      <td>${(100 * p.TS_PCT).toFixed(1)}</td><td>${(100 * p.USG_PCT).toFixed(1)}</td><td>${p.BPM == null ? "– (−2.0 used)" : (p.BPM > 0 ? "+" : "") + p.BPM.toFixed(1)}</td><td>${value(p).toFixed(2)}</td></tr>`;
    el.innerHTML = `<div class="grid trade-grid">${team(A, sB, sA)}${team(B, sA, sB)}</div>
      <div class="card table-wrap"><h3>Players moved</h3><table class="data"><thead><tr><th class="left">Player</th><th class="left">Move</th><th>G</th><th>MPG</th>
        <th title="Minutes per team game (MPG × games ÷ team games)">Min/team G</th><th>PTS</th><th>REB</th><th>AST</th><th>TS%</th><th>USG%</th><th>BPM</th>
        <th title="(BPM − replacement) × min per team game ÷ 48: net-rating points this player is worth above a replacement player">Value</th></tr></thead>
        <tbody>${sA.map((p) => row(p, A.TEAM_ABBREVIATION, B.TEAM_ABBREVIATION)).join("")}${sB.map((p) => row(p, B.TEAM_ABBREVIATION, A.TEAM_ABBREVIATION)).join("")}</tbody></table>
        <p class="muted small">Players are listed under the team they finished ${esc(season)} with (NBA.com); a traded player's line is his whole season.</p></div>`;
  }
  draw();
  void go;
}
