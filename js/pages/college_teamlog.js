// college_teamlog.js - "Schedule & results" on a college team page: every game of a season from ESPN box scores
// (data/college/gamelogs/<season>/teams.json, pipeline/college_gamelogs.py) with per-game offensive/defensive ratings and splits.
import { renderTable, esc, PALETTE, chartTheme } from "../ui.js";
import { rolling } from "../gamelog.js";
import { cload } from "../college/cdata.js";

const cache = new Map();
const getJSON = (path) => { if (!cache.has(path)) cache.set(path, fetch(path).then((r) => { if (!r.ok) throw new Error(`Could not load ${path}`); return r.json(); })); return cache.get(path); };
// Possessions: the standard box-score estimate, averaged over both teams.
const poss = (g) => ((g.FGA - g.OREB + g.TOV + 0.44 * g.FTA) + (g.O_FGA - g.O_OREB + g.O_TOV + 0.44 * g.O_FTA)) / 2;

export async function renderCollegeTeamLog(box, teamId, pageSeason) {
  if (!box) return;
  const ix = await getJSON("data/college/gamelogs/index.json").catch(() => null);
  const seasons = ix?.seasons || [];
  if (!seasons.length) return;
  const start = seasons.includes(pageSeason) ? pageSeason : seasons[0];
  box.innerHTML = `<h2>Schedule &amp; results</h2><div class="toolbar"><label class="small muted">Season <select id="ctl-season">${seasons.map((s) => `<option ${s === start ? "selected" : ""}>${s}</option>`).join("")}</select></label>
    ${seasons.includes(pageSeason) ? "" : `<span class="muted small">Game-by-game data covers ${seasons[seasons.length - 1]} to ${seasons[0]}.</span>`}</div><div id="ctl-body"></div>`;
  const show = async (season) => {
    const [file, teams] = await Promise.all([getJSON(`data/college/gamelogs/${season}/teams.json`), cload("teams", season)]);
    const tmap = new Map(teams.map((t) => [t.TEAM_ID, t])), me = tmap.get(teamId);
    const body = box.querySelector("#ctl-body");
    const games = (file.teams[teamId] || []).map((r) => {
      const g = Object.fromEntries(file.cols.map((c, i) => [c, r[i]]));
      const ot = g.OPP.startsWith("~") ? null : tmap.get(g.OPP);
      const p = poss(g);
      return { ...g, DATE: `20${g.DATE.slice(0, 2)}-${g.DATE.slice(2, 4)}-${g.DATE.slice(4, 6)}`, OPPN: ot ? ot.TEAM_NAME : g.OPP.replace(/^~/, ""), OPP_TID: ot ? g.OPP : null,
        OPP_RANK: ot?.TRANK, CONFG: !!(ot && me && ot.CONF === me.CONF), WL: g.PTS > g.OPP_PTS ? "W" : "L", MARGIN: g.PTS - g.OPP_PTS,
        POSS: p, ORTG: p ? 100 * g.PTS / p : null, DRTG: p ? 100 * g.OPP_PTS / p : null };
    });
    if (!games.length) { body.innerHTML = `<p class="muted">No ESPN box scores for this team in ${esc(season)}.</p>`; return; }
    body.innerHTML = `<div class="card"><div class="chart-box"><canvas id="ctl-chart"></canvas></div></div><div id="ctl-table" style="margin-top:12px"></div>
      <h3 style="margin-top:16px">Splits</h3><div id="ctl-splits"></div>
      <p class="muted small">ESPN box scores via sportsdataverse. Ratings per game = points per 100 possessions (possessions = FGA − OREB + TOV + 0.44×FTA, averaged over both teams), not opponent-adjusted like T-Rank's AdjO/AdjD. Opp. rank = that team's final T-Rank. Postseason = NCAA tournament and other national postseason games (ESPN season type 3). At neutral sites ESPN still lists one team as home.</p>`;
    const th = chartTheme();
    new Chart(body.querySelector("#ctl-chart"), { type: "bar", data: { labels: games.map((g) => g.DATE.slice(5)), datasets: [
      { type: "bar", label: "Margin", data: games.map((g) => g.MARGIN), backgroundColor: games.map((g) => g.WL === "W" ? "rgba(63,185,80,.6)" : "rgba(248,81,73,.5)") },
      { type: "line", label: "5-game avg margin", data: rolling(games.map((g) => g.MARGIN), 5), borderColor: PALETTE[0], pointRadius: 0, tension: .3, spanGaps: true }] },
      options: { maintainAspectRatio: false, plugins: { legend: { labels: { color: th.text } }, title: { display: true, text: `${season} game margins`, color: th.text } },
        scales: { x: { ticks: { color: th.text, maxTicksLimit: 12 }, grid: { display: false } }, y: { ticks: { color: th.text }, grid: { color: th.grid } } } } });
    const f1 = (v) => v == null ? "–" : v.toFixed(1);
    renderTable(body.querySelector("#ctl-table"), { rows: [...games].reverse(), entity: "teams", rank: false, pageSize: 40, columns: [
      { key: "DATE", label: "Date", left: true },
      { key: "OPPN", label: "Opponent", left: true, html: (r) => `${r.HA === "H" ? "vs" : "@"} ${r.OPP_TID ? `<a href="#/college/team/${esc(r.OPP_TID)}?season=${season}">${esc(r.OPPN)}</a>` : esc(r.OPPN)}${r.CONFG ? ` <span class="tag">conf</span>` : ""}${r.TYPE === 3 ? ` <span class="tag">post</span>` : ""}` },
      { key: "OPP_RANK", label: "Opp. rank", html: (r) => r.OPP_RANK ?? "–" },
      { key: "WL", label: "Result", left: true, html: (r) => `<span class="${r.WL === "W" ? "win" : "loss"}">${r.WL}</span> ${r.PTS}-${r.OPP_PTS}` },
      { key: "POSS", label: "Poss", html: (r) => f1(r.POSS) }, { key: "ORTG", label: "Off rtg", html: (r) => f1(r.ORTG) }, { key: "DRTG", label: "Def rtg", html: (r) => f1(r.DRTG) },
      { key: "FG3M", label: "3P", html: (r) => `${r.FG3M}-${r.FG3A}` }, { key: "TOV", label: "TOV", html: (r) => r.TOV }, { key: "OREB", label: "OREB", html: (r) => r.OREB }] });
    const agg = (name, rows) => {
      if (!rows.length) return null;
      const s = (k) => rows.reduce((a, g) => a + (g[k] || 0), 0), p = s("POSS");
      return { SPLIT: name, GP: rows.length, REC: `${rows.filter((g) => g.WL === "W").length}-${rows.filter((g) => g.WL === "L").length}`, PTS: f1(s("PTS") / rows.length), OPP: f1(s("OPP_PTS") / rows.length),
        MARGIN: (s("MARGIN") / rows.length >= 0 ? "+" : "") + f1(s("MARGIN") / rows.length), ORTG: f1(100 * s("PTS") / p), DRTG: f1(100 * s("OPP_PTS") / p), PACE: f1(p / rows.length) };
    };
    const months = [...new Set(games.map((g) => g.DATE.slice(0, 7)))];
    const rows = [agg("All games", games), agg("Home (as listed by ESPN)", games.filter((g) => g.HA === "H")), agg("Away (as listed by ESPN)", games.filter((g) => g.HA === "A")),
      agg("Conference games", games.filter((g) => g.CONFG)), agg("Non-conference", games.filter((g) => !g.CONFG)),
      agg("vs top-25 T-Rank", games.filter((g) => (g.OPP_RANK ?? 999) <= 25)), agg("vs top-100 T-Rank", games.filter((g) => (g.OPP_RANK ?? 999) <= 100)),
      agg("vs teams outside D-I", games.filter((g) => !g.OPP_TID)), agg("Postseason", games.filter((g) => g.TYPE === 3)),
      agg("Close games (≤5 pts)", games.filter((g) => Math.abs(g.MARGIN) <= 5)),
      ...months.map((m) => agg(new Date(m + "-15").toLocaleString("en-US", { month: "long", year: "numeric" }), games.filter((g) => g.DATE.startsWith(m))))].filter(Boolean);
    renderTable(body.querySelector("#ctl-splits"), { rows, entity: "teams", rank: false, pageSize: 40, columns: ["SPLIT", "GP", "REC", "PTS", "OPP", "MARGIN", "ORTG", "DRTG", "PACE"].map((k) =>
      ({ key: k, label: { SPLIT: "Split", REC: "W-L", OPP: "Opp PTS", ORTG: "Off rtg", DRTG: "Def rtg", PACE: "Poss/G" }[k] || k, left: k === "SPLIT" || k === "REC", html: (r) => esc(String(r[k])) })) });
  };
  box.querySelector("#ctl-season").addEventListener("change", (e) => show(e.target.value));
  await show(start);
}
