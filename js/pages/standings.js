// standings.js - conference / division / league standings from NBA.com (LeagueStandingsV3),
// plus Pythagorean expected wins and "luck" (a MODEL ESTIMATE, labeled as such).
import { load, SEASONS, currentSeason, seasonFromQuery, seasonSelectHTML, withSeason, META } from "../data.js";
import { fmt } from "../stats.js";
import { renderTable, esc, modelBadge } from "../ui.js";

export const PYTH_EXP = 13.91;     // Daryl Morey's NBA exponent, also used by Basketball-Reference
export const pyth = (pf, pa) => pf ** PYTH_EXP / (pf ** PYTH_EXP + pa ** PYTH_EXP);
const SEASON_LENGTH = { "2019-20": null, "2020-21": 72 };      // 2019-20 was cut short unevenly (COVID)
const PRIOR_GAMES = 10;            // early-season projection: blend with 10 games of a .500 team

// Add model columns to each team: Pythagorean W%, expected wins, luck, projected wins.
export function withModel(rows, season, inProgress) {
  const length = season in SEASON_LENGTH ? SEASON_LENGTH[season] : 82;
  return rows.map((r) => {
    const gp = r.WINS + r.LOSSES;
    const p = gp ? pyth(r.TotalPoints / gp, r.OppTotalPoints / gp) : null;
    const xW = p == null ? null : p * gp;
    const blend = p == null ? 0.5 : (gp * p + PRIOR_GAMES * 0.5) / (gp + PRIOR_GAMES);
    return { ...r, GP: gp, PYTH_WPCT: p, PYTH_W: xW, PYTH_L: xW == null ? null : gp - xW, LUCK: xW == null ? null : r.WINS - xW,
      PROJ_W: inProgress && length ? r.WINS + (length - gp) * blend : null };
  });
}

export async function standingsPage(app, query = "") {
  const params = new URLSearchParams(query);
  const season = seasonFromQuery(query);
  const view = params.get("view") || "conference";
  const info = META.seasons.find((s) => s.season === season) || {};
  let rows;
  try { rows = await load("standings", season); }
  catch { app.innerHTML = `<h1>Standings</h1><p class="muted">No standings file for ${season} yet.</p>`; return; }
  const teams = await load("teams", season).catch(() => []);
  const net = new Map(teams.map((t) => [t.TEAM_ID, t]));
  rows = withModel(rows, season, !!info.in_progress).map((r) => ({ ...r, NET_RATING: net.get(r.TeamID)?.NET_RATING,
    TEAM_ABBREVIATION: net.get(r.TeamID)?.TEAM_ABBREVIATION }));
  const games = Math.max(...rows.map((r) => r.GP));

  app.innerHTML = `
    <div class="page-head"><div><h1>Standings</h1>
      <p class="sub">${season} regular season${info.in_progress ? ` · in progress (${games} game${games === 1 ? "" : "s"} max so far)` : " · final"} · Source: NBA.com/stats</p></div>
      ${seasonSelectHTML(season, "st-season")}</div>
    <div class="toolbar"><div class="tabs">${[["conference", "Conference"], ["division", "Division"], ["league", "League"]].map(([k, l]) =>
      `<button data-view="${k}" class="${k === view ? "active" : ""}">${l}</button>`).join("")}</div>
      <span class="muted small">${modelBadge("Pythagorean expectation")} columns: xW-xL, Luck${info.in_progress ? ", Proj W" : ""}</span></div>
    ${games < 15 && info.in_progress ? `<p class="callout">The season just started, so the Pythagorean and projection columns are based on very few games and will swing a lot.</p>` : ""}
    <div id="st"></div>
    <div class="card method"><b>${modelBadge("")} How the model columns work.</b>
      <p class="small"><b>xW-xL</b> (Pythagorean record): a team's expected win % from points scored (PF) and allowed (PA) per game,
      PF<sup>${PYTH_EXP}</sup> ÷ (PF<sup>${PYTH_EXP}</sup> + PA<sup>${PYTH_EXP}</sup>), times games played. <b>Luck</b> = actual wins − expected wins:
      teams far above zero usually won a lot of close games, which history says doesn't hold up.
      ${info.in_progress ? `<b>Proj W</b> = wins so far + remaining games × the Pythagorean win %, pulled toward .500 as if the team had also played ${PRIOR_GAMES} average games (so the first few games don't dominate).` : ""}
      These are simple estimates, not predictions of what will happen. Seeds, records, streaks and clinch marks are NBA.com's.</p></div>`;

  const seed = (r) => `${r.PlayoffRank ?? ""}`;
  const name = (r) => `<a href="#/team/${r.TeamID}?season=${season}">${esc(r.TeamCity)} ${esc(r.TeamName)}</a>${r.ClinchIndicator ? ` <sup class="muted" title="NBA.com clinch mark">${esc(r.ClinchIndicator)}</sup>` : ""}`;
  const cols = (gbKey) => [
    { key: "PlayoffRank", label: view === "league" ? "Conf seed" : "#", html: seed },
    { key: "TeamName", label: "Team", left: true, html: name },
    { key: "WINS", label: "W" }, { key: "LOSSES", label: "L" }, { key: "WinPCT", label: "PCT", html: (r) => r.WinPCT.toFixed(3).replace(/^0/, "") },
    ...(gbKey ? [{ key: gbKey, label: "GB", html: (r) => r[gbKey] ? r[gbKey].toFixed(1) : "–" }] : []),
    { key: "HOME", label: "Home", html: (r) => r.HOME }, { key: "ROAD", label: "Road", html: (r) => r.ROAD },
    { key: "ConferenceRecord", label: "Conf", html: (r) => r.ConferenceRecord }, { key: "L10", label: "L10", html: (r) => r.L10 },
    { key: "strCurrentStreak", label: "Strk", html: (r) => r.strCurrentStreak },
    { key: "PointsPG", label: "PF", html: (r) => fmt(r.PointsPG, "PTS") }, { key: "OppPointsPG", label: "PA", html: (r) => fmt(r.OppPointsPG, "PTS") },
    { key: "DiffPointsPG", label: "Diff", html: (r) => fmt(r.DiffPointsPG, "DIFF_PG") }, { key: "NET_RATING" },
    { key: "PYTH_W", label: "xW-xL", title: "Pythagorean expected record (model estimate)", html: (r) => r.PYTH_W == null ? "–" : `${r.PYTH_W.toFixed(1)}-${r.PYTH_L.toFixed(1)}` },
    { key: "LUCK", html: (r) => r.LUCK == null ? "–" : `<span class="${r.LUCK > 0.5 ? "pos" : r.LUCK < -0.5 ? "neg" : ""}">${fmt(r.LUCK, "LUCK")}</span>` },
    ...(info.in_progress ? [{ key: "PROJ_W" }] : []),
  ];
  const box = app.querySelector("#st");
  const sections = view === "league" ? [["League", rows, null]]
    : view === "division" ? [...new Set(rows.map((r) => r.Division))].sort().map((d) => [d, rows.filter((r) => r.Division === d), "DivisionGamesBack"])
    : ["East", "West"].map((c) => [`${c}ern Conference`, rows.filter((r) => r.Conference === c), "ConferenceGamesBack"]);
  box.innerHTML = sections.map((s, i) => `<h2>${esc(s[0])}</h2><div id="st-${i}" class="${view === "conference" ? "seeded" : ""}"></div>`).join("") +
    (view === "conference" ? `<p class="muted small">Seeds 1-6 make the playoffs; 7-10 go to the Play-In Tournament (lines under 6 and 10).</p>` : "");
  sections.forEach(([, list], i) => renderTable(box.querySelector(`#st-${i}`), {
    rows: list, columns: cols(sections[i][2]), entity: "teams", rank: false, pageSize: 40,
    sortKey: view === "league" ? "WinPCT" : view === "division" ? "DivisionRank" : "PlayoffRank", sortAsc: view !== "league",
  }));

  app.querySelector("#st-season").addEventListener("change", (e) => { location.hash = withSeason(location.hash.startsWith("#/standings") ? location.hash : "#/standings", e.target.value); });
  app.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => {
    location.hash = withSeason("#/standings", season, { view: b.dataset.view });
  }));
}
