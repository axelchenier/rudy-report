// college_home.js - the College hub (#/college): recent results and the next D-I games (ESPN schedule, with a Model estimate from
// Torvik ratings), the top 25 by T-Rank, and links to every College and Draft tool.
// Data: data/college/schedule.json (pipeline/college_schedule.py, nightly) + data/college/<season>/teams.json (Torvik).
import { esc, modelBadge } from "../ui.js";
import { getJSON } from "./draft_nav.js";
import { loadCMeta, CMETA, cload, CSEASONS, playedSeasons, seasonInfo, addRecords, TORVIK_CREDIT } from "../college/cdata.js";
import { collegeNav } from "./college.js";
import { predictGame, seasonAverages } from "./college_predictor.js";

const TOOLS = [
  ["College", [
    ["#/college/teams", "Teams", "All 365 D-I teams: T-Rank, adjusted efficiency, four factors and records, every season since 2007-08."],
    ["#/college/players", "Players", "Player stats incl. Torvik BPM and PRPG!, filter by conference, team and class."],
    ["#/college/leaders", "Leaders", "Season leaders by conference and class, best single seasons and career leaders since 2007-08."],
    ["#/college/conferences", "Conferences", "Conference strength, standings, leaders and history."],
    ["#/college/compare", "Compare", "Up to 4 players or teams side by side, even from different seasons."],
    ["#/college/reports", "Reports", "Daily, weekly and monthly college reports."],
    ["#/college/predictor", "Game predictor", "Model estimate for any matchup: score, spread and win chance from Torvik ratings."],
    ["#/college/tournament", "Tournament simulator", "Simulate the real NCAA bracket (or a projected one) thousands of times."],
    ["#/college/transfer", "Transfer what-if", "Move a player to another team and see how both teams' efficiency, T-Rank and record would change."]]],
  ["Draft", [
    ["#/draft", "2027 Model Board", "Our model's ranking of 2027 draft prospects from college production, age and size."],
    ["#/draft/mock", "Mock draft", "Build a mock draft on the real lottery order; swap picks and make your own selections."],
    ["#/draft/history", "Draft classes 2008-2026", "Every pick since 2008 with college stats and what each player became in the NBA."],
    ["#/draft/translation", "College → NBA", "How college stats translated to NBA outcomes for 900+ drafted players."]]],
];
const ET = { timeZone: "America/New_York" };
const etDate = (iso) => new Date(iso).toLocaleDateString("en-CA", ET);          // YYYY-MM-DD in Eastern time
const dayLabel = (d, today) => {
  const t = new Date(today + "T12:00:00Z"), x = new Date(d + "T12:00:00Z"), diff = Math.round((x - t) / 864e5);
  const name = x.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  return diff === 0 ? `Today · ${name}` : diff === -1 ? `Yesterday · ${name}` : diff === 1 ? `Tomorrow · ${name}` : name;
};
const seasonOf = (iso) => { const d = new Date(iso), y = d.getUTCFullYear() + (d.getUTCMonth() >= 7 ? 1 : 0); return `${y - 1}-${String(y).slice(2)}`; };
const st = { day: null, all: false };

export async function collegeHomePage(app) {
  await loadCMeta();
  const newest = CSEASONS()[0], info = seasonInfo(newest);
  const [sched, teamsNow] = await Promise.all([getJSON("data/college/schedule.json").catch(() => null), cload("teams", newest)]);
  const top = [...teamsNow].map(addRecords).sort((a, b) => a.TRANK - b.TRANK).slice(0, 25);
  app.innerHTML = `${collegeNav("home")}
    <div class="page-head"><div><h1>College Basketball</h1>
      <p class="sub">NCAA men's Division I: games, ratings, players, tools and the NBA draft, built on ${TORVIK_CREDIT} and ESPN data.</p></div></div>
    <div class="grid ch-grid">
      <div class="card ch-games"><h2 style="margin-top:0">Games</h2><div id="ch-games"></div></div>
      <div class="card"><h2 style="margin-top:0">Top 25 by T-Rank <span class="muted small">${esc(newest)}${info.preseason ? " preseason" : ""}</span></h2>
        ${info.preseason ? `<p class="muted small">Torvik's preseason ratings (no games yet). <a href="#/college/teams?season=${playedSeasons()[0]}">Final ${playedSeasons()[0]} ratings →</a></p>` : ""}
        <div class="table-wrap" style="max-height:none"><table class="data"><thead><tr><th>#</th><th class="left">Team</th><th class="left">Conf</th>${info.preseason ? "<th>Proj W-L</th>" : "<th>W-L</th>"}<th title="Adjusted efficiency margin">AdjEM</th></tr></thead><tbody>
        ${top.map((t) => `<tr><td>${t.TRANK}</td><td class="left"><a href="#/college/team/${esc(t.TEAM_ID)}?season=${newest}">${esc(t.TEAM_NAME)}</a></td><td class="left">${esc(t.CONF)}</td>
          <td>${info.preseason ? (t.PROJ_W != null ? `${t.PROJ_W.toFixed(1)}-${t.PROJ_L.toFixed(1)}` : "–") : `${t.W}-${t.L}`}</td><td>${t.ADJEM > 0 ? "+" : ""}${t.ADJEM.toFixed(1)}</td></tr>`).join("")}
        </tbody></table></div>
        <p class="small"><a href="#/college/teams?season=${newest}">All ${teamsNow.length} teams →</a></p></div>
    </div>
    ${TOOLS.map(([g, list]) => `<h2 style="margin-top:20px">${g} tools</h2><div class="grid tool-cards">${list.map(([h, l, d]) =>
      `<a class="card tool-card" href="${h}"><h3>${esc(l)}</h3><p class="muted small">${esc(d)}</p></a>`).join("")}</div>`).join("")}
    <p class="muted small">Schedule and scores: ESPN scoreboard (NCAA men's D-I), saved nightly${sched ? ` · last saved ${esc(sched.generated_at)}` : ""}, so
      today's scores are not live. Win chances are a ${modelBadge("")} from Torvik's ratings for that season (the Game Predictor's method: AdjO, AdjD,
      tempo, 3-point home edge); before a season starts those are Torvik's preseason ratings. Rankings next to team names are ESPN's (AP poll).</p>`;
  await drawGames(app.querySelector("#ch-games"), sched);
}

async function drawGames(box, sched) {
  if (!sched || !sched.games?.length) { box.innerHTML = `<p class="muted">No D-I games on ESPN's schedule in the next few weeks.</p>`; return; }
  // Ratings for each game's season (preseason ratings before the season starts).
  const seasons = [...new Set(sched.games.map((g) => seasonOf(g.date)))].filter((s) => CSEASONS().includes(s));
  const R = {};
  for (const s of seasons) { const t = await cload("teams", s); R[s] = { by: new Map(t.map((x) => [x.TEAM_ID, x])), avg: seasonAverages(t) }; }
  const games = sched.games.map((g) => {
    const r = R[seasonOf(g.date)], H = r?.by.get(g.home.id), A = r?.by.get(g.away.id);
    const p = H && A ? predictGame(H, A, g.neutral ? "n" : "a", r.avg) : null;
    return { ...g, d: etDate(g.date), H, A, p, q: H && A ? H.TRANK + A.TRANK : 1e4 };
  });
  const days = [...new Set(games.map((g) => g.d))].sort();
  const today = sched.today_et && new Date().toLocaleDateString("en-CA", ET) === sched.today_et ? sched.today_et : new Date().toLocaleDateString("en-CA", ET);
  if (!days.includes(st.day)) st.day = days.find((d) => d >= today && games.some((g) => g.d === d && g.state !== "post")) || days.find((d) => d >= today) || days[days.length - 1];
  const draw = () => {
    const list = games.filter((g) => g.d === st.day).sort((a, b) => st.all ? a.date.localeCompare(b.date) : a.q - b.q);
    const shown = st.all ? list : list.filter((g) => g.H && g.A).slice(0, 15);
    const opening = !days.some((d) => d < today) && days[0] > today;
    box.innerHTML = `${opening ? `<p class="muted small">The season tips off ${dayLabel(days[0], today).replace(/^Tomorrow · /, "")}. First games on ESPN's schedule:</p>` : ""}
      <div class="toolbar" style="margin:0 0 8px"><div class="tabs subnav ch-days">${days.map((d) => `<button data-day="${d}" class="${d === st.day ? "active" : ""}">${dayLabel(d, today)}</button>`).join("")}</div>
      <div class="tabs"><button data-all="0" class="${st.all ? "" : "active"}">Top games</button><button data-all="1" class="${st.all ? "active" : ""}">All ${list.length}</button></div></div>
      ${shown.length ? `<div class="table-wrap"><table class="data ch-table"><thead><tr><th class="left">Time (ET)</th><th class="left">Game</th><th>T-Rank</th><th>Model estimate</th></tr></thead><tbody>
        ${shown.map(row).join("")}</tbody></table></div>` : `<p class="muted">No games between two D-I teams that day.</p>`}
      ${st.all ? "" : `<p class="muted small">Top games = the ${Math.min(15, list.filter((g) => g.H && g.A).length)} best matchups by combined T-Rank${list.length > shown.length ? ` (of ${list.length} games; "All" adds games against non-D-I teams)` : ""}.</p>`}`;
    box.querySelectorAll("[data-day]").forEach((b) => b.addEventListener("click", () => { st.day = b.dataset.day; draw(); }));
    box.querySelectorAll("[data-all]").forEach((b) => b.addEventListener("click", () => { st.all = b.dataset.all === "1"; draw(); }));
    const act = box.querySelector(".ch-days .active"); if (act) act.parentElement.scrollLeft = Math.max(0, act.offsetLeft - 24);
  };
  draw();
}

function team(s, T, season) {
  const rk = s.rank ? `<span class="muted small">${s.rank}</span> ` : "";
  const name = s.id && T ? `<a href="#/college/team/${esc(s.id)}?season=${season}">${esc(s.name)}</a>` : esc(s.name);
  return `${rk}${name}${s.score != null ? ` <b>${s.score}</b>` : ""}`;
}
function row(g) {
  const season = seasonOf(g.date);
  const time = g.state === "pre" ? (/TBD/.test(g.detail || "") ? "TBD" : new Date(g.date).toLocaleTimeString("en-US", { ...ET, hour: "numeric", minute: "2-digit" }))
    : g.state === "post" ? "Final" + (/OT/.test(g.detail || "") ? ` (${g.detail.replace(/^Final\/?/, "")})` : "") : esc(g.detail || "Live");
  let est = "–";
  if (g.p) {
    const homeFav = g.p.pA >= 0.5, fav = homeFav ? g.home : g.away, pr = homeFav ? g.p.pA : 1 - g.p.pA;
    let tag = "";
    if (g.state === "post" && g.home.score != null && g.away.score != null) {
      const homeWon = g.home.score > g.away.score;
      tag = homeWon === homeFav ? ` <span class="ch-hit" title="The model's favorite won">✓</span>` : ` <span class="ch-miss" title="Upset: the model's underdog won">upset</span>`;
    }
    est = `${esc(fav.name)} ${Math.round(pr * 100)}% <span class="muted small">by ${Math.abs(g.p.margin).toFixed(1)}</span>${tag}`;
  }
  return `<tr><td class="left">${time}${g.tv ? `<div class="muted small">${esc(g.tv)}</div>` : ""}</td>
    <td class="left">${team(g.away, g.A, season)} <span class="muted">${g.neutral ? "vs" : "at"}</span> ${team(g.home, g.H, season)}${g.conf ? ` <span class="muted small">conf</span>` : ""}</td>
    <td>${g.A ? g.A.TRANK : "–"} / ${g.H ? g.H.TRANK : "–"}</td><td>${est}</td></tr>`;
}
