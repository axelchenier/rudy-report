// saved_list.js - '#/saved': players and teams starred in this browser.
import { esc } from "../ui.js";
import { listSaved, removeSaved } from "../saved.js";
export function savedListPage(app) {
  const draw = () => {
    const items = listSaved();
    app.innerHTML = `<div class="page-head"><div><h1>Saved</h1><p class="sub">Saved in this browser only.</p></div></div>
      ${items.length ? `<ul class="rr-list">${items.map((x) => `<li><span class="tag">${esc(x.type)}</span> <a href="${esc(x.link)}">${esc(x.name)}</a>
        <button class="btn rr-rm" data-t="${esc(x.type)}" data-id="${esc(x.id)}">Remove</button></li>`).join("")}</ul>`
      : `<p class="muted">Nothing saved yet. Use the ☆ Save button on a player or team page.</p>`}
      <p><a href="#/draft/myboard">My Big Board →</a></p>`;
  };
  draw();
  app.onclick = (e) => { const b = e.target.closest(".rr-rm"); if (b) { removeSaved(b.dataset.t, b.dataset.id); draw(); } };
}
