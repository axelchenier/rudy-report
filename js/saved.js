// saved.js - saved players/teams kept in this browser (localStorage 'rr_saved_v1'). Items: {type, id, name, link}.
const KEY = "rr_saved_v1";
export function listSaved() { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; } }
const write = (a) => { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch { /* storage blocked */ } };
export const isSaved = (type, id) => listSaved().some((x) => x.type === type && String(x.id) === String(id));
export function removeSaved(type, id) { write(listSaved().filter((x) => !(x.type === type && String(x.id) === String(id)))); }
export function toggleSaved(item) {
  if (isSaved(item.type, item.id)) { removeSaved(item.type, item.id); return false; }
  write([...listSaved(), item]); return true;
}
const label = (on) => (on ? "★ Saved" : "☆ Save");
export function starButton(item) {
  const on = isSaved(item.type, item.id);
  return `<button type="button" class="btn rr-star" data-item='${JSON.stringify(item).replace(/&/g, "&amp;").replace(/'/g, "&#39;")}' aria-pressed="${on}">${label(on)}</button>`;
}
if (globalThis.document) document.addEventListener("click", (e) => {
  const b = e.target.closest(".rr-star"); if (!b) return;
  const on = toggleSaved(JSON.parse(b.dataset.item));
  b.textContent = label(on); b.setAttribute("aria-pressed", String(on));
});
