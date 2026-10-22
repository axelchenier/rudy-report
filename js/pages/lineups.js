// lineups.js - lineups and on/off (team + player pages) and the WOWY ("with or without you") explorer.
// Lineups and on/off: NBA.com/stats (LeagueDashLineups, TeamPlayerOnOffSummary), saved nightly by pipeline/fetch_advanced.py.
// WOWY: asked live from the free PBP Stats API (api.pbpstats.com, by Darryl Blackport) and cached in your browser.
import { load, SEASONS, currentSeason } from "../data.js";
import { fmt } from "../stats.js";
import { renderTable, esc, unpack } from "../ui.js";

const cache = new Map();
const lineupFile = (season) => {
  if (!cache.has(season)) cache.set(season, fetch(`data/${season}/lineups.json`).then((r) => {
    if (!r.ok) throw new Error("no lineups"); return r.json();
  }).then(unpack));
  return cache.get(season);
};
const flipName = (n) => n.includes(", ") ? n.split(", ").reverse().join(" ") : n;
const p1 = (v) => v == null ? "–" : (100 * v).toFixed(1);
const net = (v) => v == null ? "–" : `<span class="${v > 0 ? "pos" : v < 0 ? "neg" : ""}">${fmt(v, "NET_RATING")}</span>`;

// ---- on/off rows for one team: [{ PLAYER_ID, name, on: {...}, off: {...}, diff }]
export async function onOffRows(season, teamId) {
  const rows = (await load("onoff", season)).filter((r) => r.TEAM_ID === teamId);
  const by = new Map();
  for (const r of rows) {
    const e = by.get(r.PLAYER_ID) || { PLAYER_ID: r.PLAYER_ID, PLAYER_NAME: flipName(r.PLAYER_NAME) };
    e[r.COURT_STATUS === "On" ? "on" : "off"] = r;
    by.set(r.PLAYER_ID, e);
  }
  return [...by.values()].filter((e) => e.on && e.off).map((e) => ({ ...e, ON_MIN: e.on.MIN, ON_NET: e.on.NET_RATING, OFF_NET: e.off.NET_RATING,
    DIFF: e.on.NET_RATING - e.off.NET_RATING, ON_ORTG: e.on.OFF_RATING, OFF_ORTG: e.off.OFF_RATING, ON_DRTG: e.on.DEF_RATING, OFF_DRTG: e.off.DEF_RATING }));
}

function onOffTable(box, rows, minMin) {
  renderTable(box, {
    rows: rows.filter((r) => r.ON_MIN >= minMin), entity: "teams", sortKey: "DIFF", pageSize: 30, rank: false,
    columns: [
      { key: "PLAYER_NAME", label: "Player", left: true, html: (r) => `<a href="#/player/${r.PLAYER_ID}?tab=lineups">${esc(r.PLAYER_NAME)}</a>` },
      { key: "ON_MIN", label: "Min on", title: "Minutes on the floor", html: (r) => Math.round(r.ON_MIN) },
      { key: "ON_ORTG", label: "ORtg on", title: "Team offensive rating with him on the floor" , html: (r) => fmt(r.ON_ORTG, "OFF_RATING") },
      { key: "ON_DRTG", label: "DRtg on", title: "Team defensive rating with him on the floor", html: (r) => fmt(r.ON_DRTG, "DEF_RATING") },
      { key: "ON_NET", label: "Net on", title: "Team net rating with him on the floor", html: (r) => net(r.ON_NET) },
      { key: "OFF_NET", label: "Net off", title: "Team net rating with him on the bench", html: (r) => net(r.OFF_NET) },
      { key: "DIFF", label: "On − Off", title: "Net rating on minus net rating off. Noisy: it also reflects who he plays with and against.", html: (r) => `<b>${net(r.DIFF)}</b>` },
    ],
  });
}

// ---- Team page: Lineups tab ----
export async function renderTeamLineups(box, { season, teamId }) {
  let lineups = [];
  try { lineups = (await lineupFile(season)).filter((r) => r.TEAM_ID === teamId); }
  catch { box.innerHTML = `<p class="muted">No lineup data for ${season} yet.</p>`; return; }
  const onoff = await onOffRows(season, teamId).catch(() => []);
  let n = 5, minMin = 50;
  box.innerHTML = `
    <div class="toolbar"><div class="tabs" id="lu-n"><button data-v="5" class="active">5-man lineups</button><button data-v="2">2-man pairs</button></div>
      <label class="small">Minimum minutes <input type="range" id="lu-min" min="10" max="500" step="10" value="${minMin}"> <b id="lu-min-v">${minMin}</b></label>
      <a class="btn" href="#/wowy?team=${teamId}&season=${season}">WOWY explorer →</a></div>
    <div id="lu-table"></div>
    <p class="muted small">Ratings are points per 100 possessions while that group was on the floor. Small samples swing wildly; raise the minimum
      minutes to see the reliable ones. Source: NBA.com/stats LeagueDashLineups (5-man groups with 10+ minutes, pairs with 50+).</p>
    <h2>On/off</h2>
    <div id="oo-table"></div>
    <p class="muted small">Team net rating with each player on the floor vs on the bench (NBA.com/stats TeamPlayerOnOffSummary). On/off is
      noisy and depends on teammates and opponents, so treat it as a clue, not a verdict.</p>`;
  const draw = () => {
    const rows = lineups.filter((r) => r.N === n && r.MIN >= minMin).map((r) => ({ ...r, PLAYERS: r.GROUP_NAME }));
    const ids = (r) => r.GROUP_ID.split("-");
    renderTable(box.querySelector("#lu-table"), {
      rows, entity: "teams", sortKey: "MIN", pageSize: 25, rank: false,
      columns: [
        { key: "PLAYERS", label: n === 5 ? "Lineup" : "Pair", left: true, html: (r) => r.GROUP_NAME.split(" - ").map((nm, i) => `<a href="#/player/${ids(r)[i]}">${esc(nm)}</a>`).join(" · ") },
        { key: "GP", label: "G", html: (r) => r.GP }, { key: "MIN", label: "MIN", html: (r) => Math.round(r.MIN) }, { key: "POSS", label: "Poss", html: (r) => r.POSS },
        { key: "OFF_RATING" }, { key: "DEF_RATING" }, { key: "NET_RATING", html: (r) => net(r.NET_RATING) }, { key: "PACE" },
        { key: "EFG_PCT" }, { key: "TS_PCT" }, { key: "TM_TOV_PCT" }, { key: "OREB_PCT" }, { key: "DREB_PCT" },
      ],
    });
    box.querySelector("#lu-table").insertAdjacentHTML("afterbegin", rows.length ? "" : `<p class="muted">No ${n === 5 ? "lineups" : "pairs"} with ${minMin}+ minutes.</p>`);
  };
  box.querySelectorAll("#lu-n button").forEach((b) => b.addEventListener("click", () => {
    box.querySelectorAll("#lu-n button").forEach((x) => x.classList.toggle("active", x === b)); n = Number(b.dataset.v); draw();
  }));
  box.querySelector("#lu-min").addEventListener("input", (e) => { minMin = Number(e.target.value); box.querySelector("#lu-min-v").textContent = minMin; draw(); });
  draw();
  if (onoff.length) onOffTable(box.querySelector("#oo-table"), onoff, 100); else box.querySelector("#oo-table").innerHTML = `<p class="muted">No on/off data for ${season} yet.</p>`;
}

// ---- Player page: Lineups & on/off tab ----
export async function renderPlayerLineups(box, { season, playerId, teamId }) {
  const onoff = await onOffRows(season, teamId).catch(() => []);
  const me = onoff.find((r) => r.PLAYER_ID === playerId);
  let lineups = [];
  try { lineups = (await lineupFile(season)).filter((r) => r.GROUP_ID.split("-").includes(String(playerId))); } catch { /* no file */ }
  const card = (label, v, key) => `<div class="card stat-card"><div class="label">${label}</div><div class="value">${key === "NET_RATING" ? net(v) : fmt(v, key)}</div></div>`;
  box.innerHTML = me ? `
    <div class="grid stat-cards">
      ${card("Team net rating, him ON", me.ON_NET, "NET_RATING")}${card("Team net rating, him OFF", me.OFF_NET, "NET_RATING")}
      ${card("On − Off", me.DIFF, "NET_RATING")}${card("ORtg on / off", null, "")}
    </div>` : `<p class="muted">No on/off numbers for him with this team in ${season}.</p>`;
  if (me) box.querySelector(".stat-card:last-child .value").innerHTML = `${fmt(me.ON_ORTG, "OFF_RATING")} / ${fmt(me.OFF_ORTG, "OFF_RATING")}`;
  box.insertAdjacentHTML("beforeend", `${me ? `<p class="muted small">${Math.round(me.ON_MIN)} minutes on, ${Math.round(me.off.MIN)} off. DRtg on / off:
      ${fmt(me.ON_DRTG, "DEF_RATING")} / ${fmt(me.OFF_DRTG, "DEF_RATING")}. Source: NBA.com/stats TeamPlayerOnOffSummary. On/off is noisy: it also reflects
      teammates and opponents.</p>` : ""}
    <h2>His most-used lineups</h2><div id="pl-lu"></div>
    <p><a class="btn" href="#/wowy?team=${teamId}&season=${season}&with=${playerId}">Explore with/without him (WOWY) →</a></p>`);
  const five = lineups.filter((r) => r.N === 5).sort((a, b) => b.MIN - a.MIN).slice(0, 15);
  renderTable(box.querySelector("#pl-lu"), {
    rows: five, entity: "teams", sortKey: "MIN", pageSize: 15, rank: false,
    columns: [{ key: "GROUP_NAME", label: "Lineup", left: true }, { key: "MIN", label: "MIN", html: (r) => Math.round(r.MIN) },
      { key: "OFF_RATING" }, { key: "DEF_RATING" }, { key: "NET_RATING", html: (r) => net(r.NET_RATING) }, { key: "PACE" }, { key: "TS_PCT" }],
  });
}

// ---- WOWY explorer page: #/wowy?team=ID&season=2025-26&with=id,id&without=id ----
const WOWY_API = "https://api.pbpstats.com/get-wowy-stats/nba";
async function wowy(season, teamId, withIds, withoutIds) {
  const params = new URLSearchParams({ Season: season, SeasonType: "Regular Season", TeamId: teamId, Type: "Team" });
  if (withIds.length) params.set(`0Exactly${withIds.length}OnFloor`, withIds.join(","));
  if (withoutIds.length) params.set("1Exactly0OnFloor", withoutIds.join(","));
  const key = `wowy:${params}`;
  const saved = localStorage.getItem(key);
  if (saved) { const s = JSON.parse(saved); if (Date.now() - s.t < 12 * 3600e3) return s.d; }   // cache for 12 hours
  const r = await fetch(`${WOWY_API}?${params}`);
  if (!r.ok) throw new Error(`PBP Stats answered ${r.status}`);
  const t = (await r.json()).single_row_table_data || {};
  const d = { Minutes: t.Minutes, OffPoss: t.OffPoss, DefPoss: t.DefPoss, Points: t.Points, OpponentPoints: t.OpponentPoints,
    PlusMinus: t.PlusMinus, EfgPct: t.EfgPct, TsPct: t.TsPct, Pace: t.Pace };
  try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), d })); } catch { /* storage full */ }
  return d;
}

export async function wowyPage(app, query = "") {
  const params = new URLSearchParams(query);
  const season = SEASONS().includes(params.get("season")) && params.get("season") >= "2000-01" ? params.get("season") : currentSeason();
  const teams = await load("teams", season);
  const teamId = Number(params.get("team")) || teams.find((t) => t.TEAM_ABBREVIATION === "MIN")?.TEAM_ID || teams[0].TEAM_ID;
  const ids = (k) => (params.get(k) || "").split(",").filter(Boolean).map(Number);
  let withIds = ids("with"), withoutIds = ids("without");
  const roster = (await load("players", season)).filter((p) => p.TEAM_ID === teamId).sort((a, b) => b.MIN * b.GP - a.MIN * a.GP);
  const team = teams.find((t) => t.TEAM_ID === teamId);
  const go = () => { location.hash = `#/wowy?team=${teamId}&season=${season}&with=${withIds.join(",")}&without=${withoutIds.join(",")}`; };

  app.innerHTML = `
    <div class="page-head"><div><h1>WOWY explorer</h1>
      <p class="sub">"With or without you": how a team played with some players on the floor and others on the bench.</p></div>
      <div class="head-tools">
        <label class="page-season">Team <select id="w-team">${teams.map((t) => `<option value="${t.TEAM_ID}" ${t.TEAM_ID === teamId ? "selected" : ""}>${esc(t.TEAM_NAME)}</option>`).join("")}</select></label>
        <label class="page-season">Season <select id="w-season">${SEASONS().map((s) => `<option ${s === season ? "selected" : ""}>${s}</option>`).join("")}</select></label></div></div>
    <p class="muted small">Click a player once for <b class="pos">ON</b> the floor, twice for <b class="neg">OFF</b> (on the bench), a third time to clear.</p>
    <div class="chips" id="w-roster">${roster.map((p) => {
      const st = withIds.includes(p.PLAYER_ID) ? "on" : withoutIds.includes(p.PLAYER_ID) ? "off" : "";
      return `<button class="chip ${st}" data-id="${p.PLAYER_ID}">${esc(p.PLAYER_NAME)}${st ? ` · ${st.toUpperCase()}` : ""}</button>`;
    }).join("")}</div>
    <div id="w-out" style="margin-top:14px"></div>
    <p class="muted small">Source: <a href="https://www.pbpstats.com" target="_blank" rel="noopener">pbpstats.com</a> (free PBP Stats API, built from NBA play-by-play;
      possession counts are exact), asked live when you pick players and saved in your browser for 12 hours.
      Team totals for comparison: NBA.com/stats.</p>`;

  app.querySelector("#w-team").addEventListener("change", (e) => { location.hash = `#/wowy?team=${e.target.value}&season=${season}`; });
  app.querySelector("#w-season").addEventListener("change", (e) => { location.hash = `#/wowy?team=${teamId}&season=${e.target.value}`; });
  app.querySelectorAll("#w-roster .chip").forEach((b) => b.addEventListener("click", () => {
    const id = Number(b.dataset.id);
    if (withIds.includes(id)) { withIds = withIds.filter((x) => x !== id); withoutIds.push(id); }
    else if (withoutIds.includes(id)) withoutIds = withoutIds.filter((x) => x !== id);
    else withIds.push(id);
    go();
  }));

  const out = app.querySelector("#w-out");
  if (!withIds.length && !withoutIds.length) { out.innerHTML = `<p class="muted">Pick at least one player.</p>`; return; }
  out.innerHTML = `<p class="muted">Asking pbpstats.com…</p>`;
  try {
    const d = await wowy(season, teamId, withIds, withoutIds);
    const name = (id) => roster.find((p) => p.PLAYER_ID === id)?.PLAYER_NAME || id;
    const desc = [withIds.length ? `with ${withIds.map(name).join(" + ")} on the floor` : "", withoutIds.length ? `${withIds.length ? "and " : ""}${withoutIds.map(name).join(" + ")} on the bench` : ""].join(" ");
    if (!d.Minutes) { out.innerHTML = `<p class="callout">The ${esc(team.TEAM_NAME)} played 0 minutes ${esc(desc)} in ${season}.</p>`; return; }
    const ortg = 100 * d.Points / d.OffPoss, drtg = 100 * d.OpponentPoints / d.DefPoss;
    const small = d.OffPoss + d.DefPoss < 400;
    out.innerHTML = `<div class="card"><h3>${esc(team.TEAM_NAME)} ${esc(desc)} · ${season}</h3>
      <div class="grid stat-cards">
        <div class="stat-card"><div class="label">Minutes</div><div class="value">${d.Minutes.toLocaleString()}</div></div>
        <div class="stat-card"><div class="label">ORtg</div><div class="value">${ortg.toFixed(1)}</div><div class="lgavg">team overall ${fmt(team.OFF_RATING, "OFF_RATING")}</div></div>
        <div class="stat-card"><div class="label">DRtg</div><div class="value">${drtg.toFixed(1)}</div><div class="lgavg">team overall ${fmt(team.DEF_RATING, "DEF_RATING")}</div></div>
        <div class="stat-card"><div class="label">Net</div><div class="value">${net(ortg - drtg)}</div><div class="lgavg">team overall ${fmt(team.NET_RATING, "NET_RATING")}</div></div>
        <div class="stat-card"><div class="label">+/-</div><div class="value">${d.PlusMinus > 0 ? "+" : ""}${d.PlusMinus}</div></div>
        <div class="stat-card"><div class="label">eFG% / TS%</div><div class="value">${p1(d.EfgPct)} / ${p1(d.TsPct)}</div></div>
        <div class="stat-card"><div class="label">Pace</div><div class="value">${d.Pace?.toFixed(1) ?? "–"}</div></div>
      </div>
      <p class="muted small">${d.OffPoss.toLocaleString()} offensive and ${d.DefPoss.toLocaleString()} defensive possessions.${small ? " <b>Small sample: under 400 possessions.</b>" : ""}</p></div>`;
  } catch (err) {
    out.innerHTML = `<p class="callout">Couldn't reach pbpstats.com right now (${esc(err.message)}). It's a free hobby server; try again later.</p>`;
  }
}
