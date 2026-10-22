// team.js - one team's page, in three tabs (each with a shareable address):
//   Overview          record, stat cards with percentile chips + league averages, percentile profile, roster, season history
//   Game log & splits every game: score, margin, per-game ratings, rolling 5/10-game averages, splits
//   Clutch · Hustle   the team's numbers in those NBA.com datasets
import { load, loadAllSeasons, currentSeason, SEASONS, seasonGames } from "../data.js";
import { COLUMNS, fmt } from "../stats.js";
import { renderTable, esc, rankOf, playerLink } from "../ui.js";
import { statCard, profileHTML, tabBar, renderGameLog } from "./shared.js";
import { teamLog } from "../gamelog.js";

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
      <div><h1>${esc(t.TEAM_NAME)}</h1>
        <p class="sub">${season} · ${t.W}-${t.L} · net rating ${fmt(t.NET_RATING, "NET_RATING")} (#${rankOf(t.NET_RATING, all.map((x) => x.NET_RATING))} of ${all.length})
          · <a href="#/standings?season=${season}">standings</a></p></div>
      <div class="head-tools"><label class="page-season">Season <select id="tm-season">${SEASONS().map((s) =>
        `<option ${s === season ? "selected" : ""}>${s}</option>`).join("")}</select></label>
        <a class="btn" href="#/compare?type=teams&ids=${id}">Compare →</a></div>
    </div>
    ${tabBar(base, [["overview", "Overview"], ["gamelog", "Game log & splits"]], tab)}
    <div id="tab"></div>`;
  app.querySelectorAll(".page-tabs a").forEach((a) => a.href += `&season=${season}`);
  app.querySelector("#tm-season").addEventListener("change", (e) => { location.hash = `${base}?tab=${tab}&season=${e.target.value}`; });
  const box = app.querySelector("#tab");

  if (tab === "gamelog") {
    const games = await teamLog(season, id).catch(() => []);
    box.innerHTML = `<h2>${season} game log</h2><div id="gl"></div>`;
    renderGameLog(box.querySelector("#gl"), games, { isTeam: true, chartKeys: ["MARGIN", "PTS", "OPP_PTS", "NET_RATING", "FG3M"] });
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
}
