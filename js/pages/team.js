// team.js - one team's page, in three tabs (each with a shareable address):
import { starButton } from "../saved.js";
//   Overview          record, stat cards with percentile chips + league averages, percentile profile, roster, season history
//   Game log & splits every game: score, margin, per-game ratings, rolling 5/10-game averages, splits
//   Clutch · Hustle   the team's numbers in those NBA.com datasets
import { load, loadAllSeasons, currentSeason, SEASONS, seasonGames , dataStatus, META } from "../data.js";
import { COLUMNS, fmt } from "../stats.js";
import { renderTable, esc, rankOf, playerLink } from "../ui.js";
import { statCard, profileHTML, tabBar, renderGameLog } from "./shared.js";
import { renderShotChart } from "./shotview.js";
import { renderPlayTypes } from "./playtypeview.js";
import { renderWhatIf } from "./whatif.js";
import { renderTeamLineups } from "./lineups.js";
import { teamLog } from "../gamelog.js";
import { HUBS, hubRows, existsFor, FIRST_SEASON } from "../hubs.js";

const CARD_STATS = ["W_PCT", "OFF_RATING", "DEF_RATING", "NET_RATING", "PACE", "PTS", "FG3A_PER100", "FG3_PCT", "TS_PCT", "TM_TOV_PCT"];
const PROFILE = [
  ["Offense", ["PTS", "OFF_RATING", "EFG_PCT", "TS_PCT", "FG3A_PER100", "FG3A_RATE", "FG3_PCT", "FT_PCT", "AST_PCT", "TM_TOV_PCT", "OREB_PCT"]],
  ["Defense & rebounding", ["DEF_RATING", "DREB_PCT", "REB_PCT", "STL", "BLK"]],
  ["Overall", ["W_PCT", "NET_RATING", "PLUS_MINUS", "PACE", "PIE"]],
];

export async function teamPage(app, id, query = "") {
  id = Number(id);
  const params = new URLSearchParams(query);
  const tab = params.get("tab") || "overview";
  const season = SEASONS().includes(params.get("season")) ? params.get("season") : currentSeason();
  const all = await load("teams", season);
  const t = all.find((x) => x.TEAM_ID === id);
  if (!t) { app.innerHTML = `<p>Team not found in ${season}.</p>`; return; }
  const base = `#/team/${id}`;

  app.innerHTML = `
    <div class="page-head">
      <div><h1>${esc(t.TEAM_NAME)} ${starButton({ type: "team", id, name: t.TEAM_NAME, link: `#/team/${id}` })}</h1>
        <p class="sub">${season} · ${t.W}-${t.L} · net rating ${fmt(t.NET_RATING, "NET_RATING")} (#${rankOf(t.NET_RATING, all.map((x) => x.NET_RATING))} of ${all.length})
          · <a href="#/standings?season=${season}">standings</a></p></div>
      <div class="head-tools"><label class="page-season">Season <select id="tm-season">${SEASONS().map((s) =>
        `<option ${s === season ? "selected" : ""}>${s}</option>`).join("")}</select></label>
        <a class="btn" href="#/compare?type=teams&ids=${id}">Compare →</a></div>
    </div>
    ${tabBar(base, [["overview", "Overview"], ["gamelog", "Game log & splits"], ["shots", "Shot chart"], ["playtypes", "Play types"], ["lineups", "Lineups & on/off"], ["whatif", "What if"], ["more", "Clutch · Hustle"]], tab)}
    <div id="tab"></div>`;
  app.querySelectorAll(".page-tabs a").forEach((a) => a.href += `&season=${season}`);
  app.querySelector("#tm-season").addEventListener("change", (e) => { location.hash = `${base}?tab=${tab}&season=${e.target.value}`; });
  const box = app.querySelector("#tab");

  if (tab === "gamelog") {
    const games = await teamLog(season, id).catch(() => []);
    box.innerHTML = `<h2>${season} game log</h2><div id="up"></div><div id="gl"></div>`;
    renderGameLog(box.querySelector("#gl"), games, { isTeam: true, chartKeys: ["MARGIN", "PTS", "OPP_PTS", "NET_RATING", "FG3M"] });
    // Season still going: the rest of the schedule (NBA.com ScheduleLeagueV2, made by pipeline/fetch_schedule.py).
    const sched = !META.seasons.find((x) => x.season === season)?.in_progress ? null : await fetch(`data/${season}/schedule.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (sched) {
      const played = new Set(games.map((g) => g.GAME_ID)), abbr = new Map(all.map((x) => [x.TEAM_ID, x.TEAM_ABBREVIATION]));
      const left = sched.games.filter(([gid, , h, a]) => (h === id || a === id) && !played.has(gid));
      if (left.length) {
        const cells = left.map(([, date, h, a]) => `<span class="sched-game"><b>${esc(date.slice(5))}</b> ${h === id ? "vs" : "@"} <a href="#/team/${h === id ? a : h}?season=${season}">${esc(abbr.get(h === id ? a : h) || "?")}</a></span>`);
        box.querySelector("#up").innerHTML = `<details class="card" ${games.length ? "" : "open"}><summary><b>Remaining schedule</b> · ${left.length} games
          (next: ${esc(left[0][1])})</summary><div class="sched-list">${cells.join("")}</div>
          <p class="muted small">Source: NBA.com schedule, pulled ${esc(String(sched.pulled_at_utc || "").slice(0, 10))}.</p></details>`;
      }
    }
    return;
  }

  if (tab === "shots") {
    const st = dataStatus("shots", season);
    if (!st.ok) { box.innerHTML = `<h2>${season} shot chart</h2>${st.html}`; return; }
    box.innerHTML = `<h2>${season} shot chart</h2><div id="sc"></div>`;
    await renderShotChart(box.querySelector("#sc"), { season, teamId: id });
    return;
  }

  if (tab === "playtypes") {
    const st = dataStatus("playtypes", season);
    if (!st.ok) { box.innerHTML = `<h2>${season} play types</h2>${st.html}`; return; }
    box.innerHTML = `<h2>${season} play types</h2><div id="pt"></div>`;
    await renderPlayTypes(box.querySelector("#pt"), { season, teamId: id });
    return;
  }

  if (tab === "lineups") {
    const st = dataStatus("lineups", season);
    if (!st.ok) { box.innerHTML = `<h2>${season} lineups & on/off</h2>${st.html}`; return; }
    box.innerHTML = `<h2>${season} lineups & on/off</h2><div id="lu"></div>`;
    await renderTeamLineups(box.querySelector("#lu"), { season, teamId: id });
    return;
  }

  if (tab === "whatif") {
    box.innerHTML = `<h2>What if… · ${season}</h2><div id="wi"></div>`;
    await renderWhatIf(box.querySelector("#wi"), { season, teamId: id });
    return;
  }

  if (tab === "more") {
    let html = "";
    for (const kind of ["clutch", "hustle"]) {
      const hub = HUBS[kind];
      const st = dataStatus(kind, season);
      if (!st.ok) { html += `<h2>${hub.title}</h2>${st.html}`; continue; }
      const rows = await hubRows(kind, "teams", season).catch(() => []);
      const me = rows.find((r) => r.TEAM_ID === id);
      html += `<h2>${hub.title} <a class="small" href="#/hubs/${kind}?entity=teams&season=${season}">leaderboard →</a></h2>`;
      if (!me) { html += `<p class="muted">No ${hub.title.toLowerCase()} file for ${season} yet.</p>`; continue; }
      html += `<p class="muted small">${esc(hub.note)} Percentiles among all ${rows.length} teams.</p>` + profileHTML(hub.groups, me, rows, "teams", { ints: hub.ints });
    }
    box.innerHTML = html + `<p class="muted small">Source: NBA.com/stats clutch and hustle dashboards via nba_api.</p>`;
    return;
  }

  const pool = all;
  const games = seasonGames(season);
  box.innerHTML = `
    <div class="grid stat-cards">${CARD_STATS.map((k) => statCard(k, t, pool, "teams")).join("")}</div>
    <p class="muted small">"#1" always means best (for defensive rating and turnovers, lower is better). Chips are percentiles among the ${all.length} teams
      (100 = best); "Lg avg" is the average team.${games < 20 ? ` <b>Only ${games} games into the season: small sample.</b>` : ""}</p>
    <h2>Percentile profile · ${season}</h2>
    ${profileHTML(PROFILE, t, pool, "teams")}

    <h2>Roster · ${season}</h2>
    <div id="roster"></div>
    <p class="muted small">Players are listed under the team NBA.com shows for them at the end of the season;
      a traded player's numbers include games for all his teams that season.</p>

    <h2>Franchise &amp; playoff history</h2>
    <div id="fr"></div>

    <h2>Team stats by season</h2>
    <div class="toolbar"><div class="tabs">
      <button data-mode="teams" class="active">Per Game</button>
      <button data-mode="teams_per100">Per 100 Poss</button>
      <button data-mode="teams_totals">Totals</button>
      <button data-mode="advanced">Advanced</button></div></div>
    <div id="hist"></div>`;

  const roster = (await load("players", season)).filter((p) => p.TEAM_ID === id);
  renderTable(box.querySelector("#roster"), {
    rows: roster, entity: "players", sortKey: "MIN", rank: false,
    columns: [{ key: "PLAYER_NAME", label: "Player", left: true, html: playerLink }, { key: "AGE", label: "Age" },
      ...["GP", "MIN", "PTS", "REB", "AST", "STL", "BLK", "TOV", "FG_PCT", "FG3_PCT", "FT_PCT", "TS_PCT", "USG_PCT", "NET_RATING"].map((key) => ({ key }))],
  });

  async function drawHistory(mode) {
    const file = mode === "advanced" ? "teams" : mode;
    const rows = (await loadAllSeasons(file)).filter((x) => x.TEAM_ID === id);
    renderTable(box.querySelector("#hist"), {
      rows, entity: "teams", sortKey: "SEASON", sortAsc: true, rank: false,
      columns: [{ key: "SEASON", label: "Season", left: true }, ...(mode === "advanced" ? COLUMNS.teamsAdvanced : COLUMNS.teamsBasic).map((key) => ({ key }))],
    });
  }
  box.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => {
    box.querySelectorAll("[data-mode]").forEach((x) => x.classList.toggle("active", x === b));
    drawHistory(b.dataset.mode);
  }));
  drawHistory("teams");
  franchiseBox(box.querySelector("#fr"), id, t.TEAM_NAME).catch(() => { box.querySelector("#fr").innerHTML = `<p class="muted">Franchise history not available.</p>`; });
}

// Franchise totals (NBA.com FranchiseHistory) + every playoff run since 1996-97 (data/index/playoffs.json).
const ROUND_LOST = ["", "Lost first round", "Lost conf. semifinals", "Lost conf. finals", "Lost NBA Finals"];
async function franchiseBox(el, id, name) {
  const get = (p) => fetch(p).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [fr, po] = await Promise.all([get("data/index/franchises.json"), get("data/index/playoffs.json")]);
  const rows = (c) => (c ? c.rows.map((r) => Object.fromEntries(c.cols.map((k, i) => [k, r[i]]))) : []);
  const eras = rows(fr).filter((r) => r.TEAM_ID === id), whole = eras[0];
  const series = rows(po).filter((r) => r.WIN_ID === id || r.LOSE_ID === id);
  const runs = [...new Set(series.map((r) => r.SEASON))].sort().reverse().map((season) => {
    const ss = series.filter((r) => r.SEASON === season).sort((a, b) => a.ROUND - b.ROUND), last = ss[ss.length - 1];
    const won = last.WIN_ID === id, seed = ss[0].WIN_ID === id ? ss[0].WIN_SEED : ss[0].LOSE_SEED;
    const res = won && last.ROUND === 4 ? "<b>Won NBA title</b>" : won ? "In progress" : ROUND_LOST[last.ROUND];
    const opp = won ? "" : ` to ${esc(last.WIN)} ${last.LOSE_W}-${last.WIN_W}`;
    return `<tr><td class="left"><a href="#/history/playoffs?season=${season}">${esc(season)}</a></td><td>${seed ?? "–"}</td><td class="left">${res}${opp}</td>
      <td>${ss.reduce((a, r) => a + (r.WIN_ID === id ? r.WIN_W : r.LOSE_W), 0)}-${ss.reduce((a, r) => a + (r.WIN_ID === id ? r.LOSE_W : r.WIN_W), 0)}</td></tr>`;
  });
  const seasonsSince = (po ? [...new Set(rows(po).map((r) => r.SEASON))] : []).length;
  el.innerHTML = `${whole ? `<div class="grid stat-cards">
      <div class="card stat-card"><div class="label">Since ${esc(whole.START_YEAR)}</div><div class="value">${whole.WINS}-${whole.LOSSES}</div><div class="muted small">${(100 * whole.WIN_PCT).toFixed(1)}% · ${whole.YEARS} seasons</div></div>
      <div class="card stat-card"><div class="label">NBA titles</div><div class="value">${whole.LEAGUE_TITLES}</div><div class="muted small">${whole.CONF_TITLES} conference titles</div></div>
      <div class="card stat-card"><div class="label">Playoff appearances</div><div class="value">${whole.PO_APPEARANCES}</div><div class="muted small">${whole.DIV_TITLES} division titles</div></div>
      <div class="card stat-card"><div class="label">Playoffs since 1996-97</div><div class="value">${runs.length} of ${seasonsSince}</div><div class="muted small">seasons on this site</div></div></div>
    ${eras.length > 1 ? `<p class="small">As: ${eras.slice(1).map((e) => `${esc(e.TEAM_CITY)} ${esc(e.TEAM_NAME)} (${esc(e.START_YEAR)}–${esc(e.END_YEAR)}, ${e.LEAGUE_TITLES} title${e.LEAGUE_TITLES === 1 ? "" : "s"})`).join(" · ")}</p>` : ""}` : ""}
    ${runs.length ? `<details class="card" ${runs.length <= 8 ? "open" : ""}><summary><b>Playoff runs since 1996-97</b> · ${runs.length}</summary>
      <div class="table-wrap"><table class="data"><thead><tr><th class="left">Season</th><th title="Final regular-season conference rank">Seed</th><th class="left">Result</th><th>Playoff W-L</th></tr></thead>
      <tbody>${runs.join("")}</tbody></table></div></details>` : `<p class="muted">No playoff appearances since 1996-97.</p>`}
    <p class="muted small">Source: NBA.com FranchiseHistory (whole franchise, every season since it began) and NBA.com playoff game logs.</p>`;
}
