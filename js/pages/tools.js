// tools.js - the Tools page: scenario tools that apply real data to "what happens if" questions.
//   #/tools/odds     Playoff Odds simulator (Monte Carlo over the real remaining schedule)  - MODEL ESTIMATE
// Data: NBA.com/stats (standings, team stats, game logs) and NBA.com's schedule (ScheduleLeagueV2), saved by the pipeline.
import { load, META, completeSeasons } from "../data.js";
import { renderTable, esc, modelBadge } from "../ui.js";
import { prepare, simulate } from "../sim.js";

const TOOLS = [
  ["odds", "Playoff odds", "Simulate the rest of the season 10,000 times: playoff, Play-In, seed and title chances. Nudge any team up or down to test a scenario."],
];

export async function toolsPage(app, tool = "", query = "") {
  const tabs = `<nav class="page-tabs">${TOOLS.map(([k, l]) => `<a href="#/tools/${k}" class="${k === tool ? "active" : ""}">${esc(l)}</a>`).join("")}</nav>`;
  if (!tool) {
    app.innerHTML = `<div class="page-head"><div><h1>Tools</h1><p class="sub">Apply real data to scenarios. Every output is labeled ${modelBadge("")} and explains its method.</p></div></div>
      <div class="grid tool-cards">${TOOLS.map(([k, l, d]) => `<a class="card tool-card" href="#/tools/${k}"><h3>${esc(l)}</h3><p class="muted small">${esc(d)}</p></a>`).join("")}</div>`;
    return;
  }
  const page = { odds: oddsTool }[tool];
  app.innerHTML = `${tabs}<div id="tool"></div>`;
  await page(app.querySelector("#tool"), new URLSearchParams(query));
}

const pc = (v, d = 0) => v == null ? "–" : v >= 0.9995 && v < 1 ? ">99.9" : v > 0 && v < 0.0005 ? "<0.1" : v > 0 && v < 0.005 && d === 0 ? "<1" : (100 * v).toFixed(d);
const sgn = (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}`;
const pctCell = (v, d = 0) => `<span class="odds" style="--o:${Math.round(100 * v)}%">${pc(v, d)}</span>`;

// Everything the season simulator needs, from the saved data files.
export async function seasonInputs() {
  const season = META.current_season;
  const prior = completeSeasons().filter((s) => s < season)[0];
  const [standings, teams, last, games, schedule] = await Promise.all([
    load("standings", season), load("teams", season).catch(() => []), load("teams", prior), load("team_games", season).catch(() => []),
    load("schedule", season).catch(() => null)]);
  if (!schedule?.model) return { season, prior, missing: true };
  const now = new Map(teams.map((t) => [t.TEAM_ID, t])), before = new Map(last.map((t) => [t.TEAM_ID, t]));
  const list = standings.map((s) => {
    const t = now.get(s.TeamID), b = before.get(s.TeamID);
    return { id: s.TeamID, name: `${s.TeamCity} ${s.TeamName}`, abbr: t?.TEAM_ABBREVIATION || b?.TEAM_ABBREVIATION, conf: s.Conference,
      W: s.WINS, L: s.LOSSES, gp: s.WINS + s.LOSSES, pd: s.WINS + s.LOSSES ? s.DiffPointsPG : null, lastPd: b?.PLUS_MINUS ?? 0 };
  });
  const prep = prepare({ teams: list, schedule, playedIds: new Set(games.map((g) => g.GAME_ID)) });
  return { season, prior, schedule, prep };
}

export function oddsMethod(model, prior) {
  return `<div class="card method"><b>${modelBadge("")} How the Playoff Odds model works.</b>
    <p class="small"><b>1. Team strength</b> = expected point differential per game against an average team. Before the season it is last season's
      (${esc(prior)}) point differential × <b>${model.carryover}</b>, the share that carried over to the next season across ${esc(model.carryover_from)}.
      As games are played it moves toward this season's point differential, weighted by games played
      (a standard Bayesian blend: game-to-game spread ${model.margin_sd} points, unexplained season-to-season spread ${model.talent_sd} points).</p>
    <p class="small"><b>2. Each simulated season</b> draws every team's true strength from that uncertainty, then plays every remaining game on NBA.com's
      schedule: home margin = home strength − away strength + <b>${model.home_edge}</b> points of home edge (measured from ${model.games} games in ${esc(model.from_season)}),
      plus random game-to-game noise with a spread of ${model.margin_sd} points. NBA Cup knockout games whose teams aren't known yet
      are played against an average opponent on a neutral floor.</p>
    <p class="small"><b>3. Seeding and playoffs:</b> seeds by wins (ties broken by coin flip, not the NBA's full tiebreaker rules), the real Play-In format,
      then four best-of-7 rounds with the better seed (better record in the Finals) at home in games 1, 2, 5 and 7.
      It does not know about injuries, trades, rest or schedule fatigue. These are estimates of what could happen, not predictions.</p>
    <p class="muted small">Data: NBA.com/stats standings, team stats and game logs, NBA.com schedule (ScheduleLeagueV2) via nba_api.</p></div>`;
}

async function oddsTool(box, params) {
  const inp = await seasonInputs();
  if (inp.missing) { box.innerHTML = `<p class="muted">No schedule file for ${esc(inp.season)} yet (pipeline/fetch_schedule.py).</p>`; return; }
  const { season, prior, prep, schedule } = inp;
  const played = Math.max(...prep.teams.map((t) => t.gp));
  const names = [...prep.teams].sort((a, b) => a.name.localeCompare(b.name));
  box.innerHTML = `
    <div class="page-head"><div><h1>Playoff odds ${modelBadge("Monte Carlo simulation of the rest of the season")}</h1>
      <p class="sub">${esc(season)} · ${played ? `after ${played} game${played === 1 ? "" : "s"} (most by any team)` : "before the season"} ·
      ${prep.games.length} scheduled games left to simulate · schedule pulled ${esc(schedule.pulled_at_utc)}</p></div></div>
    <div class="card toolbar sim-controls">
      <label>Simulations <select id="po-n"><option value="2000">2,000 (fast)</option><option value="10000" selected>10,000</option><option value="25000">25,000</option></select></label>
      <label>Scenario: make <select id="po-team"><option value="">(no team)</option>${names.map((t) => `<option value="${t.idx ?? prep.teams.indexOf(t)}">${esc(t.name)}</option>`).join("")}</select></label>
      <label class="wi-slider po-slider"><span>better / worse by</span><input type="range" id="po-adj" min="-10" max="10" step="0.5" value="0"><b id="po-adj-v">+0.0</b></label>
      <span class="muted small">points per game vs the model (your own what-if: an injury, a trade, a breakout)</span>
      <button class="btn primary" id="po-run">Run simulation</button>
    </div>
    ${played < 15 ? `<p class="callout">Early season: strengths are still mostly last season's point differential × ${prep.model.carryover}, so these odds will move a lot as real games come in.</p>` : ""}
    <div id="po-out"><p class="muted">Simulating…</p></div>
    ${oddsMethod(prep.model, prior)}`;

  const team = box.querySelector("#po-team"), adj = box.querySelector("#po-adj");
  if (params.get("team")) { const i = prep.teams.findIndex((t) => String(t.id) === params.get("team")); if (i >= 0) team.value = i; }
  adj.addEventListener("input", () => { box.querySelector("#po-adj-v").textContent = sgn(+adj.value); });

  function run() {
    const out = box.querySelector("#po-out");
    out.innerHTML = `<p class="muted">Simulating…</p>`;
    setTimeout(() => {
      const t0 = performance.now();
      const n = +box.querySelector("#po-n").value;
      const adjust = team.value !== "" && +adj.value ? { [team.value]: +adj.value } : {};
      const base = Object.keys(adjust).length ? simulate(prep, { n }) : null;
      const res = simulate(prep, { n, adjust });
      const ms = Math.round(performance.now() - t0);
      const delta = (r, k) => base ? base[r.idx][k] : null;
      const cols = [
        { key: "name", label: "Team", left: true, html: (r) => `<a href="#/team/${r.id}?season=${season}">${esc(r.name)}</a>${adjust[r.idx] ? ` <span class="model-badge">${sgn(adjust[r.idx])}</span>` : ""}` },
        { key: "W", label: "Now", title: "Actual record so far (NBA.com)", html: (r) => `${r.W}-${r.L}` },
        { key: "rating", label: "Strength", title: "Model strength: expected point differential per game vs an average team (before your scenario change)", html: (r) => `<span title="prior ${sgn(r.prior)}, this season ${r.pd == null ? "no games" : sgn(r.pd)}, ±${r.ratingSd.toFixed(1)}">${sgn(r.rating)}</span>` },
        { key: "projW", label: "Proj W", title: "Average wins across all simulations", html: (r) => r.projW.toFixed(1) },
        { key: "w10", label: "80% range", title: "Wins in the middle 80% of simulations (10th to 90th percentile)", html: (r) => `${r.w10}-${r.w90}` },
        { key: "seed1", label: "#1 seed", html: (r) => pctCell(r.seed1) },
        { key: "top6", label: "Top 6", title: "Finish 1-6: straight into the playoffs", html: (r) => pctCell(r.top6) },
        { key: "playin", label: "Play-In", title: "Finish 7-10", html: (r) => pctCell(r.playin) },
        { key: "playoffs", label: "Playoffs", title: "Top 6 or win through the Play-In", html: (r) => pctCell(r.playoffs) + (base ? ` <span class="small ${r.playoffs - delta(r, "playoffs") >= 0 ? "pos" : "neg"}">${sgn(100 * (r.playoffs - delta(r, "playoffs")))}</span>` : "") },
        { key: "r2", label: "2nd rd", title: "Win a first-round series", html: (r) => pctCell(r.r2) },
        { key: "cf", label: "Conf F", title: "Reach the conference finals", html: (r) => pctCell(r.cf) },
        { key: "finals", label: "Finals", html: (r) => pctCell(r.finals) },
        { key: "title", label: "Title", html: (r) => pctCell(r.title, 1) + (base ? ` <span class="small ${r.title - delta(r, "title") >= 0 ? "pos" : "neg"}">${sgn(100 * (r.title - delta(r, "title")))}</span>` : "") },
      ];
      out.innerHTML = `<p class="muted small">${n.toLocaleString()} simulated seasons in ${ms} ms. All percentages are ${modelBadge("")} chances.
        ${base ? "Small colored numbers = change in percentage points from your scenario." : ""}</p>` +
        ["East", "West"].map((c) => `<h2>${c}ern Conference</h2><div id="po-${c}"></div>`).join("");
      for (const c of ["East", "West"]) renderTable(out.querySelector(`#po-${c}`), {
        rows: res.filter((r) => r.conf === c), columns: cols, entity: "teams", sortKey: "projW", pageSize: 15 });
    }, 20);
  }
  box.querySelector("#po-run").addEventListener("click", run);
  run();
}
