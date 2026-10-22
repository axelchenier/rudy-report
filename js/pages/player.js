// player.js - one player's profile page, in three tabs (each tab has its own shareable address):
//   Overview          headline cards with percentile chips + league averages, a percentile profile, season-by-season tables
//   Game log & splits every game of a season, rolling 5/10-game averages, home/road, rest, month and opponent splits
//   Clutch · Hustle · Tracking   the player's numbers in those NBA.com datasets, with percentiles
import { load, loadAllSeasons, currentSeason, qualifies, QUALIFY_SHARE, seasonGames, META } from "../data.js";
import { STATS, COLUMNS, fmt } from "../stats.js";
import { renderTable, esc, teamAbbrLink, chartTheme, PALETTE } from "../ui.js";
import { statCard, profileHTML, tabBar, renderGameLog } from "./shared.js";
import { renderShotChart } from "./shotview.js";
import { renderPlayTypes } from "./playtypeview.js";
import { renderPlayerLineups } from "./lineups.js";
import { playerLog } from "../gamelog.js";
import { HUBS, hubRows, inPool, existsFor, FIRST_SEASON } from "../hubs.js";

const CARD_STATS = ["PTS", "REB", "AST", "STL", "BLK", "FG3_PCT", "TS_PCT", "USG_PCT", "NET_RATING", "PIE"];
const PROFILE = [
  ["Scoring", ["PTS", "FGA", "FG_PCT", "FG3A", "FG3_PCT", "FTA", "FT_PCT", "EFG_PCT", "TS_PCT", "USG_PCT"]],
  ["Playmaking", ["AST", "AST_PCT", "AST_TO", "AST_RATIO", "TOV", "TM_TOV_PCT"]],
  ["Rebounding & defense", ["REB", "OREB", "DREB", "OREB_PCT", "DREB_PCT", "STL", "BLK", "DEF_RATING"]],
  ["Impact", ["MIN", "PLUS_MINUS", "OFF_RATING", "NET_RATING", "PIE"]],
];

export async function playerPage(app, id, query = "") {
  id = Number(id);
  const params = new URLSearchParams(query);
  const tab = params.get("tab") || "overview";
  const history = (await loadAllSeasons("players")).filter((p) => p.PLAYER_ID === id)
    .sort((a, b) => a.SEASON.localeCompare(b.SEASON));
  if (!history.length) { app.innerHTML = `<p>Player not found in the loaded seasons.</p>`; return; }

  // Season: ?season= in the address, else the header picker if he played then, else his latest season.
  const want = params.get("season") || currentSeason();
  const season = history.some((h) => h.SEASON === want) ? want : history[history.length - 1].SEASON;
  const p = history.find((h) => h.SEASON === season);
  const all = await load("players", season);
  const league = all.filter((x) => qualifies(x, season));
  const ranked = qualifies(p, season);
  const base = `#/player/${id}`;
  const seasonPick = `<label class="page-season">Season <select id="pl-season">${[...history].reverse().map((h) =>
    `<option ${h.SEASON === season ? "selected" : ""}>${h.SEASON}</option>`).join("")}</select></label>`;

  app.innerHTML = `
    <div class="page-head">
      <div>
        <h1>${esc(p.PLAYER_NAME)}</h1>
        <p class="sub">${season} · <a href="#/team/${p.TEAM_ID}">${esc(p.TEAM_ABBREVIATION)}</a> · age ${p.AGE ?? "–"} ·
          ${p.GP} game${p.GP === 1 ? "" : "s"} · ${fmt(p.MIN, "MIN")} min/game · team went ${p.W}-${p.L} in his games</p>
      </div>
      <div class="head-tools">${seasonPick}<a class="btn" href="#/compare?type=players&ids=${id}">Compare →</a></div>
    </div>
    ${tabBar(base, [["overview", "Overview"], ["gamelog", "Game log & splits"], ["shots", "Shot chart"], ["playtypes", "Play types"], ["lineups", "Lineups & on/off"], ["more", "Clutch · Hustle · Tracking"]], tab)}
    <div id="tab"></div>`;
  app.querySelectorAll(".page-tabs a").forEach((a) => a.href += `&season=${season}`);
  app.querySelector("#pl-season").addEventListener("change", (e) => { location.hash = `${base}?tab=${tab}&season=${e.target.value}`; });
  const box = app.querySelector("#tab");

  if (tab === "gamelog") {
    const games = await playerLog(season, id).catch(() => []);
    box.innerHTML = `<h2>${season} game log</h2><div id="gl"></div>`;
    renderGameLog(box.querySelector("#gl"), games, { isTeam: false, chartKeys: ["PTS", "REB", "AST", "GAME_SCORE", "FG3M", "MIN"] });
    return;
  }

  if (tab === "shots") {
    box.innerHTML = `<h2>${season} shot chart</h2><div id="sc"></div>`;
    await renderShotChart(box.querySelector("#sc"), { season, playerId: id });
    return;
  }

  if (tab === "playtypes") {
    box.innerHTML = `<h2>${season} play types</h2><div id="pt"></div>`;
    await renderPlayTypes(box.querySelector("#pt"), { season, playerId: id });
    return;
  }

  if (tab === "lineups") {
    box.innerHTML = `<h2>${season} lineups & on/off</h2><div id="lu"></div>`;
    await renderPlayerLineups(box.querySelector("#lu"), { season, playerId: id, teamId: p.TEAM_ID });
    return;
  }

  if (tab === "more") {
    const minGP = Math.ceil(seasonGames(season) * QUALIFY_SHARE);
    let html = "";
    for (const kind of ["clutch", "hustle", "tracking"]) {
      const hub = HUBS[kind];
      if (!existsFor(kind, season)) { html += `<h2>${hub.title}</h2><p class="muted">Not tracked in this era (NBA.com ${kind} data starts in ${FIRST_SEASON[kind]}).</p>`; continue; }
      const rows = await hubRows(kind, "players", season).catch(() => []);
      const me = rows.find((r) => r.PLAYER_ID === id);
      const pool = rows.filter((r) => inPool(kind, r, minGP));
      html += `<h2>${hub.title} <a class="small" href="#/hubs/${kind}?season=${season}">leaderboard →</a></h2>`;
      if (!me) { html += `<p class="muted">${rows.length ? `No ${hub.title.toLowerCase()} numbers for him in ${season}.` : `No ${hub.title.toLowerCase()} file for ${season} yet.`}</p>`; continue; }
      const okRank = pool.some((r) => r.PLAYER_ID === id);
      html += `<p class="muted small">${esc(hub.note)} Percentiles among ${pool.length} players
        ${kind === "clutch" ? "with 20+ clutch minutes" : `with ${minGP}+ games`}${okRank ? "" : " (he isn't in that group, so no percentiles)"}.</p>`;
      html += profileHTML(hub.groups, me, pool, "players", { ranked: okRank, ints: hub.ints });
    }
    box.innerHTML = html + `<p class="muted small">Source: NBA.com/stats (clutch, hustle and Second Spectrum tracking dashboards) via nba_api.</p>`;
    return;
  }

  // ---- Overview ----
  box.innerHTML = `
    <div class="grid stat-cards">${CARD_STATS.map((k) => statCard(k, p, league, "players", { ranked, avgLabel: "Avg qualified" })).join("")}</div>
    <p class="muted small">Chips show the percentile (100 = best) and ranks are among the ${league.length} players who played at least
      ${QUALIFY_SHARE * 100}% of ${season}'s games; "avg qualified" is their average.${ranked ? "" : " <b>He hasn't played enough games to be ranked.</b>"}
      Hover any stat name for its definition, or see the <a href="#/glossary">glossary</a>.</p>
    <h2>Percentile profile · ${season}</h2>
    ${profileHTML(PROFILE, p, league, "players", { ranked })}

    <h2>Season by season</h2>
    <div class="toolbar"><div class="tabs">
      <button data-mode="players" class="active">Per Game</button>
      <button data-mode="players_per36">Per 36 Min</button>
      <button data-mode="players_totals">Totals</button>
      <button data-mode="advanced">Advanced</button></div></div>
    <div id="hist"></div>
    ${history.length > 1 ? `<div class="card" style="margin-top:12px"><div class="chart-box"><canvas id="trend"></canvas></div></div>` : ""}`;

  async function drawHistory(mode) {
    const file = mode === "advanced" ? "players" : mode;
    const rows = (await loadAllSeasons(file)).filter((x) => x.PLAYER_ID === id);
    const cols = mode === "advanced" ? COLUMNS.playersAdvanced : mode === "players_totals" ? COLUMNS.playersTotals : COLUMNS.playersBasic;
    renderTable(box.querySelector("#hist"), {
      rows, entity: "players", sortKey: "SEASON", sortAsc: true, rank: false,
      columns: [{ key: "SEASON", label: "Season", left: true }, { key: "TEAM_ABBREVIATION", label: "Team", left: true, html: teamAbbrLink },
        { key: "AGE", label: "Age" }, ...cols.map((key) => ({ key }))],
    });
  }
  box.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => {
    box.querySelectorAll("[data-mode]").forEach((x) => x.classList.toggle("active", x === b));
    drawHistory(b.dataset.mode);
  }));
  drawHistory("players");

  // Leave a just-started season (fewer than 10 games) out of the trend chart so one game doesn't look like a trend.
  const inProg = new Set(META.seasons.filter((x) => x.in_progress).map((x) => x.season));
  const chartRows = history.filter((h) => !(inProg.has(h.SEASON) && h.GP < 10));
  if (history.length > 1 && chartRows.length > 1) {
    const t = chartTheme();
    new Chart(box.querySelector("#trend"), {
      type: "line",
      data: { labels: chartRows.map((h) => h.SEASON),
        datasets: ["PTS", "REB", "AST"].map((k, i) => ({ label: STATS[k].name, data: chartRows.map((h) => h[k]), borderColor: PALETTE[i], backgroundColor: PALETTE[i], tension: .25 })) },
      options: { maintainAspectRatio: false, plugins: { legend: { labels: { color: t.text } }, title: { display: true, text: `Per-game averages by season${chartRows.length < history.length ? " (in-progress season left out until 10 games)" : ""}`, color: t.text } },
        scales: { x: { ticks: { color: t.text }, grid: { color: t.grid } }, y: { ticks: { color: t.text }, grid: { color: t.grid }, beginAtZero: true } } },
    });
  }
}
