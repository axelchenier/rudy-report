// cdata.js - loads the College JSON files made by pipeline/college_fetch.py (lazy: one season at a time).
const cache = new Map();
export let CMETA = null;

async function getJSON(path) {
  if (!cache.has(path)) cache.set(path, fetch(path).then((r) => {
    if (!r.ok) throw new Error(`Could not load ${path} (${r.status})`);
    return r.json();
  }).then(expand));
  return cache.get(path);
}
// players.json is stored "column-wise" ({cols, rows}) to keep it small; turn it back into objects.
function expand(obj) {
  if (obj && Array.isArray(obj.cols) && Array.isArray(obj.rows)) return obj.rows.map((r) => Object.fromEntries(obj.cols.map((c, i) => [c, r[i]])));
  return obj;
}

export async function loadCMeta() { if (!CMETA) CMETA = await getJSON("data/college/meta.json"); return CMETA; }
export const CSEASONS = () => CMETA.seasons.map((s) => s.season);                       // newest first, incl. preseason
export const playedSeasons = () => CMETA.seasons.filter((s) => !s.preseason).map((s) => s.season);
export const seasonInfo = (s) => CMETA.seasons.find((x) => x.season === s) || {};

export function currentCSeason() {
  const saved = localStorage.getItem("cseason");
  return CSEASONS().includes(saved) ? saved : CMETA.default_season;
}
export function setCSeason(s) { localStorage.setItem("cseason", s); }
export function cseasonFromQuery(query = "") {
  const wanted = new URLSearchParams(query).get("season");
  if (wanted && CSEASONS().includes(wanted)) setCSeason(wanted);
  return currentCSeason();
}
export function cload(kind, season = currentCSeason()) {
  const info = seasonInfo(season);
  if (kind === "players" && info.preseason) return Promise.resolve([]);   // no games yet
  return getJSON(`data/college/${season}/${kind}.json`);
}
export async function careerOf(pid) {
  const rows = await getJSON(`data/college/careers/${pid % 100}.json`);
  return rows.filter((r) => r.PID === pid);
}
export function cseasonSelectHTML(season, id = "page-season") {
  const label = (s) => { const i = seasonInfo(s); return i.preseason ? `${s} (preseason ratings)` : i.in_progress ? `${s} (in progress)` : s; };
  return `<label class="page-season">Season <select id="${id}">${CSEASONS().map((s) =>
    `<option value="${s}" ${s === season ? "selected" : ""}>${label(s)}</option>`).join("")}</select></label>`;
}
// Record strings like "25-2" from the ESPN home/away counts.
export function addRecords(t) {
  if (t.HOME_W != null) { t.HOME_REC = `${t.HOME_W}-${t.HOME_L}`; t.AWAY_REC = `${t.AWAY_W}-${t.AWAY_L}`; }
  t.REC = t.W != null ? `${t.W}-${t.L}` : "0-0";
  return t;
}
export const TORVIK_CREDIT = `<a href="https://barttorvik.com/" target="_blank" rel="noopener">barttorvik.com</a> (T-Rank)`;
// "Qualified" college player for leaderboards: Torvik's own default, at least 40% of team minutes.
export const C_QUAL_MIN_PCT = 0.4;
