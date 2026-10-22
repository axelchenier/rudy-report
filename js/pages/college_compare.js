// college_compare.js - compare 2 to 4 college players or teams (same layout as the NBA Compare page).
import { STATS, fmt } from "../stats.js";
import { esc, percentile, PALETTE, chartTheme } from "../ui.js";
import { CCOMPARE, CRADAR } from "../college/cstats.js";
import { loadCMeta, cload, cseasonFromQuery, cseasonSelectHTML, seasonInfo, playedSeasons, addRecords, C_QUAL_MIN_PCT } from "../college/cdata.js";
import { collegeNav } from "./college.js";

const MAX = 4;

export async function collegeComparePage(app, query = "") {
  await loadCMeta();
  const params = new URLSearchParams(query);
  const type = params.get("type") === "teams" ? "teams" : "players";
  let season = cseasonFromQuery(query);
  if (type === "players" && seasonInfo(season).preseason) season = playedSeasons()[0];
  const ids = (params.get("ids") || "").split(",").filter(Boolean).slice(0, MAX);
  const rows = (await cload(type, season)).map((r) => type === "teams" ? addRecords(r) : r);
  const idOf = (r) => String(type === "players" ? r.PID : r.TEAM_ID);
  const nameOf = (r) => type === "players" ? `${r.PLAYER_NAME} (${r.TEAM_NAME})` : r.TEAM_NAME;
  const picked = ids.map((id) => rows.find((r) => idOf(r) === id)).filter(Boolean);
  const go = (newIds, newType = type, s = season) => { location.hash = `#/college/compare?type=${newType}&season=${s}&ids=${newIds.join(",")}`; };
  const pool = type === "players" ? rows.filter((r) => (r.MIN_PCT ?? 0) >= C_QUAL_MIN_PCT) : rows;
  const statKeys = CCOMPARE[type];
  // Datalist of names (players: only those with real minutes, to keep the list usable).
  const options = (type === "players" ? rows.filter((r) => (r.MIN_PCT ?? 0) >= 0.2) : rows).map((r) => `<option value="${esc(nameOf(r))}">`).join("");

  app.innerHTML = `
    ${collegeNav("compare")}
    <div class="page-head"><div><h1>Compare (College)</h1>
      <p class="sub">${season} · pick up to ${MAX} ${type} · best value in each row is green</p></div>
      <div style="display:flex;gap:8px;align-items:center">${cseasonSelectHTML(season)}
      <div class="tabs"><button data-type="players" class="${type === "players" ? "active" : ""}">Players</button>
        <button data-type="teams" class="${type === "teams" ? "active" : ""}">Teams</button></div></div></div>
    <div class="card"><div class="picker-row">
      ${picked.map((r, i) => `<span class="pill"><span class="dot" style="background:${PALETTE[i]}"></span>${esc(nameOf(r))}
        <button data-remove="${esc(idOf(r))}" title="Remove">×</button></span>`).join("")}
      ${picked.length < MAX ? `<input type="search" id="add" list="names" placeholder="Add a ${type === "players" ? "player" : "team"}…" style="min-width:260px">
        <datalist id="names">${options}</datalist>` : ""}
    </div></div>
    <div id="result"></div>`;
  app.querySelector("#page-season").addEventListener("change", (e) => go([], type, e.target.value));
  app.querySelectorAll("[data-type]").forEach((b) => b.addEventListener("click", () => go([], b.dataset.type)));
  app.querySelectorAll("[data-remove]").forEach((b) => b.addEventListener("click", () => go(ids.filter((x) => x !== b.dataset.remove))));
  app.querySelector("#add")?.addEventListener("change", (e) => {
    const v = e.target.value.trim().toLowerCase();
    const r = rows.find((x) => nameOf(x).toLowerCase() === v) || rows.find((x) => (type === "players" ? x.PLAYER_NAME : x.TEAM_NAME).toLowerCase() === v);
    if (r && !ids.includes(idOf(r))) go([...ids, idOf(r)]);
  });
  const result = app.querySelector("#result");
  if (picked.length < 2) { result.innerHTML = `<p class="muted" style="margin-top:16px">Add at least two ${type} to compare. Start typing a name above.</p>`; return; }

  const link = (r) => type === "players" ? `#/college/player/${r.PID}` : `#/college/team/${esc(r.TEAM_ID)}?season=${season}`;
  const head = `<tr><th class="left">Stat</th>${picked.map((r, i) => `<th><span class="dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${PALETTE[i]}"></span>
    <a href="${link(r)}">${esc(nameOf(r))}</a></th>`).join("")}</tr>`;
  const body = statKeys.map((k) => {
    const vals = picked.map((r) => r[k]).filter((v) => v != null);
    const bestVal = STATS[k].lowerBetter ? Math.min(...vals) : Math.max(...vals);
    return `<tr><td class="left">${STATS[k].label} <span class="muted small">${esc(STATS[k].name)}</span></td>${picked.map((r) =>
      `<td class="${r[k] === bestVal && !["GP", "MIN", "ADJT", "FG3_RATE"].includes(k) ? "best" : ""}">${fmt(r[k], k, type)}</td>`).join("")}</tr>`;
  }).join("");
  result.innerHTML = `
    <div class="table-wrap" style="margin-top:12px"><table class="data"><thead>${head}</thead><tbody>${body}</tbody></table></div>
    <div class="charts">
      <div class="card"><div class="toolbar" style="margin:0 0 8px"><label>Bar chart stat <select id="barstat">${statKeys.map((k) =>
        `<option value="${k}" ${k === (type === "players" ? "BPM" : "ADJEM") ? "selected" : ""}>${esc(STATS[k].label)} · ${esc(STATS[k].name)}</option>`).join("")}</select></label></div>
        <div class="chart-box"><canvas id="bar"></canvas></div></div>
      <div class="card"><h3>D-I percentile <span class="muted small">(100 = best${type === "players" ? " among players with 40%+ of team minutes" : ` of ${rows.length} teams`})</span></h3>
        <div class="chart-box"><canvas id="radar"></canvas></div></div>
    </div>`;
  const th = chartTheme();
  const show = (v, k) => STATS[k].fmt === "pct" && v != null ? +(v * 100).toFixed(1) : v;
  let bar;
  const drawBar = (k) => {
    bar?.destroy();
    bar = new Chart(result.querySelector("#bar"), { type: "bar",
      data: { labels: picked.map((r) => type === "players" ? r.PLAYER_NAME : r.TEAM_NAME), datasets: [{ label: STATS[k].name, data: picked.map((r) => show(r[k], k)), backgroundColor: PALETTE.slice(0, picked.length), borderRadius: 6 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false }, title: { display: true, text: STATS[k].name, color: th.text } },
        scales: { x: { ticks: { color: th.text }, grid: { display: false } }, y: { ticks: { color: th.text }, grid: { color: th.grid } } } } });
  };
  result.querySelector("#barstat").addEventListener("change", (e) => drawBar(e.target.value));
  drawBar(result.querySelector("#barstat").value);
  const rk = CRADAR[type];
  new Chart(result.querySelector("#radar"), { type: "radar",
    data: { labels: rk.map((k) => STATS[k].label), datasets: picked.map((r, i) => ({ label: type === "players" ? r.PLAYER_NAME : r.TEAM_NAME,
      data: rk.map((k) => percentile(r[k], pool.map((x) => x[k]), STATS[k].lowerBetter)), borderColor: PALETTE[i], backgroundColor: PALETTE[i] + "33", pointBackgroundColor: PALETTE[i] })) },
    options: { maintainAspectRatio: false, plugins: { legend: { labels: { color: th.text } } },
      scales: { r: { min: 0, max: 100, ticks: { display: false, stepSize: 25 }, grid: { color: th.grid }, angleLines: { color: th.grid }, pointLabels: { color: th.text } } } } });
}
