// college_extras.js - extra sections for college team and player pages:
//   * Team page "Program history": NCAA tournament runs (ESPN scoreboard brackets, data/college/brackets/) and the program's
//     NBA draft picks since 2008 with their NBA careers (NBA.com DraftHistory + NBA.com stats, data/draft/translation.json).
//   * Player page: transfer path (from Torvik season rows) and, for drafted players, the NBA draft pick and NBA career.
// Real data only; nothing here is a model.
import { esc } from "../ui.js";
import { getJSON, tierTag } from "./draft_nav.js";
import { unpack } from "./draft_translation.js";

const num = (v, d = 1) => v == null ? "–" : Number(v).toFixed(d);
const pct = (v) => v == null ? "–" : (v * 100).toFixed(1) + "%";
const int = (v) => v == null ? "–" : Number(v).toLocaleString();
export const ROUND_NAME = ["Lost in the round of 64", "Lost in the round of 32", "Sweet 16", "Elite Eight", "Final Four", "Runner-up", "Champion"];
const SHORT_ROUND = ["R64", "R32", "Sweet 16", "Elite 8", "Final Four", "Runner-up", "Champion"];
let transCache = null;
const translation = async () => (transCache ||= unpack(await getJSON("data/draft/translation.json")));

async function tourneyRuns(teamId) {
  const ix = await getJSON("data/college/brackets/index.json");
  const files = await Promise.all(ix.years.map((y) => getJSON(`data/college/brackets/${y}.json`).catch(() => null)));
  return files.filter(Boolean).map((b) => {
    const t = b.teams.find((x) => x.team_id === teamId);
    if (!t) return null;
    return { year: b.year, season: b.season, seed: t.seed, region: t.region, wins: t.wins };
  }).filter(Boolean).sort((a, b) => b.year - a.year);
}

export async function renderProgramHistory(box, teamId, teamName) {
  if (!box) return;
  const [runs, trans] = await Promise.all([tourneyRuns(teamId).catch(() => []), translation().catch(() => [])]);
  const picks = trans.filter((r) => r.TEAM_ID === teamId).sort((a, b) => b.DRAFT_YEAR - a.DRAFT_YEAR || a.PICK - b.PICK);
  const ix = await getJSON("data/college/brackets/index.json").catch(() => ({ years: [] }));
  const best = runs.length ? Math.max(...runs.map((r) => r.wins)) : null;
  const titles = runs.filter((r) => r.wins === 6).map((r) => r.year);
  const rot = picks.filter((r) => ["rotation", "starter"].includes(r.TIER)).length;
  box.innerHTML = `<h2>Program history</h2>
    <div class="grid stat-cards" style="grid-template-columns:repeat(auto-fill,minmax(170px,1fr))">
      <div class="card stat-card"><div class="label">NCAA tournaments</div><div class="value">${runs.length}</div><div class="rank">of ${ix.years.length} (${ix.years[ix.years.length - 1]}-${ix.years[0]}, no 2020)</div></div>
      <div class="card stat-card"><div class="label">Best finish</div><div class="value" style="font-size:20px">${best == null ? "–" : SHORT_ROUND[best]}</div><div class="rank">${best == null ? "no bids" : runs.filter((r) => r.wins === best).map((r) => r.year).join(", ")}</div></div>
      <div class="card stat-card"><div class="label">Tournament wins</div><div class="value">${runs.reduce((a, r) => a + r.wins, 0)}</div><div class="rank">${titles.length ? `titles: ${titles.join(", ")}` : "First Four not counted"}</div></div>
      <div class="card stat-card"><div class="label">NBA draft picks</div><div class="value">${picks.length}</div><div class="rank">since 2008 · ${rot} became rotation players</div></div>
    </div>
    <div class="two-col" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px">
      <div><h3>NCAA tournament runs</h3>${runs.length ? `<div class="table-wrap"><table class="data"><thead><tr><th class="left">Year</th><th>Seed</th><th class="left">Region</th><th class="left">Result</th></tr></thead><tbody>
        ${runs.map((r) => `<tr><td class="left"><a href="#/college/tournament?year=${r.year}">${r.year}</a></td><td>${r.seed}</td><td class="left">${esc(r.region)}</td><td class="left">${r.wins >= 4 ? `<b>${ROUND_NAME[r.wins]}</b>` : ROUND_NAME[r.wins]}</td></tr>`).join("")}</tbody></table></div>`
        : `<p class="muted small">No NCAA tournament bids in ${ix.years[ix.years.length - 1]}-${ix.years[0]} (First Four losers aren't listed).</p>`}
        <p class="muted small">ESPN scoreboard results. A First Four win is not counted as a tournament win here.</p></div>
      <div><h3>NBA draft picks since 2008</h3>${picks.length ? `<div class="table-wrap"><table class="data"><thead><tr><th class="left">Player</th><th>Draft</th><th class="left">Final season</th><th>NBA G</th><th>Minutes</th><th>PTS</th><th class="left">Outcome</th></tr></thead><tbody>
        ${picks.map((r) => `<tr><td class="left">${r.N_GP ? `<a href="#/player/${r.NBA_ID}">${esc(r.NAME)}</a>` : esc(r.NAME)} <a class="small" href="#/college/player/${r.PID}" title="College stats">college</a></td>
          <td><a href="#/draft/history?year=${r.DRAFT_YEAR}">${r.DRAFT_YEAR}</a> #${r.PICK}</td><td class="left">${esc(r.SEASON)}</td><td>${int(r.N_GP)}</td><td>${int(r.N_MIN)}</td><td>${num(r.N_PPG)}</td><td class="left">${tierTag(r.TIER)}</td></tr>`).join("")}</tbody></table></div>`
        : `<p class="muted small">No players from ${esc(teamName)} drafted in 2008-2026 (counted by final D-I school).</p>`}
        <p class="muted small">NBA.com Draft History and regular-season stats; counted by each player's final D-I school before the draft.</p></div>
    </div>`;
}

// Transfer path from season rows: [{TEAM_ID, TEAM_NAME, SEASON}], oldest first.
export function transferPath(career) {
  const stints = [];
  career.forEach((r) => { const last = stints[stints.length - 1]; if (last && last.id === r.TEAM_ID) last.to = r.SEASON; else stints.push({ id: r.TEAM_ID, name: r.TEAM_NAME, from: r.SEASON, to: r.SEASON }); });
  return stints;
}

export async function renderPlayerExtras(box, pid, career) {
  if (!box) return;
  const stints = transferPath(career);
  const trans = await translation().catch(() => []);
  const o = trans.find((r) => r.PID === pid);
  let html = "";
  if (stints.length > 1) html += `<div class="card"><b>Transfer path:</b> ${stints.map((s) => `<a href="#/college/team/${esc(s.id)}?season=${s.to}">${esc(s.name)}</a> <span class="muted small">(${s.from === s.to ? s.from : `${s.from} to ${s.to}`})</span>`).join(" → ")}
    <p class="muted small" style="margin:4px 0 0">${stints.length - 1} transfer${stints.length > 2 ? "s" : ""}, from Torvik's season-by-season rosters (a season he sat out doesn't appear).</p></div>`;
  if (o) {
    const row = (label, pts, reb, ast, ts, extra) => `<tr><td class="left">${label}</td><td>${num(pts)}</td><td>${num(reb)}</td><td>${num(ast)}</td><td>${pct(ts)}</td><td class="left small muted">${extra}</td></tr>`;
    html += `<div class="card" style="margin-top:12px"><h3 style="margin-top:0">NBA: ${o.DRAFT_YEAR} draft, pick #${o.PICK} ${tierTag(o.TIER)}</h3>
      <div class="table-wrap"><table class="data"><thead><tr><th class="left"></th><th>PTS</th><th>REB</th><th>AST</th><th>TS%</th><th class="left"></th></tr></thead><tbody>
        ${row(`Final college season (${esc(o.SEASON)})`, o.C_PTS, o.C_REB, o.C_AST, o.C_TS, esc(o.TEAM))}
        ${o.R_GP ? row("NBA rookie season", o.R_PPG, o.R_RPG, o.R_APG, o.R_TS, `${o.R_GP} games, ${num(o.R_MPG)} min`) : ""}
        ${o.N_GP ? row("NBA career", o.N_PPG, o.N_RPG, o.N_APG, o.N_TS, `${o.N_SEASONS} seasons, ${int(o.N_GP)} games, ${int(o.N_MIN)} min`) : ""}</tbody></table></div>
      <p class="small">${o.N_GP ? `<a href="#/player/${o.NBA_ID}">NBA career page →</a> · ` : "No NBA regular-season games yet · "}<a href="#/draft/history?year=${o.DRAFT_YEAR}">${o.DRAFT_YEAR} draft class →</a> · <a href="#/draft/translation">How college stats carried over →</a></p>
      <p class="muted small" style="margin:0">NBA.com Draft History and regular-season stats; college line from Torvik.</p></div>`;
  }
  box.innerHTML = html;
}
