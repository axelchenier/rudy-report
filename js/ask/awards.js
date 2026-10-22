// awards.js (Ask) - NBA award questions, rules only, NBA.com data (data/index/awards.json, made by pipeline/fetch_awards.py):
//   "who won MVP in 2016", "2023 defensive player of the year", "how many MVPs does LeBron have", "most MVPs since 2000",
//   "All-NBA first team 2024", "rookie of the year 2019", "LeBron James awards"
import { esc } from "../ui.js";
import { loadPlayerIndex } from "../data.js";

const NAMES = [["MVP", /\b(mvps?|most valuable player)\b(?!.*\bfinals\b)/, "MVP"], ["FMVP", /\bfinals mvps?\b|\bfinals most valuable\b/, "Finals MVP"],
  ["DPOY", /\b(dpoy|defensive player of the year)\b/, "Defensive Player of the Year"], ["ROY", /\b(roy|rookie of the year)\b/, "Rookie of the Year"],
  ["6MOY", /\b(6moy|sixth man|6th man)\b/, "Sixth Man of the Year"], ["MIP", /\b(mip|most improved)\b/, "Most Improved Player"],
  ["CPOY", /\bclutch player\b/, "Clutch Player of the Year"], ["ALL_NBA", /\ball[- ]nba\b/, "All-NBA"], ["ALL_DEF", /\ball[- ]defens/, "All-Defensive"],
  ["ALL_ROOKIE", /\ball[- ]rookie\b/, "All-Rookie"], ["ALL_STAR", /\ball[- ]stars?\b/, "All-Star"]];
const TEAMWORD = [[/\b(first|1st)[- ]team\b/, 1], [/\b(second|2nd)[- ]team\b/, 2], [/\b(third|3rd)[- ]team\b/, 3]];
const fold = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
let data = null;

export async function awardAnswer(question) {
  const q = fold(question);
  const hits = NAMES.filter(([, re]) => re.test(q));
  const generic = /\bawards?\b/.test(q);
  if (!hits.length && !generic) return null;
  if (/\b(college|ncaa|wooden|naismith)\b/.test(q)) return null;
  if (!data) data = Promise.all([fetch("data/index/awards.json").then((r) => (r.ok ? r.json() : null)), loadPlayerIndex()]);
  const [d, idx] = await data.catch(() => [null, []]);
  if (!d) return null;
  const names = new Map(idx.map((r) => [r.PLAYER_ID, r.PLAYER_NAME]));
  const R = d.rows.map((r) => Object.fromEntries(d.cols.map((c, i) => [c, r[i]]))).map((r) => ({ ...r, NAME: names.get(r.PLAYER_ID) || r.PLAYER_NAME }));
  const seasons = [...new Set(R.map((r) => r.SEASON))].sort();
  const award = hits.find(([k]) => k === "FMVP") || hits[0];
  // Player: full name, else a last name that only one award winner has.
  const people = [...new Map(R.map((r) => [r.PLAYER_ID, r.NAME])).entries()];
  let player = people.filter(([, n]) => q.includes(fold(n))).sort((a, b) => b[1].length - a[1].length)[0];
  if (!player) { const l = people.filter(([, n]) => { const last = fold(n).split(" ").pop(); return last.length >= 4 && new RegExp(`\\b${last}\\b`).test(q); }); if (new Set(l.map((x) => x[0])).size === 1) player = l[0]; }
  const yr = q.match(/\b((?:19|20)\d\d)[-\/](\d\d)\b/) || q.match(/\b((?:19|20)\d\d)\b/);
  let season = null;
  if (yr) season = yr[2] ? `${yr[1]}-${yr[2]}` : `${+yr[1] - 1}-${String(+yr[1] % 100).padStart(2, "0")}`;     // "MVP in 2016" = the 2015-16 award
  if (/\b(last year|last season|this year|latest|reigning|current)\b/.test(q)) season = seasons[seasons.length - 1];
  const dec = q.match(/\b(?:the\s+)?(?:(19|20)(\d)0|['’]?(\d)0)['’]?s\b/);
  const d0 = dec ? (dec[1] ? +`${dec[1]}${dec[2]}0` : (+dec[3] >= 5 ? 1900 : 2000) + 10 * +dec[3]) : null;
  const since = q.match(/\bsince\s+((?:19|20)\d\d)\b/);
  const inSpan = (s) => (d0 != null ? +s.slice(0, 4) >= d0 && +s.slice(0, 4) <= d0 + 9 : since ? +s.slice(0, 4) >= +since[1] - 1 : true);
  const link = (r) => `<a href="#/player/${r.PLAYER_ID}">${esc(r.NAME)}</a>`;
  const out = (tags, headline, tables = [], notes = []) => ({ tags: ["NBA awards", ...tags], result: { headline, tables, notes, html: "", sources: ["NBA.com PlayerAwards"],
    footer: `Awards ${esc(seasons[0])} to ${esc(seasons[seasons.length - 1])} on this site · <a href="#/history/awards${season ? `?season=${season}` : ""}">awards page →</a>` } });
  const missNote = (s) => (d.missing?.[s] ? [`${s} is still being filled in on this site (missing: ${d.missing[s].join(", ")}).`] : []);
  const cols = [{ key: "SEASON", label: "Season", left: true, html: (r) => `<a href="#/history/awards?season=${r.SEASON}">${esc(r.SEASON)}</a>` },
    { key: "NAME", label: "Player", left: true, html: link }, { key: "TEAM", label: "Team", left: true },
    ...(award && ["ALL_NBA", "ALL_DEF", "ALL_ROOKIE"].includes(award[0]) ? [{ key: "TEAM_NUMBER", label: "Team #" }] : [])];

  if (player) {
    const mine = R.filter((r) => r.PLAYER_ID === player[0] && (!award || r.AWARD === award[0]));
    const label = award ? award[2] : "awards";
    if (award) return out([`Player: ${esc(player[1])}`, `Award: ${award[2]}`],
      mine.length ? `<b>${link({ PLAYER_ID: player[0], NAME: player[1] })}</b> has <b>${mine.length}</b> ${esc(label)} ${["ALL_NBA", "ALL_DEF", "ALL_ROOKIE", "ALL_STAR"].includes(award[0]) ? "selection" : "award"}${mine.length === 1 ? "" : "s"} since ${esc(seasons[0])}: ${mine.map((r) => esc(r.SEASON)).join(", ")}.`
        : `${esc(player[1])} hasn't won ${esc(label)} in ${esc(seasons[0])} to ${esc(seasons[seasons.length - 1])}.`, mine.length ? [{ rows: mine, entity: "players", rank: false, columns: cols }] : []);
    const by = new Map(); for (const r of mine) by.set(r.AWARD, [...(by.get(r.AWARD) || []), r.SEASON]);
    const order = NAMES.map(([k, , l]) => [k, l]).filter(([k]) => by.has(k));
    return out([`Player: ${esc(player[1])}`, "All awards"], `<b>${link({ PLAYER_ID: player[0], NAME: player[1] })}</b>: ${order.map(([k, l]) => `${by.get(k).length}× ${esc(l)}`).join(", ") || "no season awards on this site"}.`,
      [{ rows: order.map(([k, l]) => ({ AWARD: l, N: by.get(k).length, SEASONS: by.get(k).join(", ") })), entity: "players", rank: false, columns: [
        { key: "AWARD", label: "Award", left: true }, { key: "N", label: "Times" }, { key: "SEASONS", label: "Seasons", left: true }] }]);
  }
  if (!award) return null;
  if (season && !/\b(most|how many)\b/.test(q)) {
    const tn = TEAMWORD.find(([re]) => re.test(q))?.[1];
    const w = R.filter((r) => r.SEASON === season && r.AWARD === award[0] && (!tn || r.TEAM_NUMBER === tn));
    if (!seasons.includes(season)) return out([`Award: ${award[2]}`], `${esc(season)} isn't covered: awards on this site run ${esc(seasons[0])} to ${esc(seasons[seasons.length - 1])}.`);
    if (!w.length) return out([`Award: ${award[2]}`, `Season: ${season}`], `No ${esc(award[2])} found for ${esc(season)} on this site.`, [], missNote(season));
    return out([`Award: ${award[2]}`, `Season: ${season}`, ...(tn ? [`${["", "1st", "2nd", "3rd"][tn]} team`] : [])],
      w.length === 1 ? `<b>${link(w[0])}</b> (${esc(w[0].TEAM)}) won the ${esc(season)} ${esc(award[2])}.` : `${esc(season)} ${esc(award[2])}${tn ? ` ${["", "1st", "2nd", "3rd"][tn]} team` : ""}: ${w.map(link).join(", ")}.`,
      [{ rows: w, entity: "players", rank: false, columns: cols }], missNote(season));
  }
  // Most / list of winners.
  const w = R.filter((r) => r.AWARD === award[0] && inSpan(r.SEASON));
  const m = new Map(); for (const r of w) m.set(r.PLAYER_ID, { ...r, N: (m.get(r.PLAYER_ID)?.N || 0) + 1 });
  const ranked = [...m.values()].sort((a, b) => b.N - a.N);
  if (!ranked.length) return out([`Award: ${award[2]}`], `No ${esc(award[2])} winners on this site for that span.`);
  const gaps = seasons.filter((x) => inSpan(x) && d.missing?.[x]?.includes(award[0]));
  const span = d0 != null ? `in the ${d0}s` : since ? `since ${since[1]}` : `since ${seasons[0]}`;
  return out([`Award: ${award[2]}`, span], `${gaps.length ? "So far on this site, most" : "Most"} ${esc(award[2])} ${["ALL_NBA", "ALL_DEF", "ALL_ROOKIE", "ALL_STAR"].includes(award[0]) ? "selections" : "awards"} ${span}: <b>${ranked.filter((r) => r.N === ranked[0].N).map(link).join(", ")}</b> (${ranked[0].N}).`,
    [{ title: "Most", rows: ranked.slice(0, 20), entity: "players", rank: true, sortKey: "N", columns: [{ key: "NAME", label: "Player", left: true, html: link }, { key: "N", label: "Times" }] },
     ...(["ALL_NBA", "ALL_DEF", "ALL_ROOKIE", "ALL_STAR"].includes(award[0]) ? [] : [{ title: "Every winner", rows: w.sort((a, b) => b.SEASON.localeCompare(a.SEASON)), entity: "players", rank: false, columns: cols }])],
    gaps.length ? [`Counts may be low: ${esc(award[2])} is still being filled in for ${gaps.length} season${gaps.length === 1 ? "" : "s"} in this span (${gaps.map(esc).join(", ")}).`] : []);
}
