// hubs.js (page) - leaderboards for Clutch, Hustle and Tracking stats.
// Address: #/hubs/<clutch|hustle|tracking>?entity=players|teams&season=2025-26&group=0
import { seasonFromQuery, seasonSelectHTML, withSeason, seasonGames, QUALIFY_SHARE } from "../data.js";
import { renderTable, esc, playerLink, teamAbbrLink } from "../ui.js";
import { HUBS, hubRows, inPool, existsFor, FIRST_SEASON } from "../hubs.js";
import { CLUTCH_NOTE } from "../glossary.js";

export async function hubsPage(app, kind = "clutch", query = "") {
  kind = kind || "clutch";
  const params = new URLSearchParams(query);
  const season = seasonFromQuery(query);
  const hub = HUBS[kind];
  const entity = kind === "tracking" ? "players" : (params.get("entity") === "teams" ? "teams" : "players");
  const group = Math.min(Number(params.get("group") || 0), hub.groups.length - 1);
  const minGP = Math.ceil(seasonGames(season) * QUALIFY_SHARE);
  const link = (extra) => withSeason(`#/hubs/${kind}`, season, { entity, group, ...extra });

  app.innerHTML = `
    <div class="page-head"><div><h1>Stat hubs</h1>
      <p class="sub">Clutch, hustle and player-tracking leaderboards from NBA.com/stats.</p></div>
      ${seasonSelectHTML(season, "hub-season")}</div>
    <nav class="page-tabs">${Object.entries(HUBS).map(([k, h]) =>
      `<a href="${withSeason(`#/hubs/${k}`, season)}" class="${k === kind ? "active" : ""}">${h.title}</a>`).join("")}</nav>
    <div class="toolbar">
      ${kind === "tracking" ? "" : `<div class="tabs">${["players", "teams"].map((e) =>
        `<a class="tab-link ${e === entity ? "active" : ""}" href="${withSeason(`#/hubs/${kind}`, season, { entity: e, group })}">${e === "players" ? "Players" : "Teams"}</a>`).join("")}</div>`}
      <div class="tabs">${hub.groups.map(([title], i) =>
        `<a class="tab-link ${i === group ? "active" : ""}" href="${link({ group: i })}">${esc(title)}</a>`).join("")}</div>
      ${entity === "players" ? `<input type="search" id="hub-q" placeholder="Find a player">
        <label class="small"><input type="checkbox" id="hub-all"> include small samples</label>` : ""}
    </div>
    <p class="muted small">${esc(kind === "clutch" ? CLUTCH_NOTE + " Numbers are season totals in clutch time." : hub.note)}</p>
    <div id="hub"></div>
    <p class="muted small">Source: NBA.com/stats ${kind} dashboards via nba_api. Hover a column name for its definition.</p>`;

  app.querySelector("#hub-season").addEventListener("change", (e) => { location.hash = withSeason(location.hash, e.target.value); });
  const box = app.querySelector("#hub");
  if (!existsFor(kind, season)) { box.innerHTML = `<p class="callout">Not tracked in this era: NBA.com ${kind} data starts in ${FIRST_SEASON[kind]}.</p>`; return; }
  const rows = await hubRows(kind, entity, season).catch(() => []);
  if (!rows.length) { box.innerHTML = `<p class="muted">No ${hub.title.toLowerCase()} data for ${season} yet.</p>`; return; }

  const keys = hub.groups[group][1];
  const nameCols = entity === "players"
    ? [{ key: "PLAYER_NAME", label: "Player", left: true, html: playerLink }, { key: "TEAM_ABBREVIATION", label: "Team", left: true, html: teamAbbrLink }]
    : [{ key: "TEAM_NAME", label: "Team", left: true, html: (r) => `<a href="#/team/${r.TEAM_ID}?tab=more&season=${season}">${esc(r.TEAM_NAME)}</a>` }];
  const extra = kind === "clutch" ? [] : [{ key: "GP" }, { key: "MIN" }];
  const whole = (k) => (r) => r[k] == null ? "–" : (k === "PLUS_MINUS" && r[k] > 0 ? "+" : "") + Math.round(r[k]).toLocaleString();
  const columns = [...nameCols, ...extra, ...keys.map((key) => hub.ints?.includes(key) ? { key, html: whole(key) } : { key })];
  const sortKey = keys.includes(hub.sort) ? hub.sort : keys.find((k) => !["GP", "MIN", "W", "L"].includes(k)) || keys[0];

  const draw = () => {
    const q = (app.querySelector("#hub-q")?.value || "").toLowerCase();
    const all = app.querySelector("#hub-all")?.checked;
    const shown = rows.filter((r) => (entity === "teams" || all || inPool(kind, r, minGP)) &&
      (!q || String(r.PLAYER_NAME).toLowerCase().includes(q)));
    renderTable(box, { rows: shown, columns, entity, sortKey, sortAsc: false, pageSize: 50, highlight: sortKey });
    if (entity === "players" && !all) box.insertAdjacentHTML("beforeend", `<p class="muted small">Showing players with
      ${kind === "clutch" ? "20+ clutch minutes" : `${minGP}+ games (70% of the season so far)`}. Tick “include small samples” to see everyone.</p>`);
  };
  app.querySelector("#hub-q")?.addEventListener("input", draw);
  app.querySelector("#hub-all")?.addEventListener("change", draw);
  draw();
}
