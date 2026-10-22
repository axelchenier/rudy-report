// myboard.js - '#/draft/myboard': your own 2027 big board, seeded from the Model Board (data/draft/board.json).
// Stored in localStorage 'rr_myboard_v1' as [{pid, note}].
import { esc } from "../ui.js";
import { draftNav } from "./draft_nav.js";
const KEY = "rr_myboard_v1";
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; } };
const save = (b) => { try { localStorage.setItem(KEY, JSON.stringify(b)); } catch { /* blocked */ } window.dispatchEvent(new Event("rr-data-changed")); };
export async function myBoardPage(app) {
  let data;
  try { data = await (await fetch("data/draft/board.json")).json(); } catch { app.innerHTML = `${draftNav("myboard")}<p class="muted">Could not load the model board.</p>`; return; }
  const byId = new Map(data.prospects.map((p) => [String(p.pid), p]));
  const seed = () => data.prospects.slice(0, 30).map((p) => ({ pid: String(p.pid), note: "" }));
  let board = (load() || seed()).filter((x) => byId.has(String(x.pid)));
  const commit = () => { save(board); draw(); };
  const draw = () => {
    const on = new Set(board.map((x) => x.pid));
    app.innerHTML = `${draftNav("myboard")}
      <div class="page-head"><div><h1>My Big Board · 2027</h1><p class="sub">Saved in this browser only. Seeded from the Rudy Report Model Board (model estimate); drag or use ↑ ↓ to rank.</p></div></div>
      <div class="toolbar"><select id="add"><option value="">+ Add prospect…</option>${data.prospects.filter((p) => !on.has(String(p.pid))).map((p) =>
        `<option value="${p.pid}">${esc(p.player)} (${esc(p.team)})</option>`).join("")}</select>
        <button class="btn" id="reset">Reset to model board</button></div>
      <ol class="rr-board">${board.map((x, i) => { const p = byId.get(x.pid); return `<li draggable="true" data-i="${i}">
        <b>${i + 1}.</b> <a href="#/draft/${p.pid}">${esc(p.player)}</a> <span class="muted small">${esc(p.team)} · model #${p.rank}</span>
        <input class="rr-note" data-i="${i}" placeholder="Notes" value="${esc(x.note || "")}">
        <button class="btn" data-mv="-1" data-i="${i}" aria-label="Move up">↑</button><button class="btn" data-mv="1" data-i="${i}" aria-label="Move down">↓</button>
        <button class="btn" data-rm="${i}">Remove</button></li>`; }).join("")}</ol>`;
  };
  const move = (from, to) => { if (to < 0 || to >= board.length || from === to) return; const [x] = board.splice(from, 1); board.splice(to, 0, x); commit(); };
  app.onclick = (e) => {
    const t = e.target;
    if (t.id === "reset") { if (confirm("Reset your board to the model board?")) { board = seed(); commit(); } }
    else if (t.dataset.mv) move(+t.dataset.i, +t.dataset.i + +t.dataset.mv);
    else if (t.dataset.rm) { board.splice(+t.dataset.rm, 1); commit(); }
  };
  app.onchange = (e) => {
    if (e.target.id === "add" && e.target.value) { board.push({ pid: e.target.value, note: "" }); commit(); }
    else if (e.target.classList.contains("rr-note")) { board[+e.target.dataset.i].note = e.target.value; save(board); }
  };
  let dragFrom = null;
  app.ondragstart = (e) => { const li = e.target.closest?.("li[data-i]"); if (li) dragFrom = +li.dataset.i; };
  app.ondragover = (e) => { if (dragFrom !== null && e.target.closest?.("li[data-i]")) e.preventDefault(); };
  app.ondrop = (e) => { const li = e.target.closest?.("li[data-i]"); if (li && dragFrom !== null) { e.preventDefault(); move(dragFrom, +li.dataset.i); } dragFrom = null; };
  draw();
}
