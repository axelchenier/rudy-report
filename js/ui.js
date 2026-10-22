// ui.js - small reusable building blocks: a sortable table, safe HTML, and team colors.
import { STATS, fmt } from "./stats.js";

// Escape text before putting it inside HTML (so names like "O'Neal" can't break the page).
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const el = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };

// Rank of `value` among `values` (1 = best). lowerBetter flips the direction.
export function rankOf(value, values, lowerBetter = false) {
  if (value == null) return null;
  return values.filter((v) => v != null && (lowerBetter ? v < value : v > value)).length + 1;
}
// Percentile 0-100 (100 = best in the league).
export function percentile(value, values, lowerBetter = false) {
  const vals = values.filter((v) => v != null);
  if (value == null || !vals.length) return 0;
  const below = vals.filter((v) => (lowerBetter ? v > value : v < value)).length;
  return Math.round((below / Math.max(vals.length - 1, 1)) * 100);
}

/**
 * renderTable - draws a sortable data table into `container`.
 *  rows      : list of objects (one per player/team)
 *  columns   : list of { key, label?, left?, html?(row) , cls? } ; stat keys get formatted automatically
 *  entity    : "players" or "teams" (affects number formatting)
 *  sortKey   : column to sort by at the start ; pageSize: rows shown before "Show more"
 *  highlight : stat key to highlight (e.g. the stat a question asked about)
 */
export function renderTable(container, { rows, columns, entity, sortKey, sortAsc = false, pageSize = 100, highlight, rank = true, best = false }) {
  let key = sortKey, asc = sortAsc, shown = pageSize;

  // For the Compare page: find the best value in each stat column.
  const bestOf = {};
  if (best) for (const c of columns) if (STATS[c.key]) {
    const vals = rows.map((r) => r[c.key]).filter((v) => v != null);
    bestOf[c.key] = STATS[c.key].lowerBetter ? Math.min(...vals) : Math.max(...vals);
  }

  function draw() {
    const sorted = key ? [...rows].sort((a, b) => {
      const x = a[key], y = b[key];
      if (x == null) return 1; if (y == null) return -1;
      const d = typeof x === "string" ? x.localeCompare(y) : x - y;
      return asc ? d : -d;
    }) : rows;
    const visible = sorted.slice(0, shown);
    const head = (rank ? `<th class="rk">#</th>` : "") + columns.map((c) => {
      const label = c.label || STATS[c.key]?.label || c.key;
      const title = STATS[c.key]?.name || label;
      return `<th data-key="${c.key}" title="${esc(title)}" class="${c.left ? "left" : ""} ${c.key === key ? "sorted" + (asc ? " asc" : "") : ""}">${esc(label)}</th>`;
    }).join("");
    const body = visible.map((r, i) => `<tr>${rank ? `<td class="rk">${i + 1}</td>` : ""}${columns.map((c) => {
      const content = c.html ? c.html(r) : (STATS[c.key] ? fmt(r[c.key], c.key, entity) : esc(r[c.key]));
      const cls = [c.left ? "left" : "", c.key === highlight ? "hl" : "", best && STATS[c.key] && r[c.key] === bestOf[c.key] && rows.length > 1 ? "best" : ""].join(" ");
      return `<td class="${cls}">${content}</td>`;
    }).join("")}</tr>`).join("");
    container.innerHTML = `<div class="table-wrap"><table class="data"><thead><tr>${head}</tr></thead><tbody>${body ||
      `<tr><td colspan="${columns.length + 1}" class="left muted">No rows match these filters.</td></tr>`}</tbody></table></div>
      ${sorted.length > shown ? `<button class="btn show-more">Show all ${sorted.length} rows</button>` : `<p class="muted small">${sorted.length} rows</p>`}`;
    container.querySelectorAll("th[data-key]").forEach((th) => th.addEventListener("click", () => {
      const k = th.dataset.key;
      if (k === key) asc = !asc; else { key = k; asc = typeof rows[0]?.[k] === "string" || !!STATS[k]?.lowerBetter; }
      draw();
    }));
    container.querySelector(".show-more")?.addEventListener("click", () => { shown = Infinity; draw(); });
  }
  draw();
}

// Link helpers for names inside tables.
export const playerLink = (r) => `<a href="#/player/${r.PLAYER_ID}">${esc(r.PLAYER_NAME)}</a>`;
export const teamLink = (r) => `<a href="#/team/${r.TEAM_ID}">${esc(r.TEAM_NAME || r.TEAM_ABBREVIATION)}</a>`;
export const teamAbbrLink = (r) => `<a href="#/team/${r.TEAM_ID}">${esc(r.TEAM_ABBREVIATION)}</a>`;

// Colors for up to 4 compared players/teams.
export const PALETTE = ["#ff7a1a", "#4f8cff", "#3fb950", "#c678dd"];

// Chart.js colors that follow the light/dark theme.
export function chartTheme() {
  const css = getComputedStyle(document.documentElement);
  return { text: css.getPropertyValue("--muted").trim(), grid: css.getPropertyValue("--border").trim() };
}
