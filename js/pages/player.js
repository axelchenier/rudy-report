// player.js - one player's profile page: headline numbers, league ranks, and season-by-season tables.
import { load, loadAllSeasons, currentSeason, qualifies, QUALIFY_SHARE } from "../data.js";
import { STATS, COLUMNS, fmt } from "../stats.js";
import { renderTable, esc, rankOf, teamAbbrLink, chartTheme, PALETTE } from "../ui.js";

// The stat "cards" at the top of the page.
const CARD_STATS = ["PTS", "REB", "AST", "STL", "BLK", "FG3_PCT", "TS_PCT", "USG_PCT", "NET_RATING", "PIE"];


export async function playerPage(app, id) {
  id = Number(id);
  const history = (await loadAllSeasons("players")).filter((p) => p.PLAYER_ID === id)
    .sort((a, b) => a.SEASON.localeCompare(b.SEASON));
  if (!history.length) { app.innerHTML = `<p>Player not found in the loaded seasons.</p>`; return; }

  // Show the season picked in the header if the player played then; otherwise their latest season.
  const season = history.some((h) => h.SEASON === currentSeason()) ? currentSeason() : history[history.length - 1].SEASON;
  const p = history.find((h) => h.SEASON === season);
  const league = (await load("players", season)).filter((x) => qualifies(x, season));

  const cards = CARD_STATS.map((k) => {
    const rank = qualifies(p, season) ? rankOf(p[k], league.map((x) => x[k]), STATS[k].lowerBetter) : null;
    return `<div class="card stat-card"><div class="label">${STATS[k].label}</div>
      <div class="value">${fmt(p[k], k, "players")}</div>
      <div class="rank ${rank && rank <= 10 ? "top" : ""}">${rank ? `#${rank} of ${league.length}` : "not enough games to rank"}</div></div>`;
  }).join("");

  app.innerHTML = `
    <div class="page-head">
      <div>
        <h1>${esc(p.PLAYER_NAME)}</h1>
        <p class="sub">${season} · <a href="#/team/${p.TEAM_ID}">${esc(p.TEAM_ABBREVIATION)}</a> · age ${p.AGE ?? "–"} ·
          ${p.GP} games · ${fmt(p.MIN, "MIN")} min/game · team went ${p.W}-${p.L} in his games</p>
      </div>
      <a class="btn" href="#/compare?type=players&ids=${id}">Compare with others →</a>
    </div>
    <div class="grid stat-cards">${cards}</div>
    <p class="muted small">Ranks are among the ${league.length} players who played at least ${QUALIFY_SHARE * 100}% of the ${season} season's games.</p>

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
    renderTable(app.querySelector("#hist"), {
      rows, entity: "players", sortKey: "SEASON", sortAsc: true, rank: false,
      columns: [{ key: "SEASON", label: "Season", left: true }, { key: "TEAM_ABBREVIATION", label: "Team", left: true, html: teamAbbrLink },
        { key: "AGE", label: "Age" }, ...cols.map((key) => ({ key }))],
    });
  }
  app.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => {
    app.querySelectorAll("[data-mode]").forEach((x) => x.classList.toggle("active", x === b));
    drawHistory(b.dataset.mode);
  }));
  drawHistory("players");

  // Line chart: points, rebounds, assists over the seasons.
  if (history.length > 1) {
    const t = chartTheme();
    new Chart(app.querySelector("#trend"), {
      type: "line",
      data: { labels: history.map((h) => h.SEASON),
        datasets: ["PTS", "REB", "AST"].map((k, i) => ({ label: STATS[k].name, data: history.map((h) => h[k]), borderColor: PALETTE[i], backgroundColor: PALETTE[i], tension: .25 })) },
      options: { maintainAspectRatio: false, plugins: { legend: { labels: { color: t.text } }, title: { display: true, text: "Per-game averages by season", color: t.text } },
        scales: { x: { ticks: { color: t.text }, grid: { color: t.grid } }, y: { ticks: { color: t.text }, grid: { color: t.grid }, beginAtZero: true } } },
    });
  }
}
