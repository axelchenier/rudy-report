// college_similar.js - "Most similar college seasons" card on college player pages (#/college/player/<pid>).
// Data: data/college/similar/<season>.json (pipeline/college_similar.py): for every qualified D-I season since 2007-08, the 5
// closest player-seasons by a 15-stat profile z-scored within each season (the 2027 Draft board's comp method). NBA outcomes
// come from data/draft/translation.json (NBA.com Draft History + regular-season minutes; no Basketball-Reference data).
import { esc } from "../ui.js";
import { getJSON, tierTag } from "./draft_nav.js";
import { unpack } from "./draft_translation.js";

const LABEL = { AGE: "age", HT_IN: "height", BPM: "BPM", OBPM: "OBPM", DBPM: "DBPM", USG: "usage", TS: "TS%", AST_PCT: "assist rate", TOV_PCT: "turnover rate",
  ORB_PCT: "off. rebound rate", DRB_PCT: "def. rebound rate", STL_PCT: "steal rate", BLK_PCT: "block rate", FT_ADJ: "FT% (shrunk)", FG3A_100: "3PA per 100" };

export async function renderSimilarSeasons(box, pid, career) {
  if (!box) return;
  const ix = await getJSON("data/college/similar/index.json").catch(() => null);
  if (!ix) return;
  // Qualified seasons only (the same rule the pipeline used); each season's file (~0.5 MB) loads when its tab is opened.
  const mine = [...new Set(career.filter((c) => (c.MIN_PCT ?? 0) >= 0.4 && (c.GP ?? 0) >= 15).map((c) => c.SEASON))].filter((s) => ix.seasons.includes(s)).sort().reverse().map((s) => [s]);
  if (!mine.length) { box.innerHTML = ""; return; }
  const trans = unpack(await getJSON("data/draft/translation.json").catch(() => ({ cols: [], rows: [] })));
  const nba = new Map(trans.map((r) => [r.PID, r]));
  let cur = mine[0][0];
  const draw = async () => {
    const d = await getJSON(`data/college/similar/${cur}.json`);
    if (!d.players[pid]) { box.innerHTML = ""; return; }
    const rows = d.players[pid].map(([p, ti, yr, ci, sim, pick]) => ({ p, name: d.names[p], team: ix.teams[ti] || [null, "–"], season: `${yr - 1}-${String(yr).slice(2)}`, cls: ix.classes[ci] || "", sim, pick, o: nba.get(p) }));
    box.innerHTML = `<div class="card" style="margin-top:12px"><h3 style="margin-top:0">Most similar college seasons</h3>
      ${mine.length > 1 ? `<div class="tabs" style="margin-bottom:8px;flex-wrap:wrap">${mine.map(([s]) => `<button data-sim="${s}" class="${s === cur ? "active" : ""}">${s}</button>`).join("")}</div>` : ""}
      <div class="table-wrap"><table class="data"><thead><tr><th>#</th><th class="left">Player</th><th class="left">Season</th><th class="left">Team</th><th class="left">Class</th><th>Similarity</th><th class="left">NBA</th></tr></thead><tbody>
      ${rows.map((r, i) => `<tr><td>${i + 1}</td><td class="left"><a href="#/college/player/${r.p}">${esc(r.name)}</a></td><td class="left">${r.season}</td>
        <td class="left">${r.team[0] ? `<a href="#/college/team/${esc(r.team[0])}?season=${r.season}">${esc(r.team[1])}</a>` : "–"}</td><td class="left">${esc(r.cls)}</td><td>${r.sim.toFixed(0)}%</td>
        <td class="left">${r.o ? `<a href="#/draft/history?year=${r.o.DRAFT_YEAR}">${r.o.DRAFT_YEAR} #${r.o.PICK}</a> ${tierTag(r.o.TIER)}` : r.pick ? `Drafted #${r.pick}` : `<span class="muted">–</span>`}</td></tr>`).join("")}
      </tbody></table></div>
      <p class="muted small">Closest matches to his ${cur} season among D-I seasons since 2007-08 with ${esc(ix.qualify)} (his own other seasons left out), on ${ix.stats.length} stats z-scored within each season:
        ${ix.stats.map((k) => LABEL[k] || k).join(", ")}. Similarity = 100 × (1 − distance ÷ 2). Same profile as the 2027 Draft board's comps. NBA = draft pick and outcome
        (NBA.com minutes: starter / rotation / played / none); comps from 2025-26 may still be in the draft pipeline.</p></div>`;
    box.querySelectorAll("[data-sim]").forEach((b) => b.addEventListener("click", () => { cur = b.dataset.sim; draw(); }));
  };
  await draw();
}
