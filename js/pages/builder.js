// builder.js - Lineup Builder (Tools page, #/tools/lineup). Pick any five players from a team's roster.
//  - REAL: if NBA.com has that exact 5-man lineup (10+ minutes), its actual ratings are shown.
//  - MODEL ESTIMATE: net rating estimated from the 10 two-man pairs inside it (NBA.com 2-man lineup data, 50+ minutes),
//    each pair's net rating pulled toward the team's net rating by how few minutes it has; pairs with no data use the two
//    players' on-court team net ratings (NBA.com on/off).
//  - Lineup traits: sums/averages of the five players' real per-36 and rate stats, next to a typical NBA starting five.
import { load, SEASONS, META } from "../data.js";
import { fmt } from "../stats.js";
import { esc, modelBadge, unpack } from "../ui.js";
import { onOffRows } from "./lineups.js";

const SHRINK = 300;          // minutes at which a pair's own net rating gets half the weight (the rest goes to the team's)
const p36 = (p, k) => p.MIN ? p[k] / p.MIN * 36 : 0;
const net = (v) => v == null ? "–" : `<span class="${v > 0 ? "pos" : v < 0 ? "neg" : ""}">${v > 0 ? "+" : ""}${v.toFixed(1)}</span>`;

const TRAITS = [
  ["Usage (sum of USG%)", (ps) => ps.reduce((a, p) => a + 100 * p.USG_PCT, 0), (v) => v.toFixed(0) + "%", "A real lineup's usage sums to about 100% (every possession ends with someone)."],
  ["3PA per 36 (sum)", (ps) => ps.reduce((a, p) => a + p36(p, "FG3A"), 0), (v) => v.toFixed(1), "Spacing proxy: how many threes these five take per 36 minutes each."],
  ["3P% (weighted)", (ps) => { const a = ps.reduce((s, p) => s + p.FG3A, 0); return a ? ps.reduce((s, p) => s + p.FG3M, 0) / a : 0; }, (v) => (100 * v).toFixed(1) + "%", ""],
  ["True shooting % (avg)", (ps) => ps.reduce((a, p) => a + p.TS_PCT, 0) / ps.length, (v) => (100 * v).toFixed(1) + "%", ""],
  ["Assists per 36 (sum)", (ps) => ps.reduce((a, p) => a + p36(p, "AST"), 0), (v) => v.toFixed(1), ""],
  ["Turnovers per 36 (sum)", (ps) => ps.reduce((a, p) => a + p36(p, "TOV"), 0), (v) => v.toFixed(1), ""],
  ["Rebounds per 36 (sum)", (ps) => ps.reduce((a, p) => a + p36(p, "REB"), 0), (v) => v.toFixed(1), ""],
  ["Blocks per 36 (sum)", (ps) => ps.reduce((a, p) => a + p36(p, "BLK"), 0), (v) => v.toFixed(1), ""],
  ["Steals per 36 (sum)", (ps) => ps.reduce((a, p) => a + p36(p, "STL"), 0), (v) => v.toFixed(1), ""],
];

export async function builderTool(box, params) {
  const seasons = SEASONS();
  const season = seasons.includes(params.get("season")) ? params.get("season") : META.default_season;
  const [players, teams, lineupsRaw] = await Promise.all([load("players", season), load("teams", season),
    fetch(`data/${season}/lineups.json`).then((r) => r.ok ? r.json() : null).catch(() => null)]);
  if (!lineupsRaw) { box.innerHTML = `<p class="muted">No lineup data for ${esc(season)}.</p>`; return; }
  const lineups = unpack(lineupsRaw);
  const teamList = [...teams].sort((a, b) => a.TEAM_NAME.localeCompare(b.TEAM_NAME));
  const teamId = +params.get("team") || teams.find((t) => t.TEAM_ABBREVIATION === "MIN")?.TEAM_ID || teamList[0].TEAM_ID;
  const team = teams.find((t) => t.TEAM_ID === teamId) || teamList[0];
  const roster = players.filter((p) => p.TEAM_ID === team.TEAM_ID).sort((a, b) => b.GP * b.MIN - a.GP * a.MIN);
  const mine = lineups.filter((l) => l.TEAM_ID === team.TEAM_ID);
  const onoff = await onOffRows(season, team.TEAM_ID).catch(() => []);
  const onNet = new Map(onoff.map((r) => [r.PLAYER_ID, { net: r.ON_NET, min: r.ON_MIN }]));

  // Typical NBA starting five: each team's five most-used players, trait averaged over teams.
  const typical = TRAITS.map(([, f]) => {
    const vals = teams.map((t) => players.filter((p) => p.TEAM_ID === t.TEAM_ID).sort((a, b) => b.GP * b.MIN - a.GP * a.MIN).slice(0, 5)).filter((ps) => ps.length === 5).map(f);
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  });

  let picked = (params.get("ids") || "").split(",").map(Number).filter((id) => roster.some((p) => p.PLAYER_ID === id));
  if (picked.length !== 5) {
    const top = mine.filter((l) => l.N === 5).sort((a, b) => b.MIN - a.MIN)[0];
    picked = top ? top.GROUP_ID.split("-").map(Number).filter((id) => roster.some((p) => p.PLAYER_ID === id)) : roster.slice(0, 5).map((p) => p.PLAYER_ID);
  }

  box.innerHTML = `
    <div class="page-head"><div><h1>Lineup builder</h1>
      <p class="sub">${esc(season)} · pick any five players from one roster: real NBA.com results when that five actually played, plus a ${modelBadge("")} when it didn't.</p></div></div>
    <div class="card toolbar sim-controls">
      <label>Season <select id="lb-season">${seasons.map((s) => `<option ${s === season ? "selected" : ""}>${s}</option>`).join("")}</select></label>
      <label>Team <select id="lb-team">${teamList.map((t) => `<option value="${t.TEAM_ID}" ${t.TEAM_ID === team.TEAM_ID ? "selected" : ""}>${esc(t.TEAM_NAME)}</option>`).join("")}</select></label>
      <span class="muted small">Team net rating ${net(team.NET_RATING)} · ${roster.length} players</span></div>
    <div class="lb-grid">
      <div class="card"><h3>Roster <span class="muted small">(tick 5)</span></h3><div id="lb-roster" class="lb-roster">${roster.map((p) => `
        <label><input type="checkbox" value="${p.PLAYER_ID}" ${picked.includes(p.PLAYER_ID) ? "checked" : ""}> ${esc(p.PLAYER_NAME)}
          <span class="muted small">${p.GP} G · ${p.MIN.toFixed(1)} MPG</span></label>`).join("")}</div></div>
      <div id="lb-out"></div>
    </div>
    <div class="card method"><b>${modelBadge("")} How the estimate works.</b>
      <p class="small">A five-man lineup contains 10 two-man pairs. For each pair, NBA.com's 2-man lineup data (pairs with 50+ minutes) gives the team's net rating with both on the floor.
      Each pair's number is pulled toward the team's season net rating: weight = minutes ÷ (minutes + ${SHRINK}), so small samples count less.
      A pair with no data uses the average of the two players' on-court team net ratings (NBA.com on/off), with the same pull.
      The estimate is the average of the 10 pair values. It's a simple heuristic: it ignores opponents, garbage time and how the five fit together beyond their pairs.
      Traits are the real season stats of the five players; the "typical starting five" is each team's five most-used players, averaged over the league.</p>
      <p class="muted small">Data: NBA.com/stats LeagueDashLineups (5-man and 2-man), TeamPlayerOnOffSummary, LeagueDashPlayerStats, via nba_api.</p></div>`;

  const out = box.querySelector("#lb-out");
  const go = (extra) => {
    const p = new URLSearchParams({ season, team: team.TEAM_ID, ...extra });
    location.hash = `#/tools/lineup?${p}`;
  };
  box.querySelector("#lb-season").addEventListener("change", (e) => go({ season: e.target.value, team: team.TEAM_ID }));
  box.querySelector("#lb-team").addEventListener("change", (e) => go({ team: e.target.value }));

  function draw() {
    picked = [...box.querySelectorAll("#lb-roster input:checked")].map((i) => +i.value);
    box.querySelectorAll("#lb-roster input").forEach((i) => { i.disabled = picked.length >= 5 && !i.checked; });
    history.replaceState(null, "", `#/tools/lineup?season=${season}&team=${team.TEAM_ID}&ids=${picked.join(",")}`);
    if (picked.length !== 5) { out.innerHTML = `<div class="card"><p class="muted">Pick ${5 - picked.length} more player${5 - picked.length === 1 ? "" : "s"}.</p></div>`; return; }
    const ps = picked.map((id) => roster.find((p) => p.PLAYER_ID === id));
    const key = [...picked].sort((a, b) => a - b).join("-");
    const real = mine.find((l) => l.N === 5 && l.GROUP_ID.split("-").map(Number).sort((a, b) => a - b).join("-") === key);
    const pairs = [];
    for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) {
      const a = ps[i], b = ps[j];
      const k2 = [a.PLAYER_ID, b.PLAYER_ID].sort((x, y) => x - y).join("-");
      const pr = mine.find((l) => l.N === 2 && l.GROUP_ID.split("-").map(Number).sort((x, y) => x - y).join("-") === k2);
      let raw, min, src;
      if (pr) { raw = pr.NET_RATING; min = pr.MIN; src = "pair"; }
      else {
        const oa = onNet.get(a.PLAYER_ID), ob = onNet.get(b.PLAYER_ID);
        if (oa && ob) { raw = (oa.net + ob.net) / 2; min = Math.min(oa.min, ob.min); src = "on/off"; } else { raw = team.NET_RATING; min = 0; src = "team"; }
      }
      const w = min / (min + SHRINK);
      pairs.push({ a, b, raw, min, src, est: team.NET_RATING + (raw - team.NET_RATING) * w });
    }
    const est = pairs.reduce((s, p) => s + p.est, 0) / pairs.length;
    const traits = TRAITS.map(([label, f, show, note], i) => ({ label, v: f(ps), t: typical[i], show, note }));
    const usage = traits[0].v;
    const flags = [];
    if (usage > 115) flags.push(`Usage adds up to ${usage.toFixed(0)}%: more shot-creators than possessions, so someone would take fewer shots than usual.`);
    if (usage < 88) flags.push(`Usage adds up to only ${usage.toFixed(0)}%: these five usually defer, so someone would have to create more than usual.`);
    if (traits[1].v < traits[1].t * 0.8) flags.push(`3-point volume is ${Math.round(100 * (1 - traits[1].v / traits[1].t))}% below a typical starting five (spacing).`);
    if (!ps.some((p) => p36(p, "BLK") >= 1.5)) flags.push("No one blocks 1.5+ shots per 36 minutes (rim protection, by box score).");
    if (traits[4].v < traits[4].t * 0.8) flags.push("Passing (assists per 36) well below a typical starting five.");
    out.innerHTML = `
      <div class="grid stat-cards">
        <div class="card stat-card"><div class="label">Estimated net rating ${modelBadge("pair-based estimate")}</div><div class="value">${net(est)}</div>
          <div class="lgavg">team ${net(team.NET_RATING)} · per 100 possessions</div></div>
        <div class="card stat-card"><div class="label">Actual (NBA.com)</div><div class="value">${real ? net(real.NET_RATING) : "–"}</div>
          <div class="lgavg">${real ? `${Math.round(real.MIN)} min together · ORtg ${fmt(real.OFF_RATING, "OFF_RATING")} / DRtg ${fmt(real.DEF_RATING, "DEF_RATING")}${real.MIN < 100 ? " · small sample" : ""}` : "this five never played 10+ minutes together"}</div></div>
      </div>
      ${flags.length ? `<div class="callout">${flags.map((f) => `<p>• ${esc(f)}</p>`).join("")}<p class="muted small">Rule-based notes from the five players' real stats.</p></div>` : ""}
      <div class="card"><h3>Lineup traits</h3><div class="table-wrap"><table class="data"><thead><tr><th class="left">Trait</th><th>These five</th><th>Typical starting five</th></tr></thead><tbody>
        ${traits.map((t) => `<tr><td class="left" title="${esc(t.note)}">${esc(t.label)}</td><td><b>${t.show(t.v)}</b></td><td class="muted">${t.show(t.t)}</td></tr>`).join("")}</tbody></table></div></div>
      <div class="card"><h3>The 10 pairs</h3><div class="table-wrap"><table class="data"><thead><tr><th class="left">Pair</th><th>Min</th><th>Net (raw)</th><th>Source</th><th>Used in estimate</th></tr></thead><tbody>
        ${pairs.sort((x, y) => y.min - x.min).map((p) => `<tr><td class="left">${esc(p.a.PLAYER_NAME)} + ${esc(p.b.PLAYER_NAME)}</td><td>${Math.round(p.min)}</td><td>${net(p.raw)}</td>
          <td class="small muted">${p.src === "pair" ? "2-man lineup" : p.src === "on/off" ? "avg of on/off (no pair data)" : "team (no data)"}</td><td>${net(p.est)}</td></tr>`).join("")}</tbody></table></div></div>`;
  }
  box.querySelector("#lb-roster").addEventListener("change", draw);
  draw();
}
