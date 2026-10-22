// history.js (page) - the league over time, 1996-97 to now (NBA.com data only).
//   #/history/trends    league-wide averages by season: pace, 3-point volume, efficiency... (data/index/league_trends.json)
//   #/history/leaders   every season's statistical leaders (data/index/player_seasons.json - the same file Ask uses)
import { META, loadPlayerSeasons, loadPlayerIndex, seasonGames, QUALIFY_SHARE } from "../data.js";
import { esc, renderTable, chartTheme, PALETTE } from "../ui.js";

const SHORT = { "1998-99": "lockout: 50 games", "2011-12": "lockout: 66 games", "2019-20": "COVID stoppage + bubble: 63-75 games", "2020-21": "72 games" };
const TRENDS = [
  ["PACE", "Pace", "Possessions per 48 minutes (NBA.com)", 1],
  ["FG3A", "3PA per game", "3-point attempts per team game", 1],
  ["FG3A_RATE", "3PA rate", "Share of shots that are 3s (3PA ÷ FGA)", "pct"],
  ["FG3_PCT", "3P%", "League 3-point percentage", "pct"],
  ["PTS", "Points per game", "Points per team game", 1],
  ["ORTG", "Offensive rating", "Points per 100 possessions", 1],
  ["TS_PCT", "True shooting %", "PTS ÷ (2 × (FGA + 0.44 × FTA))", "pct"],
  ["EFG_PCT", "Effective FG%", "(FGM + 0.5 × 3PM) ÷ FGA", "pct"],
  ["FT_RATE", "FT rate", "Free-throw attempts per field-goal attempt", "pct"],
  ["TOV_PCT", "Turnover %", "Turnovers per play (TOV ÷ (FGA + 0.44 FTA + TOV))", "pct"],
  ["OREB_PCT", "Offensive rebound %", "OREB ÷ (OREB + DREB), league-wide", "pct"],
  ["AST_RATE", "Assisted %", "Assists per made field goal", "pct"],
];
const f = (v, kind) => (v == null ? "–" : kind === "pct" ? (100 * v).toFixed(1) : Number(v).toFixed(kind));
const tabs = (k) => `<nav class="page-tabs">${[["trends", "League trends"], ["leaders", "Season leaders"]].map(([x, l]) =>
  `<a href="#/history/${x}" class="${x === k ? "active" : ""}">${l}</a>`).join("")}</nav>`;

export async function historyPage(app, kind = "trends", query = "") {
  kind = kind || "trends";
  const params = new URLSearchParams(query);
  app.innerHTML = `<div class="page-head"><div><h1>League history</h1>
    <p class="sub">How the NBA has changed since 1996-97, and who led it each season. NBA.com data.</p></div></div>${tabs(kind)}<div id="hist"></div>`;
  const box = app.querySelector("#hist");
  if (kind === "leaders") return leaders(box, params);
  return trends(box, params);
}

async function trends(box, params) {
  const data = await fetch("data/index/league_trends.json").then((r) => r.json());
  const showLive = params.get("live") === "1";
  const rows = data.rows.filter((r) => showLive || !r.IN_PROGRESS);
  const live = data.rows.find((r) => r.IN_PROGRESS);
  let stat = TRENDS.some((t) => t[0] === params.get("stat")) ? params.get("stat") : "FG3A";
  const first = rows[0], last = rows[rows.length - 1];
  box.innerHTML = `
    <div class="card">
      <div class="toolbar"><div class="tabs" id="tr-stat">${TRENDS.map(([k, l]) => `<button data-k="${k}" class="${k === stat ? "active" : ""}">${esc(l)}</button>`).join("")}</div></div>
      <p class="muted small" id="tr-desc"></p>
      <div class="chart-box"><canvas id="tr-chart"></canvas></div>
      <p class="small" id="tr-sum"></p>
      ${live ? `<label class="small"><input type="checkbox" id="tr-live" ${showLive ? "checked" : ""}> include ${esc(live.SEASON)} so far (${live.TEAM_GAMES / 2} games: tiny sample)</label>` : ""}
    </div>
    <h3 style="margin-top:18px">Every season</h3><div id="tr-table"></div>
    <p class="muted small">All 30 (29 before 2004-05) teams' regular-season totals added up, so each number is the league as a whole, not an average of team averages.
      Pace is NBA.com's (games-weighted team average). Shortened seasons: ${Object.entries(SHORT).map(([s, n]) => `${s} (${n})`).join(", ")}; rates are unaffected, per-game totals are.
      Source: ${esc(data.source)}.</p>`;
  let chart;
  const draw = () => {
    const [, label, desc, kind] = TRENDS.find((t) => t[0] === stat);
    const vals = rows.map((r) => (kind === "pct" ? (r[stat] == null ? null : 100 * r[stat]) : r[stat]));
    box.querySelector("#tr-desc").textContent = desc + (kind === "pct" ? " (%)" : "");
    const a = first[stat], b = last[stat], change = a ? (100 * (b - a) / a) : 0;
    const max = rows.reduce((m, r) => (r[stat] > m[stat] ? r : m)), min = rows.reduce((m, r) => (r[stat] < m[stat] ? r : m));
    box.querySelector("#tr-sum").innerHTML = `<b>${esc(label)}</b>: ${f(a, kind)} in ${first.SEASON} → ${f(b, kind)} in ${last.SEASON}
      (${change >= 0 ? "+" : ""}${change.toFixed(0)}%). Highest: ${f(max[stat], kind)} (${max.SEASON}); lowest: ${f(min[stat], kind)} (${min.SEASON}).`;
    const t = chartTheme();
    chart?.destroy();
    chart = new Chart(box.querySelector("#tr-chart"), {
      type: "line",
      data: { labels: rows.map((r) => r.SEASON), datasets: [{ label, data: vals, borderColor: PALETTE[0], backgroundColor: PALETTE[0], tension: 0.25, pointRadius: 3 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false } },
        scales: { x: { ticks: { color: t.text, maxTicksLimit: 12 }, grid: { display: false } }, y: { ticks: { color: t.text }, grid: { color: t.grid } } } },
    });
  };
  box.querySelectorAll("#tr-stat button").forEach((btn) => btn.addEventListener("click", () => {
    stat = btn.dataset.k; box.querySelectorAll("#tr-stat button").forEach((x) => x.classList.toggle("active", x === btn)); draw();
  }));
  box.querySelector("#tr-live")?.addEventListener("change", (e) => { location.hash = `#/history/trends?stat=${stat}${e.target.checked ? "&live=1" : ""}`; });
  draw();
  const cols = [{ key: "SEASON", label: "Season", left: true, html: (r) => `${esc(r.SEASON)}${SHORT[r.SEASON] ? " *" : ""}${r.IN_PROGRESS ? " (so far)" : ""}` },
    ...TRENDS.map(([k, l, , kind]) => ({ key: k, label: l, html: (r) => f(r[k], kind) }))];
  renderTable(box.querySelector("#tr-table"), { rows: [...rows].reverse(), columns: cols, entity: "teams", rank: false, pageSize: 40, sortKey: "SEASON" });
}

// ---------------------------------------------------------------- season leaders
const LEAD = [
  ["PTS", "Points", 1], ["REB", "Rebounds", 1], ["AST", "Assists", 1], ["STL", "Steals", 1], ["BLK", "Blocks", 1], ["FG3M", "3-pointers made", 1],
  ["TS_PCT", "True shooting %", "pct"], ["FG3_PCT", "3P%", "pct"], ["FT_PCT", "FT%", "pct"], ["PIE", "PIE", "pct"], ["MIN", "Minutes", 1], ["TD3", "Triple-doubles", "tot"],
];
// Same qualifying rules as Ask and the leaderboards: 70% of team games; shooting % also need NBA.com's makes minimums scaled to season length.
function seasonRows(all, season, names) {
  const games = seasonGames(season), scale = games / 82, minGP = Math.ceil(games * QUALIFY_SHARE);
  return all.filter((r) => r.SEASON === season).map((r) => {
    const gp = r.GP || 1;
    return { ...r, PLAYER_NAME: names.get(r.PLAYER_ID), QUAL: r.GP >= minGP,
      PTS: r.PTS / gp, REB: r.REB / gp, AST: r.AST / gp, STL: r.STL / gp, BLK: r.BLK / gp, FG3M_PG: r.FG3M / gp, MIN: r.MIN_TOT / gp,
      TS_PCT: r.FGA + r.FTA ? r.PTS / (2 * (r.FGA + 0.44 * r.FTA)) : null, FG3_PCT: r.FG3A ? r.FG3M / r.FG3A : null, FT_PCT: r.FTA ? r.FTM / r.FTA : null,
      OK: { TS_PCT: r.FGM >= 300 * scale, FG3_PCT: r.FG3M >= 82 * scale, FT_PCT: r.FTM >= 125 * scale } };
  });
}
const val = (r, k) => (k === "FG3M" ? r.FG3M_PG : r[k]);
const pool = (rows, k) => rows.filter((r) => val(r, k) != null && (k === "TD3" || r.QUAL) && (r.OK[k] ?? true));
const show = (v, kind) => (v == null ? "–" : kind === "pct" ? (100 * v).toFixed(1) + "%" : kind === "tot" ? String(Math.round(v)) : v.toFixed(1));

async function leaders(box, params) {
  box.innerHTML = `<p class="muted">Loading every season…</p>`;
  const [all, idx] = await Promise.all([loadPlayerSeasons(), loadPlayerIndex()]);
  const names = new Map(idx.map((r) => [r.PLAYER_ID, r.PLAYER_NAME]));
  const seasons = META.seasons.map((s) => s.season);
  const season = seasons.includes(params.get("season")) ? params.get("season") : META.default_season || seasons[1];
  const stat = LEAD.some((l) => l[0] === params.get("stat")) ? params.get("stat") : "PTS";
  const rows = seasonRows(all, season, names);
  const live = META.seasons.find((s) => s.season === season)?.in_progress;
  const card = ([k, label, kind]) => {
    const top = pool(rows, k).sort((a, b) => val(b, k) - val(a, k)).slice(0, 5);
    return `<div class="card"><h3><a href="#/history/leaders?season=${season}&stat=${k}">${esc(label)}</a>${kind === "tot" ? "" : kind === "pct" ? "" : ' <span class="muted small">per game</span>'}</h3>
      <ol class="lead-list">${top.map((r, i) => `<li><span class="muted">${i + 1}.</span> <a href="#/player/${r.PLAYER_ID}?season=${season}">${esc(r.PLAYER_NAME)}</a> <span class="muted small">${esc(r.TEAM_ABBREVIATION)}</span><b>${show(val(r, k), kind)}</b></li>`).join("") || '<li class="muted">No qualified players yet.</li>'}</ol></div>`;
  };
  // #1 in the chosen stat for every season.
  const [, sLabel, sKind] = LEAD.find((l) => l[0] === stat);
  const byYear = seasons.filter((s) => !META.seasons.find((x) => x.season === s)?.in_progress).map((s) => {
    const p = pool(seasonRows(all, s, names), stat).sort((a, b) => val(b, stat) - val(a, stat));
    return p[0] ? { SEASON: s, PLAYER_ID: p[0].PLAYER_ID, PLAYER_NAME: p[0].PLAYER_NAME, TEAM: p[0].TEAM_ABBREVIATION, V: val(p[0], stat), RUNNER: p[1], GAP: p[1] ? val(p[0], stat) - val(p[1], stat) : null } : null;
  }).filter(Boolean);
  const titles = new Map();
  for (const r of byYear) titles.set(r.PLAYER_NAME, (titles.get(r.PLAYER_NAME) || 0) + 1);
  const most = [...titles].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, c]) => `${esc(n)} (${c})`).join(", ");
  box.innerHTML = `
    <div class="toolbar"><label>Season <select id="ld-season">${seasons.map((s) => `<option ${s === season ? "selected" : ""}>${s}</option>`).join("")}</select></label>
      <span class="muted small">Qualified: ${Math.ceil(seasonGames(season) * QUALIFY_SHARE)}+ games (70% of ${seasonGames(season)}); shooting % also need NBA.com's minimum makes, scaled to season length.</span></div>
    ${live ? `<p class="callout">${esc(season)} has only just started: these are early leaders on a tiny sample.</p>` : ""}
    <div class="grid lead-grid">${LEAD.map(card).join("")}</div>
    <h2 style="margin-top:22px">${esc(sLabel)} leader, every season</h2>
    <div class="tabs" id="ld-stat">${LEAD.map(([k, l]) => `<a class="tab-link ${k === stat ? "active" : ""}" href="#/history/leaders?season=${season}&stat=${k}">${esc(l)}</a>`).join("")}</div>
    <p class="small">Most titles since 1996-97: ${most}.</p>
    <div id="ld-table"></div>
    <p class="muted small">Totals come from NBA.com season totals; per-game = total ÷ games. PIE is NBA.com's Player Impact Estimate. A traded player counts once, with his full-season line (team shown = last team).
      Leaders under these site rules can differ from NBA.com's official title holders in seasons when the league used a different minimum. Source: NBA.com.</p>`;
  box.querySelector("#ld-season").addEventListener("change", (e) => { location.hash = `#/history/leaders?season=${e.target.value}&stat=${stat}`; });
  renderTable(box.querySelector("#ld-table"), { rows: byYear.reverse(), entity: "players", rank: false, pageSize: 40, sortKey: "SEASON", columns: [
    { key: "SEASON", label: "Season", left: true, html: (r) => `<a href="#/history/leaders?season=${r.SEASON}&stat=${stat}">${esc(r.SEASON)}</a>` },
    { key: "PLAYER_NAME", label: "Leader", left: true, html: (r) => `<a href="#/player/${r.PLAYER_ID}?season=${r.SEASON}">${esc(r.PLAYER_NAME)}</a>` },
    { key: "TEAM", label: "Team", left: true }, { key: "V", label: sLabel, html: (r) => show(r.V, sKind) },
    { key: "RUNNER", label: "Runner-up", left: true, html: (r) => (r.RUNNER ? `${esc(r.RUNNER.PLAYER_NAME)} ${show(val(r.RUNNER, stat), sKind)}` : "–") },
  ] });
}
