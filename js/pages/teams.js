// teams.js - the Teams page: all 30 teams in a sortable table with tabs.
import { load, currentSeason } from "../data.js";
import { COLUMNS } from "../stats.js";
import { renderTable, teamLink } from "../ui.js";

const MODES = {
  pergame: { label: "Per Game", file: "teams", cols: COLUMNS.teamsBasic, sort: "W_PCT" },
  totals:  { label: "Totals", file: "teams_totals", cols: COLUMNS.teamsBasic, sort: "W_PCT" },
  per100:  { label: "Per 100 Poss", file: "teams_per100", cols: COLUMNS.teamsBasic, sort: "W_PCT" },
  advanced:{ label: "Advanced", file: "teams", cols: COLUMNS.teamsAdvanced, sort: "NET_RATING" },
};
const state = { mode: "pergame" };

export async function teamsPage(app) {
  const season = currentSeason();
  app.innerHTML = `
    <div class="page-head"><div><h1>Teams</h1>
      <p class="sub">${season} regular season · click a column to sort · click a team for roster and history</p></div></div>
    <div class="toolbar"><div class="tabs">${Object.entries(MODES).map(([k, m]) =>
      `<button data-mode="${k}" class="${k === state.mode ? "active" : ""}">${m.label}</button>`).join("")}</div></div>
    <div id="table"></div>
    <p class="muted small">ORtg / DRtg = points scored / allowed per 100 possessions. NetRtg = ORtg − DRtg. Pace = possessions per 48 minutes.
      3PA/100 = 3-point attempts per 100 possessions. 3PA Rate = share of all shots that were threes.</p>`;

  async function draw() {
    const mode = MODES[state.mode];
    const rows = await load(mode.file, season);
    renderTable(app.querySelector("#table"), {
      rows, entity: "teams", sortKey: mode.sort, pageSize: 30,
      columns: [{ key: "TEAM_NAME", label: "Team", left: true, html: teamLink }, ...mode.cols.map((key) => ({ key }))],
    });
  }
  app.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => {
    state.mode = b.dataset.mode;
    app.querySelectorAll("[data-mode]").forEach((x) => x.classList.toggle("active", x === b));
    draw();
  }));
  draw();
}
