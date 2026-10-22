// players.js - the Players page: one big sortable table with filters and tabs.
import { load, currentSeason, seasonGames } from "../data.js";
import { COLUMNS } from "../stats.js";
import { renderTable, playerLink, teamAbbrLink, esc } from "../ui.js";

// The four tabs. "file" = which data file, "cols" = which columns to show.
const MODES = {
  pergame: { label: "Per Game", file: "players", cols: COLUMNS.playersBasic, sort: "PTS" },
  totals:  { label: "Totals", file: "players_totals", cols: COLUMNS.playersTotals, sort: "PTS" },
  per36:   { label: "Per 36 Min", file: "players_per36", cols: COLUMNS.playersBasic, sort: "PTS" },
  advanced:{ label: "Advanced", file: "players", cols: COLUMNS.playersAdvanced, sort: "PIE" },
};

// Filter settings are remembered while you click around.
const state = { mode: "pergame", search: "", team: "", minGP: null, minMIN: 10 };

export async function playersPage(app) {
  const season = currentSeason();
  if (state.minGP === null) state.minGP = Math.round(seasonGames(season) * 0.25);
  const perGame = await load("players", season);          // used for team list + minutes filter
  const teams = [...new Set(perGame.map((p) => p.TEAM_ABBREVIATION))].sort();

  app.innerHTML = `
    <div class="page-head">
      <div><h1>Players</h1><p class="sub">${season} regular season · click any column header to sort · click a name for the full profile</p></div>
    </div>
    <div class="toolbar">
      <div class="tabs" role="tablist">${Object.entries(MODES).map(([k, m]) =>
        `<button data-mode="${k}" class="${k === state.mode ? "active" : ""}">${m.label}</button>`).join("")}</div>
      <input type="search" id="q" placeholder="Search player…" value="${esc(state.search)}">
      <select id="team"><option value="">All teams</option>${teams.map((t) => `<option ${t === state.team ? "selected" : ""}>${t}</option>`).join("")}</select>
      <label>Min games <input type="number" id="mingp" min="0" value="${state.minGP}"></label>
      <label>Min minutes/game <input type="number" id="minmin" min="0" step="1" value="${state.minMIN}"></label>
    </div>
    <div id="table"></div>`;

  const minutesById = new Map(perGame.map((p) => [p.PLAYER_ID, p.MIN]));   // minutes PER GAME for the filter

  async function draw() {
    const mode = MODES[state.mode];
    const rows = (await load(mode.file, season)).filter((p) =>
      p.PLAYER_NAME.toLowerCase().includes(state.search.toLowerCase()) &&
      (!state.team || p.TEAM_ABBREVIATION === state.team) &&
      p.GP >= (state.minGP || 0) &&
      (minutesById.get(p.PLAYER_ID) ?? 0) >= (state.minMIN || 0));
    const columns = [
      { key: "PLAYER_NAME", label: "Player", left: true, html: playerLink },
      { key: "TEAM_ABBREVIATION", label: "Team", left: true, html: teamAbbrLink },
      { key: "AGE", label: "Age" },
      ...mode.cols.map((key) => ({ key })),
    ];
    renderTable(app.querySelector("#table"), { rows, columns, entity: "players", sortKey: mode.sort });
  }

  app.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => {
    state.mode = b.dataset.mode;
    app.querySelectorAll("[data-mode]").forEach((x) => x.classList.toggle("active", x === b));
    draw();
  }));
  app.querySelector("#q").addEventListener("input", (e) => { state.search = e.target.value; draw(); });
  app.querySelector("#team").addEventListener("change", (e) => { state.team = e.target.value; draw(); });
  app.querySelector("#mingp").addEventListener("input", (e) => { state.minGP = +e.target.value; draw(); });
  app.querySelector("#minmin").addEventListener("input", (e) => { state.minMIN = +e.target.value; draw(); });
  draw();
}
