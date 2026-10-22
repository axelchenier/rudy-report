// tools.js - the Tools page: scenario tools that apply real data to "what happens if" questions.
//   #/tools/odds     Playoff Odds simulator (Monte Carlo over the real remaining schedule)  - MODEL ESTIMATE
//   #/tools/similar  Player similarity finder (js/pages/similar.js)
//   #/tools/lineup   Lineup builder (js/pages/builder.js)
//   #/tools/lottery  2027 Draft Lottery simulator: the NBA's official 3-2-1 rules (js/lottery.js) on simulated final standings
// Data: NBA.com/stats (standings, team stats, game logs) and NBA.com's schedule (ScheduleLeagueV2), saved by the pipeline.
import { load, META, completeSeasons } from "../data.js";
import { renderTable, esc, modelBadge } from "../ui.js";
import { prepare, simulate, rng } from "../sim.js";
import { similarTool } from "./similar.js";
import { builderTool } from "./builder.js";
import { draw, entriesFrom, checkOdds, GROUPS, OFFICIAL, LOTTERY_SOURCES, FLOOR } from "../lottery.js";

const TOOLS = [
  ["odds", "Playoff odds", "Simulate the rest of the season 10,000 times: playoff, Play-In, seed and title chances. Nudge any team up or down to test a scenario."],
  ["similar", "Similar players", "Find the player-seasons (1996-97 to now) whose stat profile is closest to any player's, era-adjusted."],
  ["lineup", "Lineup builder", "Pick any five from a roster: their real NBA.com results together, a pair-based net rating estimate, and lineup traits."],
  ["lottery", "Draft lottery", "The new 3-2-1 Lottery (official NBA rules for 2027): every team's chances at each pick, plus draw the lottery yourself."],
];

export async function toolsPage(app, tool = "", query = "") {
  const tabs = `<nav class="page-tabs">${TOOLS.map(([k, l]) => `<a href="#/tools/${k}" class="${k === tool ? "active" : ""}">${esc(l)}</a>`).join("")}</nav>`;
  if (!tool) {
    app.innerHTML = `<div class="page-head"><div><h1>Tools</h1><p class="sub">Apply real data to scenarios. Every output is labeled ${modelBadge("")} and explains its method.</p></div></div>
      <div class="grid tool-cards">${TOOLS.map(([k, l, d]) => `<a class="card tool-card" href="#/tools/${k}"><h3>${esc(l)}</h3><p class="muted small">${esc(d)}</p></a>`).join("")}</div>`;
    return;
  }
  const page = { odds: oddsTool, lottery: lotteryTool, similar: similarTool, lineup: builderTool }[tool];
  if (!page) { app.innerHTML = `${tabs}<p class="muted">Unknown tool.</p>`; return; }
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

// ---------------------------------------------------------------- Draft lottery
const sourcesHTML = () => LOTTERY_SOURCES.map(([t, u]) => `<a href="${u}" target="_blank" rel="noopener">${esc(t)}</a>`).join(" · ");

async function lotteryTool(box) {
  const inp = await seasonInputs();
  if (inp.missing) { box.innerHTML = `<p class="muted">No schedule file for ${esc(inp.season)} yet.</p>`; return; }
  const { season, prior, prep } = inp;
  const draftYear = +season.slice(0, 4) + 1;
  const T = prep.teams.length;
  box.innerHTML = `
    <div class="page-head"><div><h1>${draftYear} Draft lottery</h1>
      <p class="sub">The NBA's new <b>3-2-1 Lottery</b> (official rules, approved May 28, 2026, for the 2027-2029 Drafts) applied to
      ${modelBadge("")} simulated ${esc(season)} final standings.</p></div></div>
    <div class="card"><h3>The rules</h3>
      <div class="table-wrap"><table class="data"><thead><tr><th class="left">Group</th><th>Teams</th><th>Balls each</th><th>Chance at #1</th><th>Worst pick</th></tr></thead><tbody>
      ${GROUPS.map((g) => `<tr><td class="left">${esc(g.label)}</td><td>${g.teams}</td><td>${g.balls}</td><td>${(100 * g.balls / 37).toFixed(1)}%</td><td>${g.key === "relegated" ? FLOOR : 16}</td></tr>`).join("")}
      </tbody></table></div>
      <p class="small muted">37 balls in total; picks 1-16 are all drawn. Relegated teams can't fall below No. ${FLOOR}. Picks 17-30 go to the other 14 teams in inverse order of record.
        Not modeled: the new pick restrictions (no #1 pick two years running, no top-5 pick three years running) and the league's new power to change a tanking team's odds.
        Sources: ${sourcesHTML()}</p></div>
    <div class="card toolbar sim-controls"><label>Simulated seasons <select id="lt-n"><option value="2000">2,000</option><option value="10000" selected>10,000</option></select></label>
      <button class="btn primary" id="lt-run">Re-run</button><button class="btn" id="lt-draw">🎱 Draw the lottery once</button>
      <span class="muted small">"Draw once" uses one simulated final standings and one drawing.</span></div>
    <div id="lt-once"></div>
    <h2>Every team's pick odds ${modelBadge("Season simulation + official lottery rules")}</h2>
    <div id="lt-out"><p class="muted">Simulating…</p></div>
    <div class="card method"><b>Check: does this simulator match the NBA's own numbers?</b>
      <p class="small">200,000 drawings with the standard 16-team field, next to the illustrative odds in the NBA's fact sheet:</p><div id="lt-check"></div></div>
    <div class="card method"><b>${modelBadge("")} How it works.</b><p class="small">Each simulated season comes from the Playoff Odds model
      (<a href="#/tools/odds">method</a>: strengths from ${esc(prior)} and ${esc(season)} point differential, NBA.com's remaining schedule, real Play-In format).
      Its final standings put every team in a lottery group (three worst records league-wide among non-Play-In teams = relegated; ties by coin flip),
      then the drawing follows the official rules above. Odds = how often each pick happened.</p></div>`;

  function run() {
    const out = box.querySelector("#lt-out");
    out.innerHTML = `<p class="muted">Simulating…</p>`;
    setTimeout(() => {
      const n = +box.querySelector("#lt-n").value, R = rng(99);
      const pick = prep.teams.map(() => new Array(30).fill(0)), group = prep.teams.map(() => ({}));
      const res = simulate(prep, { n, onSeason: ({ wins, seeds, playIn }) => {
        const entries = entriesFrom(wins, seeds, playIn, R);
        const order = draw(entries, R);
        entries.forEach((e) => { group[e.id][e.group] = (group[e.id][e.group] || 0) + 1; });
        const inLot = new Set(order);
        const rest = [...Array(T).keys()].filter((i) => !inLot.has(i)).map((i) => [i, wins[i] + R() * 0.1]).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
        [...order, ...rest].forEach((i, k) => pick[i][k]++);
      } });
      const rows = res.map((r) => {
        const d = pick[r.idx].map((c) => c / n), cum = (k) => d.slice(0, k).reduce((a, b) => a + b, 0);
        const g = Object.entries(group[r.idx]).sort((a, b) => b[1] - a[1])[0];
        return { ...r, d, lottery: cum(16), p1: d[0], top3: cum(3), top5: cum(5), avgPick: d.reduce((a, p, k) => a + p * (k + 1), 0),
          likelyGroup: g ? GROUPS.find((x) => x.key === g[0]).label : "Playoff team (7-vs-8 winner or top 6)" };
      });
      const heat = (r) => `<span class="pick-heat">${r.d.slice(0, 16).map((p, k) => `<i title="Pick ${k + 1}: ${pc(p, 1)}%" style="opacity:${Math.min(1, 0.08 + p * 4)}"></i>`).join("")}</span>`;
      renderTable(out, { rows, entity: "teams", sortKey: "avgPick", sortAsc: true, pageSize: 30, columns: [
        { key: "name", label: "Team", left: true, html: (r) => `<a href="#/team/${r.id}?season=${season}">${esc(r.name)}</a>` },
        { key: "projW", label: "Proj W", html: (r) => r.projW.toFixed(1) },
        { key: "lottery", label: "In lottery", title: "Gets one of the 16 lottery spots", html: (r) => pctCell(r.lottery) },
        { key: "p1", label: "#1 pick", html: (r) => pctCell(r.p1, 1) },
        { key: "top3", label: "Top 3", html: (r) => pctCell(r.top3) },
        { key: "top5", label: "Top 5", html: (r) => pctCell(r.top5) },
        { key: "avgPick", label: "Avg pick", title: "Average draft position (1-30) across simulations", html: (r) => r.avgPick.toFixed(1) },
        { key: "d", label: "Picks 1 → 16", title: "Darker = more likely", html: heat },
        { key: "likelyGroup", label: "Most likely group", left: true, html: (r) => `<span class="small">${esc(r.likelyGroup)}</span>` },
      ] });
      out.insertAdjacentHTML("afterbegin", `<p class="muted small">${n.toLocaleString()} simulated seasons, one drawing each. Sorted by average pick.</p>`);
    }, 20);
  }

  function drawOnce() {
    const R = rng((Math.random() * 2 ** 31) | 0);
    let result;
    simulate(prep, { n: 1, seed: (R() * 2 ** 31) | 0, onSeason: ({ wins, seeds, playIn }) => {
      const entries = entriesFrom(wins, seeds, playIn, R);
      const order = draw(entries, R);
      const byId = new Map(entries.map((e) => [e.id, e]));
      const worstFirst = [...entries].sort((a, b) => wins[a.id] - wins[b.id]);
      result = order.map((i, k) => ({ pick: k + 1, t: prep.teams[i], e: byId.get(i), w: wins[i], move: worstFirst.indexOf(byId.get(i)) + 1 - (k + 1) }));
    } });
    box.querySelector("#lt-once").innerHTML = `<div class="card"><h3>One simulated ${draftYear} lottery ${modelBadge("")}</h3>
      <div class="table-wrap"><table class="data"><thead><tr><th>Pick</th><th class="left">Team</th><th>Sim. record</th><th>Balls</th><th class="left">Group</th><th title="Spots moved vs. worst-record order">Move</th></tr></thead><tbody>
      ${result.map((x) => `<tr><td>${x.pick}</td><td class="left">${esc(x.t.name)}</td><td>${x.w}-${82 - x.w}</td><td>${x.e.balls}</td><td class="left small">${esc(GROUPS.find((g) => g.key === x.e.group).label)}</td>
        <td class="${x.move > 0 ? "pos" : x.move < 0 ? "neg" : ""}">${x.move > 0 ? "▲" + x.move : x.move < 0 ? "▼" + -x.move : "–"}</td></tr>`).join("")}</tbody></table></div>
      <p class="muted small">Records here are one simulated outcome, not a prediction. Press the button again for another season and drawing.</p></div>`;
  }

  const check = checkOdds(200000, rng(7));
  box.querySelector("#lt-check").innerHTML = `<div class="table-wrap"><table class="data"><thead><tr><th class="left">Group</th>${["#1", "Top 3", "Top 5", "Top 10", "Avg pick"].map((h) => `<th>${h} (sim / NBA)</th>`).join("")}</tr></thead><tbody>
    ${check.map((g) => { const o = OFFICIAL[g.key]; return `<tr><td class="left">${esc(g.label)}</td><td>${g.p1.toFixed(1)}% / ${o.p1}%</td><td>${g.top3.toFixed(0)}% / ${o.top3}%</td>
      <td>${g.top5.toFixed(0)}% / ${o.top5}%</td><td>${g.top10.toFixed(0)}% / ${o.top10}%</td><td>${g.avg.toFixed(1)} / ${o.avg}</td></tr>`; }).join("")}</tbody></table></div>`;
  box.querySelector("#lt-run").addEventListener("click", run);
  box.querySelector("#lt-draw").addEventListener("click", drawOnce);
  run();
}
