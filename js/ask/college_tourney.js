// college_tourney.js (Ask) - NCAA men's tournament questions from the saved ESPN brackets (data/college/brackets/, 2008-2026;
// pipeline/college_bracket.py). Rules only.
//   "who won the 2016 NCAA tournament", "2019 Final Four", "NCAA champions since 2010", "Duke NCAA tournament history",
//   "how many national titles has UConn won", "Gonzaga in the 2021 tournament", "most Final Fours since 2008",
//   "biggest upsets in the 2023 tournament", "16 seeds that beat a 1 seed", "12 seed vs 5 seed record", "how do 1 seeds do"
import { esc } from "../ui.js";

const cache = new Map();
const getJSON = (p) => { if (!cache.has(p)) cache.set(p, fetch(p).then((r) => { if (!r.ok) throw new Error(`Could not load ${p}`); return r.json(); })); return cache.get(p); };
const ROUND = ["", "First round (R64)", "Second round (R32)", "Sweet 16", "Elite Eight", "Final Four", "Championship"];
const FINISH = ["Lost in R64", "Lost in R32", "Sweet 16", "Elite Eight", "Final Four", "Runner-up", "Champion"];
const SOURCES = ["ESPN scoreboard (site.api.espn.com): NCAA tournament seeds, regions and results"];
const TOUR = /\b(ncaa tournament|ncaa tourney|march madness|tournament|tourney|final fours?|elite (?:eight|8)|sweet (?:sixteen|16)|national (?:champ\w*|titles?)|ncaa (?:titles?|champ\w*)|championships?|champions?|champs|won it all|title game|brackets?|cinderellas?|upsets?|\d+ seeds?|seeds?)\b/;
const btn = (href, label) => `<a class="btn" href="${href}">${label} →</a>`;
const tLink = (id, name, year) => `<a href="#/college/team/${esc(id)}?season=${year - 1}-${String(year).slice(2)}">${esc(name)}</a>`;
const yearsNote = (years) => `Saved brackets: ${years[years.length - 1]}-${years[0]} (no 2020 tournament: canceled for COVID-19). First Four games are not counted as tournament games here.`;

async function load() {
  const ix = await getJSON("data/college/brackets/index.json");
  const years = [...ix.years].sort((a, b) => b - a);
  const files = await Promise.all(years.map((y) => getJSON(`data/college/brackets/${y}.json`)));
  return { years, B: new Map(files.map((d) => [d.year, d])) };
}
const team = (d, id) => d.teams.find((t) => t.team_id === id) || { team_id: id, name: id, seed: null };
const gameText = (d, g) => { const w = team(d, g.winner), l = team(d, g.winner === g.a ? g.b : g.a), ws = g.winner === g.a ? g.sa : g.sb, ls = g.winner === g.a ? g.sb : g.sa;
  return `(${w.seed}) ${esc(w.name)} ${ws}-${ls} (${l.seed}) ${esc(l.name)}`; };

function findYear(q, years) {
  const m = q.match(/\b(20\d\d)\s+(\d\d)\b/);                              // "2015-16" (normalized to "2015 16")
  if (m && +m[2] === (+m[1] + 1) % 100) return 2000 + +m[2];
  const y = q.match(/\b(20\d\d|19\d\d)\b/);
  if (y) return +y[1];
  if (/\b(last year|last season|this year|most recent|latest|last)\b/.test(q) && !/\blast (?:won|win|title|final four|time)\b/.test(q)) return years[0];
  return null;
}

/** q = normalized question; teams = [{team: Torvik name}] found by the college parser; teamId(name) -> Torvik slug. */
export async function tourneyAnswer(q, teams, teamId) {
  if (!TOUR.test(q) || /\b(conference|conf) (tournament|tourney)\b|\btournament sim|\bsimulat/.test(q)) return null;
  if (/\bseeds?\b/.test(q) && !/\b(ncaa|tournament|tourney|march madness|seeds? (?:vs|versus|against|beat|over|v)|\d+ seeds?)\b/.test(q)) return null;
  const { years, B } = await load();
  let year = findYear(q.replace(/\b(?:since|after|from)\s+20\d\d\b/, " "), years);
  const tagBase = ["College (NCAA D-I)", "NCAA tournament"];
  const out = (tags, result) => ({ tags: [...tagBase, ...tags], result: { tables: [], notes: [], sources: SOURCES, footer: "", ...result, notes: [...(result.notes || []), yearsNote(years)] } });
  if (year && !B.has(year)) {
    if (year === 2020) return out(["2020"], { headline: "There was no 2020 NCAA tournament: it was canceled in March 2020 because of COVID-19." });
    if (year < years[years.length - 1] || year > years[0]) return out([`${year}`], { headline: `The saved NCAA brackets cover ${years[years.length - 1]} to ${years[0]}, so ${year} isn't available here.` });
  }
  if (!year && /\b(who won|winner|who is the (?:reigning|defending)|reigning|defending)\b/.test(q) && !/\b(list|every|all|since|each|history|most)\b/.test(q)) year = years[0];
  const ids = teams.map((t) => ({ name: t.team, id: teamId(t.team) })).filter((t) => t.id);
  const yrs = (year ? [year] : years).filter((y) => B.has(y));
  const since = q.match(/\b(?:since|after|from)\s+(20\d\d)\b/);
  const pool = since ? years.filter((y) => y >= +since[1]) : yrs;

  // ---- upsets: "biggest upsets in 2023", "16 seeds that beat a 1 seed", "15 over 2" ------------------------------
  const sv = q.match(/\b(\d{1,2})\s*(?:seeds?)?\s*(?:(?:that|who|to)\s+)?(?:vs|versus|against|v|over|beat|beats|beating|upset|upsets|upsetting)\s*(?:an?\s+|the\s+)?(\d{1,2})\s*seeds?\b/);
  if (/\b(upsets?|cinderellas?)\b/.test(q) || (sv && /\b(beat|beats|over|upset|upsets)\b/.test(q))) {
    const lo = sv ? Math.max(+sv[1], +sv[2]) : null, hi = sv ? Math.min(+sv[1], +sv[2]) : null;
    const rows = [];
    for (const y of (sv && !year ? years : pool)) {
      const d = B.get(y);
      for (const g of d.results) {
        const w = team(d, g.winner), l = team(d, g.winner === g.a ? g.b : g.a);
        if (w.seed == null || l.seed == null) continue;
        if (sv ? (w.seed === lo && l.seed === hi) : w.seed - l.seed >= 5) rows.push({ year: y, round: g.round, diff: w.seed - l.seed, w, l, ws: g.winner === g.a ? g.sa : g.sb, ls: g.winner === g.a ? g.sb : g.sa });
      }
    }
    rows.sort((a, b) => b.diff - a.diff || b.round - a.round || b.year - a.year);
    const scope = year ? `the ${year} tournament` : since ? `the tournaments since ${since[1]}` : `the ${years[years.length - 1]}-${years[0]} tournaments`;
    const headline = sv ? (rows.length ? `${lo} seeds beat ${hi} seeds <b>${rows.length}</b> time${rows.length > 1 ? "s" : ""} in ${scope}.` : `No ${lo} seed beat a ${hi} seed in ${scope}.`)
      : rows.length ? `${rows.length} upsets by 5+ seed lines in ${scope}. Biggest: ${rows[0].year} ${ROUND[rows[0].round]}, (${rows[0].w.seed}) ${esc(rows[0].w.name)} ${rows[0].ws}-${rows[0].ls} (${rows[0].l.seed}) ${esc(rows[0].l.name)}.` : `No upsets by 5+ seed lines in ${scope}.`;
    return out(["Upsets", year ? `${year}` : "All years"], { headline,
      tables: rows.length ? [{ rows: rows.slice(0, 100), columns: [{ key: "year", label: "Year" }, { key: "round", label: "Round", left: true, html: (r) => ROUND[r.round] },
        { key: "wseed", label: "Seed", html: (r) => r.w.seed }, { key: "wname", label: "Winner", left: true, html: (r) => tLink(r.w.team_id, r.w.name, r.year) },
        { key: "score", label: "Score", html: (r) => `${r.ws}-${r.ls}` }, { key: "lseed", label: "Seed", html: (r) => r.l.seed }, { key: "lname", label: "Loser", left: true, html: (r) => tLink(r.l.team_id, r.l.name, r.year) },
        { key: "diff", label: "Seed gap" }] }] : [],
      notes: sv ? [] : ["Upset = the winner was seeded at least 5 lines worse than the loser."] });
  }

  // ---- seed records: "12 seed vs 5 seed record", "how do 1 seeds do" ---------------------------------------------
  const vs = q.match(/\b(\d{1,2})\s*seeds?\s*(?:vs|versus|against|v)\s*(?:an?\s+|the\s+)?(\d{1,2})\s*(?:seeds?)?\b/);
  const one = !vs && q.match(/\b(\d{1,2})\s*seeds?\b/);
  if (vs || (one && !ids.length)) {
    if (vs) {
      const a = +vs[1], b = +vs[2]; let w = 0, l = 0; const games = [];
      for (const y of pool) { const d = B.get(y); for (const g of d.results) { const A = team(d, g.a), Bt = team(d, g.b);
        const sa = [A.seed, Bt.seed]; if (!(sa.includes(a) && sa.includes(b)) || a === b) continue;
        const win = team(d, g.winner).seed === a; win ? w++ : l++; games.push({ year: y, round: g.round, text: gameText(d, g) }); } }
      return out(["Seed matchup", `${a} vs ${b}`], { headline: games.length ? `${a} seeds are <b>${w}-${l}</b> against ${b} seeds in ${since ? `tournaments since ${since[1]}` : year ? `${year}` : `${years[years.length - 1]}-${years[0]}`} (${(100 * w / (w + l)).toFixed(0)}% wins).` : `No ${a} vs ${b} seed games in that span.`,
        tables: games.length ? [{ rows: games.sort((x, y) => y.year - x.year), columns: [{ key: "year", label: "Year" }, { key: "round", label: "Round", left: true, html: (r) => ROUND[r.round] }, { key: "text", label: "Result", left: true, html: (r) => r.text }] }] : [] });
    }
    const s = +one[1]; if (s < 1 || s > 16) return null;
    const by = [0, 0, 0, 0, 0, 0, 0]; let n = 0;
    for (const y of pool) for (const t of B.get(y).teams) if (t.seed === s) { by[Math.min(6, t.wins)]++; n++; }
    const reach = (k) => by.slice(k).reduce((a, b) => a + b, 0);
    return out(["Seed results", `${s} seeds`], { headline: `${n} teams were ${s} seeds in ${pool.length > 1 ? `${pool[pool.length - 1]}-${pool[0]}` : pool[0]}: ${reach(1)} won a game, ${reach(2)} made the Sweet 16, ${reach(4)} the Final Four and <b>${by[6]}</b> won the title.`,
      tables: [{ rows: FINISH.map((f, i) => ({ f, n: by[i], p: n ? by[i] / n : 0 })), columns: [{ key: "f", label: "Finish", left: true }, { key: "n", label: "Teams" }, { key: "p", label: "Share", html: (r) => (r.p * 100).toFixed(0) + "%" }] }] });
  }

  // ---- one team: history or a single year's run ------------------------------------------------------------------
  if (ids.length) {
    const t = ids[0];
    if (year && B.has(year)) {
      const d = B.get(year), me = d.teams.find((x) => x.team_id === t.id);
      if (!me) return out([t.name, `${year}`], { headline: `${esc(t.name)} wasn't in the ${year} NCAA tournament field (64 teams after the First Four).` });
      const games = d.results.filter((g) => g.a === t.id || g.b === t.id).sort((a, b) => a.round - b.round);
      return out([t.name, `${year}`], { headline: `${esc(me.name)} (${me.seed} seed, ${esc(me.region)}) in ${year}: <b>${FINISH[Math.min(6, me.wins)]}</b>, ${me.wins}-${games.length - me.wins} in the tournament.`,
        html: `<p>${btn(`#/college/tournament?year=${year}`, `The ${year} bracket`)}</p>`,
        tables: [{ rows: games.map((g) => ({ round: g.round, text: gameText(d, g), won: g.winner === t.id })), columns: [{ key: "round", label: "Round", left: true, html: (r) => ROUND[r.round] }, { key: "won", label: "W/L", html: (r) => r.won ? "W" : "L" }, { key: "text", label: "Result", left: true, html: (r) => r.text }] }] });
    }
    const runs = pool.map((y) => { const d = B.get(y), me = d.teams.find((x) => x.team_id === t.id); return me ? { year: y, seed: me.seed, region: me.region, wins: me.wins, losses: me.wins >= 6 ? 0 : 1, name: me.name } : null; }).filter(Boolean);
    const W = runs.reduce((a, r) => a + r.wins, 0), L = runs.reduce((a, r) => a + r.losses, 0);
    const titles = runs.filter((r) => r.wins >= 6).map((r) => r.year), ff = runs.filter((r) => r.wins >= 4).map((r) => r.year);
    const span = since ? `since ${since[1]}` : `${pool[pool.length - 1]}-${pool[0]}`;
    return out([t.name, "Tournament history"], { headline: runs.length ? `${esc(t.name)} in the NCAA tournament, ${span}: <b>${runs.length}</b> appearances, ${W}-${L} record, ${ff.length} Final Four${ff.length === 1 ? "" : "s"}${ff.length ? ` (${ff.join(", ")})` : ""}, <b>${titles.length}</b> title${titles.length === 1 ? "" : "s"}${titles.length ? ` (${titles.join(", ")})` : ""}.` : `${esc(t.name)} didn't make the NCAA tournament field ${span}.`,
      tables: runs.length ? [{ rows: runs, columns: [{ key: "year", label: "Year", html: (r) => `<a href="#/college/tournament?year=${r.year}">${r.year}</a>` }, { key: "seed", label: "Seed" }, { key: "region", label: "Region", left: true },
        { key: "wins", label: "W" }, { key: "finish", label: "Finish", left: true, html: (r) => FINISH[Math.min(6, r.wins)] }] }] : [],
      notes: ["Titles and Final Fours before 2008 are not in the saved brackets."] });
  }

  // ---- leaderboards: "most titles / Final Fours / tournament wins / appearances since 2008" ------------------------
  const most = /\b(most|which (?:team|school|program)s?|who has|leaders?|best programs?)\b/.test(q);
  if (most && !year) {
    const by = new Map();
    for (const y of pool) for (const t of B.get(y).teams) {
      const r = by.get(t.team_id) || { id: t.team_id, name: t.name, apps: 0, wins: 0, ff: 0, titles: 0, s16: 0, last: y };
      r.apps++; r.wins += t.wins; if (t.wins >= 2) r.s16++; if (t.wins >= 4) r.ff++; if (t.wins >= 6) r.titles++; r.name = by.has(t.team_id) ? r.name : t.name; by.set(t.team_id, r);
    }
    const k = /\bfinal fours?\b/.test(q) ? "ff" : /\b(champ\w*|titles?|won it all)\b/.test(q) ? "titles" : /\bsweet (?:sixteen|16)\b/.test(q) ? "s16" : /\b(appearances?|bids?|made|times in)\b/.test(q) ? "apps" : "wins";
    const label = { ff: "Final Fours", titles: "titles", s16: "Sweet 16s", apps: "tournament appearances", wins: "tournament wins" }[k];
    const rows = [...by.values()].sort((a, b) => b[k] - a[k] || b.wins - a.wins).filter((r) => r[k] > 0).slice(0, 25);
    const top = rows.filter((r) => r[k] === rows[0][k]);
    return out(["Most " + label, since ? `Since ${since[1]}` : `${pool[pool.length - 1]}-${pool[0]}`], { headline: `Most ${label} ${since ? `since ${since[1]}` : `in ${pool[pool.length - 1]}-${pool[0]}`}: ${top.map((r) => `<b>${esc(r.name)}</b>`).join(", ")} with ${rows[0][k]}.`,
      tables: [{ rows, rank: true, columns: [{ key: "name", label: "Team", left: true, html: (r) => `<a href="#/college/team/${esc(r.id)}">${esc(r.name)}</a>` }, { key: "titles", label: "Titles" }, { key: "ff", label: "Final Fours" },
        { key: "s16", label: "Sweet 16s" }, { key: "apps", label: "Appearances" }, { key: "wins", label: "Wins" }] }] });
  }

  // ---- champion / Final Four of a year, or the list of champions ---------------------------------------------------
  if (!year) {
    const rows = pool.map((y) => { const d = B.get(y), fin = d.results.find((g) => g.round === 6), c = team(d, d.champion), r = fin ? team(d, fin.winner === fin.a ? fin.b : fin.a) : null;
      const ffs = d.teams.filter((t) => t.wins >= 4).map((t) => t.name);
      return { year: y, c, r, score: fin ? `${Math.max(fin.sa, fin.sb)}-${Math.min(fin.sa, fin.sb)}` : "–", ff: ffs.join(", ") }; });
    return out(["Champions", since ? `Since ${since[1]}` : `${pool[pool.length - 1]}-${pool[0]}`], { headline: `NCAA men's champions ${since ? `since ${since[1]}` : `${pool[pool.length - 1]}-${pool[0]}`}: latest is <b>${esc(rows[0].c.name)}</b> (${rows[0].year}).`,
      tables: [{ rows, columns: [{ key: "year", label: "Year", html: (r) => `<a href="#/college/tournament?year=${r.year}">${r.year}</a>` }, { key: "champ", label: "Champion", left: true, html: (r) => `${tLink(r.c.team_id, r.c.name, r.year)} <span class="muted small">(${r.c.seed})</span>` },
        { key: "score", label: "Final" }, { key: "ru", label: "Runner-up", left: true, html: (r) => r.r ? `${tLink(r.r.team_id, r.r.name, r.year)} <span class="muted small">(${r.r.seed})</span>` : "–" }, { key: "ff", label: "Final Four", left: true }] }] });
  }
  if (year && B.has(year)) {
    const d = B.get(year), c = team(d, d.champion), fin = d.results.find((g) => g.round === 6), ru = fin ? team(d, fin.winner === fin.a ? fin.b : fin.a) : null;
    const late = d.results.filter((g) => g.round >= (/\belite (?:eight|8)\b/.test(q) ? 4 : 5)).sort((a, b) => b.round - a.round);
    const ffTeams = d.teams.filter((t) => t.wins >= 4).sort((a, b) => b.wins - a.wins);
    const isFF = /\bfinal fours?\b/.test(q) && !/\b(won|win|champ\w*|title)\b/.test(q);
    const cs = fin ? (fin.winner === fin.a ? `${fin.sa}-${fin.sb}` : `${fin.sb}-${fin.sa}`) : "";
    const headline = isFF ? `The ${year} Final Four: ${ffTeams.map((t) => `<b>${esc(t.name)}</b> (${t.seed}, ${esc(t.region)})`).join(", ")}. ${esc(c.name)} won the title.`
      : `<b>${esc(c.name)}</b> (${c.seed} seed, ${esc(c.region)}) won the ${year} NCAA tournament${ru ? `, beating ${esc(ru.name)} (${ru.seed}) ${cs} in the title game` : ""}.`;
    return out([`${year}`, isFF ? "Final Four" : "Champion"], { headline, html: `<p>${btn(`#/college/tournament?year=${year}`, `The ${year} bracket`)}</p>`,
      tables: [{ title: "Final rounds", rows: late.map((g) => ({ round: g.round, text: gameText(d, g) })), columns: [{ key: "round", label: "Round", left: true, html: (r) => ROUND[r.round] }, { key: "text", label: "Result", left: true, html: (r) => r.text }] }] });
  }
  return null;
}
