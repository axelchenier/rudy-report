// cstats.js - the College stat dictionary (NCAA men's D-I), same shape as js/stats.js.
// Stats that exist in both (PTS, REB, FG_PCT, BPM, ...) reuse the NBA entry for display.
// College-only stats are added to the shared STATS table (with no NBA question words, so the NBA
// Ask parser never picks them) and keep their own question words in CSTAT_WORDS for the college Ask.
import { STATS } from "../stats.js";

const T = "torvik";    // source tag: Bart Torvik T-Rank (barttorvik.com)
export const CSTATS = {
  OBPM:    { label: "OBPM", name: "offensive Box Plus/Minus (Torvik's college version)", fmt: "pm", source: T },
  DBPM:    { label: "DBPM", name: "defensive Box Plus/Minus (Torvik's college version)", fmt: "pm", source: T },
  TRANK:   { label: "T-Rank", name: "T-Rank (Torvik's overall team ranking)", fmt: "n0", lowerBetter: true, source: T },
  ADJOE:   { label: "AdjO", name: "adjusted offensive efficiency (points per 100 possessions vs an average D-I defense)", fmt: "n1", source: T },
  ADJDE:   { label: "AdjD", name: "adjusted defensive efficiency (points allowed per 100 possessions vs an average D-I offense)", fmt: "n1", lowerBetter: true, source: T },
  ADJEM:   { label: "AdjEM", name: "adjusted efficiency margin (AdjO − AdjD)", fmt: "pm", source: T },
  BARTHAG: { label: "Barthag", name: "Barthag (chance to beat an average D-I team on a neutral court)", fmt: "n3", source: T },
  ADJT:    { label: "Tempo", name: "adjusted tempo (possessions per 40 minutes)", fmt: "n1", source: T },
  SOS:     { label: "SOS", name: "strength of schedule (Barthag of the average opponent)", fmt: "n3", source: T },
  NCSOS:   { label: "NC SOS", name: "non-conference strength of schedule", fmt: "n3", source: T },
  WAB:     { label: "WAB", name: "wins above bubble (wins compared with a typical bubble team's schedule)", fmt: "pm", source: T },
  PROJ_W:  { label: "Proj W", name: "Torvik projected wins", fmt: "n1", source: T },
  EFG:     { label: "eFG%", name: "effective field goal %", fmt: "pct", source: T },
  EFG_D:   { label: "Opp eFG%", name: "opponent effective field goal %", fmt: "pct", lowerBetter: true, source: T },
  FTR:     { label: "FTR", name: "free throw rate (FTA ÷ FGA)", fmt: "pct", source: T },
  FTR_D:   { label: "Opp FTR", name: "opponent free throw rate", fmt: "pct", lowerBetter: true, source: T },
  ORB:     { label: "OREB%", name: "offensive rebound %", fmt: "pct", source: T },
  ORB_D:   { label: "Opp OREB%", name: "opponent offensive rebound % (lower = better defensive rebounding)", fmt: "pct", lowerBetter: true, source: T },
  TOVR:    { label: "TOV%", name: "turnover % (turnovers per 100 possessions)", fmt: "pct", lowerBetter: true, source: T },
  TOVR_D:  { label: "Opp TOV%", name: "opponent turnover % (turnovers forced)", fmt: "pct", source: T },
  FG3_PCT_D:{ label: "Opp 3P%", name: "opponent 3-point %", fmt: "pct", lowerBetter: true, source: T },
  FG2_PCT: { label: "2P%", name: "2-point %", fmt: "pct", source: T },
  FG2_PCT_D:{ label: "Opp 2P%", name: "opponent 2-point %", fmt: "pct", lowerBetter: true, source: T },
  FG3_RATE:{ label: "3PA Rate", name: "3-point attempt rate (3PA ÷ FGA)", fmt: "pct", source: T },
  FG3_RATE_D:{ label: "Opp 3PA Rate", name: "opponent 3-point attempt rate", fmt: "pct", source: T },
  ARATE:   { label: "Ast Rate", name: "assist rate (assisted share of made field goals)", fmt: "pct", source: T },
  ARATE_D: { label: "Opp Ast Rate", name: "opponent assist rate", fmt: "pct", lowerBetter: true, source: T },
  OPP_PTS: { label: "Opp PTS", name: "opponent points per game", fmt: "n1", lowerBetter: true, source: "espn" },
  MARGIN:  { label: "Margin", name: "average scoring margin", fmt: "pm", source: "espn" },
  HOME_REC:{ label: "Home", name: "home record", fmt: "str" },
  AWAY_REC:{ label: "Away", name: "away/neutral record", fmt: "str" },
  // ---- players ----
  MIN_PCT: { label: "Min%", name: "share of team minutes played", fmt: "pct", source: T },
  GS:      { label: "GS", name: "games started", fmt: "n0", source: "espn" },
  FG2M:    { label: "2PM", name: "2-pointers made", fmt: "n1" },
  FG2A:    { label: "2PA", name: "2-point attempts", fmt: "n1" },
  ORTG:    { label: "ORtg", name: "individual offensive rating (points produced per 100 possessions used)", fmt: "n1", source: T },
  DRTG:    { label: "DRtg", name: "individual defensive rating", fmt: "n1", lowerBetter: true, source: T },
  USG:     { label: "USG%", name: "usage rate", fmt: "pct", source: T },
  TS:      { label: "TS%", name: "true shooting %", fmt: "pct", source: T },
  ORB_PCT: { label: "OREB%", name: "offensive rebound %", fmt: "pct", source: T },
  DRB_PCT: { label: "DREB%", name: "defensive rebound %", fmt: "pct", source: T },
  TOV_PCT: { label: "TOV%", name: "turnover %", fmt: "pct", lowerBetter: true, source: T },
  BLK_PCT: { label: "BLK%", name: "block %", fmt: "pct", source: T },
  STL_PCT: { label: "STL%", name: "steal %", fmt: "pct", source: T },
  AST_TOV: { label: "AST/TO", name: "assist-to-turnover ratio", fmt: "n2", source: T },
  PORPAG:  { label: "PRPG!", name: "points over replacement per adjusted game (Torvik)", fmt: "n1", source: T },
  DPORPAG: { label: "D-PRPG", name: "defensive points over replacement per game (Torvik)", fmt: "n1", source: T },
  FG3A_100:{ label: "3PA/100", name: "3-point attempts per 100 possessions", fmt: "n1", source: T },
  RIM_PCT: { label: "Rim FG%", name: "field goal % at the rim", fmt: "pct", source: T },
  MID_PCT: { label: "Mid FG%", name: "mid-range field goal %", fmt: "pct", source: T },
  DUNKS:   { label: "Dunks", name: "dunks made (season)", fmt: "n0", source: T },
  HT_IN:   { label: "Ht (in)", name: "height in inches", fmt: "n0" },
  NBA_PICK:{ label: "NBA pick", name: "NBA draft pick (if drafted)", fmt: "n0", lowerBetter: true },
};
for (const [k, v] of Object.entries(CSTATS)) if (!STATS[k]) STATS[k] = { ...v, words: [] };
// fmt "str" -> show as-is
export const cstat = (k) => STATS[k] || CSTATS[k];

// Words people type, for the college Ask bar (checked longest first).
export const CSTAT_WORDS = {
  ADJEM: ["adjusted efficiency margin", "efficiency margin", "adjusted efficiency", "adj em", "adjem", "net efficiency", "net rating", "kenpom rating", "rating"],
  ADJOE: ["adjusted offensive efficiency", "adjusted offense", "offensive efficiency", "adj o", "adjo", "best offense", "offense", "offensive rating"],
  ADJDE: ["adjusted defensive efficiency", "adjusted defense", "defensive efficiency", "adj d", "adjd", "best defense", "defense", "defensive rating"],
  TRANK: ["t-rank", "t rank", "trank", "ranking", "rankings", "ranked", "best team", "best teams", "top teams", "power rankings"],
  BARTHAG: ["barthag", "power rating"],
  ADJT: ["tempo", "pace", "fastest", "slowest", "possessions per game"],
  SOS: ["strength of schedule", "toughest schedule", "hardest schedule", "sos"],
  WAB: ["wins above bubble", "wab", "bubble"],
  EFG: ["effective field goal", "efg"],
  TOVR_D: ["forced turnovers", "turnovers forced", "force turnovers", "force the most turnovers"],
  ORB: ["offensive rebounding", "offensive rebound percentage", "offensive boards"],
  FG3_RATE: ["three point rate", "3 point rate", "3pa rate", "shoot the most threes", "most threes", "take the most threes"],
  MARGIN: ["scoring margin", "point differential", "margin"],
  OPP_PTS: ["points allowed", "fewest points allowed"],
  BPM: ["box plus minus", "box plus/minus", "bpm"],
  OBPM: ["offensive box plus minus", "obpm"], DBPM: ["defensive box plus minus", "dbpm"],
  PORPAG: ["prpg", "points over replacement", "porpag"],
  ORTG: ["individual offensive rating", "ortg"], DRTG: ["drtg"],
  USG: ["usage rate", "usage"], TS: ["true shooting", "ts%", "efficient scorers", "most efficient"],
  PTS: ["points per game", "points", "ppg", "scorers", "scorer", "scoring"],
  REB: ["rebounds per game", "rebounds", "rebounders", "rebounding", "boards", "rpg"],
  AST: ["assists per game", "assists", "apg", "passers", "dimes"],
  STL: ["steals", "spg"], BLK: ["blocks", "shot blockers", "bpg"],
  BLK_PCT: ["block rate", "block percentage", "blk%"], STL_PCT: ["steal rate", "steal percentage", "stl%"],
  AST_PCT: ["assist rate", "assist percentage", "ast%"],
  FG3_PCT: ["three point percentage", "3 point percentage", "3pt percentage", "3p%", "three point shooters", "3 point shooters", "shooters from three", "best shooters", "from three"],
  FG3M: ["threes made", "3 pointers made", "made threes", "3pm"],
  FT_PCT: ["free throw percentage", "ft%", "free throw shooters", "from the line"],
  FG_PCT: ["field goal percentage", "fg%"],
  DUNKS: ["dunks"], TOV: ["turnovers"], MIN: ["minutes"],
  W_PCT: ["win percentage", "winning percentage"], W: ["wins", "most wins"],
};
// Stats that only make sense for teams (a question about them is a team question).
export const CTEAM_ONLY = new Set(["ADJEM", "ADJOE", "ADJDE", "TRANK", "BARTHAG", "ADJT", "SOS", "WAB", "EFG", "TOVR_D", "ORB", "FG3_RATE", "MARGIN", "OPP_PTS", "W_PCT", "W"]);

export const CCOLUMNS = {
  teamsRatings: ["TRANK", "CONF", "REC", "ADJEM", "ADJOE", "ADJDE", "BARTHAG", "ADJT", "SOS", "NCSOS", "WAB", "CONF_REC"],
  teamsFour: ["EFG", "EFG_D", "TOVR", "TOVR_D", "ORB", "ORB_D", "FTR", "FTR_D", "FG3_PCT", "FG3_PCT_D", "FG2_PCT", "FG2_PCT_D", "FT_PCT", "FG3_RATE", "FG3_RATE_D", "ARATE", "ARATE_D"],
  teamsBasic: ["GP", "W", "L", "W_PCT", "PTS", "OPP_PTS", "MARGIN", "HOME_REC", "AWAY_REC", "CONF_REC"],
  playersBasic: ["GP", "GS", "MIN", "PTS", "REB", "OREB", "DREB", "AST", "STL", "BLK", "TOV", "PF", "FGM", "FGA", "FG_PCT", "FG3M", "FG3A", "FG3_PCT", "FTM", "FTA", "FT_PCT"],
  playersAdvanced: ["GP", "MIN_PCT", "ORTG", "DRTG", "USG", "EFG", "TS", "ORB_PCT", "DRB_PCT", "AST_PCT", "TOV_PCT", "STL_PCT", "BLK_PCT", "FTR", "AST_TOV", "PORPAG", "BPM", "OBPM", "DBPM"],
  playersShooting: ["GP", "FG2M", "FG2A", "FG2_PCT", "FG3M", "FG3A", "FG3_PCT", "FG3A_100", "FTM", "FTA", "FT_PCT", "FTR", "RIM_PCT", "MID_PCT", "DUNKS", "EFG", "TS"],
};
export const CCOMPARE = {
  players: ["PTS", "REB", "AST", "STL", "BLK", "TOV", "FG_PCT", "FG3_PCT", "FT_PCT", "TS", "USG", "ORTG", "DRTG", "BPM", "OBPM", "DBPM", "PORPAG", "MIN", "GP"],
  teams: ["TRANK", "W_PCT", "ADJEM", "ADJOE", "ADJDE", "BARTHAG", "ADJT", "SOS", "WAB", "EFG", "EFG_D", "TOVR", "TOVR_D", "ORB", "ORB_D", "FTR", "FG3_PCT", "FG3_RATE"],
};
export const CRADAR = {
  players: ["PTS", "REB", "AST", "STL_PCT", "BLK_PCT", "TS", "USG", "BPM"],
  teams: ["ADJOE", "ADJDE", "ADJT", "EFG", "TOVR_D", "ORB", "SOS"],
};
