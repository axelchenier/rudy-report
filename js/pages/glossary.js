// glossary.js (page) - every stat with a plain-English definition, its formula, and what's typical,
// computed from real data: the middle 50% and top 10% of qualified players (or teams) in the default season.
import { load, completeSeasons, qualifies } from "../data.js";
import { STATS, fmt } from "../stats.js";
import { GLOSSARY, CATEGORIES } from "../glossary.js";
import { esc } from "../ui.js";
import { hubRows } from "../hubs.js";

function quantile(sorted, q) {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

export async function glossaryPage(app, query = "") {
  const q0 = new URLSearchParams(query).get("q") || "";
  const season = completeSeasons()[0];
  const [players, teams, hustle, tracking] = await Promise.all([load("players", season), load("teams", season),
    hubRows("hustle", "players", season).catch(() => []), hubRows("tracking", "players", season).catch(() => [])]);
  const qualified = players.filter((p) => qualifies(p, season));
  const pools = [["players", qualified], ["players", hustle.filter((p) => qualifies(p, season))],
    ["players", tracking.filter((p) => qualifies(p, season))], ["teams", teams]];

  // "Typical" ranges from the data, so nothing is hand-typed.
  function typical(key) {
    if (["GP", "W", "L", "AGE", "POSS", "MP"].includes(key)) return "";
    for (const [entity, rows] of pools) {
      const vals = rows.map((r) => r[key]).filter((v) => v != null).sort((a, b) => a - b);
      if (vals.length < 20 && entity === "players") continue;
      if (!vals.length) continue;
      const lb = STATS[key]?.lowerBetter;
      const top = quantile(vals, lb ? 0.1 : 0.9);
      const who = entity === "players" ? "qualified players" : "teams";
      return `Typical in ${season} (middle half of ${who}): <b>${fmt(quantile(vals, .25), key, entity)}–${fmt(quantile(vals, .75), key, entity)}</b> ·
        top 10%: <b>${lb ? "≤" : "≥"} ${fmt(top, key, entity)}</b>`;
    }
    return "";
  }

  const entries = Object.entries(GLOSSARY).map(([key, [cat, def, formula]]) => ({ key, cat, def, formula,
    label: STATS[key]?.label || key, name: STATS[key]?.name || key, model: STATS[key]?.model }));

  app.innerHTML = `
    <div class="page-head"><div><h1>Glossary</h1>
      <p class="sub">What every stat on The Rudy Report means. Hover a stat name anywhere on the site to see this definition.</p></div></div>
    <div class="toolbar"><input type="search" id="gq" placeholder="Search stats (e.g. true shooting, deflections, BPM)" value="${esc(q0)}" style="min-width:min(420px,100%)"></div>
    <div id="gl"></div>`;

  function draw(q) {
    const words = q.toLowerCase().trim();
    const match = (e) => !words || [e.key, e.label, e.name, e.def].some((s) => String(s).toLowerCase().includes(words));
    const shown = entries.filter(match);
    app.querySelector("#gl").innerHTML = CATEGORIES.map((cat) => {
      const list = shown.filter((e) => e.cat === cat);
      if (!list.length) return "";
      return `<h2>${esc(cat)}</h2><div class="gloss-grid">${list.map((e) => `
        <div class="card gloss" id="g-${e.key}">
          <div class="gloss-head"><b>${esc(e.label)}</b> <span class="muted">${esc(e.name)}</span>${e.model ? ` <span class="model-badge">Model estimate</span>` : ""}</div>
          <p>${esc(e.def)}</p>
          ${e.formula ? `<p class="formula"><code>${esc(e.formula)}</code></p>` : ""}
          ${STATS[e.key]?.lowerBetter ? `<p class="small muted">Lower is better.</p>` : ""}
          <p class="small muted">${typical(e.key)}</p>
        </div>`).join("")}</div>`;
    }).join("") || `<p class="muted">No stat matches “${esc(q)}”.</p>`;
  }
  // A ?q=KEY link (from a stat tooltip) shows just that stat.
  const exact = entries.find((e) => e.key === q0);
  draw(exact ? exact.name : q0);
  if (exact) app.querySelector("#gq").value = exact.name;
  app.querySelector("#gq").addEventListener("input", (e) => draw(e.target.value));
  app.insertAdjacentHTML("beforeend", `<p class="muted small">Typical ranges are computed from NBA.com/stats data for ${season}
    (qualified = played 70%+ of games). Basketball-Reference stats are credited to basketball-reference.com.</p>`);
}
