// hubs.js - which files and columns make up the Clutch, Hustle and Tracking sections.
// Data: NBA.com/stats via nba_api (pipeline/fetch_more.py and fetch_extras.py).
import { load } from "./data.js";

// Seasons each kind of data exists for (NBA.com started tracking in 2013-14 and hustle stats in 2015-16).
export const FIRST_SEASON = { tracking: "2013-14", hustle: "2015-16", clutch: "1996-97" };
export const existsFor = (kind, season) => season >= FIRST_SEASON[kind];

export const HUBS = {
  clutch: {
    title: "Clutch", file: { players: "clutch_players", teams: "clutch_teams" },
    note: "Clutch = last 5 minutes of the 4th quarter or overtime, score within 5 points (NBA.com). Season TOTALS in those minutes.",
    groups: [["Clutch scoring", ["GP", "MIN", "PTS", "FGM", "FGA", "FG_PCT", "FG3M", "FG3A", "FG3_PCT", "FTM", "FTA", "FT_PCT", "TS_PCT"]],
      ["Clutch impact", ["W", "L", "PLUS_MINUS", "OFF_RATING", "DEF_RATING", "NET_RATING", "AST", "TOV", "REB", "STL", "BLK"]]],
    sort: "PTS",
  },
  hustle: {
    title: "Hustle", file: { players: "hustle_players", teams: "hustle_teams" },
    note: "Per game. Tracked by NBA.com since 2015-16.",
    groups: [["Defensive effort", ["DEFLECTIONS", "CONTESTED_SHOTS", "CONTESTED_SHOTS_2PT", "CONTESTED_SHOTS_3PT", "CHARGES_DRAWN"]],
      ["Doing the dirty work", ["SCREEN_ASSISTS", "SCREEN_AST_PTS", "LOOSE_BALLS_RECOVERED", "BOX_OUTS", "OFF_BOXOUTS", "DEF_BOXOUTS"]]],
    sort: "DEFLECTIONS",
  },
  tracking: {
    title: "Tracking", file: { players: ["players_tracking", "tracking_more"] },
    note: "Per game, from NBA.com's camera tracking (Second Spectrum). Players only. Available since 2013-14.",
    groups: [["Ball handling", ["TOUCHES", "TIME_OF_POSS", "AVG_SEC_PER_TOUCH", "AVG_DRIB_PER_TOUCH", "PTS_PER_TOUCH", "DRIVES", "DRIVE_PTS", "DRIVE_FG_PCT", "DRIVE_PASSES_PCT"]],
      ["Shot types", ["CATCH_SHOOT_FGA", "CATCH_SHOOT_FG_PCT", "CATCH_SHOOT_FG3A", "CATCH_SHOOT_FG3_PCT", "CATCH_SHOOT_EFG_PCT", "PULL_UP_FGA", "PULL_UP_FG_PCT", "PULL_UP_FG3A", "PULL_UP_FG3_PCT", "PULL_UP_EFG_PCT"]],
      ["Passing", ["PASSES_MADE", "PASSES_RECEIVED", "POTENTIAL_AST", "SECONDARY_AST", "AST_POINTS_CREATED", "AST_TO_PASS_PCT"]],
      ["Rebounding", ["REB_CHANCES", "REB_CHANCE_PCT", "REB_CONTEST_PCT", "OREB_CHANCES", "DREB_CHANCES"]],
      ["Rim protection", ["DEF_RIM_FGA", "DEF_RIM_FG_PCT", "D6_FGA", "D6_FG_PCT", "D6_NORMAL_FG_PCT", "D6_DIFF"]],
      ["Speed & distance", ["DIST_MILES", "DIST_MILES_OFF", "DIST_MILES_DEF", "AVG_SPEED", "AVG_SPEED_OFF", "AVG_SPEED_DEF"]]],
    sort: "TOUCHES",
  },
};

// Attempt-based percentages are meaningless with 0 attempts (NBA.com sends 0.0); blank them.
const NEEDS = { FG_PCT: "FGA", FG3_PCT: "FG3A", FT_PCT: "FTA", TS_PCT: "FGA", EFG_PCT: "FGA", DEF_RIM_FG_PCT: "DEF_RIM_FGA", D6_FG_PCT: "D6_FGA" };
function clean(r) {
  for (const [k, a] of Object.entries(NEEDS)) if (k in r && a in r && !r[a]) r[k] = null;
  return r;
}

// Rows for one hub/entity/season, joined with names and games from players.json / teams.json.
export async function hubRows(kind, entity, season) {
  const hub = HUBS[kind];
  const files = [].concat(hub.file[entity] || []);
  if (!files.length) return [];
  const base = await load(entity, season);
  const idKey = entity === "players" ? "PLAYER_ID" : "TEAM_ID";
  const byId = new Map();
  const lists = await Promise.all(files.map((f) => load(f, season).catch(() => [])));
  for (const list of lists) for (const r of list) {
    const row = byId.get(r[idKey]) || {};
    byId.set(r[idKey], Object.assign(row, r));
  }
  if (!byId.size) return [];
  const info = new Map(base.map((b) => [b[idKey], b]));
  return [...byId.values()].map((r) => {
    const b = info.get(r[idKey]) || {};
    const out = { ...r, PLAYER_NAME: r.PLAYER_NAME || b.PLAYER_NAME, TEAM_NAME: b.TEAM_NAME || r.TEAM_NAME,
      TEAM_ID: r.TEAM_ID ?? b.TEAM_ID, TEAM_ABBREVIATION: r.TEAM_ABBREVIATION || b.TEAM_ABBREVIATION,
      SEASON_GP: b.GP, SEASON_MIN: b.MIN };
    if (kind !== "clutch") { out.GP = b.GP ?? r.GP; out.MIN = b.MIN ?? r.MIN; }
    return clean(out);
  });
}

// Who counts for percentiles/leaderboards: enough games (and, for clutch, enough clutch minutes).
export function inPool(kind, r, minGP) {
  if (kind === "clutch") return (r.GP || 0) >= Math.max(5, Math.round(minGP / 4)) && (r.MIN || 0) >= 20;
  return (r.SEASON_GP ?? r.GP ?? 0) >= minGP && (r.SEASON_MIN ?? r.MIN ?? 0) >= 10;
}
