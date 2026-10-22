// app.js - the "traffic controller". It looks at the address bar (#/players, #/team/123, ...)
// and shows the matching page inside <main id="app">.
import { loadMeta, META, SEASONS, currentSeason, setSeason } from "./data.js";
import { esc } from "./ui.js";
import { askPage } from "./pages/ask.js";
import { playersPage } from "./pages/players.js";
import { teamsPage } from "./pages/teams.js";
import { playerPage } from "./pages/player.js";
import { teamPage } from "./pages/team.js";
import { comparePage } from "./pages/compare.js";
import { reportsPage } from "./pages/reports.js";

const app = document.getElementById("app");

// Each route: a pattern for the address and the function that draws that page.
const routes = [
  [/^#?\/?$/, askPage, "ask"],
  [/^#\/ask(?:\?(.*))?$/, askPage, "ask"],
  [/^#\/players$/, playersPage, "players"],
  [/^#\/teams$/, teamsPage, "teams"],
  [/^#\/player\/(\d+)$/, playerPage, "players"],
  [/^#\/team\/(\d+)$/, teamPage, "teams"],
  [/^#\/compare(?:\?(.*))?$/, comparePage, "compare"],
  [/^#\/reports(?:\/(daily|weekly|monthly))?(?:\/([\w-]+))?$/, reportsPage, "reports"],
];

async function render() {
  const hash = location.hash || "#/";
  const match = routes.find(([re]) => re.test(hash));
  const [re, page, navKey] = match || routes[0];
  const params = hash.match(re)?.slice(1) || [];
  document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === navKey));
  app.innerHTML = `<p class="muted">Loading…</p>`;
  try {
    await page(app, ...params);
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="card"><h3>Something went wrong</h3><p class="muted">${esc(err.message)}</p></div>`;
  }
  window.scrollTo(0, 0);
}

async function start() {
  await loadMeta();

  // Fill the season dropdown in the header.
  const select = document.getElementById("season-select");
  select.innerHTML = SEASONS().map((s) => `<option value="${s}">${s}</option>`).join("");
  select.value = currentSeason();
  select.addEventListener("change", () => { setSeason(select.value); render(); });

  // Light/dark switch.
  document.getElementById("theme-toggle").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("theme", next);
    render();                     // redraw so charts pick up the new colors
  });

  // Footer: where the data came from and when.
  const seasons = SEASONS();
  document.getElementById("footer-text").innerHTML =
    `Data: <a href="${META.source_url}" target="_blank" rel="noopener">NBA.com/stats</a> via the free nba_api Python library · ` +
    `${esc(META.season_type)}, ${seasons[seasons.length - 1]} to ${seasons[0]} · pulled ${esc(META.pulled_at_utc)}. ` +
    `<span class="muted">Built by Axel Chenier. Not affiliated with the NBA.</span>`;

  window.addEventListener("hashchange", render);
  render();
}

start();
