import { store, loadAll, getDay, saveDay, saveMany, drafts, token, testToken, todayISO, merged, prefs, hasMonth, loadMonth, monthOf } from "./store.js?v=202610021923";
import { $, h, esc, icon } from "./ui.js?v=202610021923";
import { renderDashboard } from "./dashboard.js?v=202610021923";
import { renderToday } from "./today.js?v=202610021923";
import { renderLift } from "./lift.js?v=202610021923";
import { VERSION } from "./version.js?v=202610021923";

const TABS = ["today", "lift", "trends"];
const state = { tab: "today", date: todayISO(), saved: null, day: {}, pending: [], restored: false, csvIdx: null };
const view = $("#view");

/* ---------- day normalization ---------- */
const clone = o => JSON.parse(JSON.stringify(o ?? {}));
function prune(o) {
  if (Array.isArray(o)) return o.map(prune);
  if (o && typeof o === "object") {
    const out = {};
    for (const [k, v] of Object.entries(o)) {
      const p = prune(v);
      if (p === null || p === undefined || p === "" || (Array.isArray(p) && !p.length) || (typeof p === "object" && !Array.isArray(p) && !Object.keys(p).length)) continue;
      out[k] = p;
    }
    return out;
  }
  return o;
}
export function cleanDay(day) {
  const d = clone(day);
  delete d.updated;
  if (d.lift) {
    d.lift.exercises = (d.lift.exercises || []).map(ex => {
      const sets = (ex.sets || []).map(v => (v === "" || v == null ? null : Number(v)));
      while (sets.length && sets[sets.length - 1] == null) sets.pop();
      const has = sets.some(v => v != null);
      if (!has) return null;
      const out = { name: ex.name, weight: ex.weight ?? ex.target ?? null, sets };
      if (ex.drop && ex.drop.reps != null && ex.drop.reps !== "") out.drop = { weight: ex.drop.weight ?? null, reps: Number(ex.drop.reps) };
      if (ex.note) out.note = ex.note;
      return out;
    }).filter(Boolean);
    if (!d.lift.exercises.length) delete d.lift;
  }
  if (d.day_type === "normal") delete d.day_type;
  return prune(d);
}
const same = (a, b) => JSON.stringify(cleanDay(a)) === JSON.stringify(cleanDay(b));
const isDirty = () => state.pending.length > 0 || !same(state.day, state.saved);

/* ---------- date + status ---------- */
function indexCSV() {
  const food = new Set(), lift = new Set(), social = new Set();
  for (const r of store.csv.daily) { if (r.calories) food.add(r.date); if (/social/.test(r.day_type)) social.add(r.date); }
  for (const r of store.csv.lifts) lift.add(r.date);
  state.csvIdx = { food, lift, social };
}
function status(date) {
  const d = date === state.date ? state.day : getDay(date);
  const i = state.csvIdx || { food: new Set(), lift: new Set(), social: new Set() };
  return {
    food: d?.food?.kcal != null || i.food.has(date),
    lift: (d?.lift?.exercises || []).some(e => (e.sets || []).some(v => v != null && v !== "")) || i.lift.has(date),
    social: /social/.test(d?.day_type || "") || i.social.has(date),
    draft: date !== state.date && !!drafts.get(date),
  };
}
function openDate(date) {
  if (!hasMonth(monthOf(date))) { loadMonth(monthOf(date)).then(() => openDate(date)).catch(() => {}); if (!state.date) return; }
  state.date = date;
  state.saved = clone(getDay(date));
  const dr = drafts.get(date);
  state.restored = !!dr && !same(dr, state.saved);
  state.day = state.restored ? dr : clone(state.saved);
  if (!state.restored && dr) drafts.clear(date);
  state.pending = [];
  render();
}
function pickDate(date) {
  if (isDirty()) drafts.set(state.date, state.day);
  openDate(date);
}

/* ---------- change plumbing ---------- */
const ctx = {
  state, status, pickDate, cleanDay,
  changed() {
    if (same(state.day, state.saved)) drafts.clear(state.date); else drafts.set(state.date, state.day);
    refreshSaveBar();
  },
  rerender: () => render(),
  goTab: t => go(t),
  openSettings: () => openSettings(),
  discardDraft() { drafts.clear(state.date); state.restored = false; state.day = clone(state.saved); state.pending = []; render(); },
  moveTo(date, patch) { // apply a parsed paste to a different date
    if (isDirty()) drafts.set(state.date, state.day);
    openDate(date);
    patch(state.day); ctx.changed(); render();
  },
};

// Apply a LoseIt report: { date: fields } -> one commit per month. Fields fill food + weight; nothing else is touched.
export function reportPatch(f) {
  return day => {
    const food = { ...(day.food || {}) };
    for (const k of ["kcal", "protein", "carbs", "fat", "fiber", "sodium"]) if (f[k] != null) food[k] = f[k];
    food.source = food.items?.length ? (food.source || "loseit") : "loseit-report";
    if (f.incomplete) food.incomplete = true; else delete food.incomplete;
    const out = { ...day, food };
    if (f.items?.length) food.items = f.items;
    if (f.weight != null) out.weight = f.weight;
    if (f.steps != null) out.steps = f.steps;
    return out;
  };
}
ctx.applyReport = async (days, label) => {
  if (!token.get()) { openSettings(); return false; }
  const patches = Object.fromEntries(Object.entries(days).map(([d, f]) => [d, reportPatch(f)]));
  const dates = Object.keys(days).sort();
  try {
    await saveMany(patches, `log: LoseIt report ${dates[0]}${dates.length > 1 ? " to " + dates.at(-1) : ""}`);
  } catch (e) { console.error(e); toast(e.status === 401 ? "Token rejected. Check settings." : "Import failed. Nothing was changed.", true); return false; }
  if (days[state.date]) {                // keep any unsaved edits on the open day, layered over the imported numbers
    const fresh = clone(getDay(state.date));
    const wasDirty = isDirty();
    state.day = wasDirty ? reportPatch(days[state.date])(state.day) : clone(fresh);
    state.saved = fresh;
  }
  toast(`Imported ${dates.length} day${dates.length > 1 ? "s" : ""} from ${label || "LoseIt"}`);
  render(); return true;
};

/* ---------- save bar ---------- */
const saveBar = h(`<div class="savebar off" aria-hidden="true">
  <div class="sb-msg"></div>
  <button class="btn primary sb-save">Save</button>
</div>`);
document.body.appendChild(saveBar);
let lastSaved = null, saving = false;
function refreshSaveBar() {
  // Only shown while there's something to save; a "Saved" toast confirms, then it slides away.
  const dirty = isDirty();
  const show = state.tab !== "trends" && (dirty || saving);
  saveBar.hidden = false;
  saveBar.classList.toggle("off", !show);
  saveBar.setAttribute("aria-hidden", String(!show));
  if (!show) return;
  const btn = saveBar.querySelector(".sb-save"), msg = saveBar.querySelector(".sb-msg");
  if (saving) { btn.disabled = true; btn.textContent = "Saving…"; return; }
  btn.textContent = token.get() ? "Save" : "Connect";
  btn.disabled = token.get() ? !dirty : false;
  msg.className = "sb-msg";
  if (!token.get()) { msg.textContent = dirty ? "Kept on this phone. Connect GitHub to save." : "Connect GitHub to save entries."; msg.classList.add("warn"); }
  else if (dirty) { msg.textContent = state.pending.length ? `Unsaved · ${state.pending.length} screenshot${state.pending.length > 1 ? "s" : ""}` : "Unsaved changes"; msg.classList.add("warn"); }
  else if (lastSaved && lastSaved.date === state.date) msg.textContent = `Saved ${lastSaved.at}`;
  else msg.textContent = state.saved && Object.keys(state.saved).length ? "Up to date" : "Nothing logged yet";
}
saveBar.querySelector(".sb-save").addEventListener("click", async () => {
  if (!token.get()) return openSettings();
  saving = true; refreshSaveBar();
  try {
    const out = cleanDay(state.day);
    const saved = await saveDay(state.date, out, state.pending.map(p => p.base64));
    state.saved = clone(saved); state.day = clone(saved); state.pending = []; state.restored = false;
    drafts.clear(state.date);
    lastSaved = { date: state.date, at: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) };
    toast("Saved to GitHub");
    saving = false; render();
  } catch (e) {
    saving = false; refreshSaveBar();
    console.error(e);
    toast(e.code === "no_token" ? "Connect GitHub first" : e.status === 401 ? "Token rejected. Check settings." : e.status === 403 || e.status === 404 ? "Token can't write to the repo. Check its permissions." : "Save failed. Your entry is kept on this phone.", true);
  }
});

/* ---------- toast ---------- */
const toastEl = h(`<div class="toast" role="status"></div>`); document.body.appendChild(toastEl);
let tt;
function toast(msg, bad) { toastEl.textContent = msg; toastEl.className = "toast show" + (bad ? " bad" : ""); clearTimeout(tt); tt = setTimeout(() => toastEl.className = "toast", 2600); }
ctx.toast = toast;

/* ---------- settings sheet ---------- */
function openSettings() {
  const has = !!token.get();
  const sheet = h(`<div class="sheet-wrap"><div class="sheet" role="dialog" aria-label="Settings">
    <div class="sheet-h"><h2>${has ? "Settings" : "Connect GitHub"}</h2><button class="iconbtn" data-close aria-label="Close">${icon.x}</button></div>
    ${has ? `<p class="sub">Connected to GitHub. Saves go into <b>snowydock/sovak-fitness</b>.</p><details class="tokhelp"><summary>Replace the token</summary>` : ""}
    <p class="sub">Saves go straight into <b>snowydock/sovak-fitness</b>. This needs a token that can only write to that one repo. It's stored on this phone only.</p>
    <ol class="steps">
      <li>Open <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">GitHub → new fine-grained token</a>.</li>
      <li>Name it <i>Fitness app</i>, pick the longest expiration offered.</li>
      <li>Repository access: <b>Only select repositories</b> → <i>sovak-fitness</i>.</li>
      <li>Permissions → Repository → <b>Contents: Read and write</b>. Nothing else.</li>
      <li>Generate, copy, paste below.</li>
    </ol>
    <label class="field"><span>Token</span><div class="inwrap"><input type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="github_pat_…" value="${has ? "••••••••••••" : ""}" data-token></div></label>
    <div class="sheet-msg" aria-live="polite"></div>
    <div class="row gap">
      <button class="btn primary" data-save>${has ? "Replace & test" : "Save & test"}</button>
      ${has ? `<button class="btn ghost" data-test>Test current</button><button class="btn ghost danger" data-remove>Remove</button>` : ""}
    </div>
    ${has ? "</details>" : ""}
    <p class="fine">Build ${esc(VERSION || "dev")} · <button class="link" data-update>Check for update</button></p>
    <p class="fine">Added this page to your home screen? Paste the token inside the home-screen app; it keeps its own storage separate from Safari. Lost phone: revoke the token on the same GitHub page.</p>
  </div></div>`);
  document.body.appendChild(sheet);
  requestAnimationFrame(() => sheet.classList.add("open"));
  const msg = sheet.querySelector(".sheet-msg");
  const close = () => { sheet.classList.remove("open"); setTimeout(() => sheet.remove(), 200); refreshSaveBar(); };
  sheet.addEventListener("click", async e => {
    if (e.target === sheet || e.target.closest("[data-close]")) return close();
    if (e.target.closest("[data-update]")) { msg.textContent = "Checking…"; if (!(await checkUpdate(true))) msg.textContent = "You're on the latest build."; return; }
    if (e.target.closest("[data-save]")) {
      const v = sheet.querySelector("[data-token]").value.trim();
      if (!v || v.startsWith("••")) { msg.textContent = "Paste a token first."; return; }
      token.set(v); msg.textContent = "Testing…";
      const r = await testToken(); msg.textContent = r.msg; msg.className = "sheet-msg " + (r.ok ? "ok" : "bad");
      if (r.ok) { await reloadData(); setTimeout(close, 900); }
    }
    if (e.target.closest("[data-test]")) { msg.textContent = "Testing…"; const r = await testToken(); msg.textContent = r.msg; msg.className = "sheet-msg " + (r.ok ? "ok" : "bad"); }
    if (e.target.closest("[data-remove]")) { token.clear(); msg.textContent = "Removed from this phone."; setTimeout(close, 700); }
  });
}

/* ---------- routing ---------- */
function go(tab) {
  if (!TABS.includes(tab)) tab = "today";
  state.tab = tab; prefs.set("sf_tab", tab);
  if (location.hash !== "#" + tab) history.replaceState(null, "", "#" + tab);
  document.querySelectorAll(".tabbar button").forEach(b => b.classList.toggle("on", b.dataset.tab === tab));
  render(); window.scrollTo(0, 0);
}
let rendering = false;
function render() {
  if (rendering) { queueMicrotask(render); return; }   // a blur/change during teardown can ask for a render; run it after
  rendering = true;
  try { renderNow(); } finally { rendering = false; }
}
function renderNow() {
  const page = document.createElement("div");   // fresh node each render so listeners never stack
  view.replaceChildren(page);
  document.body.dataset.tab = state.tab;
  $("#asof").textContent = "";
  if (state.tab === "trends") renderDashboard(page, merged());
  else if (state.tab === "lift") renderLift(page, ctx);
  else renderToday(page, ctx);
  refreshSaveBar();
}

async function reloadData() { await loadAll(); indexCSV(); openDate(state.date); }

/* ---------- updates ----------
   Every release stamps a new ?v= on all module URLs (tools/bump.py). On open and on
   returning to the app, compare against version.json; if newer, reload under a fresh
   URL so the phone fetches the new files instead of its cached copies. */
async function checkUpdate(force = false) {
  if (!VERSION) return false;
  try {
    const r = await fetch(`version.json?t=${Date.now()}`, { cache: "no-store" });
    const { version } = await r.json();
    if (!version || version <= VERSION) return false;
    if (isDirty()) drafts.set(state.date, state.day);
    if (!force && isDirty()) return false;
    toast("Updating to the latest version…");
    setTimeout(() => location.replace(`${location.pathname}?v=${version}${location.hash}`), 400);
    return true;
  } catch { return false; }
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) checkUpdate(); });

/* ---------- boot ---------- */
document.querySelector(".tabbar").addEventListener("click", e => { const b = e.target.closest("button[data-tab]"); if (b) go(b.dataset.tab); });
$("#gear").addEventListener("click", openSettings);
window.addEventListener("hashchange", () => go(location.hash.slice(1)));
window.addEventListener("beforeunload", () => { if (isDirty()) drafts.set(state.date, state.day); });
document.addEventListener("visibilitychange", () => { if (document.hidden && isDirty()) drafts.set(state.date, state.day); });

(async () => {
  try { await loadAll(); }
  catch (e) { view.innerHTML = `<div class="err">Couldn't load data (${esc(e.message)}). Open this from GitHub Pages, not as a local file.</div>`; return; }
  indexCSV();
  const startTab = location.hash.slice(1) || prefs.get("sf_tab") || "today";
  state.tab = TABS.includes(startTab) ? startTab : "today";
  document.querySelectorAll(".tabbar button").forEach(b => b.classList.toggle("on", b.dataset.tab === state.tab));
  openDate(todayISO());
  checkUpdate();
})();
