// compare.js - pick 2 to 4 players (or teams) and see them side by side, with a bar chart and a radar chart.
import { load, currentSeason, qualifies } from "../data.js";
import { STATS, COMPARE_STATS, RADAR_STATS, fmt } from "../stats.js";
import { esc, percentile, PALETTE, chartTheme } from "../ui.js";

const MAX = 4;

export async function comparePage(app, query = "") {
  const params = new URLSearchParams(query);
  const type = params.get("type") === "teams" ? "teams" : "players";
  const ids = (params.get("ids") || "").split(",").filter(Boolean).map(Number).slice(0, MAX);
  const season = currentSeason();
  const rows = await load(type, season);
  const nameOf = (r) => type === "players" ? r.PLAYER_NAME : r.TEAM_NAME;
  const idOf = (r) => type === "players" ? r.PLAYER_ID : r.TEAM_ID;
  const picked = ids.map((id) => rows.find((r) => idOf(r) === id)).filter(Boolean);

  // Changing the selection just changes the address, which redraws this page.
  const go = (newIds, newType = type) => { location.hash = `#/compare?type=${newType}&ids=${newIds.join(",")}`; };

  // League pool used for percentiles on the radar chart.
  const pool = type === "players" ? rows.filter((r) => qualifies(r, season) && r.MIN >= 15) : rows;
  const statKeys = COMPARE_STATS[type];

  app.innerHTML = `
    <div class="page-head"><div><h1>Compare</h1>
      <p class="sub">${season} · pick up to ${MAX} ${type} · best value in each row is green</p></div>
      <div class="tabs"><button data-type="players" class="${type === "players" ? "active" : ""}">Players</button>
        <button data-type="teams" class="${type === "teams" ? "active" : ""}">Teams</button></div>
    </div>
    <div class="card">
      <div class="picker-row">
        ${picked.map((r, i) => `<span class="pill"><span class="dot" style="background:${PALETTE[i]}"></span>${esc(nameOf(r))}
          <button data-remove="${idOf(r)}" title="Remove">×</button></span>`).join("")}
        ${picked.length < MAX ? `<input type="search" id="add" list="names" placeholder="Add a ${type === "players" ? "player" : "team"}…" style="min-width:240px">
          <datalist id="names">${rows.map((r) => `<option value="${esc(nameOf(r))}">`).join("")}</datalist>` : ""}
      </div>
    </div>
    <div id="result"></div>`;

  app.querySelectorAll("[data-type]").forEach((b) => b.addEventListener("click", () => go([], b.dataset.type)));
  app.querySelectorAll("[data-remove]").forEach((b) => b.addEventListener("click", () => go(ids.filter((x) => x !== +b.dataset.remove))));
  app.querySelector("#add")?.addEventListener("change", (e) => {
    const r = rows.find((x) => nameOf(x).toLowerCase() === e.target.value.trim().toLowerCase());
    if (r && !ids.includes(idOf(r))) go([...ids, idOf(r)]);
  });

  const result = app.querySelector("#result");
  if (picked.length < 2) {
    result.innerHTML = `<p class="muted" style="margin-top:16px">Add at least two ${type} to compare. Try typing a name above.</p>`;
    return;
  }

  // ---- Side-by-side table: one row per stat, one column per player/team ----
  const head = `<tr><th class="left">Stat</th>${picked.map((r, i) =>
    `<th><span class="dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${PALETTE[i]}"></span>
     <a href="#/${type === "players" ? "player" : "team"}/${idOf(r)}">${esc(nameOf(r))}</a></th>`).join("")}</tr>`;
  const body = statKeys.map((k) => {
    const vals = picked.map((r) => r[k]);
    const bestVal = STATS[k].lowerBetter ? Math.min(...vals) : Math.max(...vals);
    return `<tr><td class="left" title="${esc(STATS[k].name)}">${STATS[k].label} <span class="muted small">${esc(STATS[k].name)}</span></td>${picked.map((r) =>
      `<td class="${r[k] === bestVal && !["GP", "MIN"].includes(k) ? "best" : ""}">${fmt(r[k], k, type)}</td>`).join("")}</tr>`;
  }).join("");

  result.innerHTML = `
    <div class="table-wrap" style="margin-top:12px"><table class="data"><thead>${head}</thead><tbody>${body}</tbody></table></div>
    <div class="charts">
      <div class="card"><div class="toolbar" style="margin:0 0 8px"><label>Bar chart stat
        <select id="barstat">${statKeys.map((k) => `<option value="${k}" ${k === (type === "players" ? "PTS" : "NET_RATING") ? "selected" : ""}>${STATS[k].name}</option>`).join("")}</select></label></div>
        <div class="chart-box"><canvas id="bar"></canvas></div></div>
      <div class="card"><h3>League percentile <span class="muted small">(100 = best${type === "players" ? " among regular rotation players" : ""})</span></h3>
        <div class="chart-box"><canvas id="radar"></canvas></div></div>
    </div>`;

  const t = chartTheme();
  let bar;
  const drawBar = (k) => {
    bar?.destroy();
    bar = new Chart(result.querySelector("#bar"), {
      type: "bar",
      data: { labels: picked.map(nameOf), datasets: [{ label: STATS[k].name, data: picked.map((r) => fmtFor100(r[k], k)), backgroundColor: PALETTE.slice(0, picked.length), borderRadius: 6 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false }, title: { display: true, text: STATS[k].name + (STATS[k].fmt === "pct" ? " (%)" : ""), color: t.text } },
        scales: { x: { ticks: { color: t.text }, grid: { display: false } }, y: { ticks: { color: t.text }, grid: { color: t.grid }, beginAtZero: k !== "OFF_RATING" && k !== "DEF_RATING" && k !== "PACE" } } },
    });
  };
  result.querySelector("#barstat").addEventListener("change", (e) => drawBar(e.target.value));
  drawBar(result.querySelector("#barstat").value);

  const radarKeys = RADAR_STATS[type];
  new Chart(result.querySelector("#radar"), {
    type: "radar",
    data: { labels: radarKeys.map((k) => STATS[k].label),
      datasets: picked.map((r, i) => ({ label: nameOf(r), data: radarKeys.map((k) => percentile(r[k], pool.map((x) => x[k]), STATS[k].lowerBetter)),
        borderColor: PALETTE[i], backgroundColor: PALETTE[i] + "33", pointBackgroundColor: PALETTE[i] })) },
    options: { maintainAspectRatio: false, plugins: { legend: { labels: { color: t.text } } },
      scales: { r: { min: 0, max: 100, ticks: { display: false, stepSize: 25 }, grid: { color: t.grid }, angleLines: { color: t.grid }, pointLabels: { color: t.text } } } },
  });
}

// Show fractions (0.612) as percentages (61.2) on charts.
function fmtFor100(v, k) { return STATS[k].fmt === "pct" && v != null ? +(v * 100).toFixed(1) : v; }
