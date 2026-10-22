// search.js - site-wide quick search (header). "/" or Ctrl/Cmd+K opens it.
const PAGES = [
  ["Ask the stats", "#/ask", "ask question home query"],
  ["Players", "#/players", "player stats leaders points rebounds assists per 36 totals advanced"],
  ["Teams", "#/teams", "team stats offense defense net rating pace per 100"],
  ["Standings", "#/standings", "standings record wins losses conference seed"],
  ["Compare", "#/compare", "compare head to head vs versus players teams"],
  ["Reports", "#/reports", "reports day week month trends hot cold"],
  ["History", "#/history", "history seasons decades awards mvp champions playoffs past"],
  ["Stat hubs", "#/hubs", "hubs clutch hustle tracking shot chart shot zones lineups on off playtypes"],
  ["Tools", "#/tools", "tools simulator what-if injury scenario trade trends calculator"],
  ["WOWY (with or without you)", "#/wowy", "wowy with without on off lineup impact"],
  ["Glossary", "#/glossary", "glossary definitions true shooting ts efg net rating usage pie bpm ortg drtg pace"],
  ["Saved", "#/saved", "saved favorites bookmarks my players teams"],
  ["2027 Draft model board", "#/draft", "draft big board prospects model rankings 2027"],
  ["My Big Board", "#/draft/myboard", "my big board rank prospects custom personal"],
  ["Mock draft", "#/draft/mock", "mock draft lottery picks simulator"],
  ["Draft history", "#/draft/history", "draft history past classes picks busts steals"],
  ["College-to-NBA translation", "#/draft/translation", "translation college to nba carry over"],
  ["College home", "#/college", "college ncaa ncaab"],
  ["College players", "#/college/players", "college players ncaa stats"],
  ["College teams", "#/college/teams", "college teams t-rank adjem kenpom efficiency"],
  ["College leaders", "#/college/leaders", "college leaders ncaa"],
  ["College conferences", "#/college/conferences", "conferences big ten sec acc big 12 big east"],
  ["College compare", "#/college/compare", "college compare ncaa"],
  ["NCAA tournament", "#/college/tournament", "march madness tournament bracket national title"],
  ["Game predictor", "#/college/predictor", "predictor game prediction spread win probability"],
  ["Transfer portal model", "#/college/transfer", "transfer portal"],
].map(([t, r, k]) => ({ t, r, k }));

const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let idx = null, loading = null;
async function load() {
  if (idx) return idx;
  if (loading) return loading;
  const j = (u) => fetch(u).then((r) => r.ok ? r.json() : null).catch(() => null);
  loading = Promise.all([j("data/index/players.json"), j("data/2026-27/teams.json"), j("data/college/2025-26/teams.json"), j("data/college/2025-26/players.json"), j("data/draft/board.json")]).then(([pl, tm, ct, cp, db]) => {
    const rows = (o, f) => o && o.cols ? o.rows.map((r) => Object.fromEntries(o.cols.map((c, i) => [c, r[i]]))).map(f) : [];
    idx = {
      Players: rows(pl, (p) => ({ t: p.PLAYER_NAME, s: `${p.FIRST}–${p.LAST}`, r: `#/player/${p.PLAYER_ID}`, w: p.MINUTES || 0 })),
      Teams: (tm || []).map((t) => ({ t: t.TEAM_NAME, s: t.TEAM_ABBREVIATION, r: `#/team/${t.TEAM_ID}`, k: t.TEAM_ABBREVIATION })),
      College: [...(ct || []).map((t) => ({ t: t.TEAM_NAME, s: `College team · ${t.CONF}`, r: `#/college/team/${t.TEAM_ID}`, w: 1e6 - (t.TRANK || 999) })),
        ...rows(cp, (p) => ({ t: p.PLAYER_NAME, s: `College · ${p.TEAM_NAME}`, r: `#/college/player/${p.PID}`, w: p.MIN || 0 }))],
      "Draft prospects": ((db && db.prospects) || []).map((p) => ({ t: p.player, s: `#${p.rank} · ${p.team}`, r: `#/college/player/${p.pid}`, w: 1e6 - p.rank })),
    };
    return idx;
  });
  return loading;
}
function score(q, it) {
  const n = norm(it.t), k = norm(it.k);
  if (n === q) return 100; if (n.startsWith(q)) return 80;
  if (n.split(/[\s.'-]+/).some((w) => w.startsWith(q))) return 60;
  if (n.includes(q)) return 40;
  if (k && k.split(" ").some((w) => w.startsWith(q))) return 30;
  if (k && k.includes(q)) return 20;
  return 0;
}
function top(q, list, n = 6) {
  return list.map((it) => [score(q, it), it]).filter((x) => x[0]).sort((a, b) => b[0] - a[0] || (b[1].w || 0) - (a[1].w || 0)).slice(0, n).map((x) => x[1]);
}

function init() {
  const tools = document.querySelector(".header-tools");
  if (!tools) return;
  const btn = document.createElement("button");
  btn.className = "icon-btn search-btn"; btn.id = "search-btn"; btn.title = "Search (/ or Ctrl+K)"; btn.setAttribute("aria-label", "Search"); btn.textContent = "🔍";
  tools.prepend(btn);
  const ov = document.createElement("div");
  ov.className = "qs-overlay"; ov.hidden = true;
  ov.innerHTML = `<div class="qs-box" role="dialog" aria-label="Search"><input id="qs-input" type="search" placeholder="Search pages, players, teams, college, prospects…" autocomplete="off"><div class="qs-results" id="qs-results"></div></div>`;
  document.body.appendChild(ov);
  const css = document.createElement("style");
  css.textContent = `.qs-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000;display:flex;justify-content:center;align-items:flex-start;padding:8vh 10px 10px}
.qs-overlay[hidden]{display:none}.qs-box{width:min(640px,100%);background:var(--card,var(--bg,#fff));color:inherit;border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.4);overflow:hidden;max-height:80vh;display:flex;flex-direction:column}
#qs-input{width:100%;box-sizing:border-box;font-size:17px;padding:14px;border:0;border-bottom:1px solid rgba(128,128,128,.3);background:transparent;color:inherit;outline:none}
.qs-results{overflow-y:auto}.qs-g{font-size:12px;text-transform:uppercase;opacity:.6;padding:8px 14px 2px}.qs-i{display:flex;justify-content:space-between;gap:8px;padding:8px 14px;cursor:pointer;text-decoration:none;color:inherit}
.qs-i small{opacity:.6;white-space:nowrap}.qs-i.on,.qs-i:hover{background:rgba(128,128,128,.18)}.qs-empty{padding:14px;opacity:.6}`;
  document.head.appendChild(css);
  const inp = ov.querySelector("#qs-input"), res = ov.querySelector("#qs-results");
  let items = [], sel = 0;
  const open = () => { ov.hidden = false; inp.value = ""; render(); inp.focus(); load().then(render); };
  const close = () => { ov.hidden = true; };
  const go = (r) => { close(); location.hash = r; };
  function render() {
    const q = norm(inp.value.trim());
    let html = ""; items = [];
    const add = (g, list) => { if (!list.length) return; html += `<div class="qs-g">${g}</div>`; for (const it of list) { html += `<a class="qs-i" data-i="${items.length}" href="${esc(it.r)}"><span>${esc(it.t)}</span>${it.s ? `<small>${esc(it.s)}</small>` : ""}</a>`; items.push(it); } };
    if (!q) add("Pages & Tools", PAGES.slice(0, 8));
    else {
      add("Pages & Tools", top(q, PAGES));
      if (idx) for (const g of ["Players", "Teams", "College", "Draft prospects"]) add(g, top(q, idx[g]));
      else html += `<div class="qs-empty">Loading players and teams…</div>`;
      add("Ask", [{ t: `Ask: "${inp.value.trim()}"`, r: `#/ask?q=${encodeURIComponent(inp.value.trim())}` }]);
    }
    res.innerHTML = html; sel = 0; hl();
  }
  function hl() { res.querySelectorAll(".qs-i").forEach((e, i) => { e.classList.toggle("on", i === sel); if (i === sel) e.scrollIntoView({ block: "nearest" }); }); }
  inp.addEventListener("input", render);
  inp.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { sel = Math.min(sel + 1, items.length - 1); hl(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { sel = Math.max(sel - 1, 0); hl(); e.preventDefault(); }
    else if (e.key === "Enter" && items[sel]) { go(items[sel].r); e.preventDefault(); }
  });
  res.addEventListener("click", (e) => { const a = e.target.closest(".qs-i"); if (a) { e.preventDefault(); go(items[+a.dataset.i].r); } });
  ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
  btn.addEventListener("click", open);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !ov.hidden) return close();
    const t = e.target, typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
    if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) { e.preventDefault(); ov.hidden ? open() : close(); }
  });
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
