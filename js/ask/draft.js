// draft.js (Ask) - answers 2027 NBA Draft questions from data/draft/ (made by pipeline/college_draft.py):
//   "top 2027 draft prospects", "top SEC draft prospects", "first round odds for Tyler Tanner",
//   "most similar drafted player to Tyler Tanner". Rules only, no AI. Every chance is the site's MODEL ESTIMATE.
import { esc } from "../ui.js";
import { normalize } from "./names.js";

const DRAFT_WORDS = /\b(draft|drafted|prospects?|big board|model board|first round|1st round|lottery pick|draft pick|mock)\b/;
const SIMILAR = /\b(similar|comps?|comparison|compares? to|reminds|looks like|statistical twin)\b/;
const ODDS = /\b(odds|chances?|probability|likely|likelihood|will .* (?:be|get) (?:drafted|picked)|go in the first|first round pick)\b/;
const key = (s) => normalize(s).replace(/\./g, "").replace(/\s+/g, " ").trim();
const reFor = (w) => new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&")}(?=$|[^a-z0-9])`);
const chance = (p) => p == null ? "–" : p >= 0.995 ? ">99%" : p < 0.01 ? "<1%" : Math.round(p * 100) + "%";
const num = (v, d = 1) => v == null ? "–" : Number(v).toFixed(d);
const cache = new Map();
const getJSON = (path) => { if (!cache.has(path)) cache.set(path, fetch(path).then((r) => { if (!r.ok) throw new Error(`Could not load ${path}`); return r.json(); })); return cache.get(path); };
const CONF_WORDS = [["big ten", "B10"], ["big 10", "B10"], ["big 12", "B12"], ["big east", "BE"], ["acc", "ACC"], ["sec", "SEC"],
  ["mountain west", "MWC"], ["wcc", "WCC"], ["west coast", "WCC"], ["atlantic 10", "A10"], ["a10", "A10"], ["aac", "Amer"], ["american athletic", "Amer"], ["mvc", "MVC"], ["missouri valley", "MVC"]];
const CLASS_WORDS = [[/\bfreshm[ae]n\b/, "Fr"], [/\bsophomores?\b/, "So"], [/\bjuniors?\b/, "Jr"], [/\bseniors?\b/, "Sr"]];
const SORTS = [[/\b(points|scorers?|scoring)\b/, "pts", "points per game"], [/\b(rebound\w*)\b/, "reb", "rebounds per game"], [/\b(assists?|passers?)\b/, "ast", "assists per game"],
  [/\b(bpm|box plus minus)\b/, "bpm", "Box Plus/Minus"], [/\b(true shooting|ts|efficient)\b/, "ts", "true shooting %"], [/\b(youngest)\b/, "age_draft", "age at the draft (youngest first)"]];

const SOURCES = ["Rudy Report Model Board (model estimate, built from Bart Torvik T-Rank college stats)", "NBA.com Draft Combine (where measured)"];
const MODEL_NOTE = "First-round and drafted chances are this site's <b>model estimate</b> (a logistic model fit on 2007-08 to 2022-23 college seasons), not a scouting ranking or anyone else's board. <a href=\"#/draft\">How the model works →</a>";

/** Returns { tags, result } for a draft question, or null. */
export async function draftAnswer(question, nbaNameFound = false) {
  const q = key(question);
  const simQ = SIMILAR.test(q) && /\b(drafted|draft|nba|pro|pick)\b/.test(q);
  if (!DRAFT_WORDS.test(q) && !simQ) return null;
  const year = q.match(/\b(?:19|20)\d\d\b/g);
  if (year && !year.includes("2027")) return null;        // past drafts aren't in this data
  let b;
  try { b = await getJSON("data/draft/board.json"); } catch { return null; }
  const P = b.prospects;
  // Find a prospect: full name first, then a unique last name (4+ letters).
  const full = P.map((p) => ({ p, w: key(p.player) })).filter((x) => reFor(x.w).test(q)).sort((a, b2) => b2.w.length - a.w.length);
  let hit = full[0]?.p;
  if (!hit) {
    const words = new Set(q.split(" "));
    const lasts = P.filter((p) => { const l = key(p.player).split(" ").pop(); return l.length >= 4 && words.has(l); });
    if (lasts.length === 1) hit = lasts[0];
  }
  const tagBase = ["2027 NBA Draft", "Model Board"];
  const footer = `Board built ${esc(b.generated_at)} from ${esc(b.stats_season)} college stats.`;

  if (hit && (simQ || SIMILAR.test(q))) {
    const r = await getJSON(`data/draft/prospects/${hit.pid}.json`);
    const comps = r.comps || [];
    if (!comps.length) return { tags: [...tagBase, "Similar players"], result: { headline: `No statistical comparisons are saved for ${esc(hit.player)}.`, tables: [], notes: [], sources: SOURCES, footer } };
    const c = comps[0];
    return { tags: [...tagBase, "Similar drafted players", `Player: ${esc(hit.player)}`],
      result: { headline: `By the numbers, the most similar past drafted player to <b><a href="#/draft/${hit.pid}">${esc(hit.player)}</a></b> (${esc(hit.team)}) is <b>${esc(c.player)}</b>
          (${esc(c.team)}, ${esc(c.season)}, ${c.pick ? `pick #${c.pick} in ${c.draft_year}` : `drafted ${c.draft_year}`}), similarity ${num(c.similarity, 0)}/100.`,
        html: `<p><a class="btn" href="#/draft/${hit.pid}">Open ${esc(hit.player)}'s draft report →</a></p>`,
        tables: [{ rows: comps, rank: true, entity: "players", sortKey: "similarity", columns: [
          { key: "player", label: "Drafted player", left: true, html: (x) => `<a href="#/college/player/${x.pid}">${esc(x.player)}</a>` },
          { key: "team", label: "College", left: true, html: (x) => esc(x.team) }, { key: "season", label: "Season", left: true, html: (x) => esc(x.season) },
          { key: "pick", label: "Pick", html: (x) => x.pick ? `#${x.pick} (${x.draft_year})` : esc(x.draft_year) },
          { key: "age", label: "Age", html: (x) => num(x.age) }, { key: "pts", label: "PTS", html: (x) => num(x.pts) },
          { key: "bpm", label: "BPM", html: (x) => num(x.bpm) }, { key: "ts", label: "TS%", html: (x) => num(x.ts * 100) },
          { key: "similarity", label: "Similarity", html: (x) => num(x.similarity, 0) }] }],
        notes: [`Similarity compares ${esc(hit.player)}'s ${esc(hit.stats_season || b.stats_season)} college season with the final college season of ${esc(b.model.comps_pool.replace(/^Final college seasons of /, ""))}. It's a statistical resemblance, not a prediction of his NBA career.`],
        sources: SOURCES, footer } };
  }

  if (hit) {
    return { tags: [...tagBase, "Draft odds", `Player: ${esc(hit.player)}`],
      result: { headline: `<b><a href="#/draft/${hit.pid}">${esc(hit.player)}</a></b> (${esc(hit.team)}, ${esc(hit.class_now)}) is <b>#${hit.rank}</b> on the Rudy Report Model Board:
          <b>${chance(hit.p_first)}</b> chance of going in the first round and ${chance(hit.p_drafted)} of being drafted <span class="model-badge">Model estimate</span>.`,
        html: `<p><a class="btn" href="#/draft/${hit.pid}">Open the full draft report →</a> <a class="btn" href="#/draft">See the whole board →</a></p>`,
        tables: [{ rows: [hit], rank: false, entity: "players", columns: boardCols() }],
        notes: [MODEL_NOTE, `Most similar past drafted player: ${esc(hit.top_comp || "–")}.`], sources: SOURCES, footer } };
  }

  // A name that isn't on the board ("first round odds for <someone>")
  const named = question.match(/\b(?:for|of|to|is|does|will)\s+([A-Z][a-z'.-]+(?:\s+[A-Z][a-z'.-]+)+)/);
  if (named && (ODDS.test(q) || simQ)) {
    return { tags: [...tagBase], result: { headline: `${esc(named[1])} isn't on the 2027 Model Board (top ${P.length} returning college players).`,
      html: `<p><a class="btn" href="#/draft">See the board →</a></p>`, tables: [],
      notes: [`The board only includes players on a ${esc(b.roster_season)} D-I roster with ${esc(b.stats_season)} college stats. Incoming freshmen, international players and players already in the NBA aren't on it.`], sources: SOURCES, footer } };
  }
  if (nbaNameFound) return null;                          // "where was Anthony Edwards drafted" is an NBA question
  if (simQ && !DRAFT_WORDS.test(q)) return null;

  // Board list, optionally filtered by conference / class and sorted by a stat.
  let rows = [...P];
  const conf = CONF_WORDS.find(([w]) => reFor(w).test(q))?.[1];
  const cls = CLASS_WORDS.find(([re]) => re.test(q))?.[1];
  if (conf) rows = rows.filter((p) => p.conf === conf);
  if (cls) rows = rows.filter((p) => p.class_now === cls);
  const sort = SORTS.find(([re]) => re.test(q));
  if (sort) rows.sort((a, c) => sort[1] === "age_draft" ? a.age_draft - c.age_draft : (c[sort[1]] ?? -99) - (a[sort[1]] ?? -99));
  const n = Math.min(+(q.match(/\b(?:top|best|first)\s+(\d+)\b/)?.[1] || 10), 150);
  const top = rows.slice(0, n);
  if (!top.length) return { tags: tagBase, result: { headline: "No 2027 Model Board prospects match that.", html: `<p><a class="btn" href="#/draft">See the board →</a></p>`, tables: [],
    notes: cls === "Fr" ? ["Freshmen have no college stats until they play, so 2026-27 freshmen join the board once the season starts."] : [], sources: SOURCES, footer } };
  const lead = top[0];
  const where = [conf, cls && { Fr: "freshmen", So: "sophomores", Jr: "juniors", Sr: "seniors" }[cls]].filter(Boolean).join(" ");
  return { tags: [...tagBase, "Board", ...(conf ? [`Conference: ${conf}`] : []), ...(cls ? [`Class: ${cls}`] : []), ...(sort ? [`Sorted by ${sort[2]}`] : [])],
    result: { headline: sort
        ? `Among the top ${P.length} ${where ? where + " " : ""}prospects on the 2027 Model Board, <b><a href="#/draft/${lead.pid}">${esc(lead.player)}</a></b> (${esc(lead.team)}) ranks first by ${sort[2]} (${sort[1] === "ts" ? num(lead.ts * 100) + "%" : num(lead[sort[1]])}).`
        : `The top ${where ? where + " " : ""}2027 draft prospect on the Rudy Report Model Board is <b><a href="#/draft/${lead.pid}">${esc(lead.player)}</a></b> (${esc(lead.team)}), with a ${chance(lead.p_first)} first-round chance <span class="model-badge">Model estimate</span>.`,
      html: `<p><a class="btn" href="#/draft">Open the full 2027 Model Board →</a></p>`,
      tables: [{ rows: top, rank: false, entity: "players", columns: boardCols() }],
      notes: [MODEL_NOTE, "Incoming freshmen and international players have no college stats yet, so they aren't on the board."], sources: SOURCES, footer } };
}

function boardCols() {
  return [{ key: "rank", label: "Board #", html: (p) => p.rank },
    { key: "player", label: "Player", left: true, html: (p) => `<a href="#/draft/${p.pid}">${esc(p.player)}</a>` },
    { key: "team", label: "Team", left: true, html: (p) => `<a href="#/college/team/${esc(p.team_slug)}">${esc(p.team)}</a>` },
    { key: "class_now", label: "Class", left: true, html: (p) => esc(p.class_now) }, { key: "ht", label: "Ht", left: true, html: (p) => esc(p.ht) },
    { key: "age_draft", label: "Age at draft", html: (p) => num(p.age_draft) },
    { key: "pts", label: "PTS", html: (p) => num(p.pts) }, { key: "reb", label: "REB", html: (p) => num(p.reb) }, { key: "ast", label: "AST", html: (p) => num(p.ast) },
    { key: "bpm", label: "BPM", html: (p) => num(p.bpm) }, { key: "ts", label: "TS%", html: (p) => num(p.ts * 100) },
    { key: "p_first", label: "1st-round chance", html: (p) => chance(p.p_first) }, { key: "p_drafted", label: "Drafted chance", html: (p) => chance(p.p_drafted) }];
}
