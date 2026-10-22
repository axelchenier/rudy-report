// playtypes.js - Synergy play-type data as shown on NBA.com (pipeline/fetch_advanced.py -> data/<season>/playtypes.json).
import { unpack } from "./ui.js";

export const PLAY_TYPES = {
  Isolation: ["Isolation", "One player tries to score on his own against one defender."],
  Transition: ["Transition", "Scoring in the open court before the defense is set (fast breaks)."],
  PRBallHandler: ["Pick & roll: ball handler", "The ball handler shoots, gets fouled or turns it over coming off a screen."],
  PRRollMan: ["Pick & roll: roll man", "The screener scores after rolling or popping to the basket."],
  Postup: ["Post-up", "Scoring with his back to the basket near the block."],
  Spotup: ["Spot-up", "A catch-and-shoot or quick attack after receiving a pass while standing."],
  Handoff: ["Handoff", "Scoring right after a teammate hands him the ball."],
  Cut: ["Cut", "Scoring after cutting toward the basket without the ball."],
  OffScreen: ["Off screen", "Scoring after running off a screen away from the ball (e.g. coming around a pin-down)."],
  OffRebound: ["Putback", "Scoring right after an offensive rebound."],
  Misc: ["Misc", "Everything else (e.g. last-second heaves, plays that don't fit a type)."],
};
export const PT_ORDER = Object.keys(PLAY_TYPES);
export const FIRST_PLAYTYPE_SEASON = "2015-16";

const files = new Map();
export function playtypeRows(season) {
  if (!files.has(season)) files.set(season, fetch(`data/${season}/playtypes.json`).then((r) => {
    if (!r.ok) throw new Error("no play type file"); return r.json();
  }).then((c) => unpack(c).map((r) => ({ ...r, PLAYER_ID: r.PLAYER_ID == null ? null : Number(r.PLAYER_ID) }))));
  return files.get(season);
}

// League points per possession for each play type (all teams' offense added up).
export function leaguePPP(rows) {
  const out = {};
  for (const t of PT_ORDER) {
    const list = rows.filter((r) => r.WHO === "T" && r.SIDE === "off" && r.PLAY_TYPE === t);
    const poss = list.reduce((a, r) => a + r.POSS, 0);
    out[t] = { PPP: poss ? list.reduce((a, r) => a + r.PTS, 0) / poss : null, POSS_PCT: list.length ? list.reduce((a, r) => a + r.POSS_PCT, 0) / list.length : null };
  }
  return out;
}

// One player's (or team's) profile: combine rows for traded players (several teams).
export function profile(rows, { who, side, id }) {
  const mine = rows.filter((r) => r.WHO === who && r.SIDE === side && (who === "P" ? r.PLAYER_ID === id : r.TEAM_ID === id));
  const total = mine.reduce((a, r) => a + r.POSS, 0);
  return PT_ORDER.map((t) => {
    const list = mine.filter((r) => r.PLAY_TYPE === t);
    if (!list.length) return null;
    const sum = (k) => list.reduce((a, r) => a + (r[k] || 0), 0);
    const main = [...list].sort((a, b) => b.POSS - a.POSS)[0];
    const poss = sum("POSS"), fga = sum("FGA");
    return { PLAY_TYPE: t, POSS: poss, FREQ: total ? poss / total : null, PPP: poss ? sum("PTS") / poss : null,
      PERCENTILE: list.length === 1 ? main.PERCENTILE : null, PTS: sum("PTS"), FG_PCT: fga ? sum("FGM") / fga : null,
      EFG_PCT: list.length === 1 ? main.EFG_PCT : null, TOV_POSS_PCT: list.length === 1 ? main.TOV_POSS_PCT : null,
      SCORE_POSS_PCT: list.length === 1 ? main.SCORE_POSS_PCT : null, GP: Math.max(...list.map((r) => r.GP)) };
  }).filter(Boolean);
}
