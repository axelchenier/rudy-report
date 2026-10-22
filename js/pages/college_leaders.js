// college_leaders.js - College Leaders hub (#/college/leaders?season=&conf=&cls=&stat=&fr=1&cstat=).
// 1) Season leaders: top 10 per stat for one season, filterable by conference and class (from data/college/<season>/players.json).
// 2) All-time single-season leaders since 2007-08 (all players or freshmen only) and 3) career leaders since 2007-08,
//    both precomputed by pipeline/college_leaders.py into data/college/leaders.json (~90 KB).
import { esc } from "../ui.js";
import { getJSON } from "./draft_nav.js";
import { loadCMeta, CMETA, cload, playedSeasons, seasonInfo, TORVIK_CREDIT, C_QUAL_MIN_PCT } from "../college/cdata.js";
import { collegeNav } from "./college.js";

const FMT = {
  num: (v) => v == null ? "–" : Number(v).toFixed(1),
  pm: (v) => v == null ? "–" : (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1),
  pct: (v) => v == null ? "–" : (v * 100).toFixed(1) + "%",
  int: (v) => v == null ? "–" : Math.round(v).toLocaleString(),
};
const PM = new Set(["BPM", "OBPM", "DBPM"]);
const fmtOf = (k, f) => PM.has(k) ? FMT.pm : FMT[f] || FMT.num;
// Season cards: key, label, format, attempt minimum (column, full-season value; scaled down for a season in progress)
const CARDS = [["PTS", "Points per game", "num"], ["REB", "Rebounds per game", "num"], ["AST", "Assists per game", "num"], ["STL", "Steals per game", "num"],
  ["BLK", "Blocks per game", "num"], ["BPM", "Box Plus/Minus", "num"], ["PORPAG", "PRPG! (points over replacement per game)", "num"],
  ["TS", "True shooting %", "pct", ["FGA_TOT", 200]], ["FG3_PCT", "3-point %", "pct", ["FG3A_TOT", 100]], ["FG3M_TOT", "3-pointers made", "int"],
  ["FT_PCT", "Free-throw %", "pct", ["FTA_TOT", 100]], ["USG", "Usage rate", "pct"]];
const pLink = (pid, n) => `<a href="#/college/player/${pid}">${esc(n)}</a>`;
const tLink = (id, n, s) => `<a href="#/college/team/${esc(id)}${s ? `?season=${s}` : ""}">${esc(n)}</a>`;
const st = { season: null, conf: "", cls: "", stat: "PTS", fr: false, cstat: "PTS" };

export async function collegeLeadersPage(app, query = "") {
  await loadCMeta();
  const q = new URLSearchParams(query);
  const seasons = playedSeasons();
  st.season = seasons.includes(q.get("season")) ? q.get("season") : (st.season || seasons[0]);
  for (const k of ["conf", "cls", "stat", "cstat"]) if (q.has(k)) st[k] = q.get(k);
  if (q.has("fr")) st.fr = q.get("fr") === "1";
  const L = await getJSON("data/college/leaders.json");
  if (!L.single[st.stat]) st.stat = "PTS";
  if (!L.career[st.cstat]) st.cstat = "PTS";
  app.innerHTML = `${collegeNav("leaders")}
    <div class="page-head"><div><h1>College Leaders</h1>
      <p class="sub">NCAA men's Division I stat leaders: one season (by conference and class), the best single seasons since 2007-08 (all players or
      freshmen only) and career leaders since 2007-08. Qualified = ${Math.round(C_QUAL_MIN_PCT * 100)}%+ of team minutes and 15+ games (Torvik's rule).</p></div></div>
    <h2>Season leaders</h2>
    <div class="toolbar" id="ld-ctl">
      <select id="ld-season">${seasons.map((s) => `<option ${s === st.season ? "selected" : ""}>${s}</option>`).join("")}</select>
      <select id="ld-conf"></select>
      <select id="ld-cls"><option value="">All classes</option>${[["Fr", "Freshmen"], ["So", "Sophomores"], ["Jr", "Juniors"], ["Sr", "Seniors"]].map(([c, l]) => `<option value="${c}" ${c === st.cls ? "selected" : ""}>${l}</option>`).join("")}</select>
    </div>
    <div id="ld-season-note" class="muted small"></div>
    <div id="ld-cards" class="grid ld-grid"></div>
    <h2 style="margin-top:22px">Best single seasons since 2007-08</h2>
    <div class="toolbar"><select id="ld-stat">${Object.entries(L.single).map(([k, v]) => `<option value="${k}" ${k === st.stat ? "selected" : ""}>${esc(v.label)}</option>`).join("")}</select>
      <div class="tabs"><button data-fr="0" class="${st.fr ? "" : "active"}">All players</button><button data-fr="1" class="${st.fr ? "active" : ""}">Freshmen only</button></div></div>
    <div id="ld-single"></div>
    <h2 style="margin-top:22px">Career leaders since 2007-08</h2>
    <div class="toolbar"><select id="ld-cstat">${Object.entries(L.career).map(([k, v]) => `<option value="${k}" ${k === st.cstat ? "selected" : ""}>${esc(v.label)}</option>`).join("")}</select></div>
    <div id="ld-career"></div>
    <p class="muted small">Source: ${TORVIK_CREDIT} player files, seasons ${esc(L.seasons)}; leaderboards rebuilt ${esc(L.generated_at)}. Torvik counts games
      against Division I opponents, so totals can be a little below official NCAA totals (games against non-D-I teams are left out), and careers
      that started before 2007-08 only count 2007-08 onward. Career rebounds, assists, steals, blocks and PRPG! totals are per-game averages × games
      (rounded per game, so within a few of the true total). Players who transferred are combined across schools (Torvik player id).</p>`;
  const url = () => history.replaceState(null, "", `#/college/leaders?season=${st.season}${st.conf ? `&conf=${encodeURIComponent(st.conf)}` : ""}${st.cls ? `&cls=${st.cls}` : ""}&stat=${st.stat}${st.fr ? "&fr=1" : ""}&cstat=${st.cstat}`);

  async function drawSeason() {
    const players = await cload("players", st.season);
    const confs = [...new Set(players.map((p) => p.CONF))].filter(Boolean).sort();
    if (st.conf && !confs.includes(st.conf)) st.conf = "";
    app.querySelector("#ld-conf").innerHTML = `<option value="">All conferences</option>${confs.map((c) => `<option ${c === st.conf ? "selected" : ""}>${esc(c)}</option>`).join("")}`;
    const info = seasonInfo(st.season);
    const scale = info.in_progress ? Math.min(1, (info.max_team_games || 30) / 30) : 1;
    const minGP = Math.max(1, Math.round(15 * scale));
    const pool = players.filter((p) => (p.MIN_PCT ?? 0) >= C_QUAL_MIN_PCT && (p.GP ?? 0) >= minGP && (!st.conf || p.CONF === st.conf) && (!st.cls || p.CLASS === st.cls));
    app.querySelector("#ld-season-note").innerHTML = `${pool.length.toLocaleString()} qualified players${st.conf ? ` in the ${esc(st.conf)}` : ""}${info.in_progress ? ` · season in progress (minimums scaled to ${minGP}+ games)` : ""}.`;
    app.querySelector("#ld-cards").innerHTML = CARDS.map(([k, label, f, min]) => {
      let sub = pool.filter((p) => p[k] != null);
      if (min) sub = sub.filter((p) => (p[min[0]] ?? 0) >= Math.round(min[1] * scale));
      const top = sub.sort((a, b) => b[k] - a[k]).slice(0, 10);
      const fm = fmtOf(k, f);
      return `<div class="card ld-card"><h3>${esc(label)}${min ? ` <span class="muted small">(${Math.round(min[1] * scale)}+ ${min[0].replace("_TOT", "").replace("FG3A", "3PA")})</span>` : ""}</h3>
        ${top.length ? `<ol class="ld-list">${top.map((p) => `<li><span class="ld-n">${pLink(p.PID, p.PLAYER_NAME)} <span class="muted small">${esc(p.TEAM_NAME)} · ${esc(p.CLASS || "")}</span></span><b>${fm(p[k])}</b></li>`).join("")}</ol>` : `<p class="muted small">No qualified players.</p>`}
        <a class="small" href="#/college/players?season=${st.season}${st.conf ? `&conf=${encodeURIComponent(st.conf)}` : ""}">Full table →</a></div>`;
    }).join("");
  }
  function drawSingle() {
    const s = L.single[st.stat], rows = s[st.fr ? "fr" : "all"], fm = fmtOf(st.stat, s.fmt);
    app.querySelector("#ld-single").innerHTML = `<div class="table-wrap"><table class="data"><thead><tr><th>#</th><th class="left">Player</th><th class="left">Team</th><th class="left">Season</th><th class="left">Class</th><th>${esc(s.label)}</th></tr></thead><tbody>
      ${rows.map(([pid, n, tn, tid, season, cls, v], i) => `<tr><td>${i + 1}</td><td class="left">${pLink(pid, n)}</td><td class="left">${tLink(tid, tn, season)}</td><td class="left">${season}</td><td class="left">${esc(cls || "")}</td><td><b>${fm(v)}</b></td></tr>`).join("")}
      </tbody></table></div>`;
  }
  function drawCareer() {
    const c = L.career[st.cstat];
    app.querySelector("#ld-career").innerHTML = `<div class="table-wrap"><table class="data"><thead><tr><th>#</th><th class="left">Player</th><th class="left">Last school</th><th class="left">Seasons</th><th>${esc(c.label)}${c.kind === "approx" ? " ≈" : ""}</th></tr></thead><tbody>
      ${c.rows.map(([pid, n, tn, tid, a, b, ns, sch, v], i) => `<tr><td>${i + 1}</td><td class="left">${pLink(pid, n)}</td><td class="left">${tLink(tid, tn, b)}${sch > 1 ? ` <span class="muted small">(${sch} schools)</span>` : ""}</td><td class="left">${a === b ? a : `${a.slice(0, 4)}–${b.slice(5)}`} <span class="muted small">(${ns})</span></td><td><b>${st.cstat === "PORPAG_TOT" ? Number(v).toFixed(0) : FMT.int(v)}</b></td></tr>`).join("")}
      </tbody></table></div>`;
  }
  app.querySelector("#ld-season").addEventListener("change", (e) => { st.season = e.target.value; url(); drawSeason(); });
  app.querySelector("#ld-conf").addEventListener("change", (e) => { st.conf = e.target.value; url(); drawSeason(); });
  app.querySelector("#ld-cls").addEventListener("change", (e) => { st.cls = e.target.value; url(); drawSeason(); });
  app.querySelector("#ld-stat").addEventListener("change", (e) => { st.stat = e.target.value; url(); drawSingle(); });
  app.querySelector("#ld-cstat").addEventListener("change", (e) => { st.cstat = e.target.value; url(); drawCareer(); });
  app.querySelectorAll("[data-fr]").forEach((b) => b.addEventListener("click", () => {
    st.fr = b.dataset.fr === "1"; app.querySelectorAll("[data-fr]").forEach((x) => x.classList.toggle("active", x === b)); url(); drawSingle();
  }));
  drawSingle(); drawCareer(); await drawSeason();
}
