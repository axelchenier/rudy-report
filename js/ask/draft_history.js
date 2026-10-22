// draft_history.js (Ask) - answers questions about past NBA drafts (2008-2026) and how college stats carried over to the NBA.
// Data: data/draft/history/ and data/draft/translation.json (pipeline/college_nba.py): NBA.com DraftHistory + NBA.com
// regular-season stats + Bart Torvik college stats. Rules only, no AI, no Basketball-Reference data.
//   "who was drafted 5th in 2019", "best pick of the 2016 draft", "steal of the 2012 draft", "hit rate for picks 11-20",
//   "where was Draymond Green drafted", "does college FT% predict NBA 3P%", "which college stats predict NBA success",
//   "which college has had the most draft picks since 2008"
import { esc } from "../ui.js";
import { normalize } from "./names.js";
import { CX, NY, pairs, fit, unpack } from "../pages/draft_translation.js";
import { TIERS } from "../pages/draft_nav.js";

const cache = new Map();
const getJSON = (path) => { if (!cache.has(path)) cache.set(path, fetch(path).then((r) => { if (!r.ok) throw new Error(`Could not load ${path}`); return r.json(); })); return cache.get(path); };
const key = (s) => normalize(s).replace(/\./g, "").replace(/[^a-z0-9%\- ]/g, " ").replace(/\s+/g, " ").trim();
const num = (v, d = 1) => v == null ? "–" : Number(v).toFixed(d);
const pct = (v) => v == null ? "–" : (v * 100).toFixed(1) + "%";
const int = (v) => v == null ? "–" : Number(v).toLocaleString();
const SOURCES = ["NBA.com Draft History", "NBA.com regular-season stats (via nba_api)", "Bart Torvik T-Rank (college stats)"];
const ORD = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14 };
const DEFS = `Outcome labels use NBA.com regular-season minutes: ${Object.values(TIERS).map(([l, d]) => `<b>${l}</b> = ${d}`).join("; ")}.`;
const tierText = (t) => TIERS[t][0];
const playerLink = (p) => p.in_nba_data ? `<a href="#/player/${p.nba_id}">${esc(p.name)}</a>` : `<a href="https://www.nba.com/stats/player/${p.nba_id}" target="_blank" rel="noopener">${esc(p.name)} ↗</a>`;
const lc = (s) => s[0].toLowerCase() + s.slice(1);
const btn = (href, label) => `<a class="btn" href="${href}">${label} →</a>`;

const pickCols = () => [
  { key: "pick", label: "Pick", html: (p) => p.pick },
  { key: "name", label: "Player", left: true, html: (p) => playerLink(p) },
  { key: "team", label: "Team", left: true, html: (p) => esc(p.team) },
  { key: "org", label: "From", left: true, html: (p) => p.college ? `<a href="#/college/player/${p.college.pid}">${esc(p.college.team)}</a>` : esc(p.org || "–") },
  { key: "gp", label: "NBA GP", html: (p) => int(p.nba.career?.gp) }, { key: "min", label: "Minutes", html: (p) => int(p.nba.career?.min) },
  { key: "ppg", label: "PTS", html: (p) => num(p.nba.career?.ppg) }, { key: "rpg", label: "REB", html: (p) => num(p.nba.career?.rpg) },
  { key: "apg", label: "AST", html: (p) => num(p.nba.career?.apg) }, { key: "tier", label: "Outcome", left: true, html: (p) => tierText(p.nba.tier) }];

// College-stat and NBA-stat words for translation questions. Order matters (longest/most specific first).
const STAT_WORDS = [
  [/\b(free throws?|ft ?%?|ft pct|foul shooting)\b/, "C_FT_PCT", null], [/\b(3 ?pt|3 ?point|three point|threes?|3p ?%?|3pt%|3 ?pt ?%)\b/, "C_FG3_PCT", "N_FG3"],
  [/\b(true shooting|ts ?%?|efficiency|efficient)\b/, "C_TS", "N_TS"], [/\b(box plus minus|bpm)\b/, "C_BPM", null],
  [/\b(rebounds?|rebounding|boards)\b/, "C_REB", "N_RPG"], [/\b(assists?|passing|playmaking)\b/, "C_AST", "N_APG"],
  [/\b(points|scoring|scorers?|ppg)\b/, "C_PTS", "N_PPG"], [/\b(usage)\b/, "C_USG", null], [/\b(steals?)\b/, "C_STL_PCT", null],
  [/\b(blocks?|shot blocking)\b/, "C_BLK_PCT", null], [/\b(age|older|younger|young)\b/, "C_AGE", null], [/\b(height|taller|tall)\b/, "C_HT_IN", null]];
const TRANSLATE = /\b(predict\w*|translat\w*|carr(?:y|ies) over|correlat\w*|relat\w*|lead to|leads to|tell us|matter|indicator|signal|become|turn into)\b/;

// NBA team nicknames -> NBA.com team abbreviations used in DraftHistory (incl. NJN = New Jersey Nets, NOH = New Orleans Hornets).
const NBA_TEAMS = [["hawks", "ATL", "Hawks"], ["celtics", "BOS", "Celtics"], ["nets", "BKN NJN", "Nets"], ["hornets", "CHA NOH", "Hornets"], ["bobcats", "CHA", "Bobcats"], ["bulls", "CHI", "Bulls"],
  ["cavaliers", "CLE", "Cavaliers"], ["cavs", "CLE", "Cavaliers"], ["mavericks", "DAL", "Mavericks"], ["mavs", "DAL", "Mavericks"], ["nuggets", "DEN", "Nuggets"], ["pistons", "DET", "Pistons"],
  ["warriors", "GSW", "Warriors"], ["rockets", "HOU", "Rockets"], ["pacers", "IND", "Pacers"], ["clippers", "LAC", "Clippers"], ["lakers", "LAL", "Lakers"], ["grizzlies", "MEM", "Grizzlies"],
  ["heat", "MIA", "Heat"], ["bucks", "MIL", "Bucks"], ["timberwolves", "MIN", "Timberwolves"], ["wolves", "MIN", "Timberwolves"], ["pelicans", "NOP NOH", "Pelicans"], ["knicks", "NYK", "Knicks"],
  ["thunder", "OKC", "Thunder"], ["magic", "ORL", "Magic"], ["76ers", "PHI", "76ers"], ["sixers", "PHI", "76ers"], ["suns", "PHX", "Suns"], ["trail blazers", "POR", "Trail Blazers"],
  ["blazers", "POR", "Trail Blazers"], ["kings", "SAC", "Kings"], ["spurs", "SAS", "Spurs"], ["raptors", "TOR", "Raptors"], ["jazz", "UTA", "Jazz"], ["wizards", "WAS", "Wizards"]];

async function index() { return getJSON("data/draft/history/index.json"); }
const classFile = (y) => getJSON(`data/draft/history/${y}.json`);

function pickNumber(q) {
  if (/\b(first overall|number one|no 1|#1|top pick|1st overall|1st pick|first pick)\b/.test(q)) return 1;
  const m = q.match(/\b(?:#|no |number |pick )(\d{1,2})\b/) || q.match(/\b(\d{1,2})(?:st|nd|rd|th)\b/);
  if (m) return +m[1];
  const w = Object.keys(ORD).find((k) => new RegExp(`\\b${k}\\b`).test(q));
  return w ? ORD[w] : null;
}

/** Returns { tags, result } or null. */
export async function draftHistoryAnswer(question) {
  const q = key(question);
  const years = (q.match(/\b20[0-2]\d\b/g) || []).map(Number);
  const draftish = /\b(draft|drafted|draftees?|pick|picks|picked|selected|lottery|class)\b/.test(q);
  const nbaWord = /\b(nba|pro|pros|league)\b/.test(q);
  const collegeWord = /\b(college|ncaa|freshman|school)\b/.test(q);

  // --- College → NBA translation -------------------------------------------------------------
  if (collegeWord && (nbaWord || /\bpros?\b/.test(q)) && TRANSLATE.test(q)) {
    const t = await getJSON("data/draft/translation.json"), rows = unpack(t);
    // Which stats? First match in the college part (before "nba") is the input; a match after "nba" is the outcome.
    const cut = q.search(/\bnba\b/);
    const before = cut > 0 ? q.slice(0, cut) : q, after = cut > 0 ? q.slice(cut) : "";
    const xHit = STAT_WORDS.find(([re]) => re.test(before)) || STAT_WORDS.find(([re]) => re.test(q));
    const yHit = after ? STAT_WORDS.find(([re]) => re.test(after.replace(/^nba/, ""))) : null;
    if (!xHit) return predictorsAnswer(rows, t);
    const x = xHit[1];
    let y = yHit?.[2] || (/\b(success|career|minutes|last|stick)\b/.test(q) ? "N_MIN" : xHit[2]) || "N_MIN";
    if (/\brookie\b/.test(q) && { N_PPG: 1, N_TS: 1 }[y]) y = y === "N_PPG" ? "R_PPG" : "R_TS";
    const ps = pairs(rows, x, y), f = fit(ps);
    if (!f) return null;
    const strength = Math.abs(f.r) < 0.1 ? "almost no" : Math.abs(f.r) < 0.3 ? "a weak" : Math.abs(f.r) < 0.5 ? "a moderate" : "a strong";
    const top = [...ps].sort((a, b) => b.x - a.x).slice(0, 10).map((p) => p.r);
    return { tags: ["College → NBA", `College: ${CX[x][0]}`, `NBA: ${NY[y][0]}`],
      result: { headline: `For ${ps.length} drafted D-I players, ${esc(lc(CX[x][0]))} had <b>${strength} ${f.r >= 0 ? "positive" : "negative"} link</b> with ${esc(lc(NY[y][0]))}: correlation r = <b>${f.r.toFixed(2)}</b>.`,
        html: `<p>${btn(`#/draft/translation?x=${x}&y=${y}`, "See the scatter plot")} ${btn("#/draft/translation", "All college → NBA stats")}</p>`,
        tables: [{ rows: top, rank: false, entity: "players", columns: [
          { key: "NAME", label: `Highest ${CX[x][0].replace(/^College /, "college ")}`, left: true, html: (r) => r.N_GP ? `<a href="#/player/${r.NBA_ID}">${esc(r.NAME)}</a>` : esc(r.NAME) },
          { key: "DRAFT_YEAR", label: "Draft", html: (r) => `<a href="#/draft/history?year=${r.DRAFT_YEAR}">${r.DRAFT_YEAR}</a> #${r.PICK}` },
          { key: "TEAM", label: "College", left: true, html: (r) => `<a href="#/college/player/${r.PID}">${esc(r.TEAM)}</a> ${esc(r.SEASON)}` },
          { key: x, label: "College", html: (r) => CX[x][1](r[x]) }, { key: y, label: "NBA", html: (r) => NY[y][1](NY[y][3] ? (r[y] ?? 0) : r[y]) },
          { key: "TIER", label: "Outcome", left: true, html: (r) => tierText(r.TIER) }] }],
        notes: [`r runs from −1 to +1: ±0.1 is noise, ±0.3 a loose link, ±0.6 strong. Final college season before the draft vs NBA.com regular-season numbers${NY[y][3] ? " (career totals use classes 2008-2020; players who never played count as 0)" : NY[y][2] ? " (players meeting the games/attempts minimum)" : ""}.`,
          "Correlation describes past players; it isn't a forecast for any one prospect.", DEFS],
        sources: SOURCES, footer: `NBA stats through ${esc(t.nba_through)}.` } };
  }
  if (collegeWord && nbaWord && /\b(which|what) (college )?stats?\b/.test(q)) return predictorsAnswer(unpack(await getJSON("data/draft/translation.json")), await getJSON("data/draft/translation.json"));

  const schoolMost = /\b(which|what) (college|school|program|team)s?\b/.test(q) && /\b(most|more)\b/.test(q) && (draftish || (nbaWord && /\b(players?|rotation|starters?|produced?|sent)\b/.test(q)));
  if (!draftish && !schoolMost) return null;
  if (years.some((y) => y < 2008 || y > 2026) && !years.some((y) => y >= 2008 && y <= 2026)) return null;   // 2027 → Model Board answers
  const ix = await index().catch(() => null);
  if (!ix) return null;

  // --- Hit rate for a pick range --------------------------------------------------------------
  const rng = q.match(/\bpicks? (\d{1,2}) (?:to |through |thru )?(\d{1,2})\b/) || q.match(/\b(\d{1,2}) (?:to |through )?(\d{1,2}) picks?\b/);
  const rateQ = /\b(hit rate|success rate|how often|bust|busts|what happens|turn out|turned out|become|chance|odds|how many)\b/.test(q);
  const single = rateQ && !years.length ? q.match(/\b(?:number|no|#|pick) ?(\d{1,2}) picks?\b/) || q.match(/\b(\d{1,2})(?:st|nd|rd|th) (?:overall )?picks?\b/) : null;
  if ((rng || single) && rateQ) {
    const lo = rng ? Math.min(+rng[1], +rng[2]) : +single[1], hi = rng ? Math.max(+rng[1], +rng[2]) : +single[1];
    if (lo < 1 || hi > 60) return null;
    const mature = ix.years.filter((y) => y.mature).map((y) => y.year);
    const files = await Promise.all(mature.map(classFile));
    const xs = files.flatMap((d) => d.picks.filter((p) => p.pick >= lo && p.pick <= hi).map((p) => ({ ...p, year: d.year })));
    const c = (t) => xs.filter((p) => t.includes(p.nba.tier)).length, n = xs.length;
    const sh = (k) => n ? Math.round(100 * k / n) + "%" : "–";
    const best = [...xs].sort((a, b) => (b.nba.career?.min || 0) - (a.nba.career?.min || 0)).slice(0, 10);
    const label = lo === hi ? `No. ${lo} picks` : `Picks ${lo}-${hi}`;
    return { tags: ["Draft history", label, `Classes ${mature[0]}-${mature[mature.length - 1]}`],
      result: { headline: `${label} from the ${mature[0]}-${mature[mature.length - 1]} drafts (${n} players): <b>${sh(c(["rotation", "starter"]))}</b> became rotation players (5,000+ NBA minutes), ${sh(c(["starter"]))} starters, and ${sh(c(["played", "rotation", "starter"]))} played at least one NBA game.`,
        html: `<p>${btn("#/draft/history", "Hit rates for every pick range")}</p>`,
        tables: [{ rows: best, rank: true, entity: "players", columns: [{ key: "year", label: "Class", html: (p) => `<a href="#/draft/history?year=${p.year}">${p.year}</a>` }, ...pickCols()] }],
        notes: [`Only classes with 6+ NBA seasons count, so careers are mostly complete. Table: longest careers by NBA minutes in that range.`, DEFS],
        sources: SOURCES, footer: `NBA stats through ${esc(ix.nba_through)}.` } };
  }

  // --- Which college produced the most picks ---------------------------------------------------
  if (schoolMost) {
    const files = await Promise.all(ix.years.map((y) => classFile(y.year)));
    const all = files.flatMap((d) => d.picks.map((p) => ({ ...p, year: d.year }))).filter((p) => p.college && (!years.length || p.year >= Math.min(...years)));
    const rotOnly = /\b(rotation|nba players|good|successful|starters?)\b/.test(q);
    const by = new Map();
    all.forEach((p) => { const k = p.college.team; const e = by.get(k) || { team: k, team_id: p.college.team_id, picks: 0, first: 0, rotation: 0, names: [] }; e.picks++; e.first += p.round === 1; e.rotation += ["rotation", "starter"].includes(p.nba.tier); e.names.push(p); by.set(k, e); });
    const list = [...by.values()].sort((a, b) => rotOnly ? b.rotation - a.rotation || b.picks - a.picks : b.picks - a.picks || b.first - a.first).slice(0, 15);
    const lead = list[0], since = years.length ? Math.min(...years) : ix.first;
    return { tags: ["Draft history", "Picks by college", `Since ${since}`],
      result: { headline: `<b><a href="#/college/team/${esc(lead.team_id)}">${esc(lead.team)}</a></b> has had the most ${rotOnly ? "draftees become NBA rotation players" : "NBA draft picks"} since ${since}: ${rotOnly ? `${lead.rotation} rotation players from ${lead.picks} picks` : `${lead.picks} picks (${lead.first} in the first round)`}.`,
        html: `<p>${btn("#/draft/history", "Browse draft classes")}</p>`,
        tables: [{ rows: list, rank: true, entity: "teams", columns: [
          { key: "team", label: "College", left: true, html: (e) => `<a href="#/college/team/${esc(e.team_id)}">${esc(e.team)}</a>` },
          { key: "picks", label: "Picks" }, { key: "first", label: "1st round" }, { key: "rotation", label: "Rotation+" },
          { key: "names", label: "Longest NBA career", left: true, html: (e) => { const b = [...e.names].sort((a, c) => (c.nba.career?.min || 0) - (a.nba.career?.min || 0))[0]; return `${playerLink(b)} <span class="muted small">${b.year} #${b.pick}</span>`; } }] }],
        notes: ["Counts the player's final D-I school before the draft (Torvik). Players who skipped college or played abroad aren't counted.", DEFS],
        sources: SOURCES, footer: `Drafts ${since}-${ix.last}.` } };
  }

  // --- An NBA team's picks ("who did the Celtics draft in 2016") or a college's draftees ("Duke draft picks") ---------
  const nbaTeam = NBA_TEAMS.find(([w]) => new RegExp(`\\b${w}\\b`).test(q));
  const yr = years.find((y) => y >= ix.first && y <= ix.last);
  if (nbaTeam && /\b(draft|drafted|pick|picks|picked|select\w*)\b/.test(q) && !/\bpicks? \d/.test(q)) {
    const files = await Promise.all((yr ? [yr] : ix.years.map((y) => y.year)).map(classFile));
    const all = files.flatMap((d) => d.picks.map((p) => ({ ...p, year: d.year }))).filter((p) => nbaTeam[1].split(" ").includes(p.team));
    const rows = yr ? all : [...all].sort((a, b) => (b.nba.career?.min || 0) - (a.nba.career?.min || 0)).slice(0, 15);
    if (!rows.length) return { tags: ["Draft history", nbaTeam[2]], result: { headline: `The ${esc(nbaTeam[2])} made no picks${yr ? ` in ${yr}` : ""} (they may have traded them).`, html: `<p>${btn(`#/draft/history${yr ? `?year=${yr}` : ""}`, "Draft classes")}</p>`, tables: [], notes: ["Picks are credited to the team that made the selection on draft night (NBA.com), before any trades."], sources: SOURCES } };
    return { tags: ["Draft history", nbaTeam[2], yr ? `${yr} draft` : `Drafts ${ix.first}-${ix.last}`],
      result: { headline: yr ? `The ${esc(nbaTeam[2])} made ${rows.length} pick${rows.length > 1 ? "s" : ""} in ${yr}: ${rows.map((p) => `<b>${playerLink(p)}</b> (No. ${p.pick})`).join(", ")}.`
          : `The ${esc(nbaTeam[2])}' longest NBA career among their ${all.length} picks since ${ix.first} belongs to <b>${playerLink(rows[0])}</b> (${rows[0].year}, No. ${rows[0].pick}).`,
        html: `<p>${btn(`#/draft/history${yr ? `?year=${yr}` : ""}`, yr ? `The whole ${yr} class` : "Draft classes")}</p>`,
        tables: [{ rows, rank: !yr, entity: "players", columns: [{ key: "year", label: "Class", html: (p) => `<a href="#/draft/history?year=${p.year}">${p.year}</a>` }, ...pickCols()] }],
        notes: ["Credited to the team that made the selection on draft night (NBA.com), before any trades.", DEFS], sources: SOURCES, footer: `NBA stats through ${esc(ix.nba_through)}.` } };
  }
  if (/\b(draft|drafted|draftees?|picks)\b/.test(q) && !/\bpicks? \d/.test(q) && !/\b(prospects?|board|mock|2027)\b/.test(q)) {
    const files = await Promise.all(ix.years.map((y) => classFile(y.year)));
    const all = files.flatMap((d) => d.picks.map((p) => ({ ...p, year: d.year }))).filter((p) => p.college);
    const schools = [...new Set(all.map((p) => p.college.team))].map((t) => ({ t, w: key(t) })).filter((x) => x.w.length >= 3 && new RegExp(`(^|\\s)${x.w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`).test(q)).sort((a, b) => b.w.length - a.w.length);
    if (schools.length && !NBA_TEAMS.some(([w]) => schools[0].w === w)) {
      const sc = schools[0].t, rows = all.filter((p) => p.college.team === sc && (!yr || p.year === yr)).sort((a, b) => yr ? a.pick - b.pick : (b.nba.career?.min || 0) - (a.nba.career?.min || 0));
      if (rows.length) {
        const rot = rows.filter((p) => ["rotation", "starter"].includes(p.nba.tier)).length;
        return { tags: ["Draft history", `College: ${esc(sc)}`, yr ? `${yr} draft` : `Drafts ${ix.first}-${ix.last}`],
          result: { headline: `${esc(sc)} has had <b>${rows.length}</b> player${rows.length > 1 ? "s" : ""} drafted ${yr ? `in ${yr}` : `since ${ix.first}`} (${rows.filter((p) => p.round === 1).length} in the first round); ${rot} became NBA rotation players. Longest career: <b>${playerLink([...rows].sort((a, b) => (b.nba.career?.min || 0) - (a.nba.career?.min || 0))[0])}</b>.`,
            html: `<p>${btn(`#/college/team/${esc(rows[0].college.team_id)}`, `${esc(sc)} team page`)}</p>`,
            tables: [{ rows, rank: false, entity: "players", columns: [{ key: "year", label: "Class", html: (p) => `<a href="#/draft/history?year=${p.year}">${p.year}</a>` }, ...pickCols()] }],
            notes: ["Counted by the player's final D-I school before the draft (Torvik).", DEFS], sources: SOURCES, footer: `NBA stats through ${esc(ix.nba_through)}.` } };
      }
    }
  }

  // --- A named player: where/when was X drafted -----------------------------------------------
  const names = ix.names.map(([id, name, y, pk]) => ({ id, name, y, pk, w: key(name) })).filter((x) => x.w.length > 4 && new RegExp(`(^|\\s)${x.w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`).test(q))
    .sort((a, b) => b.w.length - a.w.length);
  if (names.length && /\b(drafted|draft|pick|picked|selected)\b/.test(q)) {
    const h = names[0], d = await classFile(h.y), p = d.picks.find((x) => x.nba_id === h.id), k = p.nba.career;
    const c = p.college;
    return { tags: ["Draft history", `${h.y} draft`, `Player: ${esc(p.name)}`],
      result: { headline: `<b>${playerLink(p)}</b> was the <b>No. ${p.pick} pick</b> (round ${p.round}, pick ${p.rpick}) in the <a href="#/draft/history?year=${h.y}">${h.y} NBA draft</a>, by ${esc(p.team_name)}${p.org ? `, from ${c ? `<a href="#/college/player/${c.pid}">${esc(p.org)}</a>` : esc(p.org)}` : ""}.`,
        html: `<p>${btn(`#/draft/history?year=${h.y}`, `The whole ${h.y} class`)}${p.in_nba_data ? " " + btn(`#/player/${p.nba_id}`, "NBA career page") : ""}${c ? " " + btn(`#/college/player/${c.pid}`, "College stats") : ""}</p>`,
        tables: [{ rows: [p], rank: false, entity: "players", columns: pickCols() }],
        notes: [k ? `NBA career so far: ${p.nba.seasons} seasons, ${int(k.gp)} games, ${num(k.ppg)} points, ${num(k.rpg)} rebounds and ${num(k.apg)} assists per game (NBA.com regular season). Re-draft rank in his class by career minutes: ${p.redraft ?? "–"}.` : "No NBA regular-season games yet.",
          c ? `Final college season (${esc(c.season)}, ${esc(c.team)}): ${num(c.pts)} points, ${num(c.reb)} rebounds, ${num(c.ast)} assists, BPM ${num(c.bpm)}.` : "", DEFS].filter(Boolean),
        sources: SOURCES, footer: `NBA stats through ${esc(ix.nba_through)}.` } };
  }

  const year = years.find((y) => y >= ix.first && y <= ix.last);
  if (!year) return null;
  const d = await classFile(year), picks = d.picks;

  // --- Who was drafted Nth in YEAR ------------------------------------------------------------
  const pk = /\b(best|steal|sleeper|value|bust|worst|re ?draft|redo)\b/.test(q) ? null : pickNumber(q);
  if (pk && pk >= 1 && pk <= 60) {
    const p = picks.find((x) => x.pick === pk);
    if (!p) return { tags: ["Draft history", `${year} draft`], result: { headline: `There was no No. ${pk} pick in ${year} (picks were forfeited that year).`, tables: [], notes: [], sources: SOURCES } };
    const k = p.nba.career;
    return { tags: ["Draft history", `${year} draft`, `Pick ${pk}`],
      result: { headline: `The No. ${pk} pick in the ${year} NBA draft was <b>${playerLink(p)}</b>, by ${esc(p.team_name)}${p.org ? ` (from ${p.college ? `<a href="#/college/player/${p.college.pid}">${esc(p.org)}</a>` : esc(p.org)})` : ""}.`,
        html: `<p>${btn(`#/draft/history?year=${year}`, `The whole ${year} class`)}</p>`,
        tables: [{ rows: picks.filter((x) => Math.abs(x.pick - pk) <= 2), rank: false, entity: "players", columns: pickCols() }],
        notes: [k ? `NBA career: ${p.nba.seasons} seasons, ${int(k.gp)} games, ${num(k.ppg)} points per game; outcome: ${tierText(p.nba.tier)}. Re-draft rank by career minutes: ${p.redraft ?? "–"} of ${picks.length}.` : "He hasn't played an NBA regular-season game yet.", DEFS],
        sources: SOURCES, footer: `NBA stats through ${esc(ix.nba_through)}.` } };
  }

  // --- Best pick / steals / re-draft / class summary ------------------------------------------
  const played = picks.filter((p) => p.nba.career);
  const steal = /\b(steal|sleeper|value|late)\b/.test(q);
  const scorer = /\b(scorer|scoring|points)\b/.test(q);
  let rows = steal ? played.filter((p) => p.pick > 20) : played;
  rows = [...rows].sort((a, b) => scorer ? (b.nba.career.gp >= 50) - (a.nba.career.gp >= 50) || b.nba.career.ppg - a.nba.career.ppg : b.nba.career.min - a.nba.career.min).slice(0, 10);
  if (!rows.length) return { tags: ["Draft history", `${year} draft`], result: { headline: `No one from the ${year} class has played an NBA regular-season game yet.`, html: `<p>${btn(`#/draft/history?year=${year}`, `The ${year} class`)}</p>`, tables: [], notes: [], sources: SOURCES } };
  const lead = rows[0], s = d.summary;
  const how = scorer ? "highest career scoring average (50+ games)" : "most career NBA minutes";
  return { tags: ["Draft history", `${year} draft`, steal ? "Best value (picks 21-60)" : scorer ? "Top scorers" : "Longest careers"],
    result: { headline: `${steal ? `The best value pick after No. 20 in ${year}` : `The ${year} draft's top player`} by ${how} is <b>${playerLink(lead)}</b> (No. ${lead.pick}, ${esc(lead.team)}): ${scorer ? `${num(lead.nba.career.ppg)} points per game` : `${int(lead.nba.career.min)} minutes over ${lead.nba.seasons} seasons`}.`,
      html: `<p>${btn(`#/draft/history?year=${year}`, `The whole ${year} class`)}</p>`,
      tables: [{ rows, rank: true, entity: "players", columns: pickCols() }],
      notes: [`“Best” here means ${how} (NBA.com regular season). It measures role and durability, not peak talent; it isn't an opinion.`,
        `${year} class: ${s.played} of ${s.picks} picks played in the NBA, ${s.rotation} became rotation players, ${s.starter} starters.${s.mature ? "" : " This class has fewer than 6 NBA seasons, so it's still changing."}`, DEFS],
      sources: SOURCES, footer: `NBA stats through ${esc(ix.nba_through)}.` } };
}

function predictorsAnswer(rows, t) {
  const mature = rows.filter((r) => r.DRAFT_YEAR <= 2020);
  const list = Object.keys(CX).filter((k) => k !== "PICK").map((k) => {
    const ok = mature.filter((r) => r[k] != null && (!CX[k][2] || CX[k][2](r)));
    const f = fit(ok.map((r) => ({ x: r[k], y: r.N_MIN ?? 0 })));
    return { k, label: CX[k][0], n: ok.length, r: f?.r ?? 0 };
  }).sort((a, b) => Math.abs(b.r) - Math.abs(a.r)).slice(0, 10);
  const pickR = fit(mature.map((r) => ({ x: r.PICK, y: r.N_MIN ?? 0 }))).r;
  return { tags: ["College → NBA", "Career predictors", "Classes 2008-2020"],
    result: { headline: `Among drafted D-I players from 2008-2020, the college number most tied to a long NBA career was <b>${esc(lc(list[0].label))}</b> (r = ${list[0].r.toFixed(2)} with career minutes). None comes close to draft position itself (r = ${pickR.toFixed(2)}).`,
      html: `<p>${btn("#/draft/translation", "Explore college → NBA")}</p>`,
      tables: [{ rows: list, rank: true, entity: "players", columns: [{ key: "label", label: "College stat (final season)", left: true }, { key: "n", label: "Players" }, { key: "r", label: "r with career minutes", html: (x) => (x.r >= 0 ? "+" : "") + x.r.toFixed(2) }] }],
      notes: ["Negative r means lower is better (younger players lasted longer). The College → NBA page also shows which stats mattered beyond draft slot (Model estimate).", "Correlation describes past players; it isn't a forecast."],
      sources: SOURCES, footer: `NBA stats through ${esc(t.nba_through)}.` } };
}
