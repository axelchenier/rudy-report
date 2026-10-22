// footer.js - the site footer credits the data sources of the section you're looking at:
// NBA pages -> NBA.com/stats; College pages -> Bart Torvik + ESPN; Draft pages -> those plus the NBA Draft Combine.
import { META, SEASONS } from "./data.js";
import { esc } from "./ui.js";
import { loadCMeta } from "./college/cdata.js";

const link = (href, text) => `<a href="${href}" target="_blank" rel="noopener">${text}</a>`;
const TORVIK = link("https://barttorvik.com/", "Bart Torvik's T-Rank") + " (barttorvik.com bulk CSV files)";
const ESPN = `ESPN box scores via the free ${link("https://github.com/sportsdataverse/sportsdataverse-py", "sportsdataverse")} package`;
const COMBINE = link("https://www.nba.com/stats/draft/combine", "NBA.com Draft Combine") + " measurements (via nba_api)";
const DRAFTHIST = link("https://www.nba.com/stats/draft/history", "NBA.com Draft History") + " and NBA.com regular-season stats (via nba_api)";
const SIGN = `<span class="muted">Built by Axel Chenier. Not affiliated with the NBA, the NCAA or any data source.</span>`;

export function footerSection(hash) {
  if (/^#\/draft\b/.test(hash)) return "draft";
  if (/^#\/college\b/.test(hash)) return "college";
  return "nba";
}

export async function setFooter(hash = location.hash || "#/") {
  const el = document.getElementById("footer-text");
  if (!el) return;
  const section = footerSection(hash);
  if (section === "nba") {
    const s = SEASONS();
    el.innerHTML = `Data: ${link(META.source_url, "NBA.com/stats")} via the free nba_api Python library · ` +
      `${esc(META.season_type)}, ${s[s.length - 1]} to ${s[0]} · pulled ${esc(META.pulled_at_utc)}. ${SIGN}`;
    el.dataset.section = "nba";
    return;
  }
  const cm = await loadCMeta().catch(() => null);
  const pulled = cm ? ` · pulled ${esc(cm.pulled_at_utc)}` : "";
  const range = cm ? ` · seasons ${cm.seasons[cm.seasons.length - 1].season} to ${cm.seasons[0].season}` : "";
  el.innerHTML = section === "college"
    ? `College data (NCAA men's Division I): ${TORVIK} and ${ESPN}${range}${pulled}. ${SIGN}`
    : `Draft data: picks and NBA careers from ${DRAFTHIST}; college stats from ${TORVIK} and ${ESPN}; ${COMBINE}. Board order is a Rudy Report model estimate, not a scouting ranking${pulled}. ${SIGN}`;
  el.dataset.section = section;
}
