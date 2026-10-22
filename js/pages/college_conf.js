// college_conf.js - College conference pages: all conferences compared (#/college/conferences) and one conference
// (#/college/conference/<code>): standings, ratings, player leaders, NCAA tournament results, and season-by-season history.
// Data: Bart Torvik T-Rank CSVs + ESPN box scores (data/college/), real brackets from ESPN (data/college/brackets/).
import { STATS, fmt } from "../stats.js";
import { renderTable, esc, chartTheme, PALETTE, ordinal } from "../ui.js";
import { collegeNav, cTeamLink, cPlayerLink, ccol } from "./college.js";
import { loadCMeta, CMETA, cload, cseasonFromQuery, cseasonSelectHTML, seasonInfo, addRecords, TORVIK_CREDIT, C_QUAL_MIN_PCT, playedSeasons, CSEASONS } from "../college/cdata.js";

// Torvik's conference codes -> names (codes we aren't sure about are shown as-is).
export const CONF_NAMES = { A10: "Atlantic 10", ACC: "Atlantic Coast (ACC)", AE: "America East", ASun: "ASUN", Amer: "American Athletic (AAC)",
  B10: "Big Ten", B12: "Big 12", BE: "Big East", BSky: "Big Sky", BSth: "Big South", BW: "Big West", CAA: "Coastal Athletic (CAA)",
  CUSA: "Conference USA", Horz: "Horizon League", Ivy: "Ivy League", MAAC: "Metro Atlantic (MAAC)", Metro: "Metro Atlantic (MAAC)", MAC: "Mid-American (MAC)",
  MEAC: "Mid-Eastern (MEAC)", MVC: "Missouri Valley", MWC: "Mountain West", NEC: "Northeast (NEC)", OVC: "Ohio Valley", P10: "Pac-10", P12: "Pac-12",
  Pat: "Patriot League", SB: "Sun Belt", SC: "Southern (SoCon)", SEC: "Southeastern (SEC)", SWAC: "Southwestern (SWAC)", Slnd: "Southland",
  Sum: "Summit League", WAC: "Western Athletic (WAC)", WCC: "West Coast (WCC)", GWC: "Great West", ind: "Independents" };
export const confName = (c) => CONF_NAMES[c] || c;
export const confLink = (c, season) => `<a href="#/college/conference/${encodeURIComponent(c)}${season ? `?season=${season}` : ""}">${esc(c)}</a>`;
const ROUND_NAME = ["Lost in Round of 64", "Lost in Round of 32", "Lost in Sweet 16", "Lost in Elite 8", "Lost in Final Four", "Lost in title game", "National champion"];
const SHORT = ["R64", "R32", "S16", "E8", "F4", "Final", "Champion"];
const winPct = (rec) => { const m = String(rec || "").match(/^(\d+)-(\d+)$/); return m && +m[1] + +m[2] ? +m[1] / (+m[1] + +m[2]) : null; };
const avg = (rows, k) => { const v = rows.map((r) => r[k]).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const sgn = (v, d = 1) => v == null ? "–" : (v > 0 ? "+" : "") + v.toFixed(d);
const cache = new Map();
const getJSON = (p) => { if (!cache.has(p)) cache.set(p, fetch(p).then((r) => (r.ok ? r.json() : null)).catch(() => null)); return cache.get(p); };
const yearOf = (season) => 2000 + +season.slice(5);

async function bracketFor(season) {
  const idx = await getJSON("data/college/brackets/index.json");
  return idx?.years?.includes(yearOf(season)) ? getJSON(`data/college/brackets/${yearOf(season)}.json`) : null;
}

// One summary row per conference for a season.
function summarize(teams, bracket) {
  const ncaa = bracket ? Object.fromEntries(bracket.teams.map((t) => [t.team_id, t])) : null;
  const by = new Map();
  for (const t of teams) { if (!by.has(t.CONF)) by.set(t.CONF, []); by.get(t.CONF).push(t); }
  const rows = [...by].map(([conf, list]) => {
    const best = [...list].sort((a, b) => a.TRANK - b.TRANK)[0];
    const bids = ncaa ? list.filter((t) => ncaa[t.TEAM_ID]) : [];
    const bestRun = bids.length ? Math.max(...bids.map((t) => ncaa[t.TEAM_ID].wins)) : null;
    const reg = [...list].filter((t) => winPct(t.CONF_REC) != null).sort((a, b) => winPct(b.CONF_REC) - winPct(a.CONF_REC) || a.TRANK - b.TRANK)[0];
    return { CONF: conf, NAME: confName(conf), N: list.length, AVG_EM: avg(list, "ADJEM"), AVG_O: avg(list, "ADJOE"), AVG_D: avg(list, "ADJDE"), AVG_T: avg(list, "ADJT"),
      TOP_EM: avg([...list].sort((a, b) => b.ADJEM - a.ADJEM).slice(0, 4), "ADJEM"), BEST: best, REG: reg,
      BIDS: ncaa ? bids.length : null, WINS: ncaa ? bids.reduce((s, t) => s + ncaa[t.TEAM_ID].wins, 0) : null, BEST_RUN: bestRun,
      BEST_RUN_TEAM: bestRun != null ? bids.find((t) => ncaa[t.TEAM_ID].wins === bestRun) : null };
  }).filter((r) => r.CONF && !/^ind/i.test(r.CONF));
  [...rows].sort((a, b) => b.AVG_EM - a.AVG_EM).forEach((r, i) => { r.RANK = i + 1; });
  return rows;
}

// ---------------------------------------------------------------- all conferences
export async function collegeConferencesPage(app, query = "") {
  await loadCMeta();
  const season = cseasonFromQuery(query);
  const teams = (await cload("teams", season)).map(addRecords);
  const bracket = await bracketFor(season);
  const rows = summarize(teams, bracket);
  app.innerHTML = `${collegeNav("conferences")}
    <div class="page-head"><div><h1>College Conferences</h1>
      <p class="sub">NCAA men's Division I · ${season}${seasonInfo(season).preseason ? " (preseason ratings)" : ""} · ${rows.length} conferences, ranked by average adjusted efficiency margin</p></div>
      ${cseasonSelectHTML(season)}</div>
    <div id="conf-table"></div>
    <div class="card" style="margin-top:12px"><div class="chart-box" style="height:${Math.max(320, rows.length * 16)}px"><canvas id="conf-chart"></canvas></div></div>
    <p class="muted small">Average AdjEM = the conference's average adjusted efficiency margin (points per 100 possessions better than an average D-I team).
      "Top-4 AdjEM" averages only its best four teams (how strong the top is). ${bracket ? `NCAA bids and wins: the real ${yearOf(season)} tournament (ESPN), First Four not counted.` : ""}
      Ratings: ${TORVIK_CREDIT}.</p>`;
  app.querySelector("#page-season").addEventListener("change", (e) => { location.hash = `#/college/conferences?season=${e.target.value}`; });
  renderTable(app.querySelector("#conf-table"), { rows, entity: "teams", sortKey: "AVG_EM", rank: false, pageSize: 40, columns: [
    { key: "RANK", label: "Rank", html: (r) => r.RANK },
    { key: "CONF", label: "Conf", left: true, html: (r) => confLink(r.CONF, season) },
    { key: "NAME", label: "Name", left: true, html: (r) => esc(r.NAME) },
    { key: "N", label: "Teams", html: (r) => r.N },
    { key: "AVG_EM", label: "Avg AdjEM", html: (r) => sgn(r.AVG_EM) },
    { key: "TOP_EM", label: "Top-4 AdjEM", html: (r) => sgn(r.TOP_EM) },
    { key: "AVG_O", label: "Avg AdjO", html: (r) => r.AVG_O.toFixed(1) },
    { key: "AVG_D", label: "Avg AdjD", html: (r) => r.AVG_D.toFixed(1) },
    { key: "AVG_T", label: "Avg tempo", html: (r) => r.AVG_T == null ? "–" : r.AVG_T.toFixed(1) },
    { key: "BEST", label: "Best team (T-Rank)", left: true, html: (r) => `${cTeamLink(r.BEST)} <span class="muted">#${r.BEST.TRANK}</span>` },
    ...(bracket ? [{ key: "BIDS", label: "NCAA bids", html: (r) => r.BIDS }, { key: "WINS", label: "NCAA wins", html: (r) => r.WINS },
      { key: "BEST_RUN", label: "Best run", left: true, html: (r) => r.BEST_RUN == null ? "–" : `${SHORT[r.BEST_RUN]} (${esc(r.BEST_RUN_TEAM.TEAM_NAME)})` }] : []),
  ] });
  const sorted = [...rows].sort((a, b) => b.AVG_EM - a.AVG_EM), th = chartTheme();
  new Chart(app.querySelector("#conf-chart"), { type: "bar",
    data: { labels: sorted.map((r) => r.CONF), datasets: [{ label: "Average AdjEM", data: sorted.map((r) => +r.AVG_EM.toFixed(2)), backgroundColor: sorted.map((r) => r.AVG_EM >= 0 ? PALETTE[0] : PALETTE[1]) }] },
    options: { indexAxis: "y", maintainAspectRatio: false, plugins: { legend: { display: false }, title: { display: true, text: `Average adjusted efficiency margin by conference, ${season}`, color: th.text } },
      scales: { x: { ticks: { color: th.text }, grid: { color: th.grid } }, y: { ticks: { color: th.text, autoSkip: false }, grid: { display: false } } } } });
}

// ---------------------------------------------------------------- one conference
const LEADERS = [["PTS", "Points"], ["REB", "Rebounds"], ["AST", "Assists"], ["BPM", "Box Plus/Minus"], ["TS", "True shooting %", (p) => (p.FGA_TOT ?? 0) >= 150], ["STL", "Steals"], ["BLK", "Blocks"], ["FG3_PCT", "3-point %", (p) => (p.FG3A_TOT ?? 0) >= 60]];

export async function collegeConferencePage(app, conf, query = "") {
  await loadCMeta();
  conf = decodeURIComponent(conf);
  const season = cseasonFromQuery(query);
  const teams = (await cload("teams", season)).map(addRecords);
  const list = teams.filter((t) => t.CONF === conf);
  const head = `${collegeNav("conferences")}`;
  if (!list.length) {
    app.innerHTML = `${head}<h1>${esc(confName(conf))}</h1><p class="muted">No ${esc(conf)} teams in ${season} (conferences change over time).
      <a href="#/college/conferences?season=${season}">All ${season} conferences →</a></p>`;
    return;
  }
  const pre = seasonInfo(season).preseason;
  const bracket = await bracketFor(season);
  const sums = summarize(teams, bracket), me = sums.find((r) => r.CONF === conf);
  const ncaa = bracket ? Object.fromEntries(bracket.teams.map((t) => [t.team_id, t])) : {};
  for (const t of list) { t.CONF_PCT = winPct(t.CONF_REC); t.NCAA = ncaa[t.TEAM_ID] || null; }
  app.innerHTML = `${head}
    <div class="page-head"><div><h1>${esc(confName(conf))}</h1>
      <p class="sub">${esc(conf)} · ${season}${pre ? " (preseason ratings)" : ""} · ${list.length} teams · #${me.RANK} of ${sums.length} conferences by average AdjEM ·
        <a href="#/college/conferences?season=${season}">all conferences</a></p></div>
      ${cseasonSelectHTML(season)}</div>
    ${pre ? `<div class="callout"><p>⏳ ${season} hasn't started: ratings are Torvik's preseason projections and records are 0-0. Player leaders are from ${playedSeasons()[0]}.</p></div>` : ""}
    <div class="grid stat-cards" style="grid-template-columns:repeat(auto-fill,minmax(170px,1fr))">
      <div class="card stat-card"><div class="label">Average AdjEM</div><div class="value">${sgn(me.AVG_EM)}</div><div class="rank ${me.RANK <= 5 ? "top" : ""}">#${me.RANK} of ${sums.length} conferences</div></div>
      <div class="card stat-card"><div class="label">Best team</div><div class="value" style="font-size:20px">${cTeamLink(me.BEST)}</div><div class="rank">T-Rank #${me.BEST.TRANK} · AdjEM ${sgn(me.BEST.ADJEM)}</div></div>
      ${me.REG && !pre ? `<div class="card stat-card"><div class="label">Best conference record</div><div class="value" style="font-size:20px">${cTeamLink(me.REG)}</div><div class="rank">${esc(me.REG.CONF_REC)} in conference</div></div>` : ""}
      <div class="card stat-card"><div class="label">Avg offense / defense</div><div class="value" style="font-size:22px">${me.AVG_O.toFixed(1)} / ${me.AVG_D.toFixed(1)}</div><div class="rank">points per 100 possessions (adjusted)</div></div>
      ${bracket ? `<div class="card stat-card"><div class="label">${yearOf(season)} NCAA tournament</div><div class="value">${me.BIDS} bid${me.BIDS === 1 ? "" : "s"}</div>
        <div class="rank">${me.WINS} win${me.WINS === 1 ? "" : "s"}${me.BEST_RUN != null ? ` · best: ${esc(me.BEST_RUN_TEAM.TEAM_NAME)} (${SHORT[me.BEST_RUN]})` : ""}</div></div>` : ""}
    </div>
    <h2>Standings</h2><div id="standings"></div>
    <p class="muted small">${pre ? "Sorted by T-Rank; projected records are Torvik's." : "Sorted by conference winning percentage (ties: T-Rank)."} AdjO/AdjD = points scored/allowed per 100 possessions against an average D-I opponent; WAB = wins above bubble.</p>
    <h2>Player leaders · ${pre ? playedSeasons()[0] : season}</h2>
    <div id="leaders" class="grid" style="grid-template-columns:repeat(auto-fill,minmax(230px,1fr))"></div>
    <p class="muted small">Players need at least 40% of their team's minutes (Torvik's default); TS% needs 150 shots and 3P% needs 60 three-point attempts.</p>
    <h2>Season by season</h2><div id="hist"><p class="muted small">Loading every season…</p></div>
    <p class="muted small">Data: ${TORVIK_CREDIT} and ESPN box scores; NCAA tournament fields and results from ESPN's scoreboard.</p>`;
  app.querySelector("#page-season").addEventListener("change", (e) => { location.hash = `#/college/conference/${encodeURIComponent(conf)}?season=${e.target.value}`; });

  const rows = [...list].sort((a, b) => pre ? a.TRANK - b.TRANK : (b.CONF_PCT ?? -1) - (a.CONF_PCT ?? -1) || a.TRANK - b.TRANK);
  rows.forEach((r, i) => { r.POS = i + 1; });
  renderTable(app.querySelector("#standings"), { rows, entity: "teams", sortKey: "POS", sortAsc: true, rank: false, pageSize: 30, columns: [
    { key: "POS", label: "#", html: (r) => r.POS },
    { key: "TEAM_NAME", label: "Team", left: true, html: cTeamLink },
    ...(pre ? [{ key: "PROJ_W", label: "Proj. W-L", left: true, html: (r) => r.PROJ_W == null ? "–" : `${r.PROJ_W.toFixed(1)}-${r.PROJ_L.toFixed(1)}` }]
      : [ccol("CONF_REC"), { key: "CONF_PCT", label: "Conf %", html: (r) => r.CONF_PCT == null ? "–" : r.CONF_PCT.toFixed(3).replace(/^0/, "") }, ccol("REC")]),
    ...["TRANK", "ADJEM", "ADJOE", "ADJDE", "ADJT", ...(pre ? [] : ["SOS", "WAB"])].map((k) => ccol(k)),
    ...(bracket ? [{ key: "NCAA", label: "NCAA", left: true, title: `${yearOf(season)} NCAA tournament`, html: (r) => r.NCAA ? `${r.NCAA.seed}-seed · ${SHORT[r.NCAA.wins]}` : "–" }] : []),
  ] });

  const lSeason = pre ? playedSeasons()[0] : season;
  const players = (await cload("players", lSeason)).filter((p) => p.CONF === conf && (p.MIN_PCT ?? 0) >= C_QUAL_MIN_PCT);
  app.querySelector("#leaders").innerHTML = players.length ? LEADERS.map(([k, label, ok]) => {
    const top = players.filter((p) => p[k] != null && (!ok || ok(p))).sort((a, b) => b[k] - a[k]).slice(0, 5);
    return `<div class="card"><h3 style="margin-top:0">${esc(label)}</h3><table class="data"><tbody>${top.map((p, i) =>
      `<tr><td class="rk">${i + 1}</td><td class="left">${cPlayerLink(p)}<div class="muted small">${esc(p.TEAM_NAME)}</div></td><td>${fmt(p[k], k, "players")}${STATS[k]?.fmt === "pct" ? "%" : ""}</td></tr>`).join("")}</tbody></table></div>`;
  }).join("") : `<p class="muted">No ${esc(conf)} player stats for ${lSeason}.</p>`;

  // History: every season's team file (small), this conference's summary each year.
  const hist = (await Promise.all(CSEASONS().map(async (s) => {
    const ts = (await cload("teams", s).catch(() => [])).map(addRecords);
    if (!ts.some((t) => t.CONF === conf)) return null;
    const r = summarize(ts, await bracketFor(s)).find((x) => x.CONF === conf);
    return r ? { ...r, SEASON: s, OF: summarize(ts, null).length } : null;
  }))).filter(Boolean);
  renderTable(app.querySelector("#hist"), { rows: hist, entity: "teams", sortKey: "SEASON", rank: false, pageSize: 40, columns: [
    { key: "SEASON", label: "Season", left: true, html: (r) => `<a href="#/college/conference/${encodeURIComponent(conf)}?season=${r.SEASON}">${r.SEASON}</a>${seasonInfo(r.SEASON).preseason ? " <span class='muted'>(pre)</span>" : ""}` },
    { key: "N", label: "Teams", html: (r) => r.N },
    { key: "RANK", label: "Conf rank", html: (r) => `${r.RANK} <span class="muted">of ${r.OF}</span>` },
    { key: "AVG_EM", label: "Avg AdjEM", html: (r) => sgn(r.AVG_EM) },
    { key: "BEST", label: "Best team (T-Rank)", left: true, html: (r) => `<a href="#/college/team/${esc(r.BEST.TEAM_ID)}?season=${r.SEASON}">${esc(r.BEST.TEAM_NAME)}</a> <span class="muted">#${r.BEST.TRANK}</span>` },
    { key: "REG", label: "Best conf record", left: true, html: (r) => r.REG && !seasonInfo(r.SEASON).preseason ? `${esc(r.REG.TEAM_NAME)} <span class="muted">${esc(r.REG.CONF_REC)}</span>` : "–" },
    { key: "BIDS", label: "NCAA bids", html: (r) => r.BIDS ?? "–" },
    { key: "WINS", label: "NCAA wins", html: (r) => r.WINS ?? "–" },
    { key: "BEST_RUN", label: "Best NCAA run", left: true, html: (r) => r.BEST_RUN == null ? "–" : `${ROUND_NAME[r.BEST_RUN].replace("Lost in ", "")} · ${esc(r.BEST_RUN_TEAM.TEAM_NAME)}` },
  ] });
}
