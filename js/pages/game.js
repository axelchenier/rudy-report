// game.js - one game's box score:  #/game/<GAME_ID>
// Built only from files we already have (NBA.com LeagueGameLog via pipeline/fetch_more.py):
//   data/<season>/team_gamelogs.json   both teams' totals for the game
//   data/<season>/gamelogs/p_NN.json   every player's line (40 shards; ~0.5 MB gzipped for a whole season, cached after the first box score)
//   data/<season>/playoffs.json        playoff games (004YY00RSG ids; pipeline/fetch_playoffs.py)
// The season comes from the game id itself: 002YY##### = regular season starting in 20YY / 19YY.
import { load } from "../data.js";
import { esc, renderTable, unpack } from "../ui.js";
import { gameScore } from "../gamelog.js";

const cache = new Map();
const getJSON = (p) => { if (!cache.has(p)) cache.set(p, fetch(p).then((r) => { if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.json(); })); return cache.get(p); };
export function seasonOfGame(gameId) {
  const yy = Number(String(gameId).slice(3, 5)), start = yy >= 46 ? 1900 + yy : 2000 + yy;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}
async function seasonPlayerLines(season) {
  const key = `lines:${season}`;
  if (!cache.has(key)) cache.set(key, Promise.all(Array.from({ length: 40 }, (_, i) =>
    getJSON(`data/${season}/gamelogs/p_${String(i).padStart(2, "0")}.json`).then(unpack).catch(() => []))).then((a) => a.flat()));
  return cache.get(key);
}

const shoot = (m, a) => (r) => `${r[m]}-${r[a]}`;
const pct = (m, a) => (a ? (100 * m / a).toFixed(1) : "–");
const sign = (v) => (v > 0 ? "+" : "") + Math.round(v);

export async function gamePage(app, gameId) {
  const season = seasonOfGame(gameId), playoff = gameId.startsWith("004");
  const coded = gameId.slice(5, 7) === "00" && "1234".includes(gameId[7]);      // ids before 2001-02 don't carry round/game
  const kindText = !playoff ? `${season} regular season`
    : coded ? `${season} playoffs · ${["", "first round", "conference semifinals", "conference finals", "NBA Finals"][+gameId[7]]}, game ${+gameId[9]}` : `${season} playoffs`;
  app.innerHTML = `<p class="muted">Loading box score…</p>`;
  let teamRows, lines, teams;
  try {
    const po = playoff ? await getJSON(`data/${season}/playoffs.json`) : null;
    [teamRows, lines, teams] = await Promise.all([po ? unpack(po.teams) : getJSON(`data/${season}/team_gamelogs.json`).then(unpack),
      po ? unpack(po.players) : seasonPlayerLines(season), load("teams", season).catch(() => [])]);
  } catch (e) {
    app.innerHTML = `<h1>Box score</h1><p class="callout">No game log files for ${esc(season)} on this site.</p>`; return;
  }
  const two = teamRows.filter((r) => r.GAME_ID === gameId);
  if (two.length !== 2) { app.innerHTML = `<h1>Box score</h1><p class="callout">Game ${esc(gameId)} isn't in the ${esc(season)} ${playoff ? "playoff" : "regular-season"} game log on this site.</p>`; return; }
  const name = (id) => teams.find((t) => t.TEAM_ID === id)?.TEAM_NAME;
  const [away, home] = two[0].HOME ? [two[1], two[0]] : [two[0], two[1]];
  const ot = Math.max(0, Math.round((home.MIN - 240) / 25));
  const winner = home.PTS > away.PTS ? home : away;
  const players = lines.filter((r) => r.GAME_ID === gameId).map((r) => ({ ...r, GAME_SCORE: gameScore(r) }));
  const top = [...players].sort((a, b) => b.GAME_SCORE - a.GAME_SCORE)[0];

  // Four factors from the two team lines (Dean Oliver's definitions).
  const ff = (t, o) => ({
    eFG: (t.FGM + 0.5 * t.FG3M) / t.FGA, TOV: t.TOV / (t.FGA + 0.44 * t.FTA + t.TOV),
    ORB: t.OREB / (t.OREB + o.DREB), FTR: t.FTM / t.FGA,
    POSS: t.FGA + 0.44 * t.FTA - t.OREB + t.TOV,
  });
  const fa = ff(away, home), fh = ff(home, away), poss = (fa.POSS + fh.POSS) / 2;
  const tline = (t, f) => `<tr><td class="left"><a href="#/team/${t.TEAM_ID}?season=${season}">${esc(t.TEAM_ABBREVIATION)}</a></td>
    <td><b>${t.PTS}</b></td><td>${t.FGM}-${t.FGA} (${pct(t.FGM, t.FGA)})</td><td>${t.FG3M}-${t.FG3A} (${pct(t.FG3M, t.FG3A)})</td><td>${t.FTM}-${t.FTA}</td>
    <td>${t.REB} (${t.OREB})</td><td>${t.AST}</td><td>${t.STL}</td><td>${t.BLK}</td><td>${t.TOV}</td>
    <td>${(100 * f.eFG).toFixed(1)}</td><td>${(100 * f.TOV).toFixed(1)}</td><td>${(100 * f.ORB).toFixed(1)}</td><td>${(100 * f.FTR).toFixed(1)}</td><td>${(100 * t.PTS / poss).toFixed(1)}</td></tr>`;

  app.innerHTML = `
    <p class="muted small"><a href="#/team/${away.TEAM_ID}?season=${season}&tab=gamelog">${esc(away.TEAM_ABBREVIATION)} game log</a> ·
      <a href="#/team/${home.TEAM_ID}?season=${season}&tab=gamelog">${esc(home.TEAM_ABBREVIATION)} game log</a></p>
    <h1>${esc(name(away.TEAM_ID) || away.TEAM_ABBREVIATION)} ${away.PTS} @ ${esc(name(home.TEAM_ID) || home.TEAM_ABBREVIATION)} ${home.PTS}${ot ? ` <span class="muted">(${ot > 1 ? ot : ""}OT)</span>` : ""}</h1>
    <p class="muted">${esc(home.GAME_DATE)} · ${esc(kindText)} · ${esc(winner.TEAM_ABBREVIATION)} won by ${Math.abs(home.PTS - away.PTS)} · about ${Math.round(poss)} possessions each
      ${top ? ` · top Game Score: <a href="#/player/${top.PLAYER_ID}">${esc(top.PLAYER_NAME)}</a> ${top.GAME_SCORE.toFixed(1)} (${top.PTS} pts, ${top.REB} reb, ${top.AST} ast)` : ""}</p>
    <div class="card table-wrap"><table class="data">
      <thead><tr><th class="left">Team</th><th>PTS</th><th>FG</th><th>3P</th><th>FT</th><th>REB (OR)</th><th>AST</th><th>STL</th><th>BLK</th><th>TOV</th>
        <th title="Effective FG%">eFG%</th><th title="Turnovers per play">TOV%</th><th title="Offensive rebound %">OREB%</th><th title="Free throws made per FGA">FT rate</th><th title="Points per 100 possessions (estimated)">ORtg</th></tr></thead>
      <tbody>${tline(away, fa)}${tline(home, fh)}</tbody></table>
      <p class="muted small">Last five columns are Dean Oliver's four factors and offensive rating, computed from the two box-score lines (possessions ≈ FGA + 0.44·FTA − OREB + TOV).</p></div>
    <div id="box-away"></div><div id="box-home"></div>
    <p class="muted small">Source: NBA.com (LeagueGameLog), ${playoff ? `playoffs · <a href="#/history/playoffs?season=${season}">${esc(season)} bracket</a>` : "regular season"}. Game Score is John Hollinger's formula.</p>`;

  const cols = [
    { key: "PLAYER_NAME", label: "Player", left: true, html: (r) => `<a href="#/player/${r.PLAYER_ID}?season=${season}">${esc(r.PLAYER_NAME)}</a>` },
    { key: "MIN", html: (r) => Math.round(r.MIN) }, ...["PTS", "REB", "OREB", "AST", "STL", "BLK", "TOV", "PF"].map((key) => ({ key, html: (r) => (r[key] == null ? "–" : String(Math.round(r[key]))) })),
    { key: "FGM", label: "FG", html: shoot("FGM", "FGA") }, { key: "FG3M", label: "3P", html: shoot("FG3M", "FG3A") }, { key: "FTM", label: "FT", html: shoot("FTM", "FTA") },
    { key: "PLUS_MINUS", label: "+/-", html: (r) => (r.PLUS_MINUS == null ? "–" : sign(r.PLUS_MINUS)) }, { key: "GAME_SCORE", label: "GmSc", html: (r) => r.GAME_SCORE.toFixed(1) },
  ];
  for (const [t, id] of [[away, "box-away"], [home, "box-home"]]) {
    const box = app.querySelector(`#${id}`);
    const rows = players.filter((r) => r.TEAM_ID === t.TEAM_ID).sort((a, b) => b.MIN - a.MIN);
    box.innerHTML = `<h2 style="margin-top:18px">${esc(name(t.TEAM_ID) || t.TEAM_ABBREVIATION)}</h2><div></div>`;
    if (!rows.length) { box.lastElementChild.innerHTML = `<p class="muted">No player lines for this team in the game log.</p>`; continue; }
    renderTable(box.lastElementChild, { rows, columns: cols, entity: "players", rank: false, sortKey: "MIN", pageSize: 20 });
  }
}
