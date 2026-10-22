// history.js (page) - the league over time, 1996-97 to now (NBA.com data only).
//   #/history/trends    league-wide averages by season: pace, 3-point volume, efficiency... (data/index/league_trends.json)
//   #/history/leaders   every season's statistical leaders (data/index/player_seasons.json - the same file Ask uses)
//   #/history/awards    MVP, DPOY, ROY, 6MOY, MIP, Finals MVP, All-NBA... by season (data/index/awards.json, pipeline/fetch_awards.py)
//   #/history/playoffs  every postseason bracket + champions (data/index/playoffs.json, made by pipeline/fetch_playoffs.py)
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
const tabs = (k) => `<nav class="page-tabs">${[["trends", "League trends"], ["leaders", "Season leaders"], ["playoffs", "Playoffs & champions"], ["awards", "Awards"]].map(([x, l]) =>
  `<a href="#/history/${x}" class="${x === k ? "active" : ""}">${l}</a>`).join("")}</nav>`;

export async function historyPage(app, kind = "trends", query = "") {
  kind = kind || "trends";
  const params = new URLSearchParams(query);
  app.innerHTML = `<div class="page-head"><div><h1>League history</h1>
    <p class="sub">How the NBA has changed since 1996-97, and who led it each season. NBA.com data.</p></div></div>${tabs(kind)}<div id="hist"></div>`;
  const box = app.querySelector("#hist");
  if (kind === "leaders") return leaders(box, params);
  if (kind === "playoffs") return playoffs(box, params);
  if (kind === "awards") return awards(box, params);
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
      <div class="toolbar"><div class="tabs tabs-wrap" id="tr-stat">${TRENDS.map(([k, l]) => `<button data-k="${k}" class="${k === stat ? "active" : ""}">${esc(l)}</button>`).join("")}</div></div>
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

// ---------------------------------------------------------------- playoffs
async function playoffs(box, params) {
  const idx = await fetch("data/index/playoffs.json").then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!idx || !idx.rows.length) { box.innerHTML = `<p class="callout">Playoff results haven't been loaded yet.</p>`; return; }
  const all = idx.rows.map((r) => Object.fromEntries(idx.cols.map((c, i) => [c, r[i]])));
  const seasons = [...new Set(all.map((r) => r.SEASON))].sort().reverse();
  const season = seasons.includes(params.get("season")) ? params.get("season") : seasons[0];
  const rows = all.filter((r) => r.SEASON === season);
  const games = await fetch(`data/${season}/playoffs.json`).then((r) => r.json()).then((d) => d.teams.rows.map((x) => Object.fromEntries(d.teams.cols.map((c, i) => [c, x[i]])))).catch(() => []);
  const seed = (s) => (s ? `<span class="muted small">(${s})</span> ` : "");
  const card = (r) => {
    const gs = games.filter((g) => g.TEAM_ID === r.WIN_ID && g.OPP === r.LOSE).sort((a, b) => a.GAME_ID.localeCompare(b.GAME_ID));
    return `<details class="series card"><summary>
        <div><b>${seed(r.WIN_SEED)}<a href="#/team/${r.WIN_ID}?season=${season}">${esc(r.WIN)}</a></b> <b class="sw">${r.WIN_W}</b></div>
        <div><span>${seed(r.LOSE_SEED)}<a href="#/team/${r.LOSE_ID}?season=${season}">${esc(r.LOSE)}</a></span> <span class="sw">${r.LOSE_W}</span></div></summary>
      <ol class="series-games">${gs.map((g) => `<li><a href="#/game/${g.GAME_ID}">${esc(g.GAME_DATE.slice(5))}</a> ${esc(r.WIN)} ${g.PTS}-${g.OPP_PTS} ${g.HOME ? "vs" : "@"} ${esc(r.LOSE)} <span class="${g.WL === "W" ? "win" : "loss"}">${g.WL}</span></li>`).join("")}</ol></details>`;
  };
  const RN = ["", "First round", "Conference semifinals", "Conference finals", "NBA Finals"];
  const conf = (c) => `<div class="bracket">${[1, 2, 3].map((rd) => `<div class="b-round"><h4>${RN[rd]}</h4>${rows.filter((r) => r.ROUND === rd && r.CONF === c).sort((a, b) => a.SERIES - b.SERIES).map(card).join("")}</div>`).join("")}</div>`;
  const fin = rows.find((r) => r.ROUND === 4);
  const champs = seasons.map((s) => all.find((r) => r.SEASON === s && r.ROUND === 4)).filter(Boolean);
  const count = new Map(); for (const c of champs) count.set(c.WIN, (count.get(c.WIN) || 0) + 1);
  box.innerHTML = `
    <div class="toolbar"><label>Season <select id="po-season">${seasons.map((s) => `<option ${s === season ? "selected" : ""}>${s}</option>`).join("")}</select></label>
      ${fin ? `<span><b>Champion: <a href="#/team/${fin.WIN_ID}?season=${season}">${esc(fin.WIN)}</a></b> beat ${esc(fin.LOSE)} ${fin.WIN_W}-${fin.LOSE_W} in the Finals</span>` : ""}</div>
    <p class="muted small">Numbers in brackets are NBA.com's final regular-season conference ranks; from 2020-21 the Play-In teams are shown in the slot they won.
      Before 2015-16 division winners could be seeded above their rank, so a few older seeds differ from the official bracket. Click a series for its games and box scores.</p>
    <h2>West</h2>${conf("West")}
    <h2>East</h2>${conf("East")}
    ${fin ? `<h2>NBA Finals</h2><div class="bracket finals">${card(fin)}</div>` : ""}
    <h2 style="margin-top:22px">Champions since ${esc(seasons[seasons.length - 1])}</h2>
    <p class="small">Most titles: ${[...count].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t, c]) => `${esc(t)} ${c}`).join(" · ")}</p>
    <div id="po-champs"></div>
    <p class="muted small">Source: ${esc(idx.source)}. First-round series were best-of-5 until 2002-03; 2019-20 was played in the Orlando bubble.</p>`;
  box.querySelector("#po-season").addEventListener("change", (e) => { location.hash = `#/history/playoffs?season=${e.target.value}`; });
  renderTable(box.querySelector("#po-champs"), { rows: champs, entity: "teams", rank: false, pageSize: 40, sortKey: "SEASON", columns: [
    { key: "SEASON", label: "Season", left: true, html: (r) => `<a href="#/history/playoffs?season=${r.SEASON}">${esc(r.SEASON)}</a>` },
    { key: "WIN", label: "Champion", left: true, html: (r) => `<a href="#/team/${r.WIN_ID}?season=${r.SEASON}">${esc(r.WIN)}</a> ${seed(r.WIN_SEED)}` },
    { key: "LOSE", label: "Runner-up", left: true, html: (r) => `${esc(r.LOSE)} ${seed(r.LOSE_SEED)}` },
    { key: "WIN_W", label: "Finals", left: true, html: (r) => `${r.WIN_W}-${r.LOSE_W}` },
  ] });
}

// ---------------------------------------------------------------- awards
export const AWARDS = [["MVP", "Most Valuable Player"], ["DPOY", "Defensive Player of the Year"], ["ROY", "Rookie of the Year"],
  ["6MOY", "Sixth Man of the Year"], ["MIP", "Most Improved Player"], ["CPOY", "Clutch Player of the Year"], ["FMVP", "Finals MVP"]];
const TEAMS_OF = [["ALL_NBA", "All-NBA"], ["ALL_DEF", "All-Defensive"], ["ALL_ROOKIE", "All-Rookie"]];
async function awards(box, params) {
  const [d, idx] = await Promise.all([fetch("data/index/awards.json").then((r) => (r.ok ? r.json() : null)).catch(() => null), loadPlayerIndex()]);
  if (!d || !d.rows.length) { box.innerHTML = `<p class="callout">Awards haven't been loaded yet.</p>`; return; }
  const names = new Map(idx.map((r) => [r.PLAYER_ID, r.PLAYER_NAME]));
  const rows = d.rows.map((r) => Object.fromEntries(d.cols.map((c, i) => [c, r[i]]))).map((r) => ({ ...r, NAME: names.get(r.PLAYER_ID) || r.PLAYER_NAME }));
  const seasons = [...new Set(rows.map((r) => r.SEASON))].sort().reverse();
  const season = seasons.includes(params.get("season")) ? params.get("season") : seasons[0];
  const who = (r, s) => `<a href="#/player/${r.PLAYER_ID}?season=${s}">${esc(r.NAME)}</a>`;
  const cell = (s, a) => rows.filter((r) => r.SEASON === s && r.AWARD === a).map((r) => who(r, s)).join(", ") || (a === "CPOY" && s < "2022-23" ? '<span class="muted" title="First awarded in 2022-23">–</span>'
    : '<span class="muted" title="Not filled in on this site yet">not in yet</span>');
  const mine = rows.filter((r) => r.SEASON === season);
  const teamBlock = ([k, label]) => {
    const t = mine.filter((r) => r.AWARD === k);
    if (!t.length) return "";
    const nums = [...new Set(t.map((r) => r.TEAM_NUMBER || 1))].sort();
    const partial = k === "ALL_NBA" ? d.missing?.[season]?.includes(k) : t.length < 10;
    return `<div class="card"><h3>${esc(label)}</h3>${partial ? `<p class="muted small">Still being filled in: ${t.length} of ${k === "ALL_NBA" ? 15 : 10} players so far.</p>` : ""}${nums.map((n) => `<p class="small"><b>${["", "1st", "2nd", "3rd"][n] || n} team:</b> ${t.filter((r) => (r.TEAM_NUMBER || 1) === n).map((r) => who(r, season)).join(", ")}</p>`).join("")}</div>`;
  };
  const count = (a) => { const m = new Map(); for (const r of rows.filter((x) => x.AWARD === a)) m.set(r.PLAYER_ID, { r, n: (m.get(r.PLAYER_ID)?.n || 0) + 1 }); return [...m.values()].sort((x, y) => y.n - x.n); };
  const miss = Object.entries(d.missing || {});
  box.innerHTML = `
    <div class="toolbar"><label>Season <select id="aw-season">${seasons.map((s) => `<option ${s === season ? "selected" : ""}>${s}</option>`).join("")}</select></label></div>
    <div class="grid lead-grid">${AWARDS.map(([k, l]) => `<div class="card"><div class="muted small">${esc(l)}</div><b>${cell(season, k)}</b></div>`).join("")}</div>
    <div class="grid lead-grid" style="margin-top:12px">${TEAMS_OF.map(teamBlock).join("")}</div>
    <h2 style="margin-top:22px">Every season</h2><div id="aw-table"></div>
    <p class="small" style="margin-top:12px">Most MVPs since ${esc(seasons[seasons.length - 1])}: ${count("MVP").slice(0, 5).map((x) => `${esc(x.r.NAME)} ${x.n}`).join(" · ")}.
      Most All-NBA selections: ${count("ALL_NBA").slice(0, 5).map((x) => `${esc(x.r.NAME)} ${x.n}`).join(" · ")}.</p>
    ${miss.length ? `<p class="callout small">Still being filled in for ${miss.length} season${miss.length === 1 ? "" : "s"} (NBA.com lists awards per player, so the site checks players one by one): ${miss.slice(0, 6).map(([s, m]) => `${esc(s)} ${esc(m.join("/"))}`).join("; ")}${miss.length > 6 ? "…" : ""}.</p>` : ""}
    <p class="muted small">Source: ${esc(d.source)}. The Clutch Player of the Year started in 2022-23.</p>`;
  box.querySelector("#aw-season").addEventListener("change", (e) => { location.hash = `#/history/awards?season=${e.target.value}`; });
  renderTable(box.querySelector("#aw-table"), { rows: seasons.map((s) => ({ SEASON: s })), entity: "players", rank: false, pageSize: 40, sortKey: "SEASON", columns: [
    { key: "SEASON", label: "Season", left: true, html: (r) => `<a href="#/history/awards?season=${r.SEASON}">${esc(r.SEASON)}</a>` },
    ...AWARDS.filter(([k]) => k !== "CPOY").map(([k]) => ({ key: k, label: k, left: true, html: (r) => cell(r.SEASON, k) }))] });
}
