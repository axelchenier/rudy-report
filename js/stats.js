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
  // ---- NBA.com player tracking (Second Spectrum) ----
  TOUCHES:{ label: "Touches", name: "touches per game", fmt: "n1", source: "tracking", words: ["touches"] },
  TIME_OF_POSS:{ label: "Time of Poss", name: "time of possession (min/game)", fmt: "n1", source: "tracking", style: true, words: ["time of possession"] },
  AVG_SEC_PER_TOUCH:{ label: "Sec/Touch", name: "seconds per touch", fmt: "n2", source: "tracking", style: true, words: ["seconds per touch"] },
  AVG_DRIB_PER_TOUCH:{ label: "Drib/Touch", name: "dribbles per touch", fmt: "n2", source: "tracking", style: true, words: ["dribbles per touch"] },
  CATCH_SHOOT_FGA:{ label: "C&S FGA", name: "catch-and-shoot shot attempts per game", fmt: "n1", source: "tracking", style: true, words: ["catch and shoot attempts"] },
  CATCH_SHOOT_FG3A:{ label: "C&S 3PA", name: "catch-and-shoot 3-point attempts per game", fmt: "n1", source: "tracking", style: true, words: [] },
  CATCH_SHOOT_FG3_PCT:{ label: "C&S 3P%", name: "catch-and-shoot 3-point %", fmt: "pct", source: "tracking", words: ["catch and shoot three point percentage", "catch and shoot 3p%", "catch and shoot"] },
  CATCH_SHOOT_EFG_PCT:{ label: "C&S eFG%", name: "catch-and-shoot eFG%", fmt: "pct", source: "tracking", words: [] },
  PULL_UP_FGA:{ label: "Pull-up FGA", name: "pull-up shot attempts per game", fmt: "n1", source: "tracking", style: true, words: ["pull up attempts"] },
  PULL_UP_FG3A:{ label: "Pull-up 3PA", name: "pull-up 3-point attempts per game", fmt: "n1", source: "tracking", style: true, words: [] },
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
  // ---- more tracking columns already in players_tracking.json ----
  PTS_PER_TOUCH:{ label: "PTS/Touch", name: "points per touch", fmt: "n2", source: "tracking", words: [] },
  CATCH_SHOOT_FG_PCT:{ label: "C&S FG%", name: "catch-and-shoot FG%", fmt: "pct", source: "tracking", words: [] },
  PULL_UP_FG_PCT:{ label: "Pull-up FG%", name: "pull-up FG%", fmt: "pct", source: "tracking", words: [] },
  DRIVE_PTS:{ label: "Drive PTS", name: "points per game on drives", fmt: "n1", source: "tracking", words: [] },
  DRIVE_FG_PCT:{ label: "Drive FG%", name: "FG% on drives", fmt: "pct", source: "tracking", words: [] },
  DRIVE_PASSES_PCT:{ label: "Drive Pass%", name: "share of drives that end in a pass", fmt: "pct", source: "tracking", style: true, words: [] },
  // ---- passing / rebounding / rim defense / speed tracking (tracking_more.json) ----
  PASSES_MADE:{ label: "Passes", name: "passes made per game", fmt: "n1", source: "tracking", words: ["passes made", "most passes"] },
  PASSES_RECEIVED:{ label: "Passes Rec", name: "passes received per game", fmt: "n1", source: "tracking", style: true, words: [] },
  SECONDARY_AST:{ label: "2nd AST", name: "secondary (hockey) assists per game", fmt: "n1", source: "tracking", words: ["secondary assists", "hockey assists"] },
  POTENTIAL_AST:{ label: "Pot. AST", name: "potential assists per game", fmt: "n1", source: "tracking", words: ["potential assists"] },
  AST_POINTS_CREATED:{ label: "AST PTS", name: "points created by assists per game", fmt: "n1", source: "tracking", words: ["assist points created", "points created by assists"] },
  AST_TO_PASS_PCT:{ label: "AST/Pass", name: "share of passes that become assists", fmt: "pct", source: "tracking", words: [] },
  REB_CHANCES:{ label: "Reb Chances", name: "rebound chances per game", fmt: "n1", source: "tracking", style: true, words: ["rebound chances"] },
  REB_CHANCE_PCT:{ label: "Reb Chance%", name: "rebounds grabbed per rebound chance", fmt: "pct", source: "tracking", words: [] },
  REB_CONTEST_PCT:{ label: "Contested Reb%", name: "share of rebounds that were contested", fmt: "pct", source: "tracking", style: true, words: [] },
  OREB_CHANCES:{ label: "OReb Ch.", name: "offensive rebound chances per game", fmt: "n1", source: "tracking", style: true, words: [] },
  DREB_CHANCES:{ label: "DReb Ch.", name: "defensive rebound chances per game", fmt: "n1", source: "tracking", style: true, words: [] },
  DEF_RIM_FGM:{ label: "Rim FGM", name: "opponent makes at the rim while defending", fmt: "n1", source: "tracking", lowerBetter: true, words: [] },
  DEF_RIM_FGA:{ label: "Rim FGA", name: "opponent shots at the rim defended per game", fmt: "n1", source: "tracking", style: true, words: [] },
  DEF_RIM_FG_PCT:{ label: "Rim DFG%", name: "opponent FG% at the rim when he defends", fmt: "pct", source: "tracking", lowerBetter: true, words: ["rim protection", "rim protectors", "opponent fg at the rim", "defending the rim"] },
  D6_FGA:{ label: "<6ft DFGA", name: "shots within 6 feet defended per game", fmt: "n1", source: "tracking", style: true, words: [] },
  D6_FG_PCT:{ label: "<6ft DFG%", name: "opponent FG% within 6 feet when he is the closest defender", fmt: "pct", source: "tracking", lowerBetter: true, words: [] },
  D6_NORMAL_FG_PCT:{ label: "<6ft Normal", name: "those shooters' usual FG% within 6 feet", fmt: "pct", source: "tracking", style: true, words: [] },
  D6_DIFF:{ label: "<6ft Diff", name: "opponent FG% within 6 feet minus their usual FG%", fmt: "pmpct", source: "tracking", lowerBetter: true, words: [] },
  DIST_MILES:{ label: "Miles", name: "miles run per game", fmt: "n2", source: "tracking", style: true, words: ["miles per game", "miles run", "distance run", "distance"] },
  DIST_MILES_OFF:{ label: "Off Miles", name: "miles run on offense per game", fmt: "n2", source: "tracking", style: true, words: [] },
  DIST_MILES_DEF:{ label: "Def Miles", name: "miles run on defense per game", fmt: "n2", source: "tracking", style: true, words: [] },
  AVG_SPEED:{ label: "Speed", name: "average speed (mph)", fmt: "n2", source: "tracking", style: true, words: ["average speed"] },
  AVG_SPEED_OFF:{ label: "Off Speed", name: "average speed on offense (mph)", fmt: "n2", source: "tracking", style: true, words: [] },
  AVG_SPEED_DEF:{ label: "Def Speed", name: "average speed on defense (mph)", fmt: "n2", source: "tracking", style: true, words: [] },
  // ---- hustle (hustle_players.json / hustle_teams.json) ----
  CONTESTED_SHOTS:{ label: "Contests", name: "shots contested per game", fmt: "n1", source: "hustle", words: ["contested shots", "shot contests", "contests"] },
  CONTESTED_SHOTS_2PT:{ label: "2PT Cont.", name: "2-point shots contested per game", fmt: "n1", source: "hustle", style: true, words: [] },
  CONTESTED_SHOTS_3PT:{ label: "3PT Cont.", name: "3-point shots contested per game", fmt: "n1", source: "hustle", style: true, words: [] },
  DEFLECTIONS:{ label: "Deflections", name: "deflections per game", fmt: "n1", source: "hustle", words: ["deflections"] },
  CHARGES_DRAWN:{ label: "Charges", name: "charges drawn per game", fmt: "n2", source: "hustle", words: ["charges drawn", "charges taken", "charges"] },
  SCREEN_ASSISTS:{ label: "Screen AST", name: "screen assists per game", fmt: "n1", source: "hustle", words: ["screen assists"] },
  SCREEN_AST_PTS:{ label: "Screen AST PTS", name: "points scored off his screen assists per game", fmt: "n1", source: "hustle", words: [] },
  LOOSE_BALLS_RECOVERED:{ label: "Loose Balls", name: "loose balls recovered per game", fmt: "n2", source: "hustle", words: ["loose balls recovered", "loose balls"] },
  BOX_OUTS:{ label: "Box Outs", name: "box-outs per game", fmt: "n1", source: "hustle", words: ["box outs", "boxouts"] },
  OFF_BOXOUTS:{ label: "Off Box Outs", name: "offensive box-outs per game", fmt: "n2", source: "hustle", words: [] },
  DEF_BOXOUTS:{ label: "Def Box Outs", name: "defensive box-outs per game", fmt: "n1", source: "hustle", words: [] },
  // ---- standings, game logs and model estimates ----
  PF_PG:{ label: "PF", name: "points scored per game", fmt: "n1", words: [] },
  PA_PG:{ label: "PA", name: "points allowed per game", fmt: "n1", lowerBetter: true, words: [] },
  DIFF_PG:{ label: "Diff", name: "average point differential", fmt: "pm", words: [] },
  PYTH_WPCT:{ label: "Pyth W%", name: "Pythagorean expected win % (model estimate)", fmt: "pct", model: true, words: [] },
  PYTH_W:{ label: "xW", name: "expected wins from points scored and allowed (model estimate)", fmt: "n1", model: true, words: [] },
  LUCK:{ label: "Luck", name: "actual wins minus expected wins (model estimate)", fmt: "pm", model: true, words: [] },
  PROJ_W:{ label: "Proj W", name: "projected wins over 82 games (model estimate)", fmt: "n1", model: true, words: [] },
  GAME_SCORE:{ label: "GmSc", name: "Game Score", fmt: "n1", words: [] },
  MARGIN:{ label: "Margin", name: "point margin (points scored minus allowed)", fmt: "pm", words: [] },
  OPP_PTS:{ label: "Opp PTS", name: "opponent points", fmt: "n1", lowerBetter: true, words: [] },
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
