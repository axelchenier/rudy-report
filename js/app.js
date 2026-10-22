// app.js - the "traffic controller". It looks at the address bar (#/players, #/team/123, ...)
// and shows the matching page inside <main id="app">.
import { loadMeta, META, SEASONS, currentSeason, setSeason, withSeason } from "./data.js";
import { esc } from "./ui.js";
import { askPage } from "./pages/ask.js";
import { playersPage } from "./pages/players.js";
import { teamsPage } from "./pages/teams.js";
import { playerPage } from "./pages/player.js";
import { teamPage } from "./pages/team.js";
import { comparePage } from "./pages/compare.js";
import { reportsPage } from "./pages/reports.js";
import { standingsPage } from "./pages/standings.js";
import { hubsPage } from "./pages/hubs.js";
import { glossaryPage } from "./pages/glossary.js";
import { wowyPage } from "./pages/lineups.js";
import { toolsPage } from "./pages/tools.js";
import { gamePage } from "./pages/game.js";
import { historyPage } from "./pages/history.js";
// College (NCAA men's D-I) section: its own pages and data (data/college/).
import { collegeTeamsPage, collegePlayersPage, collegeTeamPage, collegePlayerPage } from "./pages/college.js";
import { collegeComparePage } from "./pages/college_compare.js";
import { collegeReportsPage } from "./pages/college_reports.js";
import { collegePredictorPage } from "./pages/college_predictor.js";
import { collegeTourneyPage } from "./pages/college_tourney.js";
import { collegeConferencesPage, collegeConferencePage } from "./pages/college_conf.js";
import { draftBoardPage, draftProspectPage } from "./pages/draft.js";
import { draftHistoryPage } from "./pages/draft_history.js";
import { draftTranslationPage } from "./pages/draft_translation.js";
import { draftMockPage } from "./pages/draft_mock.js";
import { collegeTransferPage } from "./pages/college_transfer.js";
import { collegeLeadersPage } from "./pages/college_leaders.js";
import { collegeHomePage } from "./pages/college_home.js";
import { setFooter } from "./footer.js";
import { renderFreshness } from "./freshness.js";

const app = document.getElementById("app");

// Each route: a pattern for the address and the function that draws that page.
const routes = [
  [/^#?\/?$/, askPage, "ask"],
  [/^#\/ask(?:\?(.*))?$/, askPage, "ask"],
  [/^#\/players(?:\?(.*))?$/, playersPage, "players"],
  [/^#\/teams(?:\?(.*))?$/, teamsPage, "teams"],
  [/^#\/player\/(\d+)(?:\?(.*))?$/, playerPage, "players"],
  [/^#\/team\/(\d+)(?:\?(.*))?$/, teamPage, "teams"],
  [/^#\/game\/(\d{10})$/, gamePage, "teams"],
  [/^#\/history(?:\/(trends|leaders|playoffs))?(?:\?(.*))?$/, historyPage, "hubs"],
  [/^#\/standings(?:\?(.*))?$/, standingsPage, "standings"],
  [/^#\/hubs(?:\/(clutch|hustle|tracking|playtypes))?(?:\?(.*))?$/, hubsPage, "hubs"],
  [/^#\/glossary(?:\?(.*))?$/, glossaryPage, "glossary"],
  [/^#\/wowy(?:\?(.*))?$/, wowyPage, "teams"],
  [/^#\/compare(?:\?(.*))?$/, comparePage, "compare"],
  [/^#\/tools(?:\/(\w+))?(?:\?(.*))?$/, toolsPage, "tools"],
  [/^#\/college\/?(?:\?.*)?$/, collegeHomePage, "college"],
  [/^#\/college\/teams(?:\?(.*))?$/, collegeTeamsPage, "college"],
  [/^#\/college\/players(?:\?(.*))?$/, collegePlayersPage, "college"],
  [/^#\/college\/team\/([\w-]+)(?:\?(.*))?$/, collegeTeamPage, "college"],
  [/^#\/college\/player\/(\d+)$/, collegePlayerPage, "college"],
  [/^#\/college\/compare(?:\?(.*))?$/, collegeComparePage, "college"],
  [/^#\/college\/reports\/?(daily|weekly|monthly)?\/?([\w-]*)$/, collegeReportsPage, "college"],
  [/^#\/college\/predictor(?:\?(.*))?$/, collegePredictorPage, "college"],
  [/^#\/college\/tournament(?:\?(.*))?$/, collegeTourneyPage, "college"],
  [/^#\/college\/transfer(?:\?(.*))?$/, collegeTransferPage, "college"],
  [/^#\/college\/leaders(?:\?(.*))?$/, collegeLeadersPage, "college"],
  [/^#\/college\/conferences(?:\?(.*))?$/, collegeConferencesPage, "college"],
  [/^#\/college\/conference\/([^?\/]+)(?:\?(.*))?$/, collegeConferencePage, "college"],
  [/^#\/draft\/?(?:\?(.*))?$/, draftBoardPage, "draft"],
  [/^#\/draft\/history\/?(?:\?(.*))?$/, draftHistoryPage, "draft"],
  [/^#\/draft\/mock\/?(?:\?(.*))?$/, draftMockPage, "draft"],
  [/^#\/draft\/translation\/?(?:\?(.*))?$/, draftTranslationPage, "draft"],
  [/^#\/draft\/(\d+)$/, draftProspectPage, "draft"],
  [/^#\/reports(?:\/(daily|weekly|monthly))?(?:\/([\w-]+))?$/, reportsPage, "reports"],
];

async function render() {
  const hash = location.hash || "#/";
  const match = routes.find(([re]) => re.test(hash));
  const [re, page, navKey] = match || routes[0];
  const params = hash.match(re)?.slice(1) || [];
  document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === navKey));
  const picker = document.querySelector(".season-picker");          // the header picker is for NBA seasons
  if (picker) picker.style.visibility = navKey === "college" || navKey === "draft" || navKey === "tools" ? "hidden" : "";   // Tools use the current season
  app.innerHTML = `<p class="muted">Loading…</p>`;
  try {
    await page(app, ...params);
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="card"><h3>Something went wrong</h3><p class="muted">${esc(err.message)}</p></div>`;
  }
  const tab = app.querySelector(".subnav .active");   // narrow screens: scroll the section tab row to the current tab
  if (tab) tab.parentElement.scrollLeft = Math.max(0, tab.offsetLeft - 24);
  setFooter(hash);                 // footer credits the data sources of this section (NBA / College / Draft)
  window.scrollTo(0, 0);
}

async function start() {
  await loadMeta();
  renderFreshness();               // footer "Data freshness" line (all sections)

  // Fill the season dropdown in the header.
  const select = document.getElementById("season-select");
  select.innerHTML = SEASONS().map((s) => `<option value="${s}">${s}</option>`).join("");
  select.value = currentSeason();
  select.addEventListener("change", () => {
    setSeason(select.value);
    // On the Players/Teams pages the season is part of the address, so links can be shared.
    const page = location.hash.match(/^#\/(players|teams|standings|hubs|player\/\d+|team\/\d+)\b/);
    if (page) location.hash = withSeason(location.hash, select.value);
    else render();
  });

  // Light/dark switch.
  document.getElementById("theme-toggle").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("theme", next);
    render();                     // redraw so charts pick up the new colors
  });

  window.addEventListener("hashchange", render);
  render();
}

start();
