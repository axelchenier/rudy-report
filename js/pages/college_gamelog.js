// college_gamelog.js - "Game log" section of a college player page: every game of a season from ESPN box scores
// (data/college/gamelogs/<season>/g_NN.json, built by pipeline/college_gamelogs.py). Chart, game table and splits.
import { renderTable, esc, PALETTE, chartTheme } from "../ui.js";
import { rolling } from "../gamelog.js";
import { cload } from "../college/cdata.js";

const cache = new Map();
const getJSON = (path) => { if (!cache.has(path)) cache.set(path, fetch(path).then((r) => { if (!r.ok) throw new Error(`Could not load ${path}`); return r.json(); })); return cache.get(path); };
const SHARDS = 50;
const KEYS = [["PTS", "Points"], ["REB", "Rebounds"], ["AST", "Assists"], ["MIN", "Minutes"], ["FG3M", "3-pointers made"], ["GMSC", "Game score"]];
const pct = (m, a) => a ? (100 * m / a).toFixed(1) : "–";

export async function renderCollegeGameLog(box, pid, careerSeasons) {
  if (!box) return;
  const ix = await getJSON("data/college/gamelogs/index.json").catch(() => null);
  const seasons = (ix?.seasons || []).filter((s) => careerSeasons.includes(s));
  if (!seasons.length) { box.innerHTML = ""; return; }
  box.innerHTML = `<h2>Game log</h2><div class="toolbar"><label class="small muted">Season <select id="cgl-season">${seasons.map((s) => `<option>${s}</option>`).join("")}</select></label></div><div id="cgl-body"><p class="muted small">Loading…</p></div>`;
  const show = async (season) => {
    const [file, teams] = await Promise.all([getJSON(`data/college/gamelogs/${season}/g_${String(pid % SHARDS).padStart(2, "0")}.json`), cload("teams", season)]);
    const tmap = new Map(teams.map((t) => [t.TEAM_ID, t]));
    const games = (file.players[String(pid)] || []).map((r) => {
      const g = Object.fromEntries(file.cols.map((c, i) => [c, r[i]]));
      const opp = g.OPP.startsWith("~") ? { name: g.OPP.slice(1), id: null } : { name: tmap.get(g.OPP)?.TEAM_NAME || g.OPP, id: g.OPP, conf: tmap.get(g.OPP)?.CONF };
      // Hollinger game score (box-score summary; uses only this game's counting stats)
      const gmsc = g.PTS + 0.4 * g.FGM - 0.7 * g.FGA - 0.4 * (g.FTA - g.FTM) + 0.7 * g.OREB + 0.3 * (g.REB - g.OREB) + g.STL + 0.7 * g.AST + 0.7 * g.BLK - 0.4 * g.PF - g.TOV;
      return { ...g, DATE: `20${g.DATE.slice(0, 2)}-${g.DATE.slice(2, 4)}-${g.DATE.slice(4, 6)}`, OPPN: opp.name, OPP_TID: opp.id, OPP_CONF: opp.conf,
        WL: g.TM_PTS > g.OPP_PTS ? "W" : "L", GMSC: Math.round(gmsc * 10) / 10 };
    });
    const body = box.querySelector("#cgl-body");
    if (!games.length) { body.innerHTML = `<p class="muted">No ESPN box scores for him in ${esc(season)}.</p>`; return; }
    body.innerHTML = `<div class="card"><div class="toolbar"><div class="tabs" id="cgl-k">${KEYS.map(([k, l], i) => `<button data-k="${k}" class="${i === 0 ? "active" : ""}">${l}</button>`).join("")}</div>
      <span class="muted small">Bars = each game (green = win) · lines = rolling 5- and 10-game averages</span></div><div class="chart-box"><canvas id="cgl-chart"></canvas></div></div>
      <h3 style="margin-top:16px">Games</h3><div id="cgl-table"></div><h3 style="margin-top:16px">Splits</h3><div id="cgl-splits"></div>
      <p class="muted small">ESPN box scores via sportsdataverse. Game score = Hollinger's formula from the box score. Postseason = conference and national tournaments (ESPN season type 3).</p>`;
    let chart;
    const draw = (k) => {
      const vals = games.map((g) => g[k]), th = chartTheme();
      chart?.destroy();
      chart = new Chart(body.querySelector("#cgl-chart"), { type: "bar", data: { labels: games.map((g) => g.DATE.slice(5)), datasets: [
        { type: "bar", label: k, data: vals, backgroundColor: games.map((g) => g.WL === "W" ? "rgba(63,185,80,.55)" : "rgba(248,81,73,.45)") },
        { type: "line", label: "5-game avg", data: rolling(vals, 5), borderColor: PALETTE[0], pointRadius: 0, tension: .3, spanGaps: true },
        { type: "line", label: "10-game avg", data: rolling(vals, 10), borderColor: PALETTE[1], pointRadius: 0, tension: .3, spanGaps: true }] },
        options: { maintainAspectRatio: false, plugins: { legend: { labels: { color: th.text } } },
          scales: { x: { ticks: { color: th.text, maxTicksLimit: 12 }, grid: { display: false } }, y: { ticks: { color: th.text }, grid: { color: th.grid } } } } });
    };
    body.querySelectorAll("#cgl-k button").forEach((b) => b.addEventListener("click", () => { body.querySelectorAll("#cgl-k button").forEach((x) => x.classList.toggle("active", x === b)); draw(b.dataset.k); }));
    draw("PTS");
    const sh = (m, a) => (r) => `${r[m]}-${r[a]}`;
    renderTable(body.querySelector("#cgl-table"), { rows: [...games].reverse(), entity: "players", rank: false, pageSize: 20, columns: [
      { key: "DATE", label: "Date", left: true }, { key: "OPPN", label: "Opp", left: true, html: (r) => `${r.HA === "H" ? "vs" : "@"} ${r.OPP_TID ? `<a href="#/college/team/${esc(r.OPP_TID)}?season=${season}">${esc(r.OPPN)}</a>` : esc(r.OPPN)}${r.TYPE === 3 ? ` <span class="tag">post</span>` : ""}` },
      { key: "WL", label: "Result", left: true, html: (r) => `<span class="${r.WL === "W" ? "win" : "loss"}">${r.WL}</span> ${r.TM_PTS}-${r.OPP_PTS}` },
      { key: "MIN", label: "MIN", html: (r) => r.MIN }, ...["PTS", "REB", "AST", "STL", "BLK", "TOV", "PF"].map((key) => ({ key, label: key, html: (r) => r[key] })),
      { key: "FGM", label: "FG", html: sh("FGM", "FGA") }, { key: "FG3M", label: "3P", html: sh("FG3M", "FG3A") }, { key: "FTM", label: "FT", html: sh("FTM", "FTA") },
      { key: "GMSC", label: "GmSc", html: (r) => r.GMSC.toFixed(1) }] });
    const agg = (name, rows) => {
      const n = rows.length; if (!n) return null;
      const s = (k) => rows.reduce((a, g) => a + (g[k] || 0), 0);
      const tsa = 2 * (s("FGA") + 0.44 * s("FTA"));
      return { SPLIT: name, GP: n, W: rows.filter((g) => g.WL === "W").length, MIN: (s("MIN") / n).toFixed(1), PTS: (s("PTS") / n).toFixed(1), REB: (s("REB") / n).toFixed(1),
        AST: (s("AST") / n).toFixed(1), TOV: (s("TOV") / n).toFixed(1), FG: pct(s("FGM"), s("FGA")), FG3: pct(s("FG3M"), s("FG3A")), FT: pct(s("FTM"), s("FTA")), TS: tsa ? (100 * s("PTS") / tsa).toFixed(1) : "–" };
    };
    const months = [...new Set(games.map((g) => g.DATE.slice(0, 7)))];
    const rows = [agg("All games", games), agg("Home", games.filter((g) => g.HA === "H")), agg("Away / neutral", games.filter((g) => g.HA === "A")),
      agg("Wins", games.filter((g) => g.WL === "W")), agg("Losses", games.filter((g) => g.WL === "L")), agg("Started", games.filter((g) => g.GS)), agg("Off the bench", games.filter((g) => !g.GS)),
      agg("Regular season", games.filter((g) => g.TYPE === 2)), agg("Postseason", games.filter((g) => g.TYPE === 3)),
      agg("vs top-50 T-Rank teams", games.filter((g) => g.OPP_TID && (tmap.get(g.OPP_TID)?.TRANK ?? 999) <= 50)),
      ...months.map((m) => agg(new Date(m + "-15").toLocaleString("en-US", { month: "long", year: "numeric" }), games.filter((g) => g.DATE.startsWith(m))))].filter(Boolean);
    renderTable(body.querySelector("#cgl-splits"), { rows, entity: "players", rank: false, pageSize: 40, columns: ["SPLIT", "GP", "W", "MIN", "PTS", "REB", "AST", "TOV", "FG", "FG3", "FT", "TS"].map((k) =>
      ({ key: k, label: { SPLIT: "Split", FG: "FG%", FG3: "3P%", FT: "FT%", TS: "TS%" }[k] || k, left: k === "SPLIT", html: (r) => esc(String(r[k])) })) });
  };
  box.querySelector("#cgl-season").addEventListener("change", (e) => show(e.target.value));
  await show(seasons[0]);
}
