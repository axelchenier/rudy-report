// similar.js - Player Similarity Finder (Tools page, #/tools/similar). MODEL ESTIMATE.
// Every player-season with 500+ minutes, described by 15 numbers from NBA.com/stats (data/<season>/players.json).
// Each number is turned into a z-score WITHIN its own season (so a 2017 and a 2026 season are compared against their own league),
// then the closest player-seasons by weighted distance are listed. Similarity = 100 x exp(-distance / 4) (100 = identical profile).
import { load, SEASONS, META } from "../data.js";
import { esc, modelBadge } from "../ui.js";

const per36 = (k) => (p) => p.MIN ? (p[k] / p.MIN) * 36 : null;
export const FEATURES = [
  // [key, label, how to get it, group]
  ["PTS36", "Points / 36", per36("PTS"), "scoring"],
  ["USG", "Usage %", (p) => p.USG_PCT, "scoring"],
  ["TS", "True shooting %", (p) => p.TS_PCT, "scoring"],
  ["FG3R", "3PA rate (3PA / FGA)", (p) => p.FGA ? p.FG3A / p.FGA : null, "scoring"],
  ["FTR", "FT rate (FTA / FGA)", (p) => p.FGA ? p.FTA / p.FGA : null, "scoring"],
  ["FG3P", "3P%", (p) => p.FG3A * p.GP >= 40 ? p.FG3_PCT : null, "scoring"],
  ["AST36", "Assists / 36", per36("AST"), "playmaking"],
  ["ASTP", "Assist %", (p) => p.AST_PCT, "playmaking"],
  ["TOV36", "Turnovers / 36", per36("TOV"), "playmaking"],
  ["ORBP", "Off. rebound %", (p) => p.OREB_PCT, "inside"],
  ["DRBP", "Def. rebound %", (p) => p.DREB_PCT, "inside"],
  ["BLK36", "Blocks / 36", per36("BLK"), "inside"],
  ["STL36", "Steals / 36", per36("STL"), "defense"],
  ["PF36", "Fouls / 36", per36("PF"), "defense"],
  ["MPG", "Minutes / game", (p) => p.MIN, "role"],
];
const PRESETS = {
  all: { label: "Whole profile", w: {} },
  scoring: { label: "Scoring style", w: { scoring: 2, playmaking: 0.5, inside: 0.5, defense: 0.25, role: 0.5 } },
  playmaking: { label: "Playmaking", w: { scoring: 0.5, playmaking: 2.5, inside: 0.5, defense: 0.25, role: 0.5 } },
  big: { label: "Rebounding & rim", w: { scoring: 0.5, playmaking: 0.5, inside: 2.5, defense: 1, role: 0.5 } },
};
const MIN_MINUTES = 500;

let POOL = null;      // every qualifying player-season, with z-scores
async function pool() {
  if (POOL) return POOL;
  const seasons = SEASONS();
  const lists = await Promise.all(seasons.map((s) => load("players", s).catch(() => [])));
  POOL = [];
  lists.forEach((rows, si) => {
    const season = seasons[si];
    const inProgress = META.seasons.find((x) => x.season === season)?.in_progress;
    const keep = rows.filter((p) => p.GP * p.MIN >= (inProgress ? 0 : MIN_MINUTES) && p.MIN >= (inProgress ? 15 : 0));
    const ref = rows.filter((p) => p.GP * p.MIN >= MIN_MINUTES);       // league reference group for z-scores
    const base = ref.length >= 100 ? ref : rows.filter((p) => p.MIN >= 15);
    const stats = FEATURES.map(([, , get]) => {
      const v = base.map(get).filter((x) => x != null && Number.isFinite(x));
      const m = v.reduce((a, b) => a + b, 0) / v.length;
      const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length) || 1;
      return [m, sd];
    });
    for (const p of keep) {
      const raw = FEATURES.map(([, , get]) => get(p));
      POOL.push({ id: p.PLAYER_ID, name: p.PLAYER_NAME, team: p.TEAM_ABBREVIATION, season, inProgress, age: p.AGE, gp: p.GP, min: p.MIN,
        pts: p.PTS, reb: p.REB, ast: p.AST, raw, z: raw.map((v, i) => v == null || !Number.isFinite(v) ? null : (v - stats[i][0]) / stats[i][1]) });
    }
  });
  return POOL;
}

function distance(a, b, weights) {
  let s = 0, w = 0;
  FEATURES.forEach(([, , , g], i) => {
    if (a.z[i] == null || b.z[i] == null) return;
    const wi = weights[g] ?? 1;
    s += wi * (Math.max(-3, Math.min(3, a.z[i])) - Math.max(-3, Math.min(3, b.z[i]))) ** 2; w += wi;
  });
  return w ? Math.sqrt((s / w) * FEATURES.length) : Infinity;
}
const score = (d) => 100 * Math.exp(-d / 4);

export async function similarTool(box, params) {
  box.innerHTML = `<p class="muted">Loading every season…</p>`;
  const all = await pool();
  const seasons = SEASONS();
  const state = { id: +params.get("player") || null, season: params.get("season") || META.default_season, preset: params.get("w") || "all", scope: params.get("scope") || "all" };
  const names = [...new Map(all.map((p) => [p.name, p.id])).entries()].sort((a, b) => a[0].localeCompare(b[0]));
  if (!state.id) state.id = all.find((p) => p.name === "Anthony Edwards")?.id || all[0].id;

  box.innerHTML = `
    <div class="page-head"><div><h1>Similar players ${modelBadge("z-score distance over 15 NBA.com stats")}</h1>
      <p class="sub">Find the player-seasons whose statistical profile is closest, ${esc(seasons[seasons.length - 1])} to ${esc(seasons[0])}, each compared with its own season's league.</p></div></div>
    <div class="card toolbar sim-controls">
      <label>Player <input type="search" id="sm-name" list="sm-names" style="min-width:220px"><datalist id="sm-names">${names.map(([n]) => `<option value="${esc(n)}">`).join("")}</datalist></label>
      <label>Season <select id="sm-season"></select></label>
      <label>Focus <select id="sm-w">${Object.entries(PRESETS).map(([k, p]) => `<option value="${k}" ${k === state.preset ? "selected" : ""}>${p.label}</option>`).join("")}</select></label>
      <label>Search <select id="sm-scope"><option value="all">All seasons, other players</option><option value="same">Same season only</option><option value="self">Include his other seasons</option></select></label>
    </div>
    <div id="sm-out"></div>
    <div class="card method"><b>${modelBadge("")} How similarity works.</b>
      <p class="small">Each player-season with ${MIN_MINUTES}+ minutes (the in-progress season: 15+ minutes per game) is described by: ${FEATURES.map((f) => esc(f[1])).join(", ")}.
      Every number becomes a z-score within its own season (how many standard deviations above or below that season's ${MIN_MINUTES}+ minute players), capped at ±3,
      so eras with more threes or faster pace don't distort the match. Distance = weighted Euclidean distance between the two lists; "Focus" weights some groups more.
      Similarity = 100 × e<sup>−distance/4</sup>. It finds similar <i>box-score profiles</i>; it knows nothing about defense beyond steals, blocks and fouls, or about size and age.</p>
      <p class="muted small">Data: NBA.com/stats LeagueDashPlayerStats (Base + Advanced), via nba_api.</p></div>`;

  const nameBox = box.querySelector("#sm-name"), seasonBox = box.querySelector("#sm-season");
  box.querySelector("#sm-scope").value = state.scope;
  function fillSeasons() {
    const mine = all.filter((p) => p.id === state.id);
    if (!mine.some((p) => p.season === state.season)) state.season = mine[0]?.season;
    seasonBox.innerHTML = mine.map((p) => `<option value="${p.season}" ${p.season === state.season ? "selected" : ""}>${p.season} (${esc(p.team)})</option>`).join("");
    nameBox.value = mine[0]?.name || "";
  }
  function draw() {
    const me = all.find((p) => p.id === state.id && p.season === state.season);
    const out = box.querySelector("#sm-out");
    if (!me) { out.innerHTML = `<p class="muted">No qualifying season for that player (needs ${MIN_MINUTES}+ minutes).</p>`; return; }
    history.replaceState(null, "", `#/tools/similar?player=${state.id}&season=${state.season}&w=${state.preset}&scope=${state.scope}`);
    const w = PRESETS[state.preset].w;
    const cands = all.filter((p) => p !== me && (state.scope === "self" || p.id !== me.id) && (state.scope !== "same" || p.season === me.season));
    const top = cands.map((p) => ({ p, d: distance(me, p, w) })).sort((a, b) => a.d - b.d).slice(0, 15);
    const why = (p) => {
      const diffs = FEATURES.map((f, i) => [f[1], me.z[i] != null && p.z[i] != null ? Math.abs(me.z[i] - p.z[i]) : null]).filter((x) => x[1] != null).sort((a, b) => a[1] - b[1]);
      return `<span class="small">closest: ${diffs.slice(0, 3).map((x) => esc(x[0])).join(", ")} · most different: ${esc(diffs[diffs.length - 1][0])}</span>`;
    };
    const fmtv = (v, i) => v == null ? "–" : FEATURES[i][0].match(/^(USG|TS|FG3R|FTR|FG3P|ASTP|ORBP|DRBP)$/) ? (100 * v).toFixed(1) : v.toFixed(1);
    const profile = (p) => FEATURES.map((f, i) => `<td title="${esc(f[1])}: z ${p.z[i] == null ? "–" : p.z[i].toFixed(1)}" class="${p.z[i] > 1 ? "pos" : p.z[i] < -1 ? "neg" : ""}">${fmtv(p.raw[i], i)}</td>`).join("");
    out.innerHTML = `
      <div class="table-wrap"><table class="data sim-table"><thead><tr><th>Sim.</th><th class="left">Player-season</th><th>Age</th>${FEATURES.map((f) => `<th title="${esc(f[1])}">${esc(f[0])}</th>`).join("")}<th class="left">Why</th></tr></thead><tbody>
        <tr class="me"><td>–</td><td class="left"><b>${esc(me.name)}</b> ${me.season} ${esc(me.team)}${me.inProgress ? ` <span class="muted small">(in progress)</span>` : ""}</td><td>${me.age ?? "–"}</td>${profile(me)}<td class="left muted small">the player you picked</td></tr>
        ${top.map(({ p, d }) => `<tr><td><b>${score(d).toFixed(0)}</b></td><td class="left"><a href="#/player/${p.id}?season=${p.season}">${esc(p.name)}</a> ${p.season} ${esc(p.team)}</td><td>${p.age ?? "–"}</td>${profile(p)}<td class="left">${why(p)}</td></tr>`).join("")}
      </tbody></table></div>
      <p class="muted small">Green / red = more than one standard deviation above / below that season's league. Hover a number for its z-score. Similarity is a ${modelBadge("")}.</p>`;
  }
  nameBox.addEventListener("change", () => {
    const hit = names.find(([n]) => n.toLowerCase() === nameBox.value.trim().toLowerCase());
    if (hit) { state.id = hit[1]; fillSeasons(); draw(); }
  });
  seasonBox.addEventListener("change", () => { state.season = seasonBox.value; draw(); });
  box.querySelector("#sm-w").addEventListener("change", (e) => { state.preset = e.target.value; draw(); });
  box.querySelector("#sm-scope").addEventListener("change", (e) => { state.scope = e.target.value; draw(); });
  fillSeasons(); draw();
}
