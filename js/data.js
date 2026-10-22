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

// ---- Combined files (pipeline/build_indexes.py), so pages don't download all 31 seasons ----
const unpackRows = (c) => c.rows.map((r) => Object.fromEntries(c.cols.map((k, i) => [k, r[i]])));
// Every season row of one player. kind = "players" | "players_totals" | "players_per36" (same names as the season files).
export async function loadCareer(kind, playerId) {
  const dir = { players: "pergame", players_totals: "totals", players_per36: "per36" }[kind];
  return unpackRows(await getJSON(`data/careers/${dir}/p_${String(playerId % 40).padStart(2, "0")}.json`));
}
export const loadPlayerIndex = async () => unpackRows(await getJSON("data/index/players.json"));
export const loadSimilarPool = async () => unpackRows(await getJSON("data/index/similar.json"));

// ---- "Not tracked in this era" ----
// First season each kind of NBA.com data exists. Before that NBA.com didn't track it at all.
export const ERA = {
  tracking: ["2013-14", "Player tracking (camera data)"],
  hustle: ["2015-16", "Hustle stats"],
  playtypes: ["2015-16", "Synergy play types"],
  lineups: ["2007-08", "Lineup and on/off data"],
  shots: ["1996-97", "Shot location data"],
  clutch: ["1996-97", "Clutch stats"],
  gamelogs: ["1996-97", "Game logs"],
  bpm: ["2016-17", "Box Plus/Minus"],
};
const HISTORY_FILES = new Set(["gamelogs"]);       // the only optional kinds built for 1996-97..2015-16 (pipeline/build_history.py)
/**
 * Is this kind of data available for this season?
 *   { ok: true } or { ok: false, era: true, html }  (NBA.com didn't track it then)
 *               or { ok: false, era: false, html } (it exists, but this site hasn't loaded it for that season)
 */
export function dataStatus(kind, season) {
  const [first, what] = ERA[kind] || ["1996-97", kind];
  if (kind === "bpm" && META.seasons.find((s) => s.season === season)?.in_progress) return { ok: false, era: false,
    html: `<p class="callout">Box Plus/Minus isn't loaded for the season in progress (${season}).</p>` };
  if (kind === "bpm") return season >= first ? { ok: true } : { ok: false, era: false,
    html: `<p class="callout">Not available here for ${season}: this site only uses Basketball-Reference's credited BPM column for ${first} onward.</p>` };
  if (season < first) return { ok: false, era: true,
    html: `<p class="callout not-tracked"><b>Not tracked in this era.</b> ${esc(what)} on NBA.com start in ${first}, so there is nothing for ${season}.</p>` };
  const info = META.seasons.find((s) => s.season === season);
  if (info?.era === "history" && !HISTORY_FILES.has(kind)) return { ok: false, era: false,
    html: `<p class="callout">${esc(what)} exist on NBA.com for ${season}, but this site hasn't loaded them for seasons before 2016-17 yet.</p>` };
  return { ok: true };
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
