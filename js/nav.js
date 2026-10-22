// nav.js - the grouped top nav: College / More dropdowns (click or keyboard) and the mobile hamburger menu.
// Routing is unchanged (js/app.js); this only opens and closes menus.
const body = document.body;
const toggle = document.querySelector(".nav-toggle");
const groups = [...document.querySelectorAll(".nav-group")];

function closeAll(except) {
  groups.forEach((g) => { if (g !== except) { g.classList.remove("open"); g.querySelector(".nav-drop")?.setAttribute("aria-expanded", "false"); } });
}
groups.forEach((g) => {
  const btn = g.querySelector(".nav-drop");
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = !g.classList.contains("open");
    closeAll(g);
    g.classList.toggle("open", open);
    btn.setAttribute("aria-expanded", String(open));
  });
});
toggle?.addEventListener("click", (e) => {
  e.stopPropagation();
  const open = body.classList.toggle("nav-open");
  toggle.setAttribute("aria-expanded", String(open));
});
const closeMenus = () => { closeAll(); body.classList.remove("nav-open"); toggle?.setAttribute("aria-expanded", "false"); };
document.addEventListener("click", (e) => { if (!e.target.closest(".nav-group") && !e.target.closest(".nav")) closeMenus(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenus(); });
window.addEventListener("hashchange", closeMenus);

// Highlight the dropdown item for the current page (longest matching link wins, e.g. #/college/reports over #/college).
function markCurrent() {
  // Detail pages map to the list page they belong to (#/college/conference/B10 -> Conferences, #/college/player/1 -> Players).
  const h = (location.hash || "#/").split("?")[0]
    .replace(/^#\/college\/conference\/.*/, "#/college/conferences").replace(/^#\/college\/player\/.*/, "#/college/players")
    .replace(/^#\/college\/teams$/, "#/college").replace(/^#\/draft\/\d+$/, "#/draft");
  const links = [...document.querySelectorAll(".nav-menu a")];
  links.forEach((a) => a.classList.remove("current"));
  const hits = links.filter((a) => { const href = a.getAttribute("href"); return h === href || h.startsWith(href + "/"); });
  hits.sort((a, b) => b.getAttribute("href").length - a.getAttribute("href").length)[0]?.classList.add("current");
}
window.addEventListener("hashchange", markCurrent);
markCurrent();
