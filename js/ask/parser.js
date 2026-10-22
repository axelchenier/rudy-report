// parser.js - turns a plain-English question into a structured "intent" the engine can answer.
// No AI here: just rules, word lists, and patterns. Example:
//   "top 10 players in true shooting with at least 50 games"
//   -> { type: "leaders", entity: "players", stat: "TS_PCT", order: "desc", limit: 10, filters: [{stat:"GP", op:">=", value:50}] }

import { STATS } from "../stats.js";
import { normalize, findNames } from "./names.js";

// Every stat phrase, longest first, so "box plus minus" wins over "plus minus".
const PHRASES = Object.entries(STATS).flatMap(([key, s]) => (s.words || []).map((w) => ({ key, w: normalize(w) })))
  .sort((a, b) => b.w.length - a.w.length);

const TEAM_ONLY = new Set(["FG3A_PER100", "FG3M_PER100", "PTS_PER100", "FG3A_RATE", "W_PCT"]);

// Find stat words in the question. Returns [{ key, start, end }] in the order they appear.
function findStats(q) {
  const used = [], hits = [];
  for (const { key, w } of PHRASES) {
    const re = new RegExp(`(^|[^a-z0-9%])${w.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&")}(?=$|[^a-z0-9])`, "g");
    for (const m of q.matchAll(re)) {
      const s = m.index + m[1].length, e = s + w.length;
      if (used.some(([a, b]) => s < b && e > a)) continue;
      used.push([s, e]); hits.push({ key, start: s, end: e, word: w });
    }
  }
  return hits.sort((a, b) => a.start - b.start);
}

// Which seasons does the question cover? Returns { seasons: [...], label } or null (= use the season picked in the header).
function findSeasons(q, all, current) {
  const yearsAgo = q.match(/(?:past|last|previous|over the last|over the past)\s+(\d+|two|three|four|five|six|seven|eight|nine|ten)\s+(?:years|seasons)/);
  const words = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  if (yearsAgo) {
    const n = Number(yearsAgo[1]) || words[yearsAgo[1]];
    return { seasons: all.slice(0, n), label: `past ${n} seasons`, asked: n };
  }
  if (/past decade|last decade|last ten|past ten/.test(q)) return { seasons: all.slice(0, 10), label: "past 10 seasons", asked: 10 };
  if (/all time|ever\b|career|in history|of all/.test(q)) return { seasons: all, label: "all loaded seasons", asked: Infinity };
  // Decades: "in the 2000s", "the 90s", "the '90s", "1990s" = seasons that STARTED in that decade (2000s = 2000-01 to 2009-10).
  const dec = q.match(/\b(?:the\s+)?(?:(19|20)(\d)0|['’]?(\d)0)['’]?s\b/);
  if (dec) {
    const d = dec[1] ? +`${dec[1]}${dec[2]}0` : (+dec[3] >= 5 ? 1900 : 2000) + 10 * +dec[3];
    const ss = all.filter((x) => +x.slice(0, 4) >= d && +x.slice(0, 4) <= d + 9);
    if (!ss.length) return { seasons: [], label: `the ${d}s`, outOfRange: `The ${d}s aren't on this site: NBA.com stats here start in ${all[all.length - 1]}.` };
    const first = ss[ss.length - 1], last = ss[0], early = +first.slice(0, 4) > d;
    return { seasons: ss, label: `the ${d}s (${first} to ${last})`, asked: early ? 10 : ss.length,
      note: early ? `NBA.com stats on this site start in ${first}, so “the ${d}s” here means ${first} to ${last}.` : null };
  }
  const since = q.match(/since (?:the )?((?:19|20)\d\d)/);
  if (since) { const ss = all.filter((s) => +s.slice(0, 4) >= +since[1]); return { seasons: ss, label: `since ${since[1]}-${String(+since[1] + 1).slice(2)}` }; }
  const range = q.match(/((?:19|20)\d\d)[\s\/-]+(\d\d)\b/);            // "2023-24" (the dash may have become a space)
  if (range) { const s = `${range[1]}-${range[2]}`; if (all.includes(s)) return { seasons: [s], label: s }; }
  const year = q.match(/\b(?:in )?((?:19|20)\d\d)\b/);                   // "in 2024" -> the season that ENDED in 2024
  if (year) { const s = all.find((x) => +x.slice(0, 4) + 1 === +year[1]); if (s) return { seasons: [s], label: s }; }
  if (/this season|current season|so far/.test(q) && current) return { seasons: [current], label: `${current} (in progress)` };
  if (/last season|this past season/.test(q)) return { seasons: [all[0]], label: all[0] };
  return null;
}

// Number + optional comparison word right BEFORE a stat ("at least 25 points", "over 40% from three", "25+ points").
function numberBefore(q, start) {
  const before = q.slice(Math.max(0, start - 40), start);
  if (/\b(top|best|worst|bottom|first|past|last)\s+\d+\s*$/.test(before)) return null;   // "top 10 scorers" is a list size, not a filter
  const m = before.match(/(at least|minimum of|minimum|min|more than|over|above|greater than|under|less than|fewer than|below|at most|>=|<=|>|<)?\s*(\d+(?:\.\d+)?)\s*(%)?\s*(\+|or more|or better|or less|or fewer)?\s*(?:a game |per game |a night )?$/);
  if (!m) return null;
  const word = m[1] || "", tail = m[4] || "";
  const op = /under|less|fewer|below|at most|<|or less|or fewer/.test(word + tail) ? "<=" : ">=";
  return { value: Number(m[2]), pct: !!m[3], op, length: m[0].length };
}
// Also "3P% over 40" (stat first, number after).
function numberAfter(q, end) {
  const m = q.slice(end, end + 30).match(/^\s*(?:of\s+)?(at least|over|above|more than|under|below|less than|>=|<=|>|<)\s*(\d+(?:\.\d+)?)\s*(%)?/);
  return m ? { value: Number(m[2]), pct: !!m[3], op: /under|below|less|</.test(m[1]) ? "<=" : ">=" } : null;
}

/**
 * parseQuestion - the main function.
 *  question: what the user typed
 *  ctx: { index (name lookup), seasons (all loaded, newest first), season (picked in header) }
 * Returns an intent object, or { type: "unknown" } if we can't understand it.
 */
export function parseQuestion(question, ctx) {
  const q = normalize(question);
  const span = findSeasons(q, ctx.seasons, ctx.current);
  // Blank out season text like "2023 24" so its numbers aren't mistaken for stat filters.
  const qs = q.replace(/(20\d\d)[\s\/-]+(\d\d)\b/g, (m) => " ".repeat(m.length)).replace(/\b(in|since) 20\d\d\b/g, (m) => " ".repeat(m.length));
  const stats = findStats(qs);
  const names = findNames(ctx.index, q, question, stats.map((s) => [s.start, s.end]));
  const seasons = span?.seasons || [ctx.season];
  if (span?.outOfRange) return { type: "unknown", reason: span.outOfRange };
  const base = { question, seasons, spanLabel: span?.label || seasons[0], askedYears: span?.asked, spanNote: span?.note };

  // ---- Numbers attached to stats become filters ("25 points", "at least 50 games") ----
  const filters = [];
  const free = [];                                   // stat mentions WITHOUT a number = what to rank by
  for (const s of stats) {
    const n = numberBefore(qs, s.start) || numberAfter(qs, s.end);
    if (n) {
      const isPct = STATS[s.key].fmt === "pct";
      const value = isPct && (n.pct || n.value > 1) ? n.value / 100 : n.value;
      filters.push({ stat: s.key, op: n.op, value });
    } else free.push(s);
  }
  const minGP = filters.find((f) => f.stat === "GP" && f.op === ">=")?.value;
  const minMIN = filters.find((f) => f.stat === "MIN" && f.op === ">=")?.value;
  const otherFilters = filters.filter((f) => !((f.stat === "GP" || f.stat === "MIN") && f.op === ">="));

  const limitMatch = q.match(/\b(?:top|best|worst|bottom|first)\s+(\d+)\b/) || q.match(/\b(\d+)\s+(?:best|top|worst|players|teams)\b/);
  const limit = limitMatch ? Math.min(+limitMatch[1], 100) : 10;
  const low = /\b(least|fewest|lowest|worst|bottom|slowest|youngest)\b/.test(q.replace(/\bat least\b/g, ""));
  const mentionsTeams = /\bteams?\b|\bfranchises?\b/.test(q) || (names.teams.length > 0 && names.players.length === 0);

  // ---- 1) Two-player fit report: "will X and Y be a good pairing / fit together" ----
  if (names.players.length === 2 && /pair|fit|together|duo|work well|mesh|play well|good combo|combination|backcourt|frontcourt/.test(q)) {
    return { ...base, type: "fit", players: names.players };
  }
  // ---- 2) Compare: "compare X and Y", "X vs Y" ----
  if ((names.players.length >= 2 || names.teams.length >= 2) && (/compare|\bvs\b|versus|or\b|better|difference|side by side/.test(q) || stats.length === 0)) {
    const entity = names.players.length >= 2 ? "players" : "teams";
    return { ...base, type: "compare", entity, items: (entity === "players" ? names.players : names.teams).slice(0, 4), stats: free.map((s) => s.key) };
  }
  // ---- 3) Home court / home vs road ----
  if (/home court|home advantage|homecourt|home vs|home and away|home record|road record|away record|best at home|best on the road|road team|home team|at home|on the road/.test(q)) {
    const metric = /road record|on the road|road team|away record/.test(q) && !/advantage|vs/.test(q) ? "ROAD_W_PCT"
      : /home record|best at home|at home/.test(q) && !/advantage|vs/.test(q) ? "HOME_W_PCT" : "HOME_EDGE";
    return { ...base, type: "home", metric, order: low ? "asc" : "desc", limit: names.teams.length ? 30 : Math.max(limit, 10), team: names.teams[0],
      seasons: span ? seasons : [ctx.season], spanLabel: span ? span.label : ctx.season };
  }
  // ---- 4) Opening day / opening night ----
  if (/opening (day|night|game)|season opener|first game of the season/.test(q)) {
    const stat = ["PTS", "REB", "AST", "FG3M"].includes(free[0]?.key) ? free[0].key : "PTS";
    const allSeasons = span ? seasons : ctx.seasons;            // no time span given -> use every loaded season
    return { ...base, type: "opening", stat, seasons: allSeasons, spanLabel: span ? span.label : "all loaded seasons",
      minApps: filters.find((f) => f.stat === "APPS")?.value ?? Math.min(3, allSeasons.length), limit, player: names.players[0] };
  }
  // ---- 5) One player or team + a stat: "Timberwolves net rating", "Anthony Edwards true shooting" ----
  if ((names.players.length === 1 || names.teams.length === 1) && !/\b(top|leaders?|leads|most|highest|lowest|best|worst)\b/.test(q)) {
    const entity = names.players.length === 1 ? "players" : "teams";
    return { ...base, type: "lookup", entity, item: entity === "players" ? names.players[0] : names.teams[0], stats: free.map((s) => s.key) };
  }
  // ---- 6) Leaders: "who leads the league in assists", "top 10 players in true shooting" ----
  const rankStat = free.find((s) => !["GP", "MIN"].includes(s.key)) || free[0];
  if (rankStat) {
    let entity = mentionsTeams || TEAM_ONLY.has(rankStat.key) ? "teams" : "players";
    if (/\bplayers?\b|\bwho\b/.test(q) && !mentionsTeams && !TEAM_ONLY.has(rankStat.key)) entity = "players";
    const s = STATS[rankStat.key];
    const wantsBest = /\bbest\b/.test(q), wantsWorst = /\bworst\b/.test(q);
    let order = low ? "asc" : "desc";
    if (s.lowerBetter && (wantsBest || wantsWorst)) order = wantsBest ? "asc" : "desc";
    if (rankStat.word === "youngest") order = "asc";
    const total = /\btotal\b|\bmost\b.*\b(made|scored)\b|\bcombined\b/.test(q) && !/per game|average/.test(q);
    return { ...base, type: "leaders", entity, stat: rankStat.key, order, limit, filters: otherFilters, minGP, minMIN,
      team: names.teams[0], wantTotals: total, wantAverage: /per game|average|averag/.test(q) };
  }
  // ---- 7) Only numbers: "players averaging 25 points and 5 assists" ----
  if (otherFilters.length) {
    const entity = mentionsTeams ? "teams" : "players";
    return { ...base, type: "leaders", entity, stat: otherFilters[0].stat, order: "desc", limit: 100, filters: otherFilters, minGP, minMIN, isFilterList: true, team: names.teams[0] };
  }
  // ---- 8) Just a name: show their profile summary ----
  if (names.players.length === 1 || names.teams.length === 1) {
    const entity = names.players.length === 1 ? "players" : "teams";
    return { ...base, type: "lookup", entity, item: entity === "players" ? names.players[0] : names.teams[0], stats: [] };
  }
  return { ...base, type: "unknown" };
}
