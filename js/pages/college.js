// college.js - the College section (NCAA men's Division I): Teams, Players, team pages, player pages.
// Data: Bart Torvik's T-Rank CSVs (barttorvik.com) + ESPN box scores, prepared by pipeline/college_fetch.py.
import { STATS, fmt } from "../stats.js";
import { renderTable, esc, rankOf, percentile, PALETTE, chartTheme } from "../ui.js";
import { CCOLUMNS } from "../college/cstats.js";
import { renderProgramHistory, renderPlayerExtras } from "./college_extras.js";
import { renderCollegeGameLog } from "./college_gamelog.js";
import { renderCollegeWhatIf } from "./college_whatif.js";
import { loadCMeta, CMETA, cload, cseasonFromQuery, currentCSeason, cseasonSelectHTML, seasonInfo, addRecords, careerOf,
  TORVIK_CREDIT, C_QUAL_MIN_PCT, playedSeasons, CSEASONS } from "../college/cdata.js";

const STRING_KEYS = new Set(["CONF", "REC", "CONF_REC", "HOME_REC", "AWAY_REC", "CLASS", "HT", "POS", "TEAM_NAME"]);
export const cTeamLink = (r) => `<a href="#/college/team/${esc(r.TEAM_ID)}">${esc(r.TEAM_NAME)}</a>`;
export const cPlayerLink = (r) => `<a href="#/college/player/${r.PID}">${esc(r.PLAYER_NAME)}</a>`;
// Column definitions: string columns are shown as-is, stat columns are formatted by the stat dictionary.
export const ccol = (key, extra = {}) => STRING_KEYS.has(key)
  ? { key, label: { CONF: "Conf", REC: "W-L", CONF_REC: "Conf W-L", HOME_REC: "Home", AWAY_REC: "Away", CLASS: "Class", HT: "Ht", POS: "Role" }[key] || key, left: true, html: (r) => esc(r[key] ?? "–"), ...extra }
  : { key, ...extra };

// Sub-navigation shared by every College page.
export function collegeNav(active) {
  const items = [["teams", "Teams", "#/college/teams"], ["players", "Players", "#/college/players"], ["conferences", "Conferences", "#/college/conferences"], ["compare", "Compare", "#/college/compare"],
    ["reports", "Reports", "#/college/reports"], ["predictor", "Predictor", "#/college/predictor"],
    ["tournament", "Tournament sim", "#/college/tournament"], ["draft", "2027 Draft", "#/draft"]];
  return `<div class="tabs" style="margin-bottom:12px;flex-wrap:wrap">${items.map(([k, l, h]) =>
    `<a class="tab-link ${k === active ? "active" : ""}" href="${h}">${l}</a>`).join("")}</div>`;
}
const creditLine = () => `<p class="muted small">College data: ${TORVIK_CREDIT} bulk CSV files (ratings, four factors, player stats incl. BPM) and ESPN box scores
  (turnovers, fouls, starts, home/away records) via the free <code>sportsdataverse</code> package. Pulled ${esc(CMETA.pulled_at_utc)}.
  Seasons ${CSEASONS()[CSEASONS().length - 1]} to ${CSEASONS()[0]}.</p>`;

function preseasonCallout(season) {
  const i = seasonInfo(season);
  if (i.preseason) return `<div class="callout"><p>⏳ The ${season} season hasn't started (games begin in early November). These are
    <b>Torvik's preseason ratings/projections</b>, not results: every record is 0-0 and player stats appear once games are played.
    <a href="#/college/teams?season=${playedSeasons()[0]}">See last season (${playedSeasons()[0]}) →</a></p></div>`;
  if (i.in_progress) return `<div class="callout"><p>⚠ ${season} is in progress (up to ${i.max_team_games} games per team), so numbers will move a lot.</p></div>`;
  return "";
}

// ---------------------------------------------------------------- Teams list
const TEAM_MODES = {
  ratings: { label: "Ratings", cols: CCOLUMNS.teamsRatings, sort: "TRANK", asc: true },
  four: { label: "Four Factors", cols: CCOLUMNS.teamsFour, sort: "EFG" },
  basic: { label: "Scoring & Records", cols: CCOLUMNS.teamsBasic, sort: "W_PCT" },
};
const tstate = { mode: "ratings", conf: "" };

export async function collegeTeamsPage(app, query = "") {
  await loadCMeta();
  const season = cseasonFromQuery(query);
  const q = new URLSearchParams(query);
  if (TEAM_MODES[q.get("mode")]) tstate.mode = q.get("mode");
  if (q.has("conf")) tstate.conf = q.get("conf");
  const teams = (await cload("teams", season)).map(addRecords);
  const confs = [...new Set(teams.map((t) => t.CONF))].sort();
  app.innerHTML = `
    ${collegeNav("teams")}
    <div class="page-head"><div><h1>College Teams</h1>
      <p class="sub">NCAA men's Division I · ${season} · ${teams.length} teams · click a column to sort, a team for its page</p></div>
      ${cseasonSelectHTML(season)}</div>
    ${preseasonCallout(season)}
    <div class="toolbar"><div class="tabs">${Object.entries(TEAM_MODES).map(([k, m]) => `<button data-mode="${k}" class="${k === tstate.mode ? "active" : ""}">${m.label}</button>`).join("")}</div>
      <select id="conf"><option value="">All conferences</option>${confs.map((c) => `<option ${c === tstate.conf ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
      <input type="search" id="q" placeholder="Search team…"></div>
    <div id="table"></div>
    <p class="muted small">AdjO / AdjD = points scored / allowed per 100 possessions, adjusted for opponent and venue (vs an average D-I team).
      AdjEM = AdjO − AdjD. Barthag = chance to beat an average D-I team on a neutral floor. Tempo = possessions per 40 minutes.
      WAB = wins above what a bubble team would have against the same schedule. "Opp" columns are what opponents did (defense).</p>
    ${creditLine()}`;
  let search = "";
  const draw = () => {
    const m = TEAM_MODES[tstate.mode];
    const rows = teams.filter((t) => (!tstate.conf || t.CONF === tstate.conf) && t.TEAM_NAME.toLowerCase().includes(search));
    const lead = tstate.mode === "ratings" ? [] : [ccol("CONF"), ccol("REC")];
    renderTable(app.querySelector("#table"), { rows, entity: "teams", sortKey: m.sort, sortAsc: !!m.asc, pageSize: 100,
      columns: [{ key: "TEAM_NAME", label: "Team", left: true, html: cTeamLink }, ...lead, ...m.cols.map((k) => ccol(k))] });
  };
  app.querySelector("#page-season").addEventListener("change", (e) => { location.hash = `#/college/teams?season=${e.target.value}&mode=${tstate.mode}`; });
  app.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => {
    tstate.mode = b.dataset.mode;
    history.replaceState(null, "", `#/college/teams?season=${season}&mode=${tstate.mode}`);
    app.querySelectorAll("[data-mode]").forEach((x) => x.classList.toggle("active", x === b)); draw();
  }));
  app.querySelector("#conf").addEventListener("change", (e) => { tstate.conf = e.target.value; draw(); });
  app.querySelector("#q").addEventListener("input", (e) => { search = e.target.value.toLowerCase(); draw(); });
  draw();
}

// ---------------------------------------------------------------- Players list
const PLAYER_MODES = {
  pergame: { label: "Per Game", cols: CCOLUMNS.playersBasic, sort: "PTS" },
  advanced: { label: "Advanced", cols: CCOLUMNS.playersAdvanced, sort: "BPM" },
  shooting: { label: "Shooting", cols: CCOLUMNS.playersShooting, sort: "TS" },
};
const pstate = { mode: "pergame", conf: "", team: "", cls: "", search: "", minPct: 40 };

export async function collegePlayersPage(app, query = "") {
  await loadCMeta();
  let season = cseasonFromQuery(query);
  const q = new URLSearchParams(query);
  if (PLAYER_MODES[q.get("mode")]) pstate.mode = q.get("mode");
  if (q.has("team")) pstate.team = q.get("team");
  if (q.has("conf")) pstate.conf = q.get("conf");
  const pre = seasonInfo(season).preseason;
  const shownSeason = pre ? playedSeasons()[0] : season;      // preseason -> show last season's players
  const players = await cload("players", shownSeason);
  const confs = [...new Set(players.map((p) => p.CONF))].sort();
  const teams = [...new Map(players.map((p) => [p.TEAM_ID, p.TEAM_NAME])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  app.innerHTML = `
    ${collegeNav("players")}
    <div class="page-head"><div><h1>College Players</h1>
      <p class="sub">NCAA men's Division I · ${shownSeason} · ${players.length.toLocaleString()} players with at least 5% of their team's minutes</p></div>
      ${cseasonSelectHTML(season)}</div>
    ${pre ? `<div class="callout"><p>⏳ ${season} hasn't started yet, so this shows <b>${shownSeason}</b> player stats. ${season} stats appear once games are played (early November).</p></div>` : preseasonCallout(season)}
    <div class="toolbar"><div class="tabs">${Object.entries(PLAYER_MODES).map(([k, m]) => `<button data-mode="${k}" class="${k === pstate.mode ? "active" : ""}">${m.label}</button>`).join("")}</div>
      <input type="search" id="q" placeholder="Search player…" value="${esc(pstate.search)}">
      <select id="conf"><option value="">All conferences</option>${confs.map((c) => `<option ${c === pstate.conf ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
      <select id="team"><option value="">All teams</option>${teams.map(([id, n]) => `<option value="${esc(id)}" ${id === pstate.team ? "selected" : ""}>${esc(n)}</option>`).join("")}</select>
      <select id="cls"><option value="">All classes</option>${["Fr", "So", "Jr", "Sr"].map((c) => `<option ${c === pstate.cls ? "selected" : ""}>${c}</option>`).join("")}</select>
      <label>Min % of team minutes <input type="number" id="minpct" min="0" max="100" value="${pstate.minPct}" style="width:64px"></label>
    </div>
    <div id="table"></div>
    <p class="muted small">Default filter = at least 40% of team minutes (Torvik's own leaderboard default). BPM = Box Plus/Minus (Torvik's college version):
      points per 100 possessions better than an average D-I player. PRPG! = Torvik's points over replacement per adjusted game.
      ORtg here = points produced per 100 possessions used (Dean Oliver). Per-game TOV, PF and GS come from ESPN box scores (regular season).</p>
    ${creditLine()}`;
  const draw = () => {
    const m = PLAYER_MODES[pstate.mode];
    const s = pstate.search.toLowerCase();
    const rows = players.filter((p) => (!s || p.PLAYER_NAME.toLowerCase().includes(s)) && (!pstate.conf || p.CONF === pstate.conf) &&
      (!pstate.team || p.TEAM_ID === pstate.team) && (!pstate.cls || p.CLASS === pstate.cls) && (p.MIN_PCT ?? 0) * 100 >= (pstate.minPct || 0));
    renderTable(app.querySelector("#table"), { rows, entity: "players", sortKey: m.sort, pageSize: 100,
      columns: [{ key: "PLAYER_NAME", label: "Player", left: true, html: cPlayerLink }, { key: "TEAM_NAME", label: "Team", left: true, html: cTeamLink },
        ccol("CLASS"), ccol("HT"), ...m.cols.map((k) => ccol(k))] });
  };
  app.querySelector("#page-season").addEventListener("change", (e) => { location.hash = `#/college/players?season=${e.target.value}&mode=${pstate.mode}`; });
  app.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => {
    pstate.mode = b.dataset.mode;
    history.replaceState(null, "", `#/college/players?season=${season}&mode=${pstate.mode}`);
    app.querySelectorAll("[data-mode]").forEach((x) => x.classList.toggle("active", x === b)); draw();
  }));
  app.querySelector("#q").addEventListener("input", (e) => { pstate.search = e.target.value; draw(); });
  app.querySelector("#conf").addEventListener("change", (e) => { pstate.conf = e.target.value; draw(); });
  app.querySelector("#team").addEventListener("change", (e) => { pstate.team = e.target.value; draw(); });
  app.querySelector("#cls").addEventListener("change", (e) => { pstate.cls = e.target.value; draw(); });
  app.querySelector("#minpct").addEventListener("input", (e) => { pstate.minPct = +e.target.value; draw(); });
  draw();
}

// ---------------------------------------------------------------- one team
const TEAM_CARDS = ["TRANK", "ADJEM", "ADJOE", "ADJDE", "BARTHAG", "ADJT", "SOS", "WAB", "EFG", "EFG_D", "TOVR", "ORB"];
const FOUR = [["eFG%", "EFG", "EFG_D"], ["Turnover %", "TOVR", "TOVR_D"], ["Off. rebound %", "ORB", "ORB_D"], ["Free throw rate", "FTR", "FTR_D"],
  ["3P%", "FG3_PCT", "FG3_PCT_D"], ["2P%", "FG2_PCT", "FG2_PCT_D"], ["3PA rate", "FG3_RATE", "FG3_RATE_D"], ["Assist rate", "ARATE", "ARATE_D"]];

export async function collegeTeamPage(app, id, query = "") {
  await loadCMeta();
  const season = cseasonFromQuery(query);
  const all = (await cload("teams", season)).map(addRecords);
  const t = all.find((x) => x.TEAM_ID === id);
  if (!t) { app.innerHTML = `${collegeNav("teams")}<p>No team “${esc(id)}” in ${season}. <a href="#/college/teams">All teams</a></p>`; return; }
  const n = all.length;
  const rk = (k, row = t) => rankOf(row[k], all.map((x) => x[k]), STATS[k].lowerBetter);
  const cards = TEAM_CARDS.map((k) => {
    const r = k === "TRANK" ? t.TRANK : rk(k);
    return `<div class="card stat-card"><div class="label" title="${esc(STATS[k].name)}">${STATS[k].label}</div>
      <div class="value">${fmt(t[k], k, "teams")}</div><div class="rank ${r <= 25 ? "top" : ""}">${k === "TRANK" ? `of ${n} teams` : `#${r} of ${n}`}</div></div>`;
  }).join("");
  const pre = seasonInfo(season).preseason;
  const conf = all.filter((x) => x.CONF === t.CONF);
  app.innerHTML = `
    ${collegeNav("teams")}
    <div class="page-head"><div><h1>${esc(t.TEAM_NAME)}</h1>
      <p class="sub">${season} · <a href="#/college/conference/${encodeURIComponent(t.CONF)}?season=${season}">${esc(t.CONF)}</a> · ${pre ? "preseason projection" : `${t.REC} (${esc(t.CONF_REC || "–")} conf)`} · T-Rank #${t.TRANK} of ${n}
        ${t.HOME_REC ? ` · home ${t.HOME_REC}, away/neutral ${t.AWAY_REC}` : ""}</p></div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${cseasonSelectHTML(season)}
        <a class="btn" href="#/college/compare?type=teams&ids=${esc(id)}&season=${season}">Compare →</a></div></div>
    ${preseasonCallout(season)}
    <div class="grid stat-cards">${cards}</div>
    <p class="muted small">"#1" always means best (lower is better for AdjD, opponent shooting and turnovers).</p>
    <div class="two-col" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px">
      <div><h2>Four factors: offense vs defense</h2>
        <div class="table-wrap"><table class="data"><thead><tr><th class="left">Factor</th><th>Offense</th><th>Rank</th><th>Defense (opp.)</th><th>Rank</th></tr></thead><tbody>
        ${FOUR.map(([label, o, d]) => `<tr><td class="left">${label}</td><td>${fmt(t[o], o)}</td><td class="muted">#${rk(o)}</td><td>${fmt(t[d], d)}</td><td class="muted">#${rk(d)}</td></tr>`).join("")}
        </tbody></table></div></div>
      <div><h2>${esc(t.CONF)} standings</h2><div id="conf"></div><p class="small"><a href="#/college/conference/${encodeURIComponent(t.CONF)}?season=${season}">Full ${esc(t.CONF)} page: standings, leaders, history →</a></p></div>
    </div>
    <div id="cwhatif"></div>
    <h2>Roster · ${pre ? playedSeasons()[0] + " (last season's team)" : season}</h2>
    <div id="roster"></div>
    <h2>Season by season</h2>
    <div id="hist"><p class="muted small">Loading every season…</p></div>
    <div class="card" style="margin-top:12px"><div class="chart-box"><canvas id="trend"></canvas></div></div>
    <div id="cprogram"></div>
    ${creditLine()}`;
  app.querySelector("#page-season").addEventListener("change", (e) => { location.hash = `#/college/team/${id}?season=${e.target.value}`; });
  renderProgramHistory(app.querySelector("#cprogram"), id, t.TEAM_NAME).catch((e) => console.warn(e));

  renderCollegeWhatIf(app.querySelector("#cwhatif"), t, all, season, pre);
  renderTable(app.querySelector("#conf"), { rows: conf, entity: "teams", sortKey: pre ? "TRANK" : "W_PCT", sortAsc: pre, pageSize: 30,
    columns: [{ key: "TEAM_NAME", label: "Team", left: true, html: cTeamLink }, ccol("CONF_REC"), ccol("REC"), ccol("TRANK"), ccol("ADJEM")] });

  const rosterSeason = pre ? playedSeasons()[0] : season;
  const roster = (await cload("players", rosterSeason)).filter((p) => p.TEAM_ID === id);
  renderTable(app.querySelector("#roster"), { rows: roster, entity: "players", sortKey: "MIN", rank: false,
    columns: [{ key: "PLAYER_NAME", label: "Player", left: true, html: cPlayerLink }, ccol("CLASS"), ccol("HT"), ccol("POS"),
      ...["GP", "MIN", "PTS", "REB", "AST", "STL", "BLK", "TOV", "FG_PCT", "FG3_PCT", "FT_PCT", "TS", "USG", "BPM"].map((k) => ccol(k))] });

  // History: load every season's team file (small) and pick this team.
  const seasons = CSEASONS();
  const hist = (await Promise.all(seasons.map((s) => cload("teams", s).then((rows) => {
    const r = rows.find((x) => x.TEAM_ID === id); return r ? addRecords({ ...r, SEASON: s, N_TEAMS: rows.length }) : null;
  }).catch(() => null)))).filter(Boolean);
  renderTable(app.querySelector("#hist"), { rows: hist, entity: "teams", sortKey: "SEASON", rank: false, pageSize: 40,
    columns: [{ key: "SEASON", label: "Season", left: true, html: (r) => `<a href="#/college/team/${esc(id)}?season=${r.SEASON}">${r.SEASON}</a>` },
      ccol("CONF"), ccol("REC"), ccol("CONF_REC"), ...["TRANK", "ADJEM", "ADJOE", "ADJDE", "BARTHAG", "ADJT", "SOS", "WAB", "EFG", "EFG_D", "TOVR", "ORB"].map((k) => ccol(k))] });
  const pts = hist.filter((h) => !seasonInfo(h.SEASON).preseason).sort((a, b) => a.SEASON.localeCompare(b.SEASON));
  const th = chartTheme();
  new Chart(app.querySelector("#trend"), { type: "line",
    data: { labels: pts.map((h) => h.SEASON), datasets: [["ADJOE", 0], ["ADJDE", 1]].map(([k, i]) => ({ label: STATS[k].label + (k === "ADJDE" ? " (lower = better)" : ""),
      data: pts.map((h) => h[k]), borderColor: PALETTE[i], backgroundColor: PALETTE[i], tension: .25 })) },
    options: { maintainAspectRatio: false, plugins: { legend: { labels: { color: th.text } }, title: { display: true, text: "Adjusted offense and defense by season", color: th.text } },
      scales: { x: { ticks: { color: th.text }, grid: { color: th.grid } }, y: { ticks: { color: th.text }, grid: { color: th.grid } } } } });
}

// ---------------------------------------------------------------- one player
const PLAYER_CARDS = ["PTS", "REB", "AST", "STL", "BLK", "TS", "USG", "FG3_PCT", "FT_PCT", "ORTG", "BPM", "PORPAG"];

export async function collegePlayerPage(app, pid) {
  await loadCMeta();
  pid = Number(pid);
  const career = await careerOf(pid);
  if (!career.length) { app.innerHTML = `${collegeNav("players")}<p>Player not found.</p>`; return; }
  const latest = career[career.length - 1];
  const season = career.some((c) => c.SEASON === currentCSeason()) ? currentCSeason() : latest.SEASON;
  const league = await cload("players", season);
  const p = league.find((x) => x.PID === pid) || latest;
  const pool = league.filter((x) => (x.MIN_PCT ?? 0) >= C_QUAL_MIN_PCT);
  const qual = (p.MIN_PCT ?? 0) >= C_QUAL_MIN_PCT;
  const cards = PLAYER_CARDS.map((k) => {
    const vals = pool.map((x) => x[k]);
    const pc = percentile(p[k], vals, STATS[k].lowerBetter);
    return `<div class="card stat-card"><div class="label" title="${esc(STATS[k].name)}">${STATS[k].label}</div>
      <div class="value">${fmt(p[k], k, "players")}</div>
      <div class="rank ${qual && pc >= 90 ? "top" : ""}">${qual ? `${ordinal(pc)} percentile · #${rankOf(p[k], vals, STATS[k].lowerBetter)}` : "under 40% of minutes: not ranked"}</div></div>`;
  }).join("");
  app.innerHTML = `
    ${collegeNav("players")}
    <div class="page-head"><div><h1>${esc(p.PLAYER_NAME)}</h1>
      <p class="sub">${season} · <a href="#/college/team/${esc(p.TEAM_ID)}?season=${season}">${esc(p.TEAM_NAME)}</a> (${esc(p.CONF)}) ·
        ${esc(p.CLASS || "–")} · ${esc(p.HT || "–")} · ${esc(p.POS || "")} ${p.AGE ? `· age ${p.AGE} on Feb 1` : ""} ${p.HOMETOWN ? `· from ${esc(p.HOMETOWN)}` : ""}<br>
        ${p.GP} games${p.GS != null ? ` (${p.GS} starts)` : ""} · ${fmt(p.MIN, "MIN")} min/game · ${fmt(p.MIN_PCT, "MIN_PCT")}% of team minutes
        ${p.NBA_PICK ? ` · <b>NBA draft pick #${p.NBA_PICK}</b>` : ""}</p></div>
      <a class="btn" href="#/college/compare?type=players&ids=${pid}&season=${season}">Compare →</a></div>
    <div class="grid stat-cards">${cards}</div>
    <p class="muted small">Percentiles and ranks are among the ${pool.length.toLocaleString()} D-I players who played at least 40% of their team's minutes in ${season} (100th = best).</p>
    <div id="cextras"></div>
    <h2>Season by season</h2>
    <div class="toolbar"><div class="tabs"><button data-m="basic" class="active">Per Game</button><button data-m="adv">Advanced</button></div></div>
    <div id="hist"></div>
    ${career.length > 1 ? `<div class="card" style="margin-top:12px"><div class="chart-box"><canvas id="trend"></canvas></div></div>` : ""}
    <div id="cgamelog"></div>
    ${creditLine()}`;
  const drawHist = (m) => renderTable(app.querySelector("#hist"), { rows: career, entity: "players", sortKey: "SEASON", sortAsc: true, rank: false,
    columns: [{ key: "SEASON", label: "Season", left: true }, { key: "TEAM_NAME", label: "Team", left: true, html: (r) => `<a href="#/college/team/${esc(r.TEAM_ID)}?season=${r.SEASON}">${esc(r.TEAM_NAME)}</a>` },
      ccol("CLASS"), ...(m === "adv" ? ["GP", "MIN_PCT", "ORTG", "DRTG", "USG", "EFG", "TS", "ORB_PCT", "DRB_PCT", "AST_PCT", "TOV_PCT", "STL_PCT", "BLK_PCT", "FTR", "PORPAG", "BPM", "OBPM", "DBPM"]
        : ["GP", "GS", "MIN", "PTS", "REB", "AST", "STL", "BLK", "TOV", "FG_PCT", "FG3M", "FG3A", "FG3_PCT", "FTA", "FT_PCT"]).map((k) => ccol(k))] });
  app.querySelectorAll("[data-m]").forEach((b) => b.addEventListener("click", () => {
    app.querySelectorAll("[data-m]").forEach((x) => x.classList.toggle("active", x === b)); drawHist(b.dataset.m); }));
  drawHist("basic");
  renderPlayerExtras(app.querySelector("#cextras"), pid, career).catch((e) => console.warn(e));
  renderCollegeGameLog(app.querySelector("#cgamelog"), pid, career.map((c) => c.SEASON)).catch((e) => console.warn(e));
  if (career.length > 1) {
    const th = chartTheme();
    new Chart(app.querySelector("#trend"), { type: "line",
      data: { labels: career.map((c) => c.SEASON), datasets: [["PTS", 0], ["REB", 1], ["AST", 2], ["BPM", 3]].map(([k, i]) => ({ label: STATS[k].name, data: career.map((c) => c[k]), borderColor: PALETTE[i], backgroundColor: PALETTE[i], tension: .25 })) },
      options: { maintainAspectRatio: false, plugins: { legend: { labels: { color: th.text } }, title: { display: true, text: "By season", color: th.text } },
        scales: { x: { ticks: { color: th.text }, grid: { color: th.grid } }, y: { ticks: { color: th.text }, grid: { color: th.grid } } } } });
  }
}
export const ordinal = (n) => { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
