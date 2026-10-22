// playtypeview.js - the "Play types" tab (player + team pages) and the play-type leaderboard hub.
import { renderTable, esc, pctChip, playerLink, teamAbbrLink } from "../ui.js";
import { withSeason, dataStatus } from "../data.js";
import { PLAY_TYPES, PT_ORDER, FIRST_PLAYTYPE_SEASON, playtypeRows, leaguePPP, profile } from "../playtypes.js";

const p1 = (v) => v == null ? "–" : (100 * v).toFixed(1);
const SMALL = 25;   // possessions: below this the numbers are a small sample

export async function renderPlayTypes(box, { season, playerId, teamId }) {
  if (season < FIRST_PLAYTYPE_SEASON) { box.innerHTML = `<p class="callout">Not tracked in this era: NBA.com play-type data starts in ${FIRST_PLAYTYPE_SEASON}.</p>`; return; }
  let rows;
  try { rows = await playtypeRows(season); } catch { box.innerHTML = `<p class="muted">No play-type data for ${season} yet.</p>`; return; }
  const lg = leaguePPP(rows);
  const who = playerId ? "P" : "T", id = playerId || teamId;
  let side = "off";

  box.innerHTML = `
    <div class="toolbar"><div class="tabs" id="pt-side"><button data-v="off" class="active">${playerId ? "How he scores" : "Offense"}</button>
      <button data-v="def">${playerId ? "Defending (as the main defender)" : "Defense"}</button></div>
      <a class="small" href="${withSeason("#/hubs/playtypes", season)}">play-type leaderboards →</a></div>
    <div id="pt-body"></div>
    <p class="muted small">Source: Synergy Sports play-type data as published on NBA.com/stats (SynergyPlayTypes) via nba_api, ${season} regular season.
      <b>Freq</b> = share of ${playerId ? "his" : "the team's"} tracked plays; <b>PPP</b> = points per possession; the chip is NBA.com's percentile among
      ${playerId ? "players" : "teams"} for that play type (100 = best${"; on defense, best = fewest points allowed"}). Plays under ${SMALL} possessions are grayed out as small samples.</p>`;

  const draw = () => {
    const prof = profile(rows, { who, side, id });
    const body = box.querySelector("#pt-body");
    if (!prof.length) { body.innerHTML = `<p class="muted">No ${side === "off" ? "offensive" : "defensive"} play-type data for ${season}.</p>`; return; }
    const maxF = Math.max(...prof.map((r) => r.FREQ || 0));
    const sorted = [...prof].sort((a, b) => b.POSS - a.POSS);
    body.innerHTML = `<div class="card pt-list">${sorted.map((r) => {
      const d = r.PPP != null && lg[r.PLAY_TYPE].PPP != null ? r.PPP - lg[r.PLAY_TYPE].PPP : null;
      const good = side === "off" ? d > 0 : d < 0;
      return `<div class="pt-row ${r.POSS < SMALL ? "small-sample" : ""}" title="${esc(PLAY_TYPES[r.PLAY_TYPE][1])}">
        <span class="pt-name">${esc(PLAY_TYPES[r.PLAY_TYPE][0])}</span>
        <span class="pt-freq"><i style="width:${(100 * (r.FREQ || 0) / maxF).toFixed(0)}%"></i><b>${p1(r.FREQ)}%</b></span>
        <span class="pt-ppp"><b>${r.PPP?.toFixed(2) ?? "–"}</b> PPP</span>
        <span class="pt-vs ${d == null ? "" : good ? "pos" : "neg"}">${d == null ? "" : `${d >= 0 ? "+" : ""}${d.toFixed(2)} vs lg`}</span>
        <span>${r.PERCENTILE == null ? `<span class="muted small">traded</span>` : pctChip(Math.round(100 * r.PERCENTILE))}</span>
        <span class="muted small">${r.POSS} poss</span></div>`;
    }).join("")}</div>
    <h3 style="margin-top:16px">Details</h3><div id="pt-table"></div>`;
    renderTable(body.querySelector("#pt-table"), {
      rows: sorted, entity: "players", rank: false, pageSize: 20,
      columns: [
        { key: "PLAY_TYPE", label: "Play type", left: true, html: (r) => esc(PLAY_TYPES[r.PLAY_TYPE][0]) },
        { key: "POSS", label: "Poss", title: "Possessions ending with this play type", html: (r) => r.POSS },
        { key: "FREQ", label: "Freq", title: "Share of tracked plays", html: (r) => p1(r.FREQ) },
        { key: "PPP", label: "PPP", title: "Points per possession", html: (r) => r.PPP?.toFixed(3) ?? "–" },
        { key: "LG", label: "Lg PPP", title: "League points per possession on this play type", html: (r) => lg[r.PLAY_TYPE].PPP?.toFixed(3) ?? "–" },
        { key: "PERCENTILE", label: "Pctile", title: "NBA.com percentile (100 = best)", html: (r) => r.PERCENTILE == null ? "–" : Math.round(100 * r.PERCENTILE) },
        { key: "FG_PCT", label: "FG%", html: (r) => p1(r.FG_PCT) },
        { key: "EFG_PCT", label: "eFG%", html: (r) => p1(r.EFG_PCT) },
        { key: "TOV_POSS_PCT", label: "TOV%", title: "Share of these possessions ending in a turnover", html: (r) => p1(r.TOV_POSS_PCT) },
        { key: "SCORE_POSS_PCT", label: "Score%", title: "Share of these possessions where points were scored", html: (r) => p1(r.SCORE_POSS_PCT) },
        { key: "PTS", label: "PTS", html: (r) => r.PTS },
      ],
    });
  };
  box.querySelectorAll("#pt-side button").forEach((b) => b.addEventListener("click", () => {
    box.querySelectorAll("#pt-side button").forEach((x) => x.classList.toggle("active", x === b)); side = b.dataset.v; draw();
  }));
  draw();
}

// ---- Leaderboard hub: #/hubs/playtypes?type=Isolation&side=off&entity=players&min=50 ----
export async function playtypeHub(box, { season, params }) {
  const type = PT_ORDER.includes(params.get("type")) ? params.get("type") : "Isolation";
  const side = params.get("side") === "def" ? "def" : "off";
  const entity = params.get("entity") === "teams" ? "teams" : "players";
  const min = Number(params.get("min") || (entity === "players" ? 100 : 0));
  if (!dataStatus("playtypes", season).ok) { box.innerHTML = dataStatus("playtypes", season).html; return; }
  let rows;
  try { rows = await playtypeRows(season); } catch { box.innerHTML = `<p class="muted">No play-type data for ${season} yet.</p>`; return; }
  const link = (extra) => withSeason("#/hubs/playtypes", season, { type, side, entity, min, ...extra });
  const list = rows.filter((r) => r.WHO === (entity === "players" ? "P" : "T") && r.SIDE === side && r.PLAY_TYPE === type && r.POSS >= min)
    .map((r) => ({ ...r, PPP_: r.PPP, PCTL: Math.round(100 * r.PERCENTILE) }));
  const lg = leaguePPP(rows)[type];
  box.innerHTML = `
    <div class="toolbar">
      <div class="tabs">${["players", "teams"].map((e) => `<a class="tab-link ${e === entity ? "active" : ""}" href="${link({ entity: e, min: e === "players" ? 100 : 0 })}">${e === "players" ? "Players" : "Teams"}</a>`).join("")}</div>
      <div class="tabs">${["off", "def"].map((s) => `<a class="tab-link ${s === side ? "active" : ""}" href="${link({ side: s })}">${s === "off" ? "Offense" : "Defense"}</a>`).join("")}</div>
      <label class="small">Play type <select id="pt-type">${PT_ORDER.map((t) => `<option value="${t}" ${t === type ? "selected" : ""}>${esc(PLAY_TYPES[t][0])}</option>`).join("")}</select></label>
      <label class="small">Min possessions <input type="number" id="pt-min" value="${min}" min="0" step="25" style="width:80px"></label>
    </div>
    <p class="muted small">${esc(PLAY_TYPES[type][1])} League average: ${lg.PPP?.toFixed(3) ?? "–"} points per possession.
      ${side === "def" ? "On defense, lower PPP is better." : ""}</p>
    <div id="pt-lead"></div>
    <p class="muted small">Source: Synergy Sports play-type data as published on NBA.com/stats (via nba_api). Traded players appear once per team.</p>`;
  box.querySelector("#pt-type").addEventListener("change", (e) => { location.hash = link({ type: e.target.value }); });
  box.querySelector("#pt-min").addEventListener("change", (e) => { location.hash = link({ min: e.target.value }); });
  const name = entity === "players" ? [{ key: "PLAYER_NAME", label: "Player", left: true, html: playerLink }, { key: "TEAM_ABBREVIATION", label: "Team", left: true, html: teamAbbrLink }]
    : [{ key: "TEAM_ABBREVIATION", label: "Team", left: true, html: (r) => `<a href="#/team/${r.TEAM_ID}?tab=playtypes&season=${season}">${esc(r.TEAM_ABBREVIATION)}</a>` }];
  renderTable(box.querySelector("#pt-lead"), {
    rows: list, entity, sortKey: "PPP_", sortAsc: side === "def", pageSize: 50, highlight: "PPP_",
    columns: [...name, { key: "GP", label: "G", html: (r) => r.GP }, { key: "POSS", label: "Poss", html: (r) => r.POSS },
      { key: "POSS_PCT", label: "Freq", title: "Share of his/their plays", html: (r) => p1(r.POSS_PCT) },
      { key: "PPP_", label: "PPP", title: "Points per possession", html: (r) => r.PPP.toFixed(3) },
      { key: "PCTL", label: "Pctile", title: "NBA.com percentile (100 = best)", html: (r) => pctChip(r.PCTL) },
      { key: "PTS", label: "PTS", html: (r) => r.PTS }, { key: "FG_PCT", label: "FG%", html: (r) => p1(r.FG_PCT) },
      { key: "EFG_PCT", label: "eFG%", html: (r) => p1(r.EFG_PCT) }, { key: "TOV_POSS_PCT", label: "TOV%", html: (r) => p1(r.TOV_POSS_PCT) },
      { key: "SCORE_POSS_PCT", label: "Score%", html: (r) => p1(r.SCORE_POSS_PCT) }],
  });
}
