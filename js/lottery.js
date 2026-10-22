// lottery.js - the NBA's "3-2-1 Lottery" (approved by the Board of Governors on May 28, 2026, for the 2027, 2028 and 2029 Drafts).
// RULES (official sources, both NBA):
//   https://www.nba.com/news/nba-board-governors-approve-new-draft-lottery-system
//   https://pr.nba.com/wp-content/uploads/sites/46/2026/05/NBA-3-2-1-Draft-Lottery.pdf
//   - 16 lottery teams. Non-Playoff, non-Play-In teams: 3 balls each, EXCEPT the three worst records ("draft relegated"): 2 balls.
//   - No. 9 and No. 10 Play-In seeds in each conference: 2 balls. Losers of the 7-vs-8 Play-In games: 1 ball.
//   - Balls are drawn for all first 16 picks. Relegated teams can't fall below No. 12; others can fall to No. 16.
//   - Picks 17-30: the other teams in inverse order of regular-season record.
//   - Pick restrictions (no #1 pick two years in a row, no top-5 pick three years in a row) are NOT modeled here
//     (the NBA's own illustrative odds also assume no team is restricted).
export const LOTTERY_SOURCES = [
  ["NBA.com: Board of Governors approves new Draft Lottery system (May 28, 2026)", "https://www.nba.com/news/nba-board-governors-approve-new-draft-lottery-system"],
  ["NBA Communications: 3-2-1 Lottery fact sheet (PDF)", "https://pr.nba.com/wp-content/uploads/sites/46/2026/05/NBA-3-2-1-Draft-Lottery.pdf"],
];
export const GROUPS = [
  { key: "relegated", label: "Three worst records (draft relegated)", teams: 3, balls: 2 },
  { key: "nonplayin", label: "Remaining non-Play-In teams", teams: 7, balls: 3 },
  { key: "s910", label: "No. 9 and No. 10 Play-In seeds", teams: 4, balls: 2 },
  { key: "l78", label: "Losers of the 7-vs-8 Play-In games", teams: 2, balls: 1 },
];
export const FLOOR = 12;     // worst pick for a relegated team
// The NBA's published illustrative odds (fact sheet PDF), to check this simulator against.
export const OFFICIAL = {
  relegated: { p1: 5.4, top3: 16, top5: 28, top10: 61, avg: 8.1 },
  nonplayin: { p1: 8.1, top3: 24, top5: 39, top10: 73, avg: 7.4 },
  s910: { p1: 5.4, top3: 16, top5: 28, top10: 59, avg: 9.1 },
  l78: { p1: 2.7, top3: 8, top5: 15, top10: 35, avg: 11.7 },
};

/** entries = [{ id, balls, relegated }] (16 of them). Returns the ids in pick order 1..16. R = random() function. */
export function draw(entries, R) {
  const left = [...entries], order = [];
  for (let pick = 1; pick <= entries.length; pick++) {
    const relLeft = left.filter((e) => e.relegated).length;
    // Pick floor: if the relegated teams still undrawn would otherwise fall below No. 12, the pick must go to one of them.
    const pool = relLeft && relLeft >= FLOOR - pick + 1 ? left.filter((e) => e.relegated) : left;
    const total = pool.reduce((a, e) => a + e.balls, 0);
    let x = R() * total, chosen = pool[pool.length - 1];
    for (const e of pool) { x -= e.balls; if (x < 0) { chosen = e; break; } }
    order.push(chosen.id);
    left.splice(left.indexOf(chosen), 1);
  }
  return order;
}

/** Lottery entries from one season's final standings. wins = per-team wins; seeds = {East:[idx..], West:[..]} (best first); playIn = sim playIn. */
export function entriesFrom(wins, seeds, playIn, R) {
  const out = [];
  const nonPlayIn = [...seeds.East.slice(10), ...seeds.West.slice(10)];
  const tb = new Map(nonPlayIn.map((i) => [i, R()]));
  nonPlayIn.sort((a, b) => wins[a] - wins[b] || tb.get(a) - tb.get(b));      // worst first; ties by coin flip
  nonPlayIn.forEach((i, k) => out.push({ id: i, balls: k < 3 ? 2 : 3, relegated: k < 3, group: k < 3 ? "relegated" : "nonplayin" }));
  for (const c of ["East", "West"]) {
    out.push({ id: playIn[c].s9, balls: 2, relegated: false, group: "s910" });
    out.push({ id: playIn[c].s10, balls: 2, relegated: false, group: "s910" });
    out.push({ id: playIn[c].l78, balls: 1, relegated: false, group: "l78" });
  }
  return out;
}

/** Check against the NBA's illustrative odds: draw n lotteries with the standard 16 entries. */
export function checkOdds(n, R) {
  const entries = [];
  GROUPS.forEach((g) => { for (let k = 0; k < g.teams; k++) entries.push({ id: `${g.key}${k}`, balls: g.balls, relegated: g.key === "relegated", group: g.key }); });
  const pos = Object.fromEntries(entries.map((e) => [e.id, new Array(16).fill(0)]));
  for (let s = 0; s < n; s++) draw(entries, R).forEach((id, k) => pos[id][k]++);
  return GROUPS.map((g) => {
    const rows = entries.filter((e) => e.group === g.key).map((e) => pos[e.id]);
    const dist = Array.from({ length: 16 }, (_, k) => rows.reduce((a, r) => a + r[k], 0) / (rows.length * n));
    const cum = (k) => 100 * dist.slice(0, k).reduce((a, b) => a + b, 0);
    return { ...g, dist, p1: cum(1), top3: cum(3), top5: cum(5), top10: cum(10), avg: dist.reduce((a, p, k) => a + p * (k + 1), 0) };
  });
}
