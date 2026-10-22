// college_reports.js - College Reports: Daily, Weekly and Monthly reports made by pipeline/update_college.py.
// Same layout as the NBA Reports page. This page only DISPLAYS data/college/reports/*.json; every number comes from those files
// (ESPN box scores + Torvik T-Rank). Before the season starts it shows the opening day and a recap of last season.
import { esc } from "../ui.js";
import { collegeNav } from "./college.js";

const KINDS = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" };
const BASE = "data/college/reports/";
const cache = new Map();
const getJSON = (path) => { if (!cache.has(path)) cache.set(path, fetch(path, { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error(`Could not load ${path}`); return r.json(); })); return cache.get(path); };

const num = (v, d = 1) => v == null ? "–" : Number(v).toFixed(d);
const pct = (v) => v == null ? "–" : (v * 100).toFixed(1) + "%";
const signed = (v, d = 1) => v == null ? "–" : (v > 0 ? "+" : "") + Number(v).toFixed(d);
const day = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const tm = (name, slug, rank) => `${rank ? `<span class="muted small">${rank}</span> ` : ""}${slug ? `<a href="#/college/team/${esc(slug)}">${esc(name)}</a>` : esc(name)}`;
const pl = (x) => `${x.pid ? `<a href="#/college/player/${x.pid}">${esc(x.player)}</a>` : esc(x.player)} <span class="muted small">${esc(x.team || "")}</span>`;

function delta(v, { d = 1, asPct = false, lowerBetter = false } = {}) {
  if (v == null) return `<span class="muted">–</span>`;
  const shown = asPct ? (v * 100).toFixed(1) : Number(v).toFixed(d);
  if (Number(shown) === 0) return `<span class="delta flat">● 0</span>`;
  const up = v > 0, good = lowerBetter ? !up : up;
  return `<span class="delta ${good ? "up" : "down"}">${up ? "▲" : "▼"} ${up ? "+" : ""}${shown}</span>`;
}
function table(rows, cols, empty = "Nothing to show yet.") {
  if (!rows?.length) return `<p class="muted small">${empty}</p>`;
  return `<div class="table-wrap"><table class="data"><thead><tr>${cols.map(([h, , left]) => `<th class="${left ? "left" : ""}" style="cursor:default">${h}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${cols.map(([, f, left]) => `<td class="${left ? "left" : ""}">${f(r)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
const section = (title, body, sub = "") => `<section class="report-section"><h2>${title}</h2>${sub ? `<p class="muted small">${sub}</p>` : ""}${body}</section>`;
const FRAC = new Set(["EFG", "FG3A_RATE", "FT_RATE", "HOME_W_PCT"]);
const SOURCE_NOTE = `Built only from ESPN box scores (site.api.espn.com) and Bart Torvik's T-Rank (<a href="https://barttorvik.com/" target="_blank" rel="noopener">barttorvik.com</a>). No predictions.`;

export async function collegeReportsPage(app, kind = "daily", name = "") {
  kind = KINDS[kind] ? kind : "daily";
  let index;
  try { index = await getJSON(BASE + "index.json"); }
  catch { app.innerHTML = `${collegeNav("reports")}<h1>College Reports</h1><p class="muted">No reports yet. Run <code>.venv/bin/python pipeline/update_college.py</code>.</p>`; return; }

  if (index.status === "preseason") { app.innerHTML = collegeNav("reports") + preseason(index); return; }

  const list = index[kind] || [];
  const item = list.find((i) => i.name === name) || list[0];
  app.innerHTML = `${collegeNav("reports")}
    <div class="page-head"><div><h1>College Reports</h1><p class="sub">What happened in NCAA men's D-I basketball, ${index.season}. ${SOURCE_NOTE}</p></div>
      <div class="toolbar" style="margin:0">
        <div class="tabs">${Object.entries(KINDS).map(([k, l]) => `<a class="tab-link ${k === kind ? "active" : ""}" href="#/college/reports/${k}">${l}</a>`).join("")}</div>
        <label>Report <select id="pick">${list.map((i) => `<option value="${esc(i.name)}" ${i === item ? "selected" : ""}>${i.name === "latest" ? "Latest (rolling)" : esc(i.name)} · ${i.games} games</option>`).join("")}</select></label>
      </div></div>
    <div id="report">${item ? "<p class='muted'>Loading…</p>" : `<p class="muted">No ${kind} reports yet.</p>`}</div>`;
  app.querySelector("#pick")?.addEventListener("change", (e) => { location.hash = `#/college/reports/${kind}/${e.target.value}`; });
  if (!item) return;
  const rep = await getJSON(BASE + item.file);
  app.querySelector("#report").innerHTML = render(rep);
}

// ---------------------------------------------------------------- before the season
function preseason(ix) {
  const r = ix.recap || {};
  const lead = (key, label, d = 1) => `<div class="card"><h3>${label}</h3>${table(r.leaders?.[key], [["", pl, true], ["", (x) => `<b>${num(x.value, d)}</b>`]])}</div>`;
  return `<div class="page-head"><div><h1>College Reports</h1><p class="sub">${SOURCE_NOTE}</p></div></div>
    <div class="card report-head">
      <h2 style="margin:0">⏳ The ${esc(ix.season)} season hasn't started yet</h2>
      <p style="margin:6px 0 0">${ix.first_game_day ? `First game day on ESPN's schedule: <b>${day(ix.first_game_day)}</b> (${ix.first_day_games} D-I game${ix.first_day_games === 1 ? "" : "s"} listed so far).`
        : "ESPN hasn't posted the first game day yet."} Daily, weekly and monthly reports start the morning after the first games.</p>
      <p class="muted small" style="margin:4px 0 0">Checked ${esc(ix.generated_at)}. Meanwhile, here is how ${esc(r.season || "last season")} ended.</p>
    </div>
    ${r.champion ? section(`${esc(r.season)} recap`, `<div class="grid stat-cards" style="grid-template-columns:repeat(auto-fill,minmax(240px,1fr))">
      <div class="card stat-card"><div class="label">National champion</div><div class="value">${tm(r.champion.winner, r.champion.winner_slug)}</div>
        <div class="rank">beat ${tm(r.champion.loser, r.champion.loser_slug)} ${esc(r.champion.score)} · ${day(r.champion.date)}</div></div>
      <div class="card stat-card"><div class="label">D-I games played</div><div class="value">${(r.games || 0).toLocaleString()}</div><div class="rank">ESPN box scores</div></div>
      <div class="card stat-card"><div class="label">Final T-Rank No. 1</div><div class="value">${r.trank_top10?.[0] ? tm(r.trank_top10[0].team, r.trank_top10[0].team_slug) : "–"}</div>
        <div class="rank">${r.trank_top10?.[0] ? `${esc(r.trank_top10[0].rec)} · AdjEM ${signed(r.trank_top10[0].adjem)}` : ""}</div></div>
    </div>`, esc(r.champion_rule || "")) : ""}
    <div class="grid two-col">
      ${section("Final T-Rank top 10", table(r.trank_top10, [["#", (x) => x.trank], ["Team", (x) => tm(x.team, x.team_slug), true], ["W-L", (x) => esc(x.rec)],
        ["AdjEM", (x) => `<b>${signed(x.adjem)}</b>`], ["AdjO", (x) => num(x.adjoe)], ["AdjD", (x) => num(x.adjde)]]), "Torvik's end-of-season adjusted efficiency (points per 100 possessions vs an average D-I team).")}
      ${section("Best scoring games", table(r.best_games, [["Player", pl, true], ["Date", (x) => esc(day(x.date)), true], ["Line", (x) => esc(x.line), true]]), "Most points in a single game (ESPN box scores).")}
    </div>
    ${section("Season leaders", `<div class="leader-grid">${lead("PTS", "Points per game")}${lead("REB", "Rebounds per game")}${lead("AST", "Assists per game")}${lead("BPM", "Box Plus/Minus (Torvik)")}</div>`,
      "Qualified players: played at least 40% of team minutes (Torvik's standard).")}`;
}

// ---------------------------------------------------------------- a report
function gameCard(g) {
  const homeWon = g.home_pts > g.away_pts;
  const r = (x) => x ? `<span class="muted small">${x}</span> ` : "";
  return `<div class="card score"><div class="${homeWon ? "" : "win"}"><span>${r(g.away_rank)}<a href="#/college/team/${esc(g.away_slug)}">${esc(g.away)}</a></span><b>${g.away_pts}</b></div>
    <div class="${homeWon ? "win" : ""}"><span>${r(g.home_rank)}<a href="#/college/team/${esc(g.home_slug)}">${esc(g.home)}</a></span><b>${g.home_pts}</b></div>
    <div class="muted small">${g.ot ? `Final/${g.ot > 1 ? g.ot : ""}OT` : "Final"} · ${g.neutral ? "neutral site" : "at " + esc(g.home)}${g.date ? " · " + esc(day(g.date)) : ""}</div></div>`;
}

function render(rep) {
  const k = rep.type, wc = rep.what_changed || {};
  const range = rep.range.start === rep.range.end ? day(rep.range.end) : `${day(rep.range.start)} – ${day(rep.range.end)}`;
  let html = `<div class="card report-head">
      <h2 style="margin:0">${esc(rep.title)}</h2>
      <p class="muted small" style="margin:4px 0 0">Covers <b>${range}</b> · ${rep.summary.games} games · ${rep.summary.players} players · ${rep.season} season ·
        generated ${esc(rep.generated_at)} · Source: ${rep.sources.map(esc).join("; ")}. Small numbers next to teams are Torvik T-Rank.</p>
      ${rep.notes?.length ? `<div class="callout">${rep.notes.map((n) => `<p>⚠ ${esc(n)}</p>`).join("")}</div>` : ""}
    </div>`;
  html += section("Interesting trends", rep.trends?.length ? `<ul class="trends">${rep.trends.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : `<p class="muted">No trends yet.</p>`,
    "Every sentence is generated by rules from the numbers below.");

  html += section(k === "daily" ? "Scores" : "Top-25 matchups", rep.games?.length ? `<div class="scores">${rep.games.map(gameCard).join("")}</div>` : `<p class="muted small">No games.</p>`, esc(rep.games_note || ""));
  html += section("Upsets", rep.upsets?.length ? `<div class="scores">${rep.upsets.map(gameCard).join("")}</div>` : `<p class="muted small">No upsets by this rule.</p>`, esc(rep.upsets_rule || ""));

  html += section(k === "daily" ? "Top performers" : "Best single games", table(rep.top_performers, [
    ["Player", pl, true], ["Date", (r) => esc(day(r.date)), true], ["Opp", (r) => esc(r.opp) + ` <span class="muted small">${r.wl}</span>`, true],
    ["Line", (r) => esc(r.line), true], ["Game Score", (r) => `<b>${num(r.gmsc)}</b>`]]), "Ranked by Game Score (Hollinger), a one-number summary of a box-score line.");
  const nc = rep.notable_counts || {};
  html += section("Notable stat lines", table(rep.notable, [["Player", pl, true], ["Date", (r) => esc(day(r.date)), true],
    ["What", (r) => r.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join(" "), true], ["Line", (r) => esc(r.line), true]], "No 30-point games, triple-doubles, 20-10s or 7-three games."),
    `${nc["30_point_games"] ?? 0} 30-point games · ${nc.triple_doubles ?? 0} triple-doubles · ${nc.twenty_ten ?? 0} 20-10s · ${nc.games_7_threes ?? 0} games with 7+ threes`);
  if (rep.team_standouts?.length) html += section("Standout team performances", `<div class="grid stat-cards">${rep.team_standouts.map((s) =>
    `<div class="card stat-card"><div class="label">${esc(s.label)}</div><div class="value">${esc(s.value)}</div><div class="rank">${tm(s.team, s.team_slug)} ${esc(s.detail)}</div></div>`).join("")}</div>`);

  if (rep.leaders && Object.keys(rep.leaders).length) {
    const L = { pts: "Points", reb: "Rebounds", ast: "Assists", stl: "Steals", blk: "Blocks" };
    html += section("Leaders this period", `<div class="leader-grid">${Object.entries(rep.leaders).map(([key, rows]) => `<div class="card"><h3>${L[key] || key} per game</h3>
      ${table(rows, [["", pl, true], ["G", (r) => r.gp], ["", (r) => `<b>${num(r.value)}</b>`]])}</div>`).join("")}</div>`, esc(rep.qualifier || ""));
  }

  // What changed vs the previous period
  const chg = [["Player", pl, true], ["PPG", (r) => `<b>${num(r.ppg)}</b>`], ["Before", (r) => num(r.prior_ppg)], ["Change", (r) => delta(r.delta)]];
  html += `<section class="report-section"><h2>What changed <span class="muted small">${esc(wc.label || "")}${wc.range ? ` (${day(wc.range.start)}${wc.range.start !== wc.range.end ? " – " + day(wc.range.end) : ""})` : ""}</span></h2>
    ${wc.note ? `<div class="callout"><p>ℹ ${esc(wc.note)}</p></div>` : ""}
    <div class="grid two-col">
      <div class="card"><h3>D-I averages</h3>${table(wc.league, [["", (r) => esc(r.label), true],
        ["Now", (r) => FRAC.has(r.stat) ? pct(r.current) : num(r.current)], ["Before", (r) => FRAC.has(r.stat) ? pct(r.prior) : num(r.prior)],
        ["Change", (r) => delta(r.delta, { asPct: FRAC.has(r.stat) })]])}</div>
      <div class="card"><h3>T-Rank movers</h3>${table(wc.trank, [["Team", (r) => tm(r.team, r.team_slug), true], ["Now", (r) => r.rank], ["Before", (r) => r.prior_rank],
        ["Change", (r) => delta(r.move, { d: 0 })]], "No earlier T-Rank snapshot to compare with yet.")}<p class="muted small">${esc(wc.trank_basis || "")}</p></div>
      <div class="card"><h3>Biggest risers · points per game</h3>${table((wc.risers || []).filter((r) => r.delta > 0), chg, "No players qualified in both periods.")}</div>
      <div class="card"><h3>Biggest fallers · points per game</h3>${table((wc.fallers || []).filter((r) => r.delta < 0), chg, "No players qualified in both periods.")}</div>
    </div></section>`;

  const hc = [["Player", pl, true], ["G", (r) => r.gp], ["PPG", (r) => `<b>${num(r.ppg)}</b>`], ["Last season", (r) => num(r.prior_ppg)],
    ["Then at", (r) => esc(r.prior_team || ""), true], ["Change", (r) => delta(r.delta)]];
  html += section("Hottest and coldest vs last season", `<div class="grid two-col"><div class="card"><h3>🔥 Hottest</h3>${table((rep.hot || []).filter((r) => r.delta > 0), hc)}</div>
    <div class="card"><h3>🧊 Coldest</h3>${table((rep.cold || []).filter((r) => r.delta < 0), hc)}</div></div>`, esc(rep.hot_cold_basis || ""));

  html += `<div class="grid two-col">
    ${section("Freshmen", table(rep.freshmen, [["Player", pl, true], ["G", (r) => r.gp], ["PTS", (r) => `<b>${num(r.ppg)}</b>`], ["REB", (r) => num(r.rpg)], ["AST", (r) => num(r.apg)], ["TS%", (r) => pct(r.ts)]], "No freshmen met the minimums."), "First-year players (Torvik class 'Fr').")}
    ${rep.teams_best?.length ? section("Best teams this period", table(rep.teams_best, [["Team", (r) => tm(r.team, r.team_slug, r.trank), true], ["W-L", (r) => `${r.w}-${r.l}`],
      ["Margin", (r) => `<b>${signed(r.margin)}</b>`], ["ORtg", (r) => num(r.ortg)], ["DRtg", (r) => num(r.drtg)]]), "By average scoring margin. Ratings are points per 100 possessions estimated from box scores.") : ""}
  </div>`;
  return html;
}
