// draft_nav.js - the tab bar shared by every Draft page (2027 board, past classes, college-to-NBA translation).
export function draftNav(active) {
  const items = [["board", "2027 Model Board", "#/draft"], ["history", "Draft classes 2008-2026", "#/draft/history"],
    ["college", "College hub", "#/college"]];
  return `<div class="tabs" style="margin-bottom:12px;flex-wrap:wrap">${items.map(([k, l, h]) =>
    `<a class="tab-link ${k === active ? "active" : ""}" href="${h}">${l}</a>`).join("")}</div>`;
}
const _cache = new Map();
export const getJSON = (path) => { if (!_cache.has(path)) _cache.set(path, fetch(path).then((r) => { if (!r.ok) throw new Error(`Could not load ${path}`); return r.json(); })); return _cache.get(path); };
// Outcome labels from pipeline/college_nba.py (NBA.com regular-season minutes; no Basketball-Reference stats).
export const TIERS = { starter: ["Starter", "2+ seasons with 2,000+ minutes"], rotation: ["Rotation", "5,000+ career minutes"],
  played: ["Played", "under 5,000 career minutes"], none: ["No NBA games", "no regular-season games yet"] };
export const tierTag = (t) => `<span class="tier tier-${t}" title="${TIERS[t][1]}">${TIERS[t][0]}</span>`;
// Our NBA pages cover every player in the NBA.com data (1996-97 on); otherwise link out to NBA.com.
export const nbaLink = (id, name, inData) => inData ? `<a href="#/player/${id}">${name}</a>`
  : `<a href="https://www.nba.com/stats/player/${id}" target="_blank" rel="noopener">${name} ↗</a>`;
export const NBA_CREDIT = `<a href="https://www.nba.com/stats/draft/history" target="_blank" rel="noopener">NBA.com Draft History</a> and NBA.com regular-season stats (via nba_api)`;
