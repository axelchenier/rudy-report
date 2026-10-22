// sim.js - the Monte Carlo season simulator behind the Playoff Odds tool (js/pages/tools.js).
// EVERYTHING here is a MODEL ESTIMATE. Inputs are real NBA.com data; the model is described in methodNote().
//
// 1. Team strength = point differential per game vs an average team, estimated two ways and blended:
//      prior    = last season's point diff/game x carryover (measured from 270 real team-seasons, see pipeline/fetch_schedule.py)
//      this year = this season's point diff/game so far
//    Blend (a normal-normal Bayesian update): weight on this year grows with games played; the uncertainty shrinks too.
// 2. Each simulated season: draw every team's "true" strength from that uncertainty, then play every remaining
//    scheduled game: home margin ~ Normal(home strength - away strength + home edge, game spread). Positive = home win.
// 3. Seed each conference by wins (ties broken by coin flip, NOT the NBA's full tiebreaker rules),
//    play the Play-In (7v8, 9v10, loser of 7v8 v winner of 9v10) and four best-of-7 rounds (2-2-1-1-1, better seed at home).
// 4. Repeat N times; count how often each thing happened.

// Small, fast random-number generator with a seed (same seed -> same results, so the page doesn't flicker).
export function rng(seed = 12345) {
  let a = seed >>> 0;
  const next = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  let spare = null;
  next.normal = () => {             // Box-Muller
    if (spare != null) { const s = spare; spare = null; return s; }
    let u = 0; while (u === 0) u = next();
    const v = next(), r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  };
  return next;
}

// Standard normal cumulative probability (Abramowitz-Stegun 7.1.26, error < 1.5e-7).
export function phi(z) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

/**
 * Build the inputs. teams = [{ id, name, abbr, conf, W, L, gp, pd (this season diff/game or null), lastPd }]
 * schedule = schedule.json; playedIds = Set of GAME_IDs already played.
 */
export function prepare({ teams, schedule, playedIds, seasonLength = 82 }) {
  const m = schedule.model;
  const tau2 = m.talent_sd ** 2, s2 = m.margin_sd ** 2;
  const index = new Map(teams.map((t, i) => [t.id, i]));
  const out = teams.map((t) => {
    const prior = m.carryover * (t.lastPd ?? 0);
    const precision = 1 / tau2 + t.gp / s2;
    const mean = (prior / tau2 + (t.gp ? t.gp * t.pd / s2 : 0)) / precision;
    return { ...t, prior, rating: mean, ratingSd: Math.sqrt(1 / precision), sched: 0 };
  });
  const games = [];
  for (const [gid, , h, a] of schedule.games) {
    if (playedIds.has(gid) || !index.has(h) || !index.has(a)) continue;
    games.push([index.get(h), index.get(a)]);
    out[index.get(h)].sched++; out[index.get(a)].sched++;
  }
  // NBA Cup knockout games whose teams aren't known yet: fill each team to 82 with "unknown opponent" games.
  out.forEach((t) => { t.unknown = Math.max(0, seasonLength - t.W - t.L - t.sched); });
  return { teams: out, games, model: m };
}

/**
 * Run n simulated seasons. adjust = { teamIndex: +points } (scenario slider).
 * injury = { team: teamIndex, delta: -points, games: N, playoffs: bool }: the team is `delta` points per game weaker in its
 *   next N remaining games (schedule order; unscheduled Cup games last), and in the playoffs too if `playoffs`.
 * onSeason(result) is called after each season with { wins, seeds: {East: [idx...], West: [...]}, playIn } (used by the lottery).
 */
export function simulate(prep, { n = 10000, seed = 2027, adjust = {}, injury = null, onSeason } = {}) {
  const { teams, games, model } = prep;
  const T = teams.length, R = rng(seed), sd = model.margin_sd, edge = model.home_edge;
  const z = (diff) => phi(diff / sd);
  const acc = teams.map(() => ({ wins: [], top6: 0, playin: 0, playoffs: 0, seed1: 0, r2: 0, cf: 0, finals: 0, title: 0, bestRecord: 0 }));
  const strength = new Float64Array(T), wins = new Float64Array(T);
  const homeWin = (h, a) => R() < z(strength[h] - strength[a] + edge);
  const series = (hi, lo) => {           // best of 7, hi has home court: games 1,2,5,7 at hi
    let a = 0, b = 0, g = 0;
    while (a < 4 && b < 4) { const hiHome = [0, 1, 4, 6].includes(g); const hiWins = hiHome ? homeWin(hi, lo) : !homeWin(lo, hi); hiWins ? a++ : b++; g++; }
    return a === 4 ? hi : lo;
  };
  const better = (x, y) => (wins[x] > wins[y] || (wins[x] === wins[y] && strength[x] >= strength[y])) ? [x, y] : [y, x];
  const confs = ["East", "West"];
  const byConf = Object.fromEntries(confs.map((c) => [c, teams.map((t, i) => t.conf === c ? i : -1).filter((i) => i >= 0)]));

  for (let s = 0; s < n; s++) {
    for (let i = 0; i < T; i++) {
      strength[i] = teams[i].rating + teams[i].ratingSd * R.normal() + (adjust[i] || 0);
      wins[i] = teams[i].W;
    }
    let out = injury ? injury.games : 0;           // games the injured player still misses in this simulated season
    const it = injury ? injury.team : -1;
    for (const [h, a] of games) {
      if (out > 0 && (h === it || a === it)) { strength[it] += injury.delta; homeWin(h, a) ? wins[h]++ : wins[a]++; strength[it] -= injury.delta; out--; }
      else homeWin(h, a) ? wins[h]++ : wins[a]++;
    }
    for (let i = 0; i < T; i++) for (let k = 0; k < teams[i].unknown; k++) {
      const d = i === it && out > 0 ? (out--, injury.delta) : 0;
      if (R() < z(strength[i] + d)) wins[i]++;
    }
    if (injury?.playoffs) strength[it] += injury.delta;
    let top = 0; for (let i = 1; i < T; i++) if (wins[i] > wins[top] || (wins[i] === wins[top] && R() < 0.5)) top = i;
    acc[top].bestRecord++;

    const seeds = {}, playIn = {}, champs = {};
    for (const c of confs) {
      const tb = new Map(byConf[c].map((i) => [i, R()]));
      const order = [...byConf[c]].sort((x, y) => wins[y] - wins[x] || tb.get(y) - tb.get(x));
      seeds[c] = order;
      order.slice(0, 6).forEach((i) => { acc[i].top6++; acc[i].playoffs++; });
      order.slice(6, 10).forEach((i) => acc[i].playin++);
      acc[order[0]].seed1++;
      const [s7, s8, s9, s10] = order.slice(6, 10);
      const w78 = homeWin(s7, s8) ? s7 : s8, l78 = w78 === s7 ? s8 : s7;
      const w910 = homeWin(s9, s10) ? s9 : s10;
      const eighth = homeWin(l78, w910) ? l78 : w910;
      acc[w78].playoffs++; acc[eighth].playoffs++;
      playIn[c] = { w78, l78, eighth, s9, s10 };
      const bracket = [order[0], eighth, order[3], order[4], order[2], order[5], order[1], w78];   // 1v8, 4v5, 3v6, 2v7
      const seedNo = new Map(bracket.map((i, k) => [i, [1, 8, 4, 5, 3, 6, 2, 7][k]]));
      const bySeed = (x, y) => seedNo.get(x) < seedNo.get(y) ? [x, y] : [y, x];     // better seed has home court
      let round = [];
      for (let k = 0; k < 8; k += 2) round.push(series(bracket[k], bracket[k + 1]));
      round.forEach((i) => acc[i].r2++);
      round = [series(...bySeed(round[0], round[1])), series(...bySeed(round[2], round[3]))];
      round.forEach((i) => acc[i].cf++);
      champs[c] = series(...bySeed(round[0], round[1]));
      acc[champs[c]].finals++;
    }
    const champ = series(...better(champs.East, champs.West));
    acc[champ].title++;
    for (let i = 0; i < T; i++) acc[i].wins.push(wins[i]);
    if (onSeason) onSeason({ wins, seeds, playIn, strength });
  }
  return teams.map((t, i) => {
    const w = acc[i].wins.sort((a, b) => a - b);
    const pct = (k) => acc[i][k] / n;
    return { ...t, idx: i, projW: w.reduce((a, b) => a + b, 0) / n, w10: w[Math.floor(n * 0.1)], w90: w[Math.floor(n * 0.9)],
      top6: pct("top6"), playin: pct("playin"), playoffs: pct("playoffs"), seed1: pct("seed1"), r2: pct("r2"), cf: pct("cf"),
      finals: pct("finals"), title: pct("title"), bestRecord: pct("bestRecord") };
  });
}
