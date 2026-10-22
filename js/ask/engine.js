// engine.js - takes an "intent" from parser.js and builds the answer:
//   { headline, notes: [...], tables: [{ title, rows, columns, entity, highlight, sortKey, sortAsc }], html, sources: [...] }
// All numbers come from the JSON files in /data (NBA.com and Basketball-Reference). Nothing is made up.

import { load, META, seasonGames, QUALIFY_SHARE } from "../data.js";
import { STATS, fmt } from "../stats.js";
import { esc, playerLink, teamLink, teamAbbrLink, percentile, rankOf } from "../ui.js";

const SRC = {
  nba: "NBA.com/stats (via nba_api)",
  bbref: "Basketball-Reference.com advanced tables",
  logs: "NBA.com/stats game logs (via nba_api)",
  tracking: "NBA.com/stats player tracking (via nba_api)",
  hustle: "NBA.com/stats hustle stats (via nba_api)",
};
const sourceOf = (key) => SRC[STATS[key]?.source] || SRC.nba;
const label = (k) => STATS[k]?.name || k;
const seasonText = (seasons) => seasons.length === 1 ? seasons[0] : `${seasons[seasons.length - 1]} to ${seasons[0]} (${seasons.length} seasons)`;
const B = (x) => `<b>${esc(x)}</b>`;

// Load one file kind for several seasons and stick them together.
const loadSeasons = async (kind, seasons) => (await Promise.all(seasons.map((s) => load(kind, s).catch(() => [])))).flat();

// ---------------------------------------------------------------------------
// Getting PLAYER rows that include every stat a question might ask about.
// For one season we join: per-game + advanced (NBA.com), tracking (NBA.com), and BBRef (BPM etc).
// ---------------------------------------------------------------------------
// Extra files carry their own games/minutes/names; keep the main table's versions.
const onlyStats = (t) => { const { GP, G, MIN, PLAYER_NAME, TEAM_ID, TEAM_ABBREVIATION, W, L, ...rest } = t; return rest; };
async function playerRows(season, statKeys = []) {
  const rows = (await load("players", season)).map((r) => ({ ...r }));
  const byId = new Map(rows.map((r) => [r.PLAYER_ID, r]));
  if (statKeys.some((k) => STATS[k]?.source === "tracking")) {
    for (const t of await load("players_tracking", season).catch(() => [])) Object.assign(byId.get(t.PLAYER_ID) || {}, t);
    for (const t of await load("tracking_more", season).catch(() => [])) Object.assign(byId.get(t.PLAYER_ID) || {}, onlyStats(t));
  }
  if (statKeys.some((k) => STATS[k]?.source === "hustle")) {
    for (const t of await load("hustle_players", season).catch(() => [])) Object.assign(byId.get(t.PLAYER_ID) || {}, onlyStats(t));
  }
  if (statKeys.some((k) => STATS[k]?.source === "bbref")) {
    for (const b of await load("bbref_advanced", season).catch(() => [])) {
      const r = byId.get(b.PLAYER_ID);
      if (r) Object.assign(r, { BPM: b.BPM, OBPM: b.OBPM, DBPM: b.DBPM, PER: b.PER, WS: b.WS, WS_48: b.WS_48, VORP: b.VORP, MP: b.MP });
    }
  }
  return rows;
}

// Which counting stats can be added up across seasons.
const SUMMABLE = ["GP", "PTS", "REB", "OREB", "DREB", "AST", "STL", "BLK", "TOV", "PF", "FGM", "FGA", "FG3M", "FG3A", "FTM", "FTA", "PLUS_MINUS", "DD2", "TD3"];
const isCounting = (k) => SUMMABLE.includes(k) && k !== "GP";

// Several seasons -> one row per player: season totals added up; per-game = total / games;
// percentages recalculated from makes/attempts; advanced stats averaged, weighted by minutes played.
async function playerRowsSpan(seasons, statKeys) {
  const totals = await loadSeasons("players_totals", seasons);
  const perGame = (await Promise.all(seasons.map((s) => playerRows(s, statKeys)))).flat();
  const byId = new Map();
  for (const t of totals) {
    const e = byId.get(t.PLAYER_ID) || { PLAYER_ID: t.PLAYER_ID, PLAYER_NAME: t.PLAYER_NAME, TEAM_ID: t.TEAM_ID, TEAM_ABBREVIATION: t.TEAM_ABBREVIATION,
      SEASONS_N: 0, MIN_TOT: 0, latest: "", _w: {} , T: Object.fromEntries(SUMMABLE.map((k) => [k, 0])) };
    e.SEASONS_N += 1; e.MIN_TOT += t.MIN || 0;
    for (const k of SUMMABLE) e.T[k] += t[k] || 0;
    if (t.SEASON > e.latest) { e.latest = t.SEASON; e.PLAYER_NAME = t.PLAYER_NAME; e.TEAM_ID = t.TEAM_ID; e.TEAM_ABBREVIATION = t.TEAM_ABBREVIATION; }
    byId.set(t.PLAYER_ID, e);
  }
  // Minutes-weighted averages for advanced / BBRef / tracking stats.
  const weighted = statKeys.filter((k) => !SUMMABLE.includes(k) && !["FG_PCT", "FG3_PCT", "FT_PCT", "MIN", "TS_PCT", "EFG_PCT"].includes(k));
  for (const r of perGame) {
    const e = byId.get(r.PLAYER_ID); if (!e) continue;
    const w = (r.MIN || 0) * (r.GP || 0);
    for (const k of weighted) if (r[k] != null) {
      if (k === "WS" || k === "VORP") { e._w[k] = e._w[k] || { sum: 0, w: 1 }; e._w[k].sum += r[k]; continue; }     // add up
      e._w[k] = e._w[k] || { sum: 0, w: 0 }; e._w[k].sum += r[k] * w; e._w[k].w += w;
    }
  }
  return [...byId.values()].map((e) => {
    const T = e.T, gp = T.GP || 1;
    const row = { PLAYER_ID: e.PLAYER_ID, PLAYER_NAME: e.PLAYER_NAME, TEAM_ID: e.TEAM_ID, TEAM_ABBREVIATION: e.TEAM_ABBREVIATION,
      SEASONS_N: e.SEASONS_N, GP: T.GP, MIN: e.MIN_TOT / gp, MIN_TOTAL: e.MIN_TOT };
    for (const k of SUMMABLE) if (k !== "GP") { row[k] = T[k] / gp; row[k + "_TOTAL"] = T[k]; }
    row.FG_PCT = T.FGA ? T.FGM / T.FGA : null; row.FG3_PCT = T.FG3A ? T.FG3M / T.FG3A : null; row.FT_PCT = T.FTA ? T.FTM / T.FTA : null;
    row.TS_PCT = T.FGA + T.FTA ? T.PTS / (2 * (T.FGA + 0.44 * T.FTA)) : null;       // true shooting formula
    row.EFG_PCT = T.FGA ? (T.FGM + 0.5 * T.FG3M) / T.FGA : null;
    for (const [k, v] of Object.entries(e._w)) row[k] = v.w ? v.sum / v.w : null;
    return row;
  });
}

// Shooting-percentage leaderboards need enough makes (NBA.com's rules, scaled to the season length).
function attemptsOK(r, key, games, span) {
  const scale = games / 82, g = span ? 1 : r.GP;   // span rows already store per-game averages over many seasons
  const made = (k) => (r[k] || 0) * (span ? r.GP : g);
  if (key === "FG_PCT" || key === "TS_PCT" || key === "EFG_PCT") return made("FGM") >= 300 * scale;
  if (key === "FG3_PCT") return made("FG3M") >= 82 * scale;
  if (key === "FT_PCT") return made("FTM") >= 125 * scale;
  return true;
}

function applyFilters(rows, filters) {
  return rows.filter((r) => filters.every((f) => r[f.stat] != null && (f.op === "<=" ? r[f.stat] <= f.value : r[f.stat] >= f.value)));
}
const filterText = (filters, entity) => filters.map((f) => `${label(f.stat)} ${f.op === "<=" ? "≤" : "≥"} ${fmt(f.value, f.stat, entity)}${STATS[f.stat].fmt === "pct" ? "%" : ""}`);

// Columns for an answer table.
function playerCols(keys, highlight, extra = []) {
  const uniq = [...new Set(keys)];
  return [{ key: "PLAYER_NAME", label: "Player", left: true, html: (r) => r.PLAYER_ID ? playerLink(r) : esc(r.PLAYER_NAME) },
    { key: "TEAM_ABBREVIATION", label: "Team", left: true, html: (r) => r.TEAM_ID ? teamAbbrLink(r) : esc(r.TEAM_ABBREVIATION) },
    ...extra, ...uniq.map((key) => ({ key }))];
}
const teamCols = (keys) => [{ key: "TEAM_NAME", label: "Team", left: true, html: teamLink }, ...[...new Set(keys)].map((key) => ({ key }))];

// ---------------------------------------------------------------------------
// The answer builders, one per intent type.
// ---------------------------------------------------------------------------
async function leaders(intent) {
  const { entity, stat, order, limit, filters = [], seasons } = intent;
  const s = STATS[stat];
  const asc = order === "asc";
  const sorter = (k) => (a, b) => (asc ? a[k] - b[k] : b[k] - a[k]);
  const notes = [], tables = [];
  const sources = new Set([sourceOf(stat), ...filters.map((f) => sourceOf(f.stat))]);
  const live = META.seasons.find((x) => x.in_progress && seasons.includes(x.season));
  if (live) notes.push(`${live.season} is still in progress (teams have played up to ${live.max_team_games} game${live.max_team_games === 1 ? "" : "s"}), so these numbers will change a lot.`);
  if (intent.askedYears && intent.askedYears !== Infinity && intent.askedYears > seasons.length)
    notes.push(`You asked about ${intent.askedYears} seasons, but this site has ${seasons.length} loaded (${seasonText(seasons)}).`);

  // ---------------- TEAMS ----------------
  if (entity === "teams") {
    let rows;
    if (seasons.length === 1) rows = await load("teams", seasons[0]);
    else {                                            // several seasons: wins/losses added up, other stats averaged
      const all = await loadSeasons("teams", seasons), byId = new Map();
      for (const t of all) { const e = byId.get(t.TEAM_ID) || { TEAM_ID: t.TEAM_ID, TEAM_NAME: t.TEAM_NAME, n: 0, sums: {} }; e.n++;
        for (const [k, v] of Object.entries(t)) if (typeof v === "number") e.sums[k] = (e.sums[k] || 0) + v; if (t.SEASON === seasons[0]) e.TEAM_NAME = t.TEAM_NAME; byId.set(t.TEAM_ID, e); }
      rows = [...byId.values()].map((e) => { const r = { TEAM_ID: e.TEAM_ID, TEAM_NAME: e.TEAM_NAME };
        for (const [k, v] of Object.entries(e.sums)) r[k] = ["W", "L", "GP"].includes(k) ? v : v / e.n; r.W_PCT = r.W / (r.W + r.L); return r; });
      notes.push(`Across several seasons, wins and losses are added up and every other stat is the average of the team's season numbers.`);
    }
    rows = applyFilters(rows, filters).filter((r) => r[stat] != null).sort(sorter(stat));
    const top = rows[0];
    if (!top) return { headline: "No teams match those filters.", notes, tables, sources: [...sources] };
    const tie = rows.filter((r) => r[stat] === top[stat]).length > 1 ? " (tied)" : "";
    const headline = intent.isFilterList
      ? `${rows.length} team${rows.length === 1 ? "" : "s"} match: ${filterText(filters, "teams").join(", ")} (${seasonText(seasons)}).`
      : `The ${B(top.TEAM_NAME)}${tie} ${seasons.length > 1 ? "had" : "had"} the ${asc ? "lowest" : "highest"} ${label(stat)} — ${B(fmt(top[stat], stat, "teams") + (s.fmt === "pct" || STATS[stat].fmt === "pmpct" ? "%" : ""))} — in ${seasonText(seasons)}.`;
    const context = ["W", "L", "W_PCT", "OFF_RATING", "DEF_RATING", "NET_RATING", "PACE"];
    tables.push({ rows: rows.slice(0, intent.isFilterList ? 100 : Math.max(limit, 30)), entity: "teams", highlight: stat, sortKey: stat, sortAsc: asc,
      columns: teamCols([stat, ...filters.map((f) => f.stat), ...context]) });
    return { headline, notes, tables, sources: [...sources] };
  }

  // ---------------- PLAYERS ----------------
  const keys = [stat, ...filters.map((f) => f.stat)];
  const games = seasons.reduce((n, se) => n + seasonGames(se), 0);
  const span = seasons.length > 1;
  let rows = span ? await playerRowsSpan(seasons, keys) : await playerRows(seasons[0], keys);
  if (intent.team) rows = rows.filter((r) => r.TEAM_ID === intent.team.id);

  // Totals question (or ambiguous counting stat over many seasons): add a "totals" table.
  // Double/triple-doubles are counts, so over several seasons we only show totals.
  const countOnly = ["DD2", "TD3"].includes(stat) && span;
  const showTotals = isCounting(stat) && (intent.wantTotals || countOnly || (span && !intent.wantAverage));
  const showAverage = !countOnly && !(isCounting(stat) && intent.wantTotals && !span) && !(span && intent.wantTotals);

  let totalsTop = null;
  if (showTotals) {
    let trows;
    if (span) trows = rows.map((r) => ({ ...r, [stat + "_SUM"]: r[stat + "_TOTAL"] }));
    else trows = (await load("players_totals", seasons[0])).map((r) => ({ ...r, [stat + "_SUM"]: r[stat] }));
    trows = applyFilters(trows, filters).sort((a, b) => b[stat + "_SUM"] - a[stat + "_SUM"]);
    totalsTop = trows[0];
    tables.push({ title: `Total ${label(stat)}, ${seasonText(seasons)}`, rows: trows.slice(0, Math.max(limit, 25)), entity: "players",
      highlight: stat + "_SUM", sortKey: stat + "_SUM",
      columns: playerCols(["GP", ...(span ? ["SEASONS_N"] : [])], null, []).concat([{ key: stat + "_SUM", label: `Total ${STATS[stat].label}`, html: (r) => Math.round(r[stat + "_SUM"]).toLocaleString() }, ...(countOnly ? [] : [{ key: stat, label: STATS[stat].label + "/G" }])]) });
  }

  // Qualifying rules for per-game / rate leaderboards.
  const advancedLike = ["bbref", "tracking", "hustle"].includes(s.source) || ["TS_PCT", "EFG_PCT", "USG_PCT", "AST_PCT", "REB_PCT", "OREB_PCT", "DREB_PCT", "PIE", "OFF_RATING", "DEF_RATING", "NET_RATING", "TM_TOV_PCT", "AST_TO", "AST_RATIO", "PACE"].includes(stat);
  const minGP = intent.minGP ?? Math.ceil(games * (span ? 0.4 : QUALIFY_SHARE));
  const minMIN = intent.minMIN ?? (advancedLike ? 15 : 0);
  let qualified = rows.filter((r) => r[stat] != null && r.GP >= minGP && (r.MIN || 0) >= minMIN && attemptsOK(r, stat, games, span));
  qualified = applyFilters(qualified, filters).sort(sorter(stat));
  const rules = [`at least ${minGP} games${intent.minGP ? "" : span ? ` (40% of the ${games} possible)` : ` (${QUALIFY_SHARE * 100}% of the season, NBA.com's leaderboard rule)`}`];
  if (minMIN) rules.push(`at least ${minMIN} minutes per game`);
  if (["FG_PCT", "TS_PCT", "EFG_PCT", "FG3_PCT", "FT_PCT"].includes(stat)) rules.push("NBA.com's minimum-makes rule for shooting percentages");

  const top = qualified[0];
  const unit = s.fmt === "pct" ? "%" : "";
  let headline;
  if (intent.isFilterList) {
    headline = `${B(qualified.length)} player${qualified.length === 1 ? "" : "s"} had ${filterText(filters, "players").join(" and ")} in ${seasonText(seasons)}.`;
  } else if (showTotals && totalsTop) {
    headline = `${B(totalsTop.PLAYER_NAME)} has the most total ${label(stat)} — ${B(Math.round(totalsTop[stat + "_SUM"]).toLocaleString())} — in ${seasonText(seasons)}.`;
    if (showAverage && top) headline += ` Per game, ${B(top.PLAYER_NAME)} leads at ${B(fmt(top[stat], stat, "players"))} ${STATS[stat].label}.`;
  } else if (top) {
    const verb = span ? "had the" : "led the league with the";
    headline = `${B(top.PLAYER_NAME)} ${asc ? "had the lowest" : verb.replace("the", "the")} ${asc ? "" : "highest "}${label(stat)}${span ? " per game" : ""} — ${B(fmt(top[stat], stat, "players") + unit)} — in ${seasonText(seasons)}.`
      .replace("led the league with the highest", "led the league in").replace("had the highest", "had the highest");
  } else headline = "No players match those filters.";
  if (s.source === "bbref") notes.push(`${label(stat)} is a Basketball-Reference stat (not on NBA.com). Names were matched to NBA.com players automatically.`);
  if (!intent.isFilterList || filters.length) notes.push(`Qualified players: ${rules.join(", ")}.${intent.minGP ? "" : " Add “with at least N games” to change it."}`);
  if (span && !STATS[stat].source && !isCounting(stat) && !["FG_PCT", "FG3_PCT", "FT_PCT", "TS_PCT", "EFG_PCT"].includes(stat))
    notes.push(`Across several seasons, ${label(stat)} is the minutes-weighted average of each season's value.`);

  if (showAverage) {
    const ctx = advancedLike ? ["GP", "MIN", "PTS", "TS_PCT", "USG_PCT"] : ["GP", "MIN", "PTS", "REB", "AST"];
    tables.push({ title: showTotals ? `${label(stat)} per game (qualified players)` : null, rows: qualified.slice(0, intent.isFilterList ? 100 : limit), entity: "players",
      highlight: stat, sortKey: stat, sortAsc: asc, columns: playerCols([...(span ? ["SEASONS_N"] : []), ...ctx, stat, ...filters.map((f) => f.stat)].filter((k, i, a) => a.indexOf(k) === i)) });
  }
  return { headline, notes, tables, sources: [...sources] };
}

async function lookup(intent) {
  const { entity, item } = intent;
  const season = intent.seasons[0];
  const tables = [], notes = [];
  if (entity === "teams") {
    const all = await load("teams", season);
    const t = all.find((x) => x.TEAM_ID === item.id);
    const keys = intent.stats.length ? intent.stats : ["NET_RATING", "OFF_RATING", "DEF_RATING", "PACE"];
    const parts = keys.map((k) => `${label(k)} ${B(fmt(t[k], k, "teams") + (STATS[k].fmt === "pct" ? "%" : ""))} (#${rankOf(t[k], all.map((x) => x[k]), STATS[k].lowerBetter)} of 30)`);
    const hist = (await loadSeasons("teams", intent.seasons.length > 1 ? intent.seasons : META.seasons.map((s) => s.season))).filter((x) => x.TEAM_ID === item.id);
    tables.push({ title: "Season by season", rows: hist, entity: "teams", sortKey: "SEASON", sortAsc: false, rank: false, highlight: keys[0],
      columns: [{ key: "SEASON", label: "Season", left: true }, ...["W", "L", ...keys, "OFF_RATING", "DEF_RATING", "NET_RATING", "PACE"].filter((k, i, a) => a.indexOf(k) === i).map((key) => ({ key }))] });
    return { headline: `${B(t.TEAM_NAME)}, ${season} (${t.W}-${t.L}): ${parts.join("; ")}.`, notes: [`“#1” = best in the league.`, `<a href="#/team/${t.TEAM_ID}">Open the full team page →</a>`], tables, sources: [SRC.nba] };
  }
  // A player
  const keys = intent.stats.length ? intent.stats : ["PTS", "REB", "AST", "TS_PCT"];
  const rowsAll = (await Promise.all(META.seasons.map((s) => playerRows(s.season, keys)))).flat().filter((r) => r.PLAYER_ID === item.id);
  const inSpan = rowsAll.filter((r) => intent.seasons.includes(r.SEASON));
  const p = inSpan[0] || rowsAll[0];
  if (!p) return { headline: `I couldn't find ${esc(item.name)} in the loaded seasons.`, notes, tables, sources: [] };
  const league = (await playerRows(p.SEASON, keys)).filter((x) => x.GP >= Math.ceil(seasonGames(p.SEASON) * QUALIFY_SHARE));
  const parts = keys.map((k) => {
    const rk = league.some((x) => x.PLAYER_ID === p.PLAYER_ID) ? ` (#${rankOf(p[k], league.map((x) => x[k]), STATS[k].lowerBetter)} of ${league.length} qualified)` : "";
    return `${label(k)} ${B(fmt(p[k], k, "players") + (STATS[k].fmt === "pct" ? "%" : ""))}${rk}`;
  });
  tables.push({ title: "Season by season", rows: rowsAll, entity: "players", sortKey: "SEASON", rank: false, highlight: keys[0],
    columns: [{ key: "SEASON", label: "Season", left: true }, { key: "TEAM_ABBREVIATION", label: "Team", left: true },
      ...["GP", "MIN", ...keys, "PTS", "REB", "AST", "TS_PCT"].filter((k, i, a) => a.indexOf(k) === i).map((key) => ({ key }))] });
  if (p.SEASON !== intent.seasons[0]) notes.push(`${esc(p.PLAYER_NAME)} has no ${intent.seasons[0]} data, so this shows ${p.SEASON}.`);
  notes.push(`<a href="#/player/${p.PLAYER_ID}">Open the full player page →</a>`);
  return { headline: `${B(p.PLAYER_NAME)} (${p.TEAM_ABBREVIATION}), ${p.SEASON}: ${parts.join("; ")}.`, notes, tables, sources: [...new Set(keys.map(sourceOf))] };
}

async function compare(intent) {
  const { entity, items } = intent;
  const season = intent.seasons[0];
  const ids = items.map((i) => i.id);
  const statsWanted = intent.stats.length ? intent.stats : null;
  if (entity === "teams") {
    const rows = (await load("teams", season)).filter((t) => ids.includes(t.TEAM_ID));
    const keys = statsWanted || ["W", "L", "W_PCT", "OFF_RATING", "DEF_RATING", "NET_RATING", "PACE", "FG3A_PER100", "TS_PCT"];
    const k = statsWanted?.[0] || "NET_RATING";
    const best = [...rows].sort((a, b) => STATS[k].lowerBetter ? a[k] - b[k] : b[k] - a[k])[0];
    return { headline: `${rows.map((r) => B(r.TEAM_NAME)).join(" vs ")} (${season}): the ${B(best.TEAM_NAME)} had the better ${label(k)} (${B(fmt(best[k], k, "teams"))}).`,
      notes: [`<a href="#/compare?type=teams&ids=${ids.join(",")}">Open in the Compare page for charts →</a>`],
      tables: [{ rows, entity: "teams", rank: false, best: true, columns: teamCols(keys) }], sources: [SRC.nba] };
  }
  const keys = statsWanted || ["GP", "MIN", "PTS", "REB", "AST", "STL", "BLK", "TOV", "FG_PCT", "FG3_PCT", "TS_PCT", "USG_PCT", "NET_RATING", "BPM"];
  // Use the asked season; if someone didn't play then, step back to the newest season where ALL of them played.
  let rows = [], usedSeason = season;
  for (const s of META.seasons.map((x) => x.season).filter((x) => x <= season)) {
    rows = (await playerRows(s, [...keys, "BPM"])).filter((p) => ids.includes(p.PLAYER_ID));
    if (rows.length === ids.length) { usedSeason = s; break; }
  }
  rows.sort((a, b) => ids.indexOf(a.PLAYER_ID) - ids.indexOf(b.PLAYER_ID));     // keep the order they were typed
  {
  }
  if (rows.length < 2) return { headline: `I couldn't find a loaded season where all of those players played.`, notes: [], tables: [], sources: [SRC.nba] };
  const seasonNote = usedSeason !== season ? [`Not everyone played in ${season}, so this uses ${usedSeason}, the newest season they all played.`] : [];
  const k = statsWanted?.[0] || "PTS";
  const best = [...rows].sort((a, b) => STATS[k].lowerBetter ? a[k] - b[k] : b[k] - a[k])[0];
  return { headline: `${rows.map((r) => B(r.PLAYER_NAME)).join(" vs ")} in ${usedSeason}: ${B(best.PLAYER_NAME)} had the ${STATS[k].lowerBetter ? "better (lower)" : "higher"} ${label(k)} (${B(fmt(best[k], k, "players"))}). Green = better in each column.`,
    notes: [...seasonNote, `<a href="#/compare?type=players&ids=${ids.join(",")}">Open in the Compare page for bar + radar charts →</a>`],
    tables: [{ rows, entity: "players", rank: false, best: true, columns: playerCols(keys) }], sources: [SRC.nba, ...(keys.includes("BPM") ? [SRC.bbref] : [])] };
}

async function homeCourt(intent) {
  const { seasons, metric } = intent;
  const games = await loadSeasons("team_games", seasons);
  const names = new Map((await load("teams", seasons[0])).map((t) => [t.TEAM_ID, t.TEAM_NAME]));
  const byId = new Map();
  for (const g of games) {
    const e = byId.get(g.TEAM_ID) || { TEAM_ID: g.TEAM_ID, TEAM_NAME: names.get(g.TEAM_ID) || g.TEAM_NAME, hw: 0, hg: 0, rw: 0, rg: 0, hpm: 0, rpm: 0 };
    if (g.HOME) { e.hg++; e.hw += g.WL === "W"; e.hpm += g.PLUS_MINUS; } else { e.rg++; e.rw += g.WL === "W"; e.rpm += g.PLUS_MINUS; }
    byId.set(g.TEAM_ID, e);
  }
  let rows = [...byId.values()].map((e) => ({ TEAM_ID: e.TEAM_ID, TEAM_NAME: e.TEAM_NAME,
    HOME_REC: `${e.hw}-${e.hg - e.hw}`, ROAD_REC: `${e.rw}-${e.rg - e.rw}`,
    HOME_W_PCT: e.hw / e.hg, ROAD_W_PCT: e.rw / e.rg, HOME_EDGE: e.hw / e.hg - e.rw / e.rg,
    HOME_PM: e.hpm / e.hg, ROAD_PM: e.rpm / e.rg, PM_EDGE: e.hpm / e.hg - e.rpm / e.rg }));
  const asc = intent.order === "asc";
  rows.sort((a, b) => asc ? a[metric] - b[metric] : b[metric] - a[metric]);
  if (intent.team) rows = rows.filter((r) => r.TEAM_ID === intent.team.id).concat(rows.filter((r) => r.TEAM_ID !== intent.team.id));
  const top = rows[0];
  const leagueHome = games.filter((g) => g.HOME && g.WL === "W").length / games.filter((g) => g.HOME).length;
  const notes = [`Home-court advantage here = home win % minus road win %. League-wide, home teams won ${B((leagueHome * 100).toFixed(1) + "%")} of games in this span.`,
    `The “Margin edge” column does the same with average point margin (home minus road) — a second way to measure it.`];
  if (intent.askedYears && intent.askedYears > seasons.length) notes.unshift(`Only ${seasons.length} seasons are loaded.`);
  if (seasons.includes("2019-20")) notes.push("2019-20 includes “bubble” games at a neutral site with no fans, which shrinks home advantage.");
  if (seasons.includes("2020-21")) notes.push("2020-21 was played with few or no fans in most arenas.");
  const what = metric === "HOME_EDGE" ? "biggest home-court advantage" : metric === "HOME_W_PCT" ? "best home record" : "best road record";
  const val = metric === "HOME_EDGE" ? `${B("+" + (top.HOME_EDGE * 100).toFixed(1))} points of win % (${(top.HOME_W_PCT * 100).toFixed(1)}% at home vs ${(top.ROAD_W_PCT * 100).toFixed(1)}% on the road)`
    : `${B((top[metric] * 100).toFixed(1) + "%")} (${metric === "HOME_W_PCT" ? top.HOME_REC : top.ROAD_REC})`;
  return {
    headline: intent.team ? `${B(top.TEAM_NAME)}, ${seasonText(seasons)}: ${top.HOME_REC} at home (${(top.HOME_W_PCT * 100).toFixed(1)}%) vs ${top.ROAD_REC} on the road (${(top.ROAD_W_PCT * 100).toFixed(1)}%).`
      : `The ${B(top.TEAM_NAME)} had the ${asc ? what.replace("biggest", "smallest").replace("best", "worst") : what} ${seasons.length > 1 ? "over" : "in"} ${seasonText(seasons)}: ${val}.`,
    notes, sources: [SRC.logs],
    tables: [{ rows, entity: "teams", highlight: metric, sortKey: intent.team ? null : metric, sortAsc: asc, pageSize: 30,
      columns: [{ key: "TEAM_NAME", label: "Team", left: true, html: teamLink }, { key: "HOME_REC", label: "Home W-L" }, { key: "HOME_W_PCT" },
        { key: "ROAD_REC", label: "Road W-L" }, { key: "ROAD_W_PCT" }, { key: "HOME_EDGE" }, { key: "HOME_PM" }, { key: "ROAD_PM" }, { key: "PM_EDGE" }] }],
  };
}

async function openingDay(intent) {
  const { seasons, stat, minApps } = intent;
  const lines = await loadSeasons("opening_day", seasons);
  const dates = [...new Set(lines.map((l) => `${l.SEASON}: ${l.GAME_DATE.slice(0, 10)}`))].sort().reverse();
  const byId = new Map();
  for (const l of lines) {
    const e = byId.get(l.PLAYER_ID) || { PLAYER_ID: l.PLAYER_ID, PLAYER_NAME: l.PLAYER_NAME, TEAM_ID: l.TEAM_ID, TEAM_ABBREVIATION: l.TEAM_ABBREVIATION, APPS: 0, sum: 0, games: [] };
    e.APPS++; e.sum += l[stat] || 0; e.games.push(`${l.SEASON.slice(2)}: ${l[stat]}`);
    if (l.SEASON >= (e.latest || "")) { e.latest = l.SEASON; e.TEAM_ABBREVIATION = l.TEAM_ABBREVIATION; e.TEAM_ID = l.TEAM_ID; }
    byId.set(l.PLAYER_ID, e);
  }
  let rows = [...byId.values()].map((e) => ({ ...e, [stat]: e.sum / e.APPS, GAMES_LIST: e.games.join(" · ") }));
  if (intent.player) rows = rows.filter((r) => r.PLAYER_ID === intent.player.id);
  const qualified = rows.filter((r) => r.APPS >= minApps).sort((a, b) => b[stat] - a[stat]);
  const top = qualified[0];
  const definition = `“Opening day” = the first game date of each regular season (only the teams that played that day count). ${seasonText(seasons)}; opening dates: ${dates.map((d) => d.split(": ")[1]).join(", ")}.`;
  return {
    headline: top ? `${B(top.PLAYER_NAME)} has the highest average ${label(stat)} on opening day — ${B(top[stat].toFixed(1))} over ${top.APPS} opening-day games (minimum ${minApps} appearances).`
      : `No player has ${minApps}+ opening-day games in this span.`,
    notes: [definition, `Only ${lines.length} player-games were played on those ${seasons.length} opening days, so samples are small.`],
    sources: [SRC.logs],
    tables: [{ rows: qualified.slice(0, Math.max(intent.limit, 15)), entity: "players", highlight: stat, sortKey: stat,
      columns: [...playerCols([], null), { key: "APPS", label: "Opening-day games" }, { key: stat, label: `Avg ${STATS[stat].label}` },
        { key: "GAMES_LIST", label: `${STATS[stat].label} by season`, left: true, html: (r) => `<span class="muted">${esc(r.GAMES_LIST)}</span>` }] }],
  };
}

// ---------------------------------------------------------------------------
// Fit report for two players: usage, ball dominance, shooting profile, defense. Rules, not predictions.
// ---------------------------------------------------------------------------
const FIT_STATS = [
  ["Role & usage", ["MIN", "PTS", "USG_PCT", "AST_PCT", "TOUCHES", "TIME_OF_POSS", "AVG_SEC_PER_TOUCH", "AVG_DRIB_PER_TOUCH"]],
  ["Shooting profile", ["TS_PCT", "FG3A", "FG3_PCT", "CATCH_SHOOT_FG3A", "CATCH_SHOOT_FG3_PCT", "PULL_UP_FGA", "PULL_UP_FG3_PCT", "DRIVES"]],
  ["Defense & impact", ["DEF_RATING", "STL", "BLK", "DREB_PCT", "DBPM", "OBPM", "BPM", "NET_RATING"]],
];
async function fit(intent) {
  const [a, b] = intent.players;
  const keys = FIT_STATS.flatMap(([, k]) => k);
  // Use the newest season (in the asked span) where BOTH players played.
  let season = null, rows = [];
  for (const s of (intent.seasons.length > 1 ? intent.seasons : META.seasons.map((x) => x.season).filter((x) => x <= intent.seasons[0]))) {
    rows = await playerRows(s, keys);
    if (rows.some((r) => r.PLAYER_ID === a.id) && rows.some((r) => r.PLAYER_ID === b.id)) { season = s; break; }
  }
  if (!season) return { headline: `I couldn't find a loaded season where both ${esc(a.name)} and ${esc(b.name)} played.`, notes: [], tables: [], sources: [] };
  const A = rows.find((r) => r.PLAYER_ID === a.id), Bp = rows.find((r) => r.PLAYER_ID === b.id);
  const pool = rows.filter((r) => r.GP >= 20 && r.MIN >= 20);          // regular rotation players, for percentiles
  const pct = (r, k) => percentile(r[k], pool.map((x) => x[k]), STATS[k].lowerBetter);
  const v = (r, k) => fmt(r[k], k, "players") + (STATS[k].fmt === "pct" ? "%" : "");

  // ---- Simple rules that turn the numbers into plain-English observations ----
  const obs = [];
  const usg = (r) => (r.USG_PCT || 0) * 100;
  const combined = usg(A) + usg(Bp);
  const n1 = A.PLAYER_NAME.split(" ").slice(-1)[0], n2 = Bp.PLAYER_NAME.split(" ").slice(-1)[0];
  const highUsage = (r) => usg(r) >= 27, onBall = (r) => (r.TIME_OF_POSS || 0) >= 5 || (r.AVG_SEC_PER_TOUCH || 0) >= 4.5;
  if (highUsage(A) && highUsage(Bp)) obs.push(`<b>Both are high-usage creators.</b> Usage ${usg(A).toFixed(1)}% + ${usg(Bp).toFixed(1)}% = ${combined.toFixed(1)}% combined. The 5 players on the court share 100%, so one or both would likely need to use fewer possessions than they do now.`);
  else obs.push(`Combined usage is ${combined.toFixed(1)}% (${n1} ${usg(A).toFixed(1)}%, ${n2} ${usg(Bp).toFixed(1)}%). Five players share 100%, so about 40% is a typical share for a team's top two.`);
  if (onBall(A) && onBall(Bp)) obs.push(`<b>Both are on-ball players:</b> ${n1} holds the ball ${v(A, "TIME_OF_POSS")} min/game (${v(A, "AVG_SEC_PER_TOUCH")} sec per touch), ${n2} ${v(Bp, "TIME_OF_POSS")} min/game (${v(Bp, "AVG_SEC_PER_TOUCH")} sec per touch). That's overlap: when one has the ball, the other has to play off it.`);
  else if (onBall(A) !== onBall(Bp)) obs.push(`<b>Ball-handling roles differ:</b> ${onBall(A) ? n1 : n2} has the ball much more (${v(onBall(A) ? A : Bp, "TIME_OF_POSS")} vs ${v(onBall(A) ? Bp : A, "TIME_OF_POSS")} min/game), which usually makes roles easier to split.`);
  for (const r of [A, Bp]) {
    const n = r.PLAYER_NAME.split(" ").slice(-1)[0];
    if ((r.CATCH_SHOOT_FG3A || 0) >= 2 && (r.CATCH_SHOOT_FG3_PCT || 0) >= 0.37) obs.push(`${n} is a proven <b>catch-and-shoot threat</b> (${v(r, "CATCH_SHOOT_FG3_PCT")} on ${v(r, "CATCH_SHOOT_FG3A")} attempts a game), which helps when playing off the other.`);
    else if ((r.CATCH_SHOOT_FG3A || 0) >= 1) obs.push(`${n}'s catch-and-shoot 3s: ${v(r, "CATCH_SHOOT_FG3_PCT")} on ${v(r, "CATCH_SHOOT_FG3A")} a game${(r.CATCH_SHOOT_FG3_PCT || 0) < 0.35 ? " — below the ~36% league norm, a question mark for an off-ball role" : ""}.`);
    if ((r.AST_PCT || 0) >= 0.3) obs.push(`${n} is a primary playmaker (assisted on ${v(r, "AST_PCT")} of teammates' baskets while on the floor; ${pct(r, "AST_PCT")}th percentile).`);
  }
  const dA = pct(A, "DEF_RATING"), dB = pct(Bp, "DEF_RATING");
  obs.push(`Defense (on-court defensive rating percentile, 100 = best): ${n1} ${dA}, ${n2} ${dB}${A.DBPM != null && Bp.DBPM != null ? `; Basketball-Reference DBPM: ${n1} ${v(A, "DBPM")}, ${n2} ${v(Bp, "DBPM")}` : ""}. Team-level ratings depend a lot on teammates.`);

  const table = FIT_STATS.flatMap(([group, ks]) => [{ group }, ...ks.map((k) => ({ k }))]);
  const html = `
    <div class="table-wrap"><table class="data"><thead><tr><th class="left">Stat</th><th>${esc(A.PLAYER_NAME)} (${A.TEAM_ABBREVIATION})</th><th class="muted">pctile</th>
      <th>${esc(Bp.PLAYER_NAME)} (${Bp.TEAM_ABBREVIATION})</th><th class="muted">pctile</th></tr></thead><tbody>
      ${table.map((r) => r.group ? `<tr><td class="left" colspan="5"><b>${r.group}</b></td></tr>` :
        `<tr><td class="left">${STATS[r.k].label} <span class="muted small">${esc(STATS[r.k].name)}</span></td>
          <td>${v(A, r.k)}</td><td class="muted">${A[r.k] != null ? pct(A, r.k) : "–"}</td><td>${v(Bp, r.k)}</td><td class="muted">${Bp[r.k] != null ? pct(Bp, r.k) : "–"}</td></tr>`).join("")}
    </tbody></table></div>
    <h3 style="margin-top:16px">What the numbers say</h3><ul>${obs.map((o) => `<li>${o}</li>`).join("")}</ul>`;
  return {
    headline: `Fit report: ${B(A.PLAYER_NAME)} + ${B(Bp.PLAYER_NAME)} (${season} data). This compares how they play — it is <b>not a prediction</b>.`,
    notes: [`Percentiles compare each player to the ${pool.length} players with 20+ games and 20+ minutes per game in ${season}.`,
      `Nobody can know from stats alone whether a pairing will work (coaching, effort and the other 3 players matter). A written “verdict” would need the optional AI mode.`,
      `<a href="#/compare?type=players&ids=${A.PLAYER_ID},${Bp.PLAYER_ID}">Open both in the Compare page →</a>`],
    html, tables: [], sources: [SRC.nba, SRC.tracking, SRC.bbref],
  };
}

export async function answer(intent) {
  switch (intent.type) {
    case "leaders": return leaders(intent);
    case "lookup": return lookup(intent);
    case "compare": return compare(intent);
    case "home": return homeCourt(intent);
    case "opening": return openingDay(intent);
    case "fit": return fit(intent);
    default: return null;
  }
}
