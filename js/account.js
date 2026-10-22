// account.js - Supabase email sign-in + cloud sync of rr_saved_v1 / rr_myboard_v1 (table user_data).
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
const KEYS = { saved: "rr_saved_v1", myboard: "rr_myboard_v1" };
const TS = "rr_local_updated";
let sb = null, user = null, note = "", timer = null, pulling = false;

const client = async () => {
  if (!sb) {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    sb.auth.onAuthStateChange((_e, s) => { const was = user; user = s?.user || null; if (user && !was) syncOnSignIn(); render(); });
  }
  return sb;
};
const readLocal = (k) => { try { return JSON.parse(localStorage.getItem(KEYS[k]) || "null"); } catch { return null; } };

async function push() {
  if (!user) return;
  try {
    const { error } = await sb.from("user_data").upsert({ user_id: user.id, saved: readLocal("saved"), myboard: readLocal("myboard"), updated_at: localStorage.getItem(TS) || new Date().toISOString() });
    note = error ? "Cloud sync not set up yet" : "Synced"; } catch { note = "Cloud sync not set up yet"; }
  render();
}
async function syncOnSignIn() {
  try {
    const { data, error } = await sb.from("user_data").select("*").eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    const localTs = localStorage.getItem(TS) || "";
    if (data && data.updated_at > localTs) {
      pulling = true;
      for (const k in KEYS) if (data[k] != null) localStorage.setItem(KEYS[k], JSON.stringify(data[k]));
      localStorage.setItem(TS, data.updated_at); pulling = false;
      note = "Loaded your cloud saves"; window.dispatchEvent(new HashChangeEvent("hashchange"));
    } else await push();
  } catch { note = "Cloud sync not set up yet"; }
  render();
}
window.addEventListener("rr-data-changed", () => {
  if (pulling) return;
  localStorage.setItem(TS, new Date().toISOString());
  if (user) { clearTimeout(timer); timer = setTimeout(push, 1500); }
});

const modal = document.createElement("div");
modal.className = "acct-modal"; modal.hidden = true;
document.body.appendChild(modal);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function render() {
  if (modal.hidden) return;
  modal.innerHTML = `<div class="acct-box" role="dialog" aria-label="Account"><button class="acct-x" aria-label="Close">×</button>
  ${user ? `<h3>Account</h3><p>Signed in as <b>${esc(user.email)}</b></p><button class="btn" data-a="out">Sign out</button>`
    : `<h3>Sign in to sync</h3><p class="muted">Your saves and big board follow you across devices.</p>
    <input type="email" id="acct-email" placeholder="Email" autocomplete="email">
    <input type="password" id="acct-pw" placeholder="Password (6+ characters)" autocomplete="current-password">
    <div class="acct-row"><button class="btn" data-a="in">Sign in</button><button class="btn" data-a="up">Sign up</button></div>`}
  <p class="acct-note">${esc(note)}</p></div>`;
}
modal.addEventListener("click", async (e) => {
  if (e.target === modal || e.target.closest(".acct-x")) { modal.hidden = true; return; }
  const a = e.target.closest("[data-a]")?.dataset.a; if (!a) return;
  const c = await client();
  try {
    if (a === "out") { await c.auth.signOut(); user = null; note = "Signed out. Saves stay in this browser."; }
    else {
      const email = modal.querySelector("#acct-email").value.trim(), password = modal.querySelector("#acct-pw").value;
      if (!email || password.length < 6) { note = "Enter an email and a password of 6+ characters."; return render(); }
      note = "Working…"; render();
      const { data, error } = a === "up"
        ? await c.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } })
        : await c.auth.signInWithPassword({ email, password });
      if (error) note = /confirm/i.test(error.message) ? "Please confirm your email first (check your inbox)." : /invalid/i.test(error.message) ? "Wrong email or password." : error.message;
      else if (a === "up" && !data.session) note = "Check your email to confirm your account, then sign in.";
      else note = "Signed in!";
    }
  } catch { note = "Couldn't reach the sign-in service. Try again later."; }
  render();
});
document.getElementById("acct-btn")?.addEventListener("click", async () => {
  modal.hidden = false; render();
  try { const c = await client(); const { data } = await c.auth.getSession(); user = data.session?.user || null; render(); }
  catch { note = "Couldn't load sign-in right now."; render(); }
});
// Restore an existing session quietly (only if one was stored before).
if (Object.keys(localStorage).some((k) => k.startsWith("sb-"))) client().then((c) => c.auth.getSession()).catch(() => {});
