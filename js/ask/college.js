// college.js (Ask) - answers questions about COLLEGE basketball (NCAA men's D-I) with simple rules.
// The NBA stays the default: a question only comes here if it says college/NCAA/etc., names a college
// team that isn't also an NBA city, or names a college player the NBA parser didn't recognise.
import { STATS, fmt } from "../stats.js";
import { esc } from "../ui.js";
import { normalize } from "./names.js";
import { CSTAT_WORDS, CTEAM_ONLY } from "../college/cstats.js";
import { loadCMeta, CMETA, cload, CSEASONS, playedSeasons, seasonInfo, addRecords, C_QUAL_MIN_PCT } from "../college/cdata.js";

const KEYWORDS = /\b(college|colleges|ncaa|ncaab|ncaam|cbb|march madness|final four|d1|d 1|d i|division i|division 1|freshm[ae]n|sophomores?|juniors?|seniors?|mid majors?|t rank|trank|torvik|kenpom|barthag|adjusted efficiency|adj ?[oed]m?\b|wab)\b/;
// College teams that share a name with an NBA city/team: only treated as college with a college keyword.
const NBA_CITIES = new Set(["charlotte", "denver", "houston", "memphis", "miami", "miami fl", "indiana", "minnesota", "new orleans", "portland",
  "utah", "washington", "boston", "chicago", "detroit", "toronto", "orlando", "phoenix", "sacramento", "atlanta", "dallas", "cleveland",
  "american"]);
const TEAM_ALIASES = { "uconn": "Connecticut", "unc": "North Carolina", "tar heels": "North Carolina", "ole miss": "Mississippi",
  "zags": "Gonzaga", "nc state": "N.C. State", "st johns": "St. John's", "saint johns": "St. John's", "pitt": "Pittsburgh",
  "cuse": "Syracuse", "nova": "Villanova", "bama": "Alabama", "kentucky wildcats": "Kentucky", "blue devils": "Duke",
  "jayhawks": "Kansas", "spartans": "Michigan St.", "boilermakers": "Purdue", "hoosiers": "Indiana", "illini": "Illinois",
  "badgers": "Wisconsin", "wolverines": "Michigan", "huskies": "Connecticut", "gators": "Florida", "vols": "Tennessee",
  "hogs": "Arkansas", "aggies": "Texas A&M", "longhorns": "Texas", "bruins": "UCLA", "trojans": "USC", "cougars": "Houston",
  "wildcats": "Arizona", "red raiders": "Texas Tech", "bulldogs": "Gonzaga", "miami hurricanes": "Miami FL", "hurricanes": "Miami FL",
  "michigan state": "Michigan St.", "iowa state": "Iowa St.", "ohio state": "Ohio St.", "florida state": "Florida St.",
  "san diego state": "San Diego St.", "saint marys": "Saint Mary's", "st marys": "Saint Mary's", "vcu": "VCU" };
const CONFS = [["big ten", "B10"], ["big 10", "B10"], ["b1g", "B10"], ["big 12", "B12"], ["big twelve", "B12"], ["big east", "BE"],
  ["acc", "ACC"], ["sec", "SEC"], ["pac 12", "P12"], ["pac twelve", "P12"], ["mountain west", "MWC"], ["west coast conference", "WCC"], ["wcc", "WCC"],
  ["atlantic 10", "A10"], ["a10", "A10"], ["a 10", "A10"], ["american athletic", "Amer"], ["aac", "Amer"], ["missouri valley", "MVC"], ["mvc", "MVC"],
  ["ivy league", "Ivy"], ["ivy", "Ivy"], ["big west", "BW"], ["big sky", "BSky"], ["sun belt", "SB"], ["conference usa", "CUSA"], ["c usa", "CUSA"],
  ["mac", "MAC"], ["mid american", "MAC"], ["colonial", "CAA"], ["caa", "CAA"], ["horizon", "Horz"], ["southern conference", "SC"], ["socon", "SC"],
  ["wac", "WAC"], ["swac", "SWAC"], ["meac", "MEAC"], ["summit", "Sum"], ["southland", "Slnd"], ["big south", "BSth"], ["ohio valley", "OVC"],
  ["patriot", "Pat"], ["america east", "AE"], ["asun", "ASun"], ["atlantic sun", "ASun"], ["maac", "MAAC"], ["northeast conference", "NEC"], ["nec", "NEC"]];

const key = (s) => normalize(s).replace(/\./g, "").replace(/\bstate\b/g, "st").replace(/\bsaint\b/g, "st").replace(/\s+/g, " ").trim();
const PHRASES = Object.entries(CSTAT_WORDS).flatMap(([k, ws]) => ws.map((w) => ({ k, w: key(w) }))).sort((a, b) => b.w.length - a.w.length);
const reFor = (w) => new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&")}(?=$|[^a-z0-9])`);

function findAll(q, list) {                            // list of {w, ...}; longest first; no overlaps
  const used = [], hits = [];
  for (const item of list) {
    const m = q.match(reFor(item.w));
    if (!m) continue;
    const s = m.index + m[1].length, e = s + item.w.length;
    if (used.some(([a, b]) => s < b && e > a)) continue;
    used.push([s, e]); hits.push({ ...item, start: s, end: e });
  }
  return hits.sort((a, b) => a.start - b.start);
}

let teamIndex = null, playerIndex = null;
async function teamNames() {
  if (!teamIndex) {
    const rows = await cload("teams", playedSeasons()[0]);
    const list = rows.map((t) => ({ w: key(t.TEAM_NAME), team: t.TEAM_NAME }));
    for (const [a, t] of Object.entries(TEAM_ALIASES)) list.push({ w: key(a), team: t });
    teamIndex = list.sort((a, b) => b.w.length - a.w.length);
  }
  return teamIndex;
}
async function playerNames() {
  if (!playerIndex) {
    const rows = await cload("players", playedSeasons()[0]);
    playerIndex = rows.filter((p) => (p.MIN_PCT ?? 0) >= 0.1).map((p) => ({ w: key(p.PLAYER_NAME), pid: p.PID, name: p.PLAYER_NAME }))
      .sort((a, b) => b.w.length - a.w.length);
  }
  return playerIndex;
}

function findSeason(q) {
  const all = CSEASONS();
  const range = q.match(/(20\d\d)[\s\/-]+(\d\d)\b/);
  if (range && all.includes(`${range[1]}-${range[2]}`)) return `${range[1]}-${range[2]}`;
  const year = q.match(/\b(?:in |of )?(20\d\d)\b/);
  if (year) { const s = all.find((x) => 2000 + +x.slice(5) === +year[1]); if (s) return s; }
  if (/last season|last year|this past season/.test(q)) return playedSeasons()[0] === CMETA.default_season && seasonInfo(playedSeasons()[0]).in_progress ? playedSeasons()[1] : playedSeasons()[0];
  if (/preseason|this season|upcoming|2026 27/.test(q) && seasonInfo(all[0]).preseason) return all[0];
  return null;
}

/** Returns { result, tags } for a college question, or null to let the NBA answer it. */
export async function collegeAnswer(question, nbaIntent) {
  const q = key(question);
  const confHit = findAll(q, CONFS.filter(([w]) => !["mac", "summit", "horizon", "patriot", "colonial", "southland", "ivy"].includes(w)).map(([w]) => ({ w: key(w) })));
  const explicit = KEYWORDS.test(q) || confHit.length > 0;      // "best offense in the Big Ten" is a college question
  const nbaFoundName = !!(nbaIntent?.item || nbaIntent?.items?.length || nbaIntent?.players?.length || nbaIntent?.team || nbaIntent?.player);
  await loadCMeta();
  const teamsFound = findAll(q, await teamNames()).filter((h) => explicit || !NBA_CITIES.has(h.w));
  if (!explicit && nbaFoundName) {
    // The NBA parser found a name. Keep the NBA answer unless that was only a loose match (e.g. "Duke" -> David Duke Jr.)
    // and the question names a college team exactly.
    const nbaNames = [nbaIntent.item, ...(nbaIntent.items || []), ...(nbaIntent.players || []), nbaIntent.team, nbaIntent.player]
      .filter(Boolean).map((x) => key(x.name || x.PLAYER_NAME || x.TEAM_NAME || ""));
    const nbaExact = nbaNames.some((n) => n && reFor(n).test(q) || n.split(" ").filter((w) => w.length > 3).length > 1 && n.split(" ").every((w) => q.includes(w)));
    if (nbaExact || !teamsFound.length) return null;
  }
  // Player names only when needed (the player list is a bigger file).
  const playersFound = (explicit || nbaIntent?.type === "unknown" || teamsFound.length) ? findAll(q, await playerNames()) : [];
  // Player names hide team names inside them ("Jalen Duke"?): drop team hits that sit inside a player hit.
  const teams = [...new Map(teamsFound.filter((t) => !playersFound.some((p) => t.start >= p.start && t.end <= p.end)).map((t) => [t.team, t])).values()];
  const players = [...new Map(playersFound.map((p) => [p.pid, p])).values()];
  if (!explicit && !teams.length && !players.length) return null;

  const stats = findAll(q, PHRASES).filter((s) => !teams.some((t) => s.start >= t.start && s.end <= t.end) && !players.some((p) => s.start >= p.start && s.end <= p.end));
  const conf = findAll(q, CONFS.map(([w, c]) => ({ w: key(w), conf: c })))
    .filter((c) => !teams.some((t) => c.start >= t.start && c.end <= t.end))[0]?.conf;
  let season = findSeason(q) || CMETA.default_season;
  const notes = [];
  if (seasonInfo(season).preseason && (players.length || stats.some((s) => !CTEAM_ONLY.has(s.k)) || !/rank|best team|top team|preseason/.test(q))) {
    if (!/preseason|rank|adj|offense|defense|tempo|barthag/.test(q) || players.length) {
      notes.push(`${season} hasn't started yet, so this uses ${playedSeasons()[0]}.`);
      season = playedSeasons()[0];
    }
  }
  if (seasonInfo(season).preseason) notes.push(`${season} hasn't tipped off: these are Torvik's <b>preseason</b> ratings (projections), not results.`);

  const limitM = q.match(/\b(?:top|best|worst|bottom|first)\s+(\d+)\b/) || q.match(/\b(\d+)\s+(?:best|top|worst|players|teams|scorers)\b/);
  const limit = limitM ? Math.min(+limitM[1], 100) : 10;
  const low = /\b(least|fewest|lowest|worst|bottom|slowest)\b/.test(q.replace(/\bat least\b/g, ""));
  const leaderWords = /\b(top|leaders?|leads|lead|most|highest|lowest|best|worst|fastest|slowest|who|which|rank|ranking|rankings)\b/.test(q);
  const tagBase = ["College (NCAA D-I)"];
  const sources = ["Bart Torvik T-Rank (barttorvik.com)", ...(seasonInfo(season).has_box ? ["ESPN box scores via sportsdataverse"] : [])];
  const footer = `Data pulled ${esc(CMETA.pulled_at_utc)}.`;

  // ---------- compare ----------
  if (teams.length >= 2 || players.length >= 2) {
    const entity = players.length >= 2 ? "players" : "teams";
    const rows = await rowsFor(entity, season);
    const picked = entity === "players" ? players.slice(0, 4).map((p) => rows.find((r) => r.PID === p.pid)).filter(Boolean)
      : teams.slice(0, 4).map((t) => rows.find((r) => r.TEAM_NAME === t.team)).filter(Boolean);
    if (picked.length >= 2) {
      const keys = entity === "teams" ? ["TRANK", "REC", "ADJEM", "ADJOE", "ADJDE", "BARTHAG", "ADJT", "SOS", "EFG", "EFG_D", "TOVR", "ORB"]
        : ["GP", "MIN", "PTS", "REB", "AST", "STL", "BLK", "TS", "USG", "ORTG", "BPM"];
      const extra = stats.map((s) => s.k).filter((k) => !keys.includes(k));
      const best = entity === "teams" ? picked.reduce((a, b) => (a.ADJEM ?? -99) > (b.ADJEM ?? -99) ? a : b) : picked.reduce((a, b) => (a.BPM ?? -99) > (b.BPM ?? -99) ? a : b);
      const ids = picked.map((r) => entity === "teams" ? r.TEAM_ID : r.PID).join(",");
      return { tags: [...tagBase, "Comparison", entity === "teams" ? "Teams" : "Players", `Season: ${season}`],
        result: { headline: entity === "teams"
            ? `By Torvik's adjusted efficiency margin, <b>${esc(best.TEAM_NAME)}</b> rates highest of these ${picked.length} in ${season} (${fmt(best.ADJEM, "ADJEM")}).`
            : `<b>${esc(best.PLAYER_NAME)}</b> (${esc(best.TEAM_NAME)}) has the highest BPM of these ${picked.length} in ${season} (${fmt(best.BPM, "BPM")}).`,
          html: `<p><a class="btn" href="#/college/compare?type=${entity}&season=${season}&ids=${ids}">Open in College Compare (charts) →</a></p>`,
          tables: [{ rows: picked, entity, rank: false, sortKey: entity === "teams" ? "ADJEM" : "BPM", columns: [nameCol(entity), ...(entity === "players" ? [teamCol] : []), ...[...extra, ...keys].map(col)] }],
          notes, sources, footer } };
    }
  }

  const statKeys = stats.map((s) => s.k);
  const mentionsTeams = /\bteams?\b|\bschools?\b|\bprograms?\b|\bconferences?\b/.test(q);

  // ---------- one team / one player lookup ----------
  // "top scorers at Duke" = a leaderboard inside one team, not a team lookup.
  const teamLeaders = teams.length === 1 && !players.length && /\b(top|leaders?|leads|most|best|who)\b/.test(q) &&
    (/\b(scorers?|players?|who|rebounders?|passers?|shooters?)\b/.test(q) || statKeys.some((k) => !CTEAM_ONLY.has(k)));
  if (players.length === 1 || (teams.length === 1 && !teamLeaders)) {
    if (players.length === 1) {
      const rows = await rowsFor("players", season);
      let p = rows.find((r) => r.PID === players[0].pid);
      if (!p) { season = playedSeasons().find(() => true); p = (await rowsFor("players", season)).find((r) => r.PID === players[0].pid); }
      if (p) {
        const pool = rows.filter((r) => (r.MIN_PCT ?? 0) >= C_QUAL_MIN_PCT);
        const keys = statKeys.length ? statKeys : ["PTS", "REB", "AST", "TS", "BPM"];
        const parts = keys.map((k) => `${fmt(p[k], k, "players")}${STATS[k].fmt === "pct" ? "%" : ""} ${esc(STATS[k].label)}${rankText(p, k, pool)}`);
        return { tags: [...tagBase, "Lookup", "Player", `Season: ${season}`],
          result: { headline: `<b><a href="#/college/player/${p.PID}">${esc(p.PLAYER_NAME)}</a></b> (${esc(p.TEAM_NAME)}, ${esc(p.CLASS || "")}) in ${season}: ${parts.join(" · ")}.`,
            tables: [{ rows: [p], entity: "players", rank: false, columns: [nameCol("players"), teamCol, ...[...new Set([...keys, "GP", "MIN", "PTS", "REB", "AST", "STL", "BLK", "FG_PCT", "FG3_PCT", "FT_PCT", "TS", "USG", "BPM"])].map(col)] }],
            notes: [...notes, `Ranks are among players with at least 40% of their team's minutes (${pool.length.toLocaleString()} players).`], sources, footer } };
      }
    }
    if (teams.length === 1) {
      const rows = await rowsFor("teams", season);
      const t = rows.find((r) => r.TEAM_NAME === teams[0].team);
      if (t) {
        const asked = statKeys.filter((k) => k !== "TRANK" && (k in t || CTEAM_ONLY.has(k)));
        const keys = asked.length ? asked : ["ADJEM", "ADJOE", "ADJDE", "ADJT"];
        const parts = keys.filter((k) => k !== "TRANK").map((k) => `${esc(STATS[k].label)} ${fmt(t[k], k, "teams")}${STATS[k].fmt === "pct" ? "%" : ""}${rankText(t, k, rows)}`);
        const pre = seasonInfo(season).preseason;
        return { tags: [...tagBase, "Lookup", "Team", `Season: ${season}`],
          result: { headline: `<b><a href="#/college/team/${esc(t.TEAM_ID)}?season=${season}">${esc(t.TEAM_NAME)}</a></b> (${esc(t.CONF)}) ${pre ? "preseason" : season}: T-Rank #${t.TRANK}${pre ? "" : `, ${t.REC}`} · ${parts.join(" · ")}.`,
            tables: [{ rows: [t], entity: "teams", rank: false, columns: [nameCol("teams"), ...[...new Set([...keys, "TRANK", "REC", "ADJEM", "ADJOE", "ADJDE", "BARTHAG", "ADJT", "SOS", "WAB", "EFG", "EFG_D", "TOVR", "ORB"])].map(col)] }],
            notes: [...notes, `Ranks are out of ${rows.length} D-I teams. AdjO/AdjD = points scored/allowed per 100 possessions vs an average D-I opponent.`], sources, footer } };
      }
    }
  }

  // ---------- leaders ----------
  let stat = statKeys.find((k) => !["GP", "MIN"].includes(k)) || statKeys[0];
  if (!stat) stat = mentionsTeams || teams.length || !/\bplayers?\b|\bwho\b/.test(q) ? "TRANK" : "BPM";
  const entity = (CTEAM_ONLY.has(stat) || mentionsTeams || ["TRANK"].includes(stat)) && !/\bplayers?\b/.test(q) ? "teams" : "players";
  const s = STATS[stat];
  const wantsBest = /\bbest\b|\btop\b/.test(q), wantsWorst = /\bworst\b|\bbottom\b/.test(q);
  let asc = low;
  if (s.lowerBetter) asc = wantsWorst ? false : (low && !wantsBest ? false : true);
  if (/slowest/.test(q)) asc = true;
  let rows = await rowsFor(entity, season);
  if (entity === "players" && !(stat in (rows[0] || {}))) return null;
  // Number filters for players: "at least 20 points", "over 40% from three"
  const filters = [];
  for (const h of stats) {
    const before = q.slice(Math.max(0, h.start - 30), h.start);
    const m = before.match(/(at least|over|more than|above|under|below|less than)?\s*(\d+(?:\.\d+)?)\s*(%)?\s*(\+)?\s*(?:a game |per game )?$/);
    if (m && !/\b(top|best|worst|bottom)\s+\d+\s*$/.test(before)) {
      const v = STATS[h.k].fmt === "pct" ? +m[2] / 100 : +m[2];
      filters.push({ k: h.k, op: /under|below|less/.test(m[1] || "") ? "<=" : ">=", v });
    }
  }
  if (conf) rows = rows.filter((r) => r.CONF === conf);
  if (teams.length === 1 && entity === "players") rows = rows.filter((r) => r.TEAM_NAME === teams[0].team);
  const cls = q.match(/\b(freshm[ae]n|sophomores?|juniors?|seniors?)\b/)?.[1];
  if (cls && entity === "players") rows = rows.filter((r) => r.CLASS === { f: "Fr", s: cls.startsWith("so") ? "So" : "Sr", j: "Jr" }[cls[0]]);
  for (const f of filters) rows = rows.filter((r) => r[f.k] != null && (f.op === ">=" ? r[f.k] >= f.v : r[f.k] <= f.v));
  const rankStat = filters.length && filters.some((f) => f.k === stat) ? (statKeys.find((k) => !filters.some((f) => f.k === k)) || stat) : stat;
  if (entity === "players" && !(teams.length === 1)) rows = rows.filter((r) => (r.MIN_PCT ?? 0) >= C_QUAL_MIN_PCT);
  // Shooting percentages need enough attempts to count (otherwise a 3-for-3 shooter "leads").
  const MIN_ATT = { FG3_PCT: [(r) => r.FG3A_TOT, 60, "3-point attempts"], FT_PCT: [(r) => r.FTA_TOT, 50, "free throw attempts"],
    FG_PCT: [(r) => r.FGA_TOT, 150, "field goal attempts"], EFG: [(r) => r.FGA_TOT, 150, "field goal attempts"], TS: [(r) => r.FGA_TOT, 150, "field goal attempts"],
    RIM_PCT: [(r) => r.RIM_A, 50, "shots at the rim"], MID_PCT: [(r) => r.MID_A, 50, "mid-range shots"] };
  if (entity === "players" && MIN_ATT[stat]) {
    const [get, n, what] = MIN_ATT[stat];
    rows = rows.filter((r) => (get(r) ?? 0) >= n);
    notes.push(`Minimum ${n} ${what} for the season.`);
  }
  rows = rows.filter((r) => r[rankStat] != null).sort((a, b) => asc ? a[rankStat] - b[rankStat] : b[rankStat] - a[rankStat]);
  const isList = filters.length && rankStat === stat && filters.some((f) => f.k === stat);
  const top = rows.slice(0, isList ? 100 : limit);
  if (!top.length) return { tags: [...tagBase], result: { headline: "No college " + entity + " match that.", tables: [], notes, sources, footer } };
  const lead = top[0];
  const where = conf ? `the ${conf}` : teams.length === 1 && entity === "players" ? lead.TEAM_NAME : "Division I";
  const sname = STATS[rankStat].name.replace(/\s*\(.*\)$/, "");          // drop the explanation in brackets
  const val = `${fmt(lead[rankStat], rankStat, entity)}${STATS[rankStat].fmt === "pct" ? "%" : ""}`;
  const headline = entity === "teams"
    ? `<b><a href="#/college/team/${esc(lead.TEAM_ID)}?season=${season}">${esc(lead.TEAM_NAME)}</a></b> ${rankStat === "TRANK" ? `is No. 1 in Torvik's T-Rank` : `${asc !== !!STATS[rankStat].lowerBetter ? "has the lowest" : "leads"} ${esc(where)} in ${esc(sname)}`} ${rankStat === "TRANK" ? `in ${esc(where)}` : ""} for ${seasonInfo(season).preseason ? `the ${season} preseason` : season}${rankStat === "TRANK" ? ` (AdjEM ${fmt(lead.ADJEM, "ADJEM")})` : `: ${val}`}.`
    : `<b><a href="#/college/player/${lead.PID}">${esc(lead.PLAYER_NAME)}</a></b> (${esc(lead.TEAM_NAME)}) ${asc !== !!STATS[rankStat].lowerBetter ? "has the lowest" : "leads"} ${esc(where)} in ${esc(sname)} in ${season}: ${val}.`;
  const base = entity === "teams" ? ["TRANK", "REC", "ADJEM", "ADJOE", "ADJDE", "ADJT"] : ["GP", "MIN", "PTS", "REB", "AST", "TS", "BPM"];
  const tags = [...tagBase, "Leaderboard", entity === "teams" ? "Teams" : "Players", `Stat: ${esc(sname)}`, ...(conf ? [`Conference: ${conf}`] : []),
    ...filters.map((f) => `${esc(STATS[f.k].label)} ${f.op === "<=" ? "≤" : "≥"} ${STATS[f.k].fmt === "pct" ? (f.v * 100).toFixed(1) + "%" : f.v}`), `Season: ${season}`];
  if (entity === "players" && !(teams.length === 1)) notes.push("Players need at least 40% of their team's minutes to qualify (Torvik's default).");
  return { tags, result: { headline, tables: [{ rows: top, entity, sortKey: rankStat, sortAsc: asc, highlight: rankStat,
      columns: [nameCol(entity), ...(entity === "players" ? [teamCol, col("CLASS")] : [col("CONF")]), ...[...new Set([rankStat, ...filters.map((f) => f.k), ...base])].map(col)] }],
    notes, sources, footer } };
}

async function rowsFor(entity, season) {
  const rows = await cload(entity, season);
  return entity === "teams" ? rows.map(addRecords) : rows;
}
function rankText(row, k, pool) {
  if (row[k] == null || !STATS[k] || STATS[k].fmt === "str") return "";
  const lb = !!STATS[k].lowerBetter;
  const r = pool.filter((x) => x[k] != null && (lb ? x[k] < row[k] : x[k] > row[k])).length + 1;
  return ` <span class="muted small">(#${r})</span>`;
}
const STR = { CONF: "Conf", REC: "W-L", CLASS: "Class", CONF_REC: "Conf W-L" };
function col(k) { return STR[k] ? { key: k, label: STR[k], left: true, html: (r) => esc(r[k] ?? "–") } : { key: k }; }
const nameCol = (entity) => entity === "teams"
  ? { key: "TEAM_NAME", label: "Team", left: true, html: (r) => `<a href="#/college/team/${esc(r.TEAM_ID)}">${esc(r.TEAM_NAME)}</a>` }
  : { key: "PLAYER_NAME", label: "Player", left: true, html: (r) => `<a href="#/college/player/${r.PID}">${esc(r.PLAYER_NAME)}</a>` };
const teamCol = { key: "TEAM_NAME", label: "Team", left: true, html: (r) => `<a href="#/college/team/${esc(r.TEAM_ID)}">${esc(r.TEAM_NAME)}</a>` };
