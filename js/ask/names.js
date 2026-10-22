// names.js - finds player and team names inside a typed question, even with small typos.
// Example: "compare anthony edwrds and shai gilgeous alexander" -> [Anthony Edwards, Shai Gilgeous-Alexander]

// Make text easy to compare: lowercase, no accents (Jokić -> jokic), no punctuation.
export function normalize(text) {
  return String(text).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[’']/g, "").replace(/[^a-z0-9%+.\/ -]/g, " ").replace(/-/g, " ").replace(/\s+/g, " ").trim();
}

// How many single-letter edits turn word a into word b ("Levenshtein distance").
function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}
const similar = (a, b) => 1 - editDistance(a, b) / Math.max(a.length, b.length);

// Everyday words that happen to be someone's first or last name. We never treat these alone as a name.
const NOT_NAMES = new Set(("who what which when will would can could should does did is are was the a an and or of in on at to for " +
  "with by from vs versus compare comparison pairing pair duo together fit good great bad best worst most least top bottom " +
  "highest lowest leads lead leader leaders league player players team teams game games season seasons year years past last " +
  "since this that average averaging averages points point rebounds assists steals blocks home road away court advantage " +
  "opening day days night nights per possessions take takes shooting shot shots three threes percentage rating net total " +
  "career ever all time history much many more than less fewer over under above below at least minimum min max show list " +
  "me find give tell how has have had do get young green brown white black love rose smart holiday wall house hill banks " +
  "free bridges early price king grant johnson jones williams james smith jackson davis thompson harris miller wilson").split(" "));

// Nicknames people really type.
const PLAYER_NICKNAMES = {
  "sga": "Shai Gilgeous-Alexander", "kd": "Kevin Durant", "lebron": "LeBron James", "bron": "LeBron James",
  "steph": "Stephen Curry", "giannis": "Giannis Antetokounmpo", "greek freak": "Giannis Antetokounmpo",
  "luka": "Luka Dončić", "joker": "Nikola Jokić", "jokic": "Nikola Jokić", "wemby": "Victor Wembanyama",
  "ant": "Anthony Edwards", "ant man": "Anthony Edwards", "melo": "LaMelo Ball", "cp3": "Chris Paul",
  "ad": "Anthony Davis", "dame": "Damian Lillard", "embiid": "Joel Embiid", "kat": "Karl-Anthony Towns",
};
const TEAM_NICKNAMES = {
  "wolves": "MIN", "twolves": "MIN", "t wolves": "MIN", "sixers": "PHI", "76ers": "PHI", "cavs": "CLE", "mavs": "DAL",
  "blazers": "POR", "trail blazers": "POR", "dubs": "GSW", "okc": "OKC", "knicks": "NYK", "celts": "BOS",
  "nola": "NOP", "pels": "NOP", "grizz": "MEM", "wizards": "WAS", "spurs": "SAS", "suns": "PHX", "nets": "BKN",
};
const AMBIGUOUS_CITIES = new Set(["los angeles", "la"]);

/**
 * Build the lookup lists once.
 *  players: per-game rows from all loaded seasons (newest season first)
 *  teams:   team rows from one season
 */
export function buildNameIndex(players, teams) {
  // One entry per player: latest name + total minutes (so ties go to the bigger name).
  const byId = new Map();
  for (const p of players) {
    const e = byId.get(p.PLAYER_ID) || { id: p.PLAYER_ID, name: p.PLAYER_NAME, minutes: 0 };
    e.minutes += (p.MIN || 0) * (p.GP || 0);
    byId.set(p.PLAYER_ID, e);
  }
  const playerList = [...byId.values()].map((e) => {
    const n = normalize(e.name).replace(/ (jr|sr|ii|iii|iv)\.?$/, "");
    const parts = n.split(" ");
    return { ...e, norm: n, first: parts[0], last: parts.slice(1).join(" "), lastWord: parts[parts.length - 1] };
  });

  const teamList = teams.map((t) => {
    const full = normalize(t.TEAM_NAME);
    const words = full.split(" ");
    const nickname = full.endsWith("trail blazers") ? "trail blazers" : words[words.length - 1];
    const city = full.slice(0, full.length - nickname.length).trim();
    return { id: t.TEAM_ID, name: t.TEAM_NAME, abbr: t.TEAM_ABBREVIATION, full, nickname, city };
  });
  return { playerList, teamList };
}

/**
 * findNames - returns { players: [...], teams: [...], used: [[start, end], ...] } found in the question.
 *  q:        normalized question text
 *  original: the question as typed (used to spot UPPERCASE team codes like "MIN")
 *  skip:     character ranges already used by stat words (so "points" is never read as a name)
 */
export function findNames(index, q, original = "", skip = []) {
  const found = { players: [], teams: [], used: [...skip] };
  const free = (s, e) => !found.used.some(([a, b]) => s < b && e > a);
  const take = (s, e) => found.used.push([s, e]);
  const posOf = (phrase) => {                  // find a whole-word phrase in q
    const m = new RegExp(`(^|[^a-z0-9])(${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})(?=$|[^a-z0-9])`).exec(q);
    return m ? [m.index + m[1].length, m.index + m[1].length + phrase.length] : null;
  };
  const addPlayer = (p, s, e) => { if (!found.players.some((x) => x.id === p.id)) found.players.push({ ...p, at: s }); take(s, e); };
  const addTeam = (t, s, e) => { if (!found.teams.some((x) => x.id === t.id)) found.teams.push({ ...t, at: s }); take(s, e); };

  // 1) Teams: full name, nickname ("timberwolves"), city ("minnesota"), slang ("wolves"), UPPERCASE code ("MIN").
  for (const t of index.teamList) {
    for (const phrase of [t.full, t.nickname, AMBIGUOUS_CITIES.has(t.city) ? null : t.city].filter(Boolean)) {
      const at = posOf(phrase); if (at && free(...at)) { addTeam(t, ...at); break; }
    }
  }
  for (const [nick, abbr] of Object.entries(TEAM_NICKNAMES)) {
    const at = posOf(nick), t = index.teamList.find((x) => x.abbr === abbr);
    if (at && t && free(...at)) addTeam(t, ...at);
  }
  for (const m of original.matchAll(/\b([A-Z]{3})\b/g)) {
    const t = index.teamList.find((x) => x.abbr === m[1]);
    const at = posOf(m[1].toLowerCase());
    if (t && at && free(...at)) addTeam(t, ...at);
  }

  // 2) Players: exact full name first ("anthony edwards").
  for (const p of [...index.playerList].sort((a, b) => b.minutes - a.minutes)) {
    const at = posOf(p.norm); if (at && free(...at)) addPlayer(p, ...at);
  }
  // 3) Nicknames ("sga", "wemby").
  for (const [nick, full] of Object.entries(PLAYER_NICKNAMES)) {
    const at = posOf(nick), p = index.playerList.find((x) => x.name === full);
    if (at && p && free(...at)) addPlayer(p, ...at);
  }
  // 4) Small typos: compare 2- and 3-word chunks of the question to full names.
  const tokens = [...q.matchAll(/[a-z0-9]+/g)].map((m) => ({ w: m[0], s: m.index, e: m.index + m[0].length }));
  for (const size of [3, 2]) for (let i = 0; i + size <= tokens.length; i++) {
    const chunk = tokens.slice(i, i + size), s = chunk[0].s, e = chunk[size - 1].e;
    if (!free(s, e) || chunk.every((t) => NOT_NAMES.has(t.w))) continue;
    const text = chunk.map((t) => t.w).join(" ");
    let best = null, bestScore = 0.84;
    for (const p of index.playerList) {
      if (p.norm.split(" ").length !== size) continue;
      const sc = similar(text, p.norm);
      if (sc > bestScore || (sc === bestScore && best && p.minutes > best.minutes)) { best = p; bestScore = sc; }
    }
    if (best) addPlayer(best, s, e);
  }
  // 5) A single last name ("edwards") or rare first name ("lamelo") -> the player with the most minutes.
  for (const t of tokens) {
    if (!free(t.s, t.e) || t.w.length < 4 || NOT_NAMES.has(t.w)) continue;
    const byLast = index.playerList.filter((p) => p.lastWord === t.w || p.last === t.w);
    const byFirst = index.playerList.filter((p) => p.first === t.w);
    const pool = byLast.length ? byLast : byFirst.length && byFirst.length <= 3 ? byFirst : [];
    if (pool.length) addPlayer(pool.sort((a, b) => b.minutes - a.minutes)[0], t.s, t.e);
  }
  // Keep the order the names were typed in.
  found.players.sort((a, b) => a.at - b.at);
  found.teams.sort((a, b) => a.at - b.at);
  return found;
}
