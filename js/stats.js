// stats.js - a "dictionary" of every stat the site knows about.
// For each stat code (the column name NBA.com uses) we store:
//   label  = short column header         name = full name in plain English
//   fmt    = how to display it ("pct" = a fraction shown as %, "n1" = 1 decimal, "n0" = whole number,
//            "pm" = +/- number with 1 decimal)
//   lowerBetter = true when a SMALLER number is better (turnovers, defensive rating)
//   words  = phrases people might type in a question (used by the Ask page)

export const STATS = {
  GP:   { label: "G",    name: "games played", fmt: "n0", words: ["games played", "games"] },
  W:    { label: "W",    name: "wins", fmt: "n0", words: ["wins", "win"] },
  L:    { label: "L",    name: "losses", fmt: "n0", lowerBetter: true, words: ["losses"] },
  W_PCT:{ label: "W%",   name: "win percentage", fmt: "pct", words: ["win percentage", "winning percentage", "win pct", "win %"] },
  AGE:  { label: "Age",  name: "age", fmt: "n0", words: ["age", "oldest", "youngest"] },
  MIN:  { label: "MIN",  name: "minutes", fmt: "n1", words: ["minutes per game", "minutes", "mpg"] },
  PTS:  { label: "PTS",  name: "points", fmt: "n1", words: ["points per game", "points", "ppg", "scoring", "scorer", "scorers", "pts"] },
  REB:  { label: "REB",  name: "rebounds", fmt: "n1", words: ["rebounds per game", "total rebounds", "rebounds", "rebounding", "rebounders", "boards", "rpg", "reb"] },
  OREB: { label: "OREB", name: "offensive rebounds", fmt: "n1", words: ["offensive rebounds", "offensive boards"] },
  DREB: { label: "DREB", name: "defensive rebounds", fmt: "n1", words: ["defensive rebounds", "defensive boards"] },
  AST:  { label: "AST",  name: "assists", fmt: "n1", words: ["assists per game", "assists", "apg", "dimes", "ast"] },
  STL:  { label: "STL",  name: "steals", fmt: "n1", words: ["steals", "spg"] },
  BLK:  { label: "BLK",  name: "blocks", fmt: "n1", words: ["blocks", "blocked shots", "bpg"] },
  TOV:  { label: "TOV",  name: "turnovers", fmt: "n1", lowerBetter: true, words: ["turnovers", "turnover"] },
  PF:   { label: "PF",   name: "personal fouls", fmt: "n1", lowerBetter: true, words: ["personal fouls", "fouls"] },
  FGM:  { label: "FGM",  name: "field goals made", fmt: "n1", words: ["field goals made", "made field goals"] },
  FGA:  { label: "FGA",  name: "field goal attempts", fmt: "n1", words: ["field goal attempts", "shot attempts", "shots"] },
  FG_PCT:{ label: "FG%", name: "field goal percentage", fmt: "pct", words: ["field goal percentage", "field goal %", "fg%", "fg percentage", "shooting percentage"] },
  FG3M: { label: "3PM",  name: "3-pointers made", fmt: "n1", words: ["three pointers made", "3 pointers made", "threes made", "made threes", "3pm", "threes", "3s"] },
  FG3A: { label: "3PA",  name: "3-point attempts", fmt: "n1", words: ["three point attempts", "3 point attempts", "three pointers attempted", "threes attempted", "3pa", "attempts from three"] },
  FG3_PCT:{ label: "3P%",name: "3-point percentage", fmt: "pct", words: ["three point percentage", "3 point percentage", "3pt percentage", "three point %", "3p%", "3pt%", "from three", "from 3", "three point shooters", "3 point shooters", "3pt shooters", "shooters from three", "shooters from 3", "best shooters", "shooters", "three point shooting", "3 point shooting", "3pt shooting"] },
  FTM:  { label: "FTM",  name: "free throws made", fmt: "n1", words: ["free throws made", "made free throws"] },
  FTA:  { label: "FTA",  name: "free throw attempts", fmt: "n1", words: ["free throw attempts", "free throws attempted", "fta", "free throws"] },
  FT_PCT:{ label: "FT%", name: "free throw percentage", fmt: "pct", words: ["free throw percentage", "free throw %", "ft%", "free throw shooting", "from the line"] },
  PLUS_MINUS:{ label: "+/-", name: "plus-minus", fmt: "pm", words: ["plus minus", "plus/minus", "+/-"] },
  DD2:  { label: "DD",   name: "double-doubles", fmt: "n0", words: ["double doubles", "double double"] },
  TD3:  { label: "TD",   name: "triple-doubles", fmt: "n0", words: ["triple doubles", "triple double"] },
  // ---- advanced ----
  OFF_RATING:{ label: "ORtg", name: "offensive rating", fmt: "n1", words: ["offensive rating", "ortg", "off rating", "offense"] },
  DEF_RATING:{ label: "DRtg", name: "defensive rating", fmt: "n1", lowerBetter: true, words: ["defensive rating", "drtg", "def rating", "defense"] },
  NET_RATING:{ label: "NetRtg", name: "net rating", fmt: "pm", words: ["net rating", "netrtg", "net rtg", "point differential"] },
  AST_PCT:{ label: "AST%", name: "assist percentage", fmt: "pct", words: ["assist percentage", "assist %", "ast%"] },
  AST_TO:{ label: "AST/TO", name: "assist-to-turnover ratio", fmt: "n2", words: ["assist to turnover ratio", "assist to turnover", "ast/to", "assist turnover ratio"] },
  AST_RATIO:{ label: "AST Ratio", name: "assist ratio", fmt: "n1", words: ["assist ratio"] },
  OREB_PCT:{ label: "OREB%", name: "offensive rebound percentage", fmt: "pct", words: ["offensive rebound percentage", "offensive rebounding percentage", "oreb%"] },
  DREB_PCT:{ label: "DREB%", name: "defensive rebound percentage", fmt: "pct", words: ["defensive rebound percentage", "defensive rebounding percentage", "dreb%"] },
  REB_PCT:{ label: "REB%", name: "rebound percentage", fmt: "pct", words: ["rebound percentage", "rebounding percentage", "reb%"] },
  TM_TOV_PCT:{ label: "TOV%", name: "turnover percentage", fmt: "n1", lowerBetter: true, words: ["turnover percentage", "turnover rate", "tov%"] },
  EFG_PCT:{ label: "eFG%", name: "effective field goal percentage", fmt: "pct", words: ["effective field goal percentage", "effective fg", "efg%", "efg"] },
  TS_PCT:{ label: "TS%", name: "true shooting percentage", fmt: "pct", words: ["true shooting percentage", "true shooting", "ts%", "efficient scorers", "most efficient"] },
  USG_PCT:{ label: "USG%", name: "usage rate", fmt: "pct", words: ["usage rate", "usage percentage", "usage", "usg%"] },
  PACE: { label: "Pace", name: "pace", fmt: "n1", words: ["pace", "fastest", "possessions per game"] },
  PIE:  { label: "PIE",  name: "Player Impact Estimate", fmt: "pct", words: ["player impact estimate", "pie", "impact"] },
  POSS: { label: "Poss", name: "possessions", fmt: "n0", words: ["possessions"] },
  // ---- Basketball-Reference advanced stats (source: basketball-reference.com) ----
  BPM:  { label: "BPM",  name: "Box Plus/Minus", fmt: "pm", source: "bbref", words: ["box plus minus", "box plus/minus", "box score plus minus", "bpm"] },
  OBPM: { label: "OBPM", name: "Offensive Box Plus/Minus", fmt: "pm", source: "bbref", words: ["offensive box plus minus", "obpm"] },
  DBPM: { label: "DBPM", name: "Defensive Box Plus/Minus", fmt: "pm", source: "bbref", words: ["defensive box plus minus", "dbpm"] },
  PER:  { label: "PER",  name: "Player Efficiency Rating", fmt: "n1", source: "bbref", words: ["player efficiency rating", "efficiency rating"] },
  WS:   { label: "WS",   name: "Win Shares", fmt: "n1", source: "bbref", words: ["win shares", "winshares"] },
  WS_48:{ label: "WS/48", name: "Win Shares per 48 minutes", fmt: "n3", source: "bbref", words: ["win shares per 48", "ws/48", "ws per 48"] },
  VORP: { label: "VORP", name: "Value Over Replacement Player", fmt: "n1", source: "bbref", words: ["value over replacement", "vorp"] },
  MP:   { label: "MP",   name: "minutes played (season total)", fmt: "n0", source: "bbref", words: [] },
  // ---- NBA.com player tracking (Second Spectrum) ----
  TOUCHES:{ label: "Touches", name: "touches per game", fmt: "n1", source: "tracking", words: ["touches"] },
  TIME_OF_POSS:{ label: "Time of Poss", name: "time of possession (min/game)", fmt: "n1", source: "tracking", words: ["time of possession"] },
  AVG_SEC_PER_TOUCH:{ label: "Sec/Touch", name: "seconds per touch", fmt: "n2", source: "tracking", words: ["seconds per touch"] },
  AVG_DRIB_PER_TOUCH:{ label: "Drib/Touch", name: "dribbles per touch", fmt: "n2", source: "tracking", words: ["dribbles per touch"] },
  CATCH_SHOOT_FGA:{ label: "C&S FGA", name: "catch-and-shoot shot attempts per game", fmt: "n1", source: "tracking", words: ["catch and shoot attempts"] },
  CATCH_SHOOT_FG3A:{ label: "C&S 3PA", name: "catch-and-shoot 3-point attempts per game", fmt: "n1", source: "tracking", words: [] },
  CATCH_SHOOT_FG3_PCT:{ label: "C&S 3P%", name: "catch-and-shoot 3-point %", fmt: "pct", source: "tracking", words: ["catch and shoot three point percentage", "catch and shoot 3p%", "catch and shoot"] },
  CATCH_SHOOT_EFG_PCT:{ label: "C&S eFG%", name: "catch-and-shoot eFG%", fmt: "pct", source: "tracking", words: [] },
  PULL_UP_FGA:{ label: "Pull-up FGA", name: "pull-up shot attempts per game", fmt: "n1", source: "tracking", words: ["pull up attempts"] },
  PULL_UP_FG3A:{ label: "Pull-up 3PA", name: "pull-up 3-point attempts per game", fmt: "n1", source: "tracking", words: [] },
  PULL_UP_FG3_PCT:{ label: "Pull-up 3P%", name: "pull-up 3-point %", fmt: "pct", source: "tracking", words: ["pull up three point percentage", "pull up 3p%", "pull up"] },
  PULL_UP_EFG_PCT:{ label: "Pull-up eFG%", name: "pull-up eFG%", fmt: "pct", source: "tracking", words: [] },
  DRIVES:{ label: "Drives", name: "drives per game", fmt: "n1", source: "tracking", words: ["drives"] },
  // ---- home/away and opening-day answers (calculated from NBA.com game logs) ----
  HOME_W_PCT:{ label: "Home W%", name: "home win %", fmt: "pct", words: [] },
  ROAD_W_PCT:{ label: "Road W%", name: "road win %", fmt: "pct", words: [] },
  HOME_EDGE:{ label: "Home edge", name: "home win % minus road win %", fmt: "pmpct", words: [] },
  HOME_PM:{ label: "Home +/-", name: "average point margin at home", fmt: "pm", words: [] },
  ROAD_PM:{ label: "Road +/-", name: "average point margin on the road", fmt: "pm", words: [] },
  PM_EDGE:{ label: "Margin edge", name: "home margin minus road margin", fmt: "pm", words: [] },
  APPS:{ label: "Apps", name: "appearances", fmt: "n0", words: [] },
  SEASONS_N:{ label: "Seasons", name: "seasons", fmt: "n0", words: [] },
  // ---- team-only extras ----
  FG3A_PER100:{ label: "3PA/100", name: "3-point attempts per 100 possessions", fmt: "n1",
    words: ["threes per 100 possessions", "threes per 100", "3pa per 100 possessions", "3pa per 100", "3 point attempts per 100",
            "three point attempts per 100", "three pointers per 100", "3s per 100", "threes per 100 poss"] },
  FG3M_PER100:{ label: "3PM/100", name: "3-pointers made per 100 possessions", fmt: "n1", words: ["threes made per 100", "3pm per 100"] },
  PTS_PER100:{ label: "PTS/100", name: "points per 100 possessions", fmt: "n1", words: ["points per 100 possessions", "points per 100"] },
  FG3A_RATE:{ label: "3PA Rate", name: "3-point attempt rate (3PA ÷ FGA)", fmt: "pct", words: ["three point rate", "3 point rate", "3pa rate", "three point attempt rate", "3 point attempt rate"] },
};

// Team turnover % comes from NBA.com as a fraction (0.138) while player TOV% is already a % (13.8).
export function fmtFor(key, entity) {
  if (key === "TM_TOV_PCT" && entity === "teams") return "pct";
  return STATS[key]?.fmt || "n1";
}

// Turn a raw number into display text.
export function fmt(value, key, entity) {
  if (value === null || value === undefined || Number.isNaN(value)) return "–";
  switch (fmtFor(key, entity)) {
    case "pct": return (value * 100).toFixed(1);
    case "n0": return Math.round(value).toLocaleString();
    case "n2": return Number(value).toFixed(2);
    case "n3": return Number(value).toFixed(3);
    case "pmpct": return (value > 0 ? "+" : "") + (value * 100).toFixed(1);
    case "pm": return (value > 0 ? "+" : "") + Number(value).toFixed(1);
    default: return Number(value).toFixed(1);
  }
}

// Which columns each table tab shows (in order).
export const COLUMNS = {
  playersBasic: ["GP", "MIN", "PTS", "REB", "OREB", "DREB", "AST", "STL", "BLK", "TOV", "PF",
                 "FGM", "FGA", "FG_PCT", "FG3M", "FG3A", "FG3_PCT", "FTM", "FTA", "FT_PCT", "PLUS_MINUS"],
  playersTotals: ["GP", "MIN", "PTS", "REB", "OREB", "DREB", "AST", "STL", "BLK", "TOV", "PF",
                  "FGM", "FGA", "FG_PCT", "FG3M", "FG3A", "FG3_PCT", "FTM", "FTA", "FT_PCT", "PLUS_MINUS", "DD2", "TD3"],
  playersAdvanced: ["GP", "MIN", "TS_PCT", "EFG_PCT", "USG_PCT", "OFF_RATING", "DEF_RATING", "NET_RATING",
                    "AST_PCT", "AST_TO", "AST_RATIO", "OREB_PCT", "DREB_PCT", "REB_PCT", "TM_TOV_PCT", "PACE", "PIE", "POSS"],
  teamsBasic: ["GP", "W", "L", "W_PCT", "PTS", "REB", "OREB", "DREB", "AST", "STL", "BLK", "TOV", "PF",
               "FGM", "FGA", "FG_PCT", "FG3M", "FG3A", "FG3_PCT", "FTM", "FTA", "FT_PCT", "PLUS_MINUS"],
  teamsAdvanced: ["GP", "W", "L", "W_PCT", "OFF_RATING", "DEF_RATING", "NET_RATING", "PACE", "TS_PCT", "EFG_PCT",
                  "FG3A_PER100", "FG3A_RATE", "AST_PCT", "AST_TO", "OREB_PCT", "DREB_PCT", "REB_PCT", "TM_TOV_PCT", "PIE"],
};

// Stats that make sense on a radar chart / in comparisons.
export const COMPARE_STATS = {
  players: ["PTS", "REB", "AST", "STL", "BLK", "TOV", "FG_PCT", "FG3_PCT", "FT_PCT", "TS_PCT", "USG_PCT", "NET_RATING", "PIE", "MIN", "GP"],
  teams: ["W_PCT", "PTS", "REB", "AST", "TOV", "FG3A_PER100", "FG3_PCT", "TS_PCT", "OFF_RATING", "DEF_RATING", "NET_RATING", "PACE"],
};
export const RADAR_STATS = {
  players: ["PTS", "REB", "AST", "STL", "BLK", "TS_PCT", "USG_PCT", "FG3_PCT"],
  teams: ["OFF_RATING", "DEF_RATING", "PACE", "FG3A_PER100", "TS_PCT", "REB_PCT", "AST_PCT"],
};
