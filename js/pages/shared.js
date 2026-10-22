// shared.js - page pieces used by both player and team pages:
//   percentile cards, the "percentile profile" bars, the game log + splits view, and the tab bar.
import { STATS, fmt } from "../stats.js";
import { renderTable, esc, percentile, pctChip, pctClass, avgOf, statLabel, ordinal, chartTheme, PALETTE } from "../ui.js";
import { rolling, splits } from "../gamelog.js";

// One stat card: value, rank, percentile chip and the league average.
export function statCard(key, row, pool, entity, { ranked = true, avgLabel = "Lg avg" } = {}) {
  const vals = pool.map((x) => x[key]);
  const lb = !!STATS[key]?.lowerBetter;
  const p = ranked && row[key] != null ? percentile(row[key], vals, lb) : null;
  const rank = ranked && row[key] != null ? vals.filter((v) => v != null && (lb ? v < row[key] : v > row[key])).length + 1 : null;
  return `<div class="card stat-card">
    <div class="label">${statLabel(key)}</div>
    <div class="value">${fmt(row[key], key, entity)} ${pctChip(p)}</div>
    <div class="rank ${rank && rank <= (entity === "teams" ? 5 : 10) ? "top" : ""}">${rank ? `#${rank} of ${pool.length}` : "not ranked (small sample)"}</div>
    <div class="lgavg">${avgLabel} ${fmt(avgOf(pool, key), key, entity)}</div></div>`;
}

// Horizontal percentile bars for groups of stats.
// ints = stat codes to show as whole numbers (e.g. clutch season totals).
const showVal = (v, k, entity, ints) => ints?.includes(k) && v != null ? (k === "PLUS_MINUS" && v > 0 ? "+" : "") + Math.round(v).toLocaleString() : fmt(v, k, entity);
export function profileHTML(groups, row, pool, entity, { ranked = true, ints = null } = {}) {
  const hasStyle = groups.some(([, keys]) => keys.some((k) => STATS[k]?.style));
  return (hasStyle ? `<p class="muted small"><i class="legend-ps"></i> Blue bars are "style" stats (how much, not how good). Other bars run from red (poor) to green (top 10%).</p>` : "") + `<div class="profile">${groups.map(([title, keys]) => {
    const items = keys.filter((k) => row[k] !== undefined).map((k) => {
      const lb = !!STATS[k]?.lowerBetter;
      const p = ranked && row[k] != null ? percentile(row[k], pool.map((x) => x[k]), lb) : null;
      return `<div class="prow">
        <span class="pname">${statLabel(k, STATS[k]?.name ? cap(STATS[k].name) : k)}</span>
        <span class="pval">${showVal(row[k], k, entity, ints)}</span>
        <span class="pavg muted">avg ${fmt(avgOf(pool, k), k, entity)}</span>
        <span class="pbar" title="${STATS[k]?.style ? "Style stat: the bar shows how much, not how good" : "Percentile, 100 = best"}"><i class="${STATS[k]?.style ? "ps" : pctClass(p)}" style="width:${p ?? 0}%"></i></span>
        <span class="ppct">${p == null ? "–" : ordinal(p)}</span></div>`;
    }).join("");
    return items ? `<div class="card pgroup"><h3>${esc(title)}</h3>${items}</div>` : "";
  }).join("")}</div>`;
}
const cap = (s) => s[0].toUpperCase() + s.slice(1);

// The tab bar at the top of player/team pages. Each tab is a link, so the URL is shareable.
export function tabBar(base, tabs, active) {
  return `<nav class="page-tabs">${tabs.map(([k, label]) =>
    `<a href="${base}?tab=${k}" class="${k === active ? "active" : ""}">${esc(label)}</a>`).join("")}</nav>`;
}

// Game log table + rolling-average chart + splits.
export function renderGameLog(box, games, { isTeam, chartKeys }) {
  if (!games.length) { box.innerHTML = `<p class="muted">No games in this season's game log.</p>`; return; }
  const small = games.length < 10;
  box.innerHTML = `
    <div class="card">
      <div class="toolbar"><div class="tabs" id="gl-stat">${chartKeys.map((k, i) =>
        `<button data-k="${k}" class="${i === 0 ? "active" : ""}">${esc(STATS[k]?.label || k)}</button>`).join("")}</div>
        <span class="muted small">Bars = each game · lines = rolling 5- and 10-game averages</span></div>
      <div class="chart-box"><canvas id="gl-chart"></canvas></div>
    </div>
    ${small ? `<p class="callout">Only ${games.length} game${games.length === 1 ? "" : "s"} so far: averages and splits are a small sample.</p>` : ""}
    <h3 style="margin-top:18px">Games <span class="muted small">· click a date for the box score</span></h3>
    <div id="gl-table"></div>
    <h3 style="margin-top:18px">Splits</h3>
    <div class="tabs" id="gl-split"></div>
    <div id="gl-splits"></div>`;

  // Chart
  let chart;
  const draw = (k) => {
    const vals = games.map((g) => g[k]);
    const t = chartTheme();
    chart?.destroy();
    chart = new Chart(box.querySelector("#gl-chart"), {
      type: "bar",
      data: { labels: games.map((g) => g.GAME_DATE.slice(5)),
        datasets: [
          { type: "bar", label: STATS[k]?.name || k, data: vals, backgroundColor: games.map((g) => g.WL === "W" ? "rgba(63,185,80,.55)" : "rgba(248,81,73,.45)") },
          { type: "line", label: "5-game avg", data: rolling(vals, 5), borderColor: PALETTE[0], pointRadius: 0, tension: .3, spanGaps: true },
          { type: "line", label: "10-game avg", data: rolling(vals, 10), borderColor: PALETTE[1], pointRadius: 0, tension: .3, spanGaps: true },
        ] },
      options: { maintainAspectRatio: false, plugins: { legend: { labels: { color: t.text } } },
        scales: { x: { ticks: { color: t.text, maxTicksLimit: 12 }, grid: { display: false } }, y: { ticks: { color: t.text }, grid: { color: t.grid } } } },
    });
  };
  box.querySelectorAll("#gl-stat button").forEach((b) => b.addEventListener("click", () => {
    box.querySelectorAll("#gl-stat button").forEach((x) => x.classList.toggle("active", x === b)); draw(b.dataset.k);
  }));
  draw(chartKeys[0]);

  // Game table (newest first)
  const shoot = (m, a) => (r) => `${r[m]}-${r[a]}`;
  const whole = (k) => (r) => r[k] == null ? "–" : Math.round(r[k]);
  const res = (r) => `<span class="${r.WL === "W" ? "win" : "loss"}">${r.WL}</span>${isTeam ? ` ${r.PTS}-${r.OPP_PTS}` : ""}`;
  const cols = [
    { key: "GAME_DATE", label: "Date", left: true, html: (r) => r.GAME_ID ? `<a href="#/game/${r.GAME_ID}" title="Box score">${esc(r.GAME_DATE)}</a>` : esc(r.GAME_DATE) }, { key: "OPP", label: "Opp", left: true, html: (r) => `${r.HOME ? "vs" : "@"} ${esc(r.OPP)}` },
    { key: "WL", label: "Result", left: true, html: res },
    ...(isTeam ? [{ key: "MARGIN", html: (r) => (r.MARGIN > 0 ? "+" : "") + r.MARGIN }, { key: "OFF_RATING" }, { key: "DEF_RATING" }, { key: "NET_RATING" }] : [{ key: "MIN", html: whole("MIN") }]),
    ...["PTS", "REB", "AST", "STL", "BLK", "TOV"].map((key) => ({ key, html: whole(key) })),
    { key: "FGM", label: "FG", html: shoot("FGM", "FGA") }, { key: "FG3M", label: "3P", html: shoot("FG3M", "FG3A") }, { key: "FTM", label: "FT", html: shoot("FTM", "FTA") },
    ...(isTeam ? [] : [{ key: "PLUS_MINUS", html: (r) => (r.PLUS_MINUS > 0 ? "+" : "") + Math.round(r.PLUS_MINUS) }, { key: "GAME_SCORE" }]),
  ];
  renderTable(box.querySelector("#gl-table"), { rows: [...games].reverse(), columns: cols, entity: "players", rank: false, pageSize: 20 });

  // Splits
  const groups = splits(games, isTeam);
  const splitCols = [{ key: "SPLIT", label: "Split", left: true }, { key: "GP" }, { key: "W" }, { key: "L" },
    ...(isTeam ? ["PTS", "OPP_PTS", "OFF_RATING", "DEF_RATING", "NET_RATING", "FG_PCT", "FG3_PCT", "TS_PCT", "REB", "AST", "TOV"]
      : ["MIN", "PTS", "REB", "AST", "STL", "BLK", "TOV", "FG_PCT", "FG3_PCT", "FT_PCT", "TS_PCT", "PLUS_MINUS", "GAME_SCORE"]).map((key) => ({ key }))];
  const splitBox = box.querySelector("#gl-splits"), splitTabs = box.querySelector("#gl-split");
  splitTabs.innerHTML = groups.map((g, i) => `<button data-i="${i}" class="${i === 0 ? "active" : ""}">${g.name}</button>`).join("");
  const showSplit = (i) => renderTable(splitBox, { rows: groups[i].rows, columns: splitCols, entity: isTeam ? "teams" : "players", rank: false, pageSize: 40 });
  splitTabs.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    splitTabs.querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b)); showSplit(Number(b.dataset.i));
  }));
  showSplit(0);
  box.insertAdjacentHTML("beforeend", `<p class="muted small">${isTeam ? "Team ratings per game use the standard possession estimate (FGA + 0.44×FTA − OREB + TOV, averaged between both teams). " : ""}
    Split percentages are computed from summed makes and attempts. Source: NBA.com/stats game logs (LeagueGameLog) via nba_api.</p>`);
}
