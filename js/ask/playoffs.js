// playoffs.js (Ask) - NBA playoff and championship questions, rules only, NBA.com data:
//   "who won the 2016 finals", "2025 NBA champion", "how many titles do the Spurs have", "most championships since 2000",
//   "Celtics playoff history", "most points in the 2024 playoffs", "who did the Lakers lose to in 2023"
// Data: data/index/playoffs.json (every series since 1996-97), data/index/franchises.json (NBA.com FranchiseHistory),
//       data/<season>/playoffs.json (playoff player game lines) - all made by the pipeline (fetch_playoffs.py, build_indexes.py).
import { esc } from "../ui.js";
import { loadCMeta, cload, playedSeasons } from "../college/cdata.js";

const cache = new Map();
const getJSON = (p) => { if (!cache.has(p)) cache.set(p, fetch(p).then((r) => { if (!r.ok) throw new Error(p); return r.json(); })); return cache.get(p); };
const rowsOf = (c) => c.rows.map((r) => Object.fromEntries(c.cols.map((k, i) => [k, r[i]])));
const TRIGGER = /\b(finals?|champions?|championships?|titles?|rings?|playoffs?|postseason|swept|sweep)\b/;
const COLLEGE = /\b(college|ncaa|march madness|final fours?|ncaam|tournament|national (?:champ\w*|titles?)|elite (?:eight|8)|sweet (?:16|sixteen))\b/;
// Common short names for schools that aren't their Torvik team names, so "UConn titles" defers to College Ask.
const SCHOOL_NICKS = ["uconn", "unc", "nova", "zags", "lsu", "unlv", "byu", "vcu", "smu", "tcu", "utep", "uk", "osu", "msu", "ole miss", "pitt", "cuse"];
let schools = null;
async function collegeTeamIn(q) {
  if (SCHOOL_NICKS.some((n) => new RegExp(`\\b${n}\\b`).test(q))) return true;
  try {
    if (!schools) schools = loadCMeta().then(() => cload("teams", playedSeasons()[0])).then((rows) => rows.map((t) => t.TEAM_NAME.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    return (await schools).some((n) => n.length > 3 && new RegExp(`\\b${n}\\b`).test(q));
  } catch { return false; }
}
const ROUND = ["", "first round", "conference semifinals", "conference finals", "NBA Finals"];
const NICK_EXTRA = { "sixers": "76ers", "cavs": "Cavaliers", "mavs": "Mavericks", "wolves": "Timberwolves", "blazers": "Trail Blazers", "knicks": "Knicks", "dubs": "Warriors" };
const SRC = ["NBA.com LeagueGameLog (Playoffs)", "NBA.com FranchiseHistory"];

function seasonFrom(q, seasons) {
  const r = q.match(/\b((?:19|20)\d\d)[-\/](\d\d)\b/);
  if (r && seasons.includes(`${r[1]}-${r[2]}`)) return `${r[1]}-${r[2]}`;
  const y = q.match(/\b((?:19|20)\d\d)\b/);           // "2016 finals" / "2016 playoffs" = the 2015-16 season
  if (y) { const end = +y[1]; const s = `${end - 1}-${String(end % 100).padStart(2, "0")}`; if (seasons.includes(s)) return s; }
  if (/\b(last year|last season|this year|latest|most recent|reigning|defending)\b/.test(q)) return seasons[seasons.length - 1];
  return null;
}

export async function playoffAnswer(question) {
  const q = question.toLowerCase();
  if (!TRIGGER.test(q) || COLLEGE.test(q) || /\b(draft|lottery|odds|chances?|simulat|predict|will)\b/.test(q)) return null;
  let po, fr;
  try { [po, fr] = await Promise.all([getJSON("data/index/playoffs.json"), getJSON("data/index/franchises.json")]); } catch { return null; }
  const S = rowsOf(po), F = rowsOf(fr), seasons = [...new Set(S.map((r) => r.SEASON))].sort();
  const first = seasons[0];
  const finals = S.filter((r) => r.ROUND === 4);
  // Team: current nickname, city or abbreviation (franchise rows: first row per TEAM_ID is the franchise as it is now).
  const current = new Map(); for (const f of F) if (!current.has(f.TEAM_ID)) current.set(f.TEAM_ID, f);
  const teams = [...current.values()].map((f) => {
    const now = F.filter((x) => x.TEAM_ID === f.TEAM_ID)[1] || f;
    return { id: f.TEAM_ID, name: `${now.TEAM_CITY} ${now.TEAM_NAME}`, words: [now.TEAM_NAME.toLowerCase(), now.TEAM_CITY.toLowerCase(), `${now.TEAM_CITY} ${now.TEAM_NAME}`.toLowerCase()], f };
  });
  for (const [k, v] of Object.entries(NICK_EXTRA)) { const t = teams.find((x) => x.words[0] === v.toLowerCase()); if (t) t.words.push(k); }
  const abbrs = new Map(S.flatMap((r) => [[r.WIN.toLowerCase(), r.WIN_ID], [r.LOSE.toLowerCase(), r.LOSE_ID]]));
  const team = teams.find((t) => t.words.some((w) => w.length > 2 && new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(q)))
    || teams.find((t) => [...abbrs].some(([a, id]) => id === t.id && new RegExp(`\\b${a}\\b`).test(q)));
  if (!team && await collegeTeamIn(q)) return null;      // a college school and no NBA team: College Ask answers it
  const season = seasonFrom(q, seasons);
  const link = (id, abbr, s) => `<a href="#/team/${id}${s ? `?season=${s}` : ""}">${esc(abbr)}</a>`;
  const full = (id, abbr, s) => `<a href="#/team/${id}${s ? `?season=${s}` : ""}">${esc(teams.find((t) => t.id === id)?.name || abbr)}</a>`;
  const out = (tags, headline, tables = [], notes = [], html = "") => ({ tags: ["NBA playoffs", ...tags], result: { headline, tables, notes, sources: SRC, html,
    footer: `Playoff results since ${first} on this site; <a href="#/history/playoffs${season ? `?season=${season}` : ""}">bracket →</a>` } });
  const champCols = [
    { key: "SEASON", label: "Season", left: true, html: (r) => `<a href="#/history/playoffs?season=${r.SEASON}">${esc(r.SEASON)}</a>` },
    { key: "WIN", label: "Champion", left: true, html: (r) => link(r.WIN_ID, r.WIN, r.SEASON) }, { key: "LOSE", label: "Runner-up", left: true, html: (r) => link(r.LOSE_ID, r.LOSE, r.SEASON) },
    { key: "WIN_W", label: "Finals", left: true, html: (r) => `${r.WIN_W}-${r.LOSE_W}` }];

  // Playoff scoring / stat leaders for one postseason.
  const STAT = [[/\bpoints?|scor/, "PTS", "points"], [/\brebound/, "REB", "rebounds"], [/\bassist/, "AST", "assists"], [/\bsteal/, "STL", "steals"], [/\bblock/, "BLK", "blocks"], [/\bthrees?|3-pointers?|3s\b/, "FG3M", "3-pointers made"]];
  const st = STAT.find(([re]) => re.test(q));
  if (st && /\bplayoffs?|postseason\b/.test(q) && !/\bfinals?\b/.test(q) || st && /\bfinals\b/.test(q) && /\b(most|leader|led|top)\b/.test(q)) {
    const s = season || seasons[seasons.length - 1];
    const d = await getJSON(`data/${s}/playoffs.json`);
    const finalsOnly = /\bfinals\b/.test(q);
    const lines = rowsOf(d.players).filter((r) => !finalsOnly || r.GAME_ID.slice(7, 8) === "4" || (finals.find((f) => f.SEASON === s) && r.GAME_DATE >= finals.find((f) => f.SEASON === s).FIRST));
    const by = new Map();
    for (const l of lines) { const e = by.get(l.PLAYER_ID) || { PLAYER_ID: l.PLAYER_ID, PLAYER_NAME: l.PLAYER_NAME, TEAM: l.TEAM_ABBREVIATION, GP: 0, PTS: 0, REB: 0, AST: 0, STL: 0, BLK: 0, FG3M: 0, MIN: 0 };
      e.GP += 1; for (const k of ["PTS", "REB", "AST", "STL", "BLK", "FG3M", "MIN"]) e[k] += l[k] || 0; by.set(l.PLAYER_ID, e); }
    const perGame = /\b(per game|average|averag|ppg|rpg|apg)\b/.test(q);
    const rows = [...by.values()].map((e) => ({ ...e, V: perGame ? e[st[1]] / e.GP : e[st[1]] })).filter((e) => !perGame || e.GP >= 5).sort((a, b) => b.V - a.V);
    const top = rows[0]; if (!top) return null;
    const where = `the ${s} ${finalsOnly ? "NBA Finals" : "playoffs"}`;
    return out([`Season: ${s}`, finalsOnly ? "Finals" : "All rounds", `Stat: ${st[2]}${perGame ? " per game (5+ games)" : " (total)"}`],
      `<b><a href="#/player/${top.PLAYER_ID}">${esc(top.PLAYER_NAME)}</a></b> (${esc(top.TEAM)}) had the most ${st[2]}${perGame ? " per game" : ""} in ${where}: <b>${perGame ? top.V.toFixed(1) : Math.round(top.V)}</b> in ${top.GP} games.`,
      [{ rows: rows.slice(0, 25), entity: "players", rank: true, sortKey: "V", columns: [
        { key: "PLAYER_NAME", label: "Player", left: true, html: (r) => `<a href="#/player/${r.PLAYER_ID}">${esc(r.PLAYER_NAME)}</a>` }, { key: "TEAM", label: "Team", left: true },
        { key: "GP", label: "G" }, { key: "V", label: perGame ? `${st[1]}/G` : st[1], html: (r) => (perGame ? r.V.toFixed(1) : String(Math.round(r.V))) },
        ...["PTS", "REB", "AST"].filter((k) => k !== st[1]).map((k) => ({ key: k, label: `${k}/G`, html: (r) => (r[k] / r.GP).toFixed(1) }))] }],
      ["Regular-season stats aren't mixed in: these are playoff games only (NBA.com LeagueGameLog, Playoffs)."]);
  }

  // A team: titles / playoff history / a season's run.
  if (team) {
    const mine = S.filter((r) => r.WIN_ID === team.id || r.LOSE_ID === team.id);
    const titles = finals.filter((r) => r.WIN_ID === team.id);
    if (season) {
      const ss = mine.filter((r) => r.SEASON === season).sort((a, b) => a.ROUND - b.ROUND);
      if (!ss.length) return out([`Team: ${esc(team.name)}`, `Season: ${season}`], `The ${esc(team.name)} didn't make the ${season} playoffs.`);
      const last = ss[ss.length - 1], won = last.WIN_ID === team.id;
      const text = won && last.ROUND === 4 ? `won the ${season} NBA title, beating the ${full(last.LOSE_ID, last.LOSE, season)} ${last.WIN_W}-${last.LOSE_W} in the Finals` :
        `lost in the ${ROUND[last.ROUND]} of the ${season} playoffs to the ${full(last.WIN_ID, last.WIN, season)}, ${last.LOSE_W}-${last.WIN_W}`;
      return out([`Team: ${esc(team.name)}`, `Season: ${season}`], `The <b>${esc(team.name)}</b> ${text}.`, [{ rows: ss, entity: "teams", rank: false, columns: [
        { key: "ROUND", label: "Round", left: true, html: (r) => ROUND[r.ROUND] }, { key: "WIN", label: "Winner", left: true, html: (r) => link(r.WIN_ID, r.WIN, season) },
        { key: "LOSE", label: "Loser", left: true, html: (r) => link(r.LOSE_ID, r.LOSE, season) }, { key: "WIN_W", label: "Series", left: true, html: (r) => `${r.WIN_W}-${r.LOSE_W}` }] }]);
    }
    const f = team.f, runs = [...new Set(mine.map((r) => r.SEASON))];
    return out([`Team: ${esc(team.name)}`, "Franchise history"],
      `The <b>${esc(team.name)}</b> franchise has won <b>${f.LEAGUE_TITLES}</b> NBA title${f.LEAGUE_TITLES === 1 ? "" : "s"} since ${esc(f.START_YEAR)} (${f.PO_APPEARANCES} playoff appearances, NBA.com)` +
      `; since ${first}: ${titles.length} title${titles.length === 1 ? "" : "s"}${titles.length ? ` (${titles.map((t) => t.SEASON).join(", ")})` : ""} in ${runs.length} playoff trips.`,
      titles.length ? [{ title: "Titles since " + first, rows: titles, entity: "teams", rank: false, columns: champCols }] : [], [],
      `<p><a class="btn" href="#/team/${team.id}">Full playoff runs on the team page →</a></p>`);
  }

  // Who won a season's title?
  if (season && /\b(won|win|winner|champions?|championship|title|finals)\b/.test(q)) {
    const fin = finals.find((r) => r.SEASON === season);
    if (!fin) return out([`Season: ${season}`], `The ${season} Finals aren't in this site's data yet.`);
    return out([`Season: ${season}`, "NBA Finals"], `The <b>${full(fin.WIN_ID, fin.WIN, season)}</b> won the ${season} NBA title, beating the ${full(fin.LOSE_ID, fin.LOSE, season)} <b>${fin.WIN_W}-${fin.LOSE_W}</b> in the Finals (${esc(fin.FIRST)} to ${esc(fin.LAST)}).`,
      [{ title: "That postseason", rows: S.filter((r) => r.SEASON === season).sort((a, b) => b.ROUND - a.ROUND), entity: "teams", rank: false, columns: [
        { key: "ROUND", label: "Round", left: true, html: (r) => ROUND[r.ROUND] }, { key: "WIN", label: "Winner", left: true, html: (r) => `${r.WIN_SEED ? `(${r.WIN_SEED}) ` : ""}${link(r.WIN_ID, r.WIN, season)}` },
        { key: "LOSE", label: "Loser", left: true, html: (r) => `${r.LOSE_SEED ? `(${r.LOSE_SEED}) ` : ""}${link(r.LOSE_ID, r.LOSE, season)}` }, { key: "WIN_W", label: "Series", left: true, html: (r) => `${r.WIN_W}-${r.LOSE_W}` }] }]);
  }

  // Most titles (optionally since a year) / list of champions.
  if (/\b(champions?|championships?|titles?|rings?|finals)\b/.test(q)) {
    const since = q.match(/\b(?:since|after|from)\s+((?:19|20)\d\d)\b/);
    const from = since ? seasons.find((s) => +s.slice(0, 4) >= +since[1] - (/(after)/.test(q) ? 0 : 1)) || first : first;
    const dec = q.match(/\b(?:the\s+)?(?:(19|20)(\d)0|['’]?(\d)0)['’]?s\b/);       // "the 2000s" = seasons that began 2000-2009
    const d0 = dec ? (dec[1] ? +`${dec[1]}${dec[2]}0` : (+dec[3] >= 5 ? 1900 : 2000) + 10 * +dec[3]) : null;
    const list = finals.filter((r) => (d0 == null ? r.SEASON >= from : +r.SEASON.slice(0, 4) >= d0 && +r.SEASON.slice(0, 4) <= d0 + 9)).sort((a, b) => b.SEASON.localeCompare(a.SEASON));
    if (!list.length) return out([], `No NBA Finals on this site for that span (playoff results start in ${first}).`);
    const count = new Map(); for (const r of list) count.set(r.WIN_ID, { id: r.WIN_ID, abbr: r.WIN, n: (count.get(r.WIN_ID)?.n || 0) + 1, last: count.get(r.WIN_ID)?.last || r.SEASON });
    const ranked = [...count.values()].sort((a, b) => b.n - a.n);
    const span = d0 == null ? `since ${from}` : `in the ${d0}s (${list[list.length - 1].SEASON} to ${list[0].SEASON})`;
    return out([`Seasons: ${list[list.length - 1].SEASON} to ${list[0].SEASON}`, "Champions"],
      `Most NBA titles ${span}: <b>${ranked.filter((r) => r.n === ranked[0].n).map((r) => full(r.id, r.abbr)).join(", ")}</b> with <b>${ranked[0].n}</b>.`,
      [{ title: "Titles", rows: ranked.map((r) => ({ ...r, TEAM: r.abbr })), entity: "teams", rank: true, sortKey: "n", columns: [
        { key: "TEAM", label: "Team", left: true, html: (r) => link(r.id, r.abbr) }, { key: "n", label: "Titles" }, { key: "last", label: "Latest", left: true }] },
       { title: "Every champion", rows: list, entity: "teams", rank: false, columns: champCols }],
      [`Whole-franchise totals (every season since each team began) are on each team page and in “how many titles do the <i>team</i> have”.`]);
  }
  return null;
}
