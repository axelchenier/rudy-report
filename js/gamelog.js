// gamelog.js - game-by-game data for player and team pages: loading, Game Score, rolling averages and splits.
// The files are made by pipeline/fetch_more.py (from NBA.com's LeagueGameLog).
import { unpack } from "./ui.js";

const files = new Map();
function getCompact(path) {
  if (!files.has(path)) files.set(path, fetch(path).then((r) => {
    if (!r.ok) throw new Error(`No game log file for this season yet (${r.status})`);
    return r.json();
  }).then(unpack));
  return files.get(path);
}

// Player logs are split into 40 files by PLAYER_ID % 40, so we only download ~1/40 of the season.
export async function playerLog(season, id) {
  const rows = await getCompact(`data/${season}/gamelogs/p_${String(id % 40).padStart(2, "0")}.json`);
  return rows.filter((r) => r.PLAYER_ID === id).map(addGameStats).sort((a, b) => a.GAME_DATE.localeCompare(b.GAME_DATE));
}
export async function teamLog(season, id) {
  const rows = await getCompact(`data/${season}/team_gamelogs.json`);
  return rows.filter((r) => r.TEAM_ID === id).map(addTeamGameStats).sort((a, b) => a.GAME_DATE.localeCompare(b.GAME_DATE));
}
export const allTeamLogs = (season) => getCompact(`data/${season}/team_gamelogs.json`);

// John Hollinger's Game Score.
export const gameScore = (g) => g.PTS + 0.4 * g.FGM - 0.7 * g.FGA - 0.4 * (g.FTA - g.FTM) + 0.7 * g.OREB + 0.3 * g.DREB
  + g.STL + 0.7 * g.AST + 0.7 * g.BLK - 0.4 * g.PF - g.TOV;

function addGameStats(g) {
  return { ...g, GAME_SCORE: gameScore(g), WIN: g.WL === "W" ? 1 : 0 };
}
// Possessions estimate (averaged between both teams), then per-game ratings.
function addTeamGameStats(g) {
  const own = g.FGA + 0.44 * g.FTA - g.OREB + g.TOV;
  const opp = g.OPP_FGA + 0.44 * g.OPP_FTA - g.OPP_OREB + g.OPP_TOV;
  const poss = (own + opp) / 2;
  return { ...g, WIN: g.WL === "W" ? 1 : 0, MARGIN: g.PTS - g.OPP_PTS, POSS_EST: poss,
    OFF_RATING: 100 * g.PTS / poss, DEF_RATING: 100 * g.OPP_PTS / poss, NET_RATING: 100 * (g.PTS - g.OPP_PTS) / poss };
}

// Rolling average of the last n games (null until n games exist).
export function rolling(values, n) {
  return values.map((_, i) => i + 1 < n ? null : values.slice(i + 1 - n, i + 1).reduce((a, b) => a + b, 0) / n);
}

// Days of rest before each game (0 = second night of a back-to-back).
export function addRest(games) {
  games.forEach((g, i) => {
    if (i === 0) { g.REST = null; return; }
    const days = (new Date(g.GAME_DATE) - new Date(games[i - 1].GAME_DATE)) / 86400000 - 1;
    g.REST = days;
  });
  return games;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Totals for a group of games -> averages and shooting percentages (from summed makes and attempts).
export function summarize(games, isTeam) {
  const sum = (k) => games.reduce((a, g) => a + (g[k] || 0), 0);
  const n = games.length;
  const fga = sum("FGA"), fta = sum("FTA"), pts = sum("PTS");
  const out = { GP: n, W: sum("WIN"), L: n - sum("WIN"),
    MIN: sum("MIN") / n, PTS: pts / n, REB: sum("REB") / n, AST: sum("AST") / n, STL: sum("STL") / n, BLK: sum("BLK") / n,
    TOV: sum("TOV") / n, FG3M: sum("FG3M") / n,
    FG_PCT: fga ? sum("FGM") / fga : null, FG3_PCT: sum("FG3A") ? sum("FG3M") / sum("FG3A") : null,
    FT_PCT: fta ? sum("FTM") / fta : null, TS_PCT: fga + fta ? pts / (2 * (fga + 0.44 * fta)) : null,
    PLUS_MINUS: sum("PLUS_MINUS") / n };
  if (isTeam) {
    const poss = sum("POSS_EST");
    Object.assign(out, { OPP_PTS: sum("OPP_PTS") / n, OFF_RATING: 100 * pts / poss, DEF_RATING: 100 * sum("OPP_PTS") / poss,
      NET_RATING: 100 * (pts - sum("OPP_PTS")) / poss });
  } else out.GAME_SCORE = sum("GAME_SCORE") / n;
  return out;
}

// The split groups shown under a game log.
export function splits(games, isTeam) {
  addRest(games);
  const groups = [
    ["Location", [["Home", (g) => g.HOME === 1], ["Road", (g) => g.HOME === 0]]],
    ["Result", [["Wins", (g) => g.WL === "W"], ["Losses", (g) => g.WL === "L"]]],
    ["Rest", [["0 days (back-to-back)", (g) => g.REST === 0], ["1 day", (g) => g.REST === 1], ["2+ days", (g) => g.REST >= 2]]],
    ["Month", [...new Set(games.map((g) => g.GAME_DATE.slice(0, 7)))].map((m) =>
      [`${MONTHS[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`, (g) => g.GAME_DATE.startsWith(m)])],
    ["Opponent", [...new Set(games.map((g) => g.OPP))].sort().map((o) => [`vs ${o}`, (g) => g.OPP === o])],
  ];
  return groups.map(([name, parts]) => ({ name, rows: parts.map(([label, test]) => {
    const gs = games.filter(test);
    return gs.length ? { SPLIT: label, ...summarize(gs, isTeam) } : null;
  }).filter(Boolean) }));
}
