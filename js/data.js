// data.js - loads the JSON files made by pipeline/fetch_data.py.
// Each file is downloaded only once, then kept in memory ("cached").

const cache = new Map();
export let META = null;          // contents of data/meta.json (seasons, source, pull date)

async function getJSON(path) {
  if (!cache.has(path)) {
    cache.set(path, fetch(path).then((r) => {
      if (!r.ok) throw new Error(`Could not load ${path} (${r.status})`);
      return r.json();
    }));
  }
  return cache.get(path);
}

export async function loadMeta() {
  META = await getJSON("data/meta.json");
  return META;
}

export const SEASONS = () => META.seasons.map((s) => s.season);   // newest first
export const completeSeasons = () => META.seasons.filter((s) => !s.in_progress).map((s) => s.season);

// The season picked in the header (remembered between visits).
export function currentSeason() {
  const saved = localStorage.getItem("season");
  // Default: META.default_season (the last COMPLETE season until the new one has ~20 games).
  return SEASONS().includes(saved) ? saved : (META.default_season || SEASONS()[0]);
}
export function setSeason(season) { localStorage.setItem("season", season); }

// kind = "players" | "players_totals" | "players_per36" | "teams" | "teams_totals" | "teams_per100"
export function load(kind, season = currentSeason()) {
  return getJSON(`data/${season}/${kind}.json`);
}

// Load one kind of file for EVERY season (used for season-by-season history).
export async function loadAllSeasons(kind) {
  const lists = await Promise.all(SEASONS().map((s) => load(kind, s)));
  return lists.flat();
}

// Games in the season so far (the most games any team has played). Used for "qualified" filters.
export function seasonGames(season = currentSeason()) {
  return META.seasons.find((s) => s.season === season)?.max_team_games || 82;
}

// A player "qualifies" for league rankings if he played at least 70% of the season's games
// (the same rule NBA.com uses for its stat leaderboards).
export const QUALIFY_SHARE = 0.7;
export const qualifies = (p, season) => p.GP >= Math.ceil(seasonGames(season) * QUALIFY_SHARE);

// ---- Season in the address bar (#/players?season=2024-25&mode=advanced) ----
// If the address names a valid season, make it the current season (and update the header picker).
export function seasonFromQuery(query = "") {
  const wanted = new URLSearchParams(query).get("season");
  if (wanted && SEASONS().includes(wanted) && wanted !== currentSeason()) {
    setSeason(wanted);
    const picker = document.getElementById("season-select");
    if (picker) picker.value = wanted;
  }
  return currentSeason();
}
// Return the same address with ?season=... set (other settings like &mode= are kept).
export function withSeason(hash, season, extra = {}) {
  const [path, query = ""] = hash.split("?");
  const params = new URLSearchParams(query);
  params.set("season", season);
  for (const [k, v] of Object.entries(extra)) params.set(k, v);
  return `${path}?${params}`;
}
// A season dropdown for a page (stays in sync with the header picker through the address).
export function seasonSelectHTML(season, id = "page-season") {
  const label = (s) => META.seasons.find((x) => x.season === s)?.in_progress ? `${s} (in progress)` : s;
  return `<label class="page-season">Season <select id="${id}">${SEASONS().map((s) =>
    `<option value="${s}" ${s === season ? "selected" : ""}>${label(s)}</option>`).join("")}</select></label>`;
}
