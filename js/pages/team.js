// team.js - one team's page: record, league ranks, roster, and season-by-season team stats.
import { load, loadAllSeasons, currentSeason } from "../data.js";
import { STATS, COLUMNS, fmt } from "../stats.js";
import { renderTable, esc, rankOf, playerLink } from "../ui.js";

const CARD_STATS = ["W_PCT", "OFF_RATING", "DEF_RATING", "NET_RATING", "PACE", "PTS", "FG3A_PER100", "FG3_PCT", "TS_PCT", "TM_TOV_PCT"];

export async function teamPage(app, id) {
  id = Number(id);
  const season = currentSeason();
  const all = await load("teams", season);
  const t = all.find((x) => x.TEAM_ID === id);
  if (!t) { app.innerHTML = `<p>Team not found.</p>`; return; }

  const cards = CARD_STATS.map((k) => {
    const rank = rankOf(t[k], all.map((x) => x[k]), STATS[k].lowerBetter);
    return `<div class="card stat-card"><div class="label">${STATS[k].label}</div>
      <div class="value">${fmt(t[k], k, "teams")}</div>
      <div class="rank ${rank <= 5 ? "top" : ""}">#${rank} of 30</div></div>`;
  }).join("");

  app.innerHTML = `
    <div class="page-head">
      <div><h1>${esc(t.TEAM_NAME)}</h1>
        <p class="sub">${season} · ${t.W}-${t.L} · net rating ${fmt(t.NET_RATING, "NET_RATING")} (#${rankOf(t.NET_RATING, all.map((x) => x.NET_RATING))} of 30)</p></div>
      <a class="btn" href="#/compare?type=teams&ids=${id}">Compare with others →</a>
    </div>
    <div class="grid stat-cards">${cards}</div>
    <p class="muted small">"#1" always means best (for defensive rating and turnovers, lower is better).</p>

    <h2>Roster · ${season}</h2>
    <div id="roster"></div>
    <p class="muted small">Players are listed under the team NBA.com shows for them at the end of the season;
      a traded player's numbers include games for all his teams that season.</p>

    <h2>Team stats by season</h2>
    <div class="toolbar"><div class="tabs">
      <button data-mode="teams" class="active">Per Game</button>
      <button data-mode="teams_per100">Per 100 Poss</button>
      <button data-mode="teams_totals">Totals</button>
      <button data-mode="advanced">Advanced</button></div></div>
    <div id="hist"></div>`;

  const roster = (await load("players", season)).filter((p) => p.TEAM_ID === id);
  renderTable(app.querySelector("#roster"), {
    rows: roster, entity: "players", sortKey: "MIN", rank: false,
    columns: [{ key: "PLAYER_NAME", label: "Player", left: true, html: playerLink }, { key: "AGE", label: "Age" },
      ...["GP", "MIN", "PTS", "REB", "AST", "STL", "BLK", "TOV", "FG_PCT", "FG3_PCT", "FT_PCT", "TS_PCT", "USG_PCT", "NET_RATING"].map((key) => ({ key }))],
  });

  async function drawHistory(mode) {
    const file = mode === "advanced" ? "teams" : mode;
    const rows = (await loadAllSeasons(file)).filter((x) => x.TEAM_ID === id);
    renderTable(app.querySelector("#hist"), {
      rows, entity: "teams", sortKey: "SEASON", sortAsc: true, rank: false,
      columns: [{ key: "SEASON", label: "Season", left: true }, ...(mode === "advanced" ? COLUMNS.teamsAdvanced : COLUMNS.teamsBasic).map((key) => ({ key }))],
    });
  }
  app.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => {
    app.querySelectorAll("[data-mode]").forEach((x) => x.classList.toggle("active", x === b));
    drawHistory(b.dataset.mode);
  }));
  drawHistory("teams");
}
