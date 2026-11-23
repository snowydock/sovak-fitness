import { store, targetsFor, compressImage, todayISO, addDays, getDay, RAW, parseISO, plannedOn } from "./store.js?v=202611230234";
import { h, esc, fmt, numOrNull, md, icon, dateNav, sheet } from "./ui.js?v=202611230234";
import { parseLoseIt, parseReportText, parseLoseItReport, pdfToLines } from "./parsers.js?v=202611230234";
import { isClosedDate, token } from "./store.js?v=202611230234";
import { buildSummary } from "./summary.js?v=202611230234";
import { VERSION } from "./version.js?v=202611230234";

const DAY_TYPES = [["normal", "Normal"], ["light_social", "Light social"], ["heavy_social", "Heavy social"], ["travel", "Travel"]];
const ACTS = ["Run", "Walk", "Cardio", "Sport"];

function getPath(o, path) { return path.split(".").reduce((x, k) => (x == null ? undefined : x[k]), o); }
function setPath(o, path, v) {
  const ks = path.split("."); let x = o;
  for (let i = 0; i < ks.length - 1; i++) { x[ks[i]] ??= {}; x = x[ks[i]]; }
  x[ks.at(-1)] = v;
}

// most recent weigh-in before `date` from either source
function prevWeight(date) {
  for (let i = 1; i <= 14; i++) {
    const d = addDays(date, -i);
    const l = getDay(d)?.weight;
    if (l != null) return { date: d, w: l };
    const c = store.csv.daily.find(r => r.date === d && r.weight_lb);
    if (c) return { date: d, w: Number(c.weight_lb) };
  }
  return null;
}

// Meals. Items logged through Claude carry an optional meal label and a time.
const MEALS = ["Breakfast", "Lunch", "Dinner", "Snacks", "Late night", "Booze"];
const ALWAYS = ["Breakfast", "Lunch", "Dinner", "Snacks"];
const MACROS = [["protein", "Protein"], ["carbs", "Carbs"], ["fat", "Fat"], ["fiber", "Fiber"]];
const sumOf = (items, k) => items.reduce((t, i) => t + (Number(i[k]) || 0), 0);

// Daily goals. Protein and fat are fixed; carbs take whatever calories are left. A sized social day swaps the budget.
function goalsFor(t, dayType) {
  const P = store.program || {}, g = P.targets || {};
  const kcal = (P.dayBudgets || {})[dayType] || t.kcal || null;
  const protein = t.protein || g.protein || 180, fat = g.fat || 65, fiber = g.fiber || 30;
  const carbs = kcal ? Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4 / 5) * 5) : null;
  return { kcal, protein, carbs, fat, fiber };
}
function addFoodBtn(meal) {
  return `<button class="btn small add" data-add="${esc(meal)}">${icon.plus}<span>Add food</span></button>`;
}
const round1 = n => Math.round(n * 10) / 10;
// How a library food is measured: by weight (foods stored per N grams) or by serving.
function unitOf(food) {
  const m = food.usual?.mult || 1;
  if (food.per?.g) { const base = food.per.g; return { unit: "g", base, step: base >= 50 ? 10 : 5, def: Math.round(base * m) }; }
  return { unit: "serving", base: 1, step: 0.5, def: Math.max(0.5, Math.round(m * 2) / 2) };
}
const amtLabel = (food, u, a) => u.unit === "g" ? `${fmt(a)} g` : a === 1 ? food.serving : `${a} × ${food.serving}`;
// A library food at a given amount (grams or servings), as a log item. No amount = the usual portion.
function libraryItem(food, meal, amount) {
  const u = unitOf(food), a = amount ?? u.def, m = a / u.base;
  const it = { name: food.name, qty: amtLabel(food, u, a), amount: a, unit: u.unit, basis: "library", food_id: food.id };
  if (meal && meal !== "Other") it.meal = meal;
  it.time = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  it.kcal = Math.round(food.kcal * m);
  for (const k of ["protein", "carbs", "fat", "fiber", "sodium"]) if (food[k] != null) it[k] = round1(food[k] * m);
  return it;
}
const amountHtml = (food, a) => { const u = unitOf(food); return `<div class="amt" data-amt>
  <button type="button" class="stepb" data-step="-1" aria-label="Less">−</button>
  <div class="inwrap"><input inputmode="decimal" enterkeyhint="done" data-amount value="${a ?? u.def}" aria-label="Amount"><em>${u.unit === "g" ? "g" : "×"}</em></div>
  <button type="button" class="stepb" data-step="1" aria-label="More">+</button>
  <div class="amt-v"><b class="num" data-akcal></b><small data-asub></small></div></div>`; };
// Wire a stepper block: returns a getter for the current amount.
function wireAmount(box, food, onChange) {
  const u = unitOf(food), input = box.querySelector("[data-amount]");
  const read = () => { const v = parseFloat(String(input.value).replace(",", ".")); return v > 0 ? v : null; };
  const show = () => { const a = read(), it = a ? libraryItem(food, null, a) : null;
    box.querySelector("[data-akcal]").textContent = it ? `${fmt(it.kcal)} kcal` : "–";
    box.querySelector("[data-asub]").textContent = it ? [u.unit === "serving" ? food.serving : "", it.protein ? `${fmt(it.protein)} g protein` : ""].filter(Boolean).join(" · ") : "";
    onChange?.(a); };
  box.addEventListener("click", e => { const b = e.target.closest("[data-step]"); if (!b) return;
    const next = Math.max(u.step, Math.round(((read() || 0) + Number(b.dataset.step) * u.step) / u.step) * u.step);
    input.value = u.unit === "g" ? next : Math.round(next * 100) / 100; show(); });
  input.addEventListener("input", show);
  input.addEventListener("focus", () => input.select());
  show();
  return read;
}
function foodRows(list, counts = {}) {
  return list.map(f => { const it = libraryItem(f), n = counts[f.id] || 0;
    return `<div class="foodrow${n ? " has" : ""}" data-row="${esc(f.id)}">
      <button type="button" class="fr-main" data-open="${esc(f.id)}"><span><b>${esc(f.name)}</b><small>${esc(it.qty)}${it.protein ? ` · ${fmt(it.protein)} g protein` : ""}</small></span><em class="num">${fmt(it.kcal)}</em></button>
      <button type="button" class="fr-add" data-quick="${esc(f.id)}" aria-label="Add ${esc(f.name)}">${n ? `<b class="num">${n}</b>` : icon.plus}</button>
      <div class="fr-edit" data-edit-for="${esc(f.id)}"><div class="fr-edit-in"></div></div>
    </div>`; }).join("");
}
function mealsHtml(f, canAdd) {
  const items = (f.items || []).map((it, idx) => ({ ...it, idx }));
  const viaClaude = f.source === "claude";
  const groups = [...MEALS, "Other"].map(m => [m, items.filter(i => (i.meal || "Other") === m)])
    .filter(([m, g]) => g.length || ALWAYS.includes(m));
  return groups.map(([m, g]) => {
    const title = m === "Other" && !viaClaude ? "From Lose It" : m;
    if (!g.length) return `<div class="card meal-card empty"><div class="row between"><h3>${title}</h3>${canAdd ? addFoodBtn(m) : ""}</div></div>`;
    const line = MACROS.filter(([k]) => g.some(i => i[k] != null)).map(([k, l]) => `${fmt(sumOf(g, k))} g ${l.toLowerCase()}`).join(" · ");
    return `<div class="card meal-card">
      <div class="row between"><h3>${title}<b class="num">${fmt(sumOf(g, "kcal"))}</b></h3>${canAdd && m !== "Other" ? addFoodBtn(m) : ""}</div>
      ${line ? `<p class="mac-line">${line}</p>` : ""}
      <ul class="foods">${g.map(i => `<li>${viaClaude && i.food_id ? `<button type="button" class="fitem" data-edit="${i.idx}">` : `<span class="fitem">`}<span>${esc(i.name)}${i.basis === "estimate" ? ' <em class="est" title="Estimated from a photo or description">est.</em>' : ""}<small>${esc([i.time, i.qty].filter(Boolean).join(" · "))}</small></span><b class="num">${fmt(i.kcal)}</b>${viaClaude && i.food_id ? "</button>" : "</span>"}${viaClaude ? `<button class="del" data-del="${i.idx}" aria-label="Remove ${esc(i.name)}">${icon.x}</button>` : ""}</li>`).join("")}</ul>
    </div>`;
  }).join("");
}

export function renderToday(root, ctx) {
  const { state } = ctx;
  const date = state.date, day = state.day;
  const t = targetsFor(date);
  const today = todayISO();
  const future = date > today;
  const stepT = store.program?.stepBonusThreshold || 10000;

  dateNav(root, date, ctx.pickDate, ctx.status);

  if (state.restored) root.appendChild(h(`<div class="banner"><span>Unsaved changes from earlier on this phone.</span><button class="link" data-discard>Discard</button></div>`));
  if (future) root.appendChild(h(`<div class="banner calm"><span><b>Planning ahead.</b> Mark a social day now and we'll size it before it happens.</span></div>`));

  /* ---------- Budget ---------- */
  const f = day.food || {};
  const savedImgs = f.images || [];
  const srcTag = f.source ? `<span class="tag">${f.source?.startsWith("loseit") ? "from LoseIt" : f.source === "claude" ? "meal log" : f.source === "screenshot" ? "screenshots" : "typed"}</span>` : "";
  root.appendChild(h(`<section class="card budget">
    <div class="row between"><h2 data-btitle>Budget</h2>${srcTag}</div>
    <div class="b-top">
      <div class="b-side"><span>Food</span><b class="num" data-kcal>–</b></div>
      <div class="ring"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="rt" cx="60" cy="60" r="52"/><circle class="rf" data-ring cx="60" cy="60" r="52" transform="rotate(-90 60 60)"/></svg>
        <div class="ring-c"><b class="num" data-left>–</b><small data-leftlbl>kcal left</small></div></div>
      <div class="b-side"><span>Protein left</span><b class="num" data-pleft>–</b></div>
    </div>
    <div class="macros">${MACROS.map(([k, l]) => `<div class="mac" data-mac="${k}">
      <div class="mac-h"><span>${l}</span><small class="num" data-togo></small></div>
      <div class="bar thin"><i></i></div>
      <div class="mac-v num"><b data-v>–</b><span data-g></span></div></div>`).join("")}</div>
    <div class="b-foot"><span>Sodium</span><b class="num" data-sodium>–</b></div>
  </section>`));

  /* ---------- Meals ---------- */
  const pw = prevWeight(date);
  root.appendChild(h(`<section class="meals"><div class="row between sec-h"><h2>Meals</h2><small class="fine"></small></div><div data-meals></div></section>`));
  const renderMeals = () => { root.querySelector("[data-meals]").innerHTML = mealsHtml(state.day.food || {}, !future); };

  /* ---------- Weight & steps ---------- */
  root.appendChild(h(`<section class="card form">
    <h2>Weight &amp; steps</h2>
    <div class="fields2">
      <label class="field"><span>Weigh-in</span>
        <div class="inwrap"><input inputmode="decimal" enterkeyhint="next" data-k="weight" data-num placeholder="${pw ? fmt(pw.w, 1) : "lb"}" value="${day.weight ?? ""}"><em>lb</em></div>
        <small class="hint" data-wdelta></small></label>
      <label class="field"><span>Steps</span>
        <div class="inwrap"><input inputmode="numeric" enterkeyhint="next" data-k="steps" data-num placeholder="${fmt(t.steps || 10000)}" value="${day.steps != null ? fmt(day.steps) : ""}"></div>
        <div class="minibar"><i data-stepbar></i></div></label>
    </div>
  </section>`));

  /* ---------- Manual entry (backup): LoseIt import and typed numbers ---------- */
  const manual = h(`<details class="card form manual">
    <summary>Add or fix manually</summary>
    <label class="btn soft wide" data-pdf-label>${icon.doc}<span>Import LoseIt report (PDF)</span><input type="file" accept="application/pdf,.pdf" hidden data-pdf></label>
    <div class="parsed" data-parsed hidden></div>
    <div class="thumbs" data-thumbs></div>
    <div class="grid3">
      ${[["kcal", "Calories", ""], ["protein", "Protein", "g"], ["carbs", "Carbs", "g"], ["fat", "Fat", "g"], ["fiber", "Fiber", "g"], ["sodium", "Sodium", "mg"]].map(([k, l, u]) =>
        `<label class="field compact"><span>${l}</span><div class="inwrap"><input inputmode="decimal" data-k="food.${k}" data-num value="${f[k] != null ? f[k] : ""}">${u ? `<em>${u}</em>` : ""}</div></label>`).join("")}
    </div>
    <p class="fine">Backup for days you don't log through Claude. In LoseIt: Daily Report → Share → Save to Files, then import it here.</p>
  </details>`);

  /* ---------- Day ---------- */
  const lift = day.lift?.exercises?.filter(e => (e.sets || []).some(v => v != null && v !== "")) || [];
  const setsN = lift.reduce((s, e) => s + e.sets.filter(v => v != null && v !== "").length, 0);
  const acts = (day.activity || "").split(" + ").filter(Boolean);
  const dayCard = h(`<section class="card form">
    <h2>Day</h2>
    <div class="seg" role="radiogroup" aria-label="Day type">${DAY_TYPES.map(([v, l]) => `<button role="radio" aria-checked="${(day.day_type || "normal") === v}" class="${(day.day_type || "normal") === v ? "on" : ""} ${v.includes("social") ? "soc" : ""}" data-dt="${v}">${l}</button>`).join("")}</div>
    <div class="chips">${ACTS.map(a => `<button class="chip ${acts.includes(a) ? "on" : ""}" data-act="${a}">${a}</button>`).join("")}</div>
    <label class="field"><span>Activity details</span><div class="inwrap"><input data-k="activity" placeholder="Tap above, or type (e.g. Run 30 min)" value="${esc(day.activity || "")}"></div></label>
    <button class="liftrow" data-golift>
      <span class="lr-ico">${icon.lift}</span>
      <span class="lr-t">${lift.length ? `<b>${esc(day.lift.session || "Lift")}</b><small>${lift.length} exercises · ${setsN} sets</small>` : `<b>No lift logged</b><small>${future ? "Plan it on the Lift tab" : "Blank means rest day"}</small>`}</span>
      <span class="lr-go">${icon.right}</span>
    </button>
    ${runRowHtml(day, date, future)}
  </section>`);
  root.appendChild(dayCard);

  /* ---------- Notes ---------- */
  root.appendChild(h(`<section class="card form">
    <h2>Notes</h2>
    <textarea rows="3" data-k="notes" placeholder="How it went, hunger, sleep, what's coming up…">${esc(day.notes || "")}</textarea>
  </section>`));

  /* ---------- Check in with Claude ---------- */
  if (!future) root.appendChild(h(`<section class="card form claude">
    <div class="row between"><h2>Check in</h2><small class="fine">Paste into this month's chat</small></div>
    <button class="btn primary wide" data-copy>${icon.paste}<span>Copy for Claude</span></button>
  </section>`));

  /* ---------- Monthly (1st of the month, or wherever it was logged) ---------- */
  const m = day.monthly || {};
  if (date.endsWith("-01") || m.bf != null || m.waist != null) root.appendChild(h(`<section class="card form">
    <div class="row between"><h2>Monthly check-in</h2><small class="fine">Fasted, after the weigh-in</small></div>
    <div class="fields2">
      <label class="field"><span>Hume body fat</span><div class="inwrap"><input inputmode="decimal" data-k="monthly.bf" data-num value="${m.bf ?? ""}"><em>%</em></div></label>
      <label class="field"><span>Waist (navel)</span><div class="inwrap"><input inputmode="decimal" data-k="monthly.waist" data-num value="${m.waist ?? ""}"><em>in</em></div></label>
    </div>
  </section>`));

  root.appendChild(manual);
  root.appendChild(h(`<div class="center"><button class="link danger" data-clear>Clear this day</button></div>`));

  async function copySummary() {
    const text = buildSummary(date, state.day, { dirty: ctx.isDirty() });
    try {
      await navigator.clipboard.writeText(text);
      ctx.toast(ctx.isDirty() ? "Copied. Save too, so it's on record." : "Copied. Paste it into the chat.");
    } catch {
      // Clipboard blocked: show it so it can be selected by hand.
      const s = sheet(`<div class="sheet-h"><h2>Copy for Claude</h2><button class="iconbtn" data-close aria-label="Close">${icon.x}</button></div>
        <p class="sub">Long-press, Select All, Copy.</p><textarea rows="12" readonly class="summary-ta">${esc(text)}</textarea>`, "Copy for Claude");
      const ta2 = s.el.querySelector("textarea"); ta2.focus(); ta2.select();
    }
  }

  /* ---------- Add food: usual foods for this meal, or a photo through Claude ---------- */
  const retotal = fd => { for (const k of ["kcal", "protein", "carbs", "fat", "fiber", "sodium"]) { const vals = (fd.items || []).filter(i => i[k] != null); if (vals.length) fd[k] = Math.round(sumOf(vals, k)); else delete fd[k]; } };
  function openAddFood(meal) {
    const fd0 = state.day.food || {};
    if (fd0.source && fd0.source !== "claude" && fd0.kcal != null) return ctx.toast("This day's food came from Lose It. Clear the numbers under Add or fix manually to log by meal.", true);
    const all = [...(store.foods || [])].sort((a, b) => (b.count || 0) - (a.count || 0) || a.name.localeCompare(b.name));
    const usual = all.filter(f => (f.meals || []).includes(meal));
    const chat = store.program?.foodChat || store.program?.claudeSession;
    const chatHref = !chat ? "" : chat.startsWith("session_") ? `claude://code/${esc(chat)}` : `claude://claude.ai/chat/${esc(chat)}`;
    const s = sheet(`<div class="af-head">
        <div class="sheet-h"><h2>Add to ${esc(meal)}</h2><button class="iconbtn" data-close aria-label="Close">${icon.x}</button></div>
        <div class="af-search"><div class="inwrap"><input type="search" placeholder="Search your foods" data-fsearch autocomplete="off" autocorrect="off" enterkeyhint="search"></div>
          ${chatHref ? `<a class="btn soft af-cam" href="${chatHref}" aria-label="Photo or describe it to Claude">${icon.camera}<span>Claude</span></a>` : ""}</div>
      </div>
      <div class="af-tray" data-tray></div>
      <div class="fr-h" data-fh></div>
      <div class="foodlist" data-flist></div>
      <div class="af-foot"><button class="btn primary wide" data-close data-done>Done</button></div>`, `Add to ${meal}`);
    s.el.querySelector(".sheet").classList.add("addfood");
    const list = s.el.querySelector("[data-flist]"), head = s.el.querySelector("[data-fh]"), tray = s.el.querySelector("[data-tray]"), done = s.el.querySelector("[data-done]");
    const pending = [];                                   // added in this sheet; written to the day when it closes
    let showAll = false, query = "";
    const counts = () => pending.reduce((c, it) => (c[it.food_id] = (c[it.food_id] || 0) + 1, c), {});
    const draw = () => {
      const q = query.trim().toLowerCase();
      let rows, label;
      if (q) { rows = all.filter(f => f.name.toLowerCase().includes(q) || (f.loseit_names || []).some(n => n.toLowerCase().includes(q))).slice(0, 40); label = rows.length ? "Matches" : "Not in your foods yet. Send it to Claude instead."; }
      else if (usual.length && !showAll) { rows = usual.slice(0, 12); label = `Your usual for ${meal.toLowerCase()}`; }
      else { rows = all; label = "All your foods"; }
      head.textContent = label;
      list.innerHTML = foodRows(rows, counts()) + (!q && usual.length && !showAll ? `<button type="button" class="fr-more" data-all>Show all ${all.length} foods</button>` : "");
    };
    const drawTray = () => {
      tray.innerHTML = pending.length ? pending.map((it, i) => `<button type="button" class="chip-x" data-undo="${i}" aria-label="Remove ${esc(it.name)}"><span>${esc(it.name)}</span><b class="num">${fmt(it.kcal)}</b>${icon.x}</button>`).join("")
        : `<span class="hint">Tap + for your usual amount, or a name to change it.</span>`;
      if (pending.length) tray.scrollLeft = tray.scrollWidth;
      done.textContent = pending.length ? `Add ${pending.length} to ${meal} · ${fmt(sumOf(pending, "kcal"))} kcal` : "Done";
    };
    const add = (food, amount) => {
      pending.push(libraryItem(food, meal, amount));
      const row = list.querySelector(`[data-row="${CSS.escape(food.id)}"]`);
      if (row) { row.classList.add("has", "pop"); row.querySelector(".fr-add").innerHTML = `<b class="num">${counts()[food.id]}</b>`; row.classList.remove("open"); setTimeout(() => row.classList.remove("pop"), 320); }
      drawTray();
    };
    s.el.querySelector("[data-fsearch]").addEventListener("input", e => { query = e.target.value; draw(); });
    list.addEventListener("click", e => {
      if (e.target.closest("[data-all]")) { showAll = true; return draw(); }
      const quick = e.target.closest("[data-quick]"), open = e.target.closest("[data-open]"), addBtn = e.target.closest("[data-addamt]");
      if (quick) return add(all.find(f => f.id === quick.dataset.quick));
      if (open) {
        const row = open.closest(".foodrow"), food = all.find(f => f.id === open.dataset.open), was = row.classList.contains("open");
        list.querySelectorAll(".foodrow.open").forEach(r => r.classList.remove("open"));
        if (was) return;
        const box = row.querySelector(".fr-edit-in");
        box.innerHTML = `${amountHtml(food)}<button type="button" class="btn primary small" data-addamt>Add</button>`;
        row._read = wireAmount(box, food, a => { box.querySelector("[data-addamt]").disabled = !a; });
        box.querySelector("[data-amount]").addEventListener("keydown", ev => { if (ev.key === "Enter") { ev.preventDefault(); box.querySelector("[data-addamt]").click(); } });
        row.classList.add("open");
        return;
      }
      if (addBtn) { const row = addBtn.closest(".foodrow"), a = row._read?.(); if (a) add(all.find(f => f.id === row.dataset.row), a); }
    });
    tray.addEventListener("click", e => { const b = e.target.closest("[data-undo]"); if (!b) return; pending.splice(Number(b.dataset.undo), 1); draw(); drawTray(); });
    const commit = () => {
      if (!pending.length) return;
      const fd = (state.day.food ??= {});
      fd.source = "claude"; fd.items = [...(fd.items || []), ...pending.splice(0)];
      retotal(fd); ctx.changed(); refresh();
      setTimeout(() => ctx.save(), 280);
    };
    s.el.addEventListener("click", e => { if (e.target === s.el || e.target.closest("[data-close]")) commit(); });
    draw(); drawTray();
  }

  /* ---------- Change the amount of a food already in a meal ---------- */
  function openEditItem(idx) {
    const fd = state.day.food || {}, it = (fd.items || [])[idx], food = (store.foods || []).find(f => f.id === it?.food_id);
    if (!it || !food) return;
    const u = unitOf(food), current = it.amount ?? (food.kcal ? Math.round((it.kcal / food.kcal) * u.base * (u.unit === "g" ? 1 : 2)) / (u.unit === "g" ? 1 : 2) : u.def);
    const s = sheet(`<div class="sheet-h"><h2>${esc(food.name)}</h2><button class="iconbtn" data-close aria-label="Close">${icon.x}</button></div>
      <p class="sub">${esc([it.meal, it.time].filter(Boolean).join(" · "))}</p>
      <div class="edit-amt">${amountHtml(food, current)}</div>
      <button class="btn primary wide" data-update>Update</button>
      <button class="btn ghost wide danger" data-remove>Remove</button>`, "Edit amount");
    const read = wireAmount(s.el.querySelector(".edit-amt"), food, a => { s.el.querySelector("[data-update]").disabled = !a; });
    const finish = () => { retotal(fd); ctx.changed(); refresh(); s.close(); setTimeout(() => ctx.save(), 280); };
    s.el.querySelector("[data-update]").addEventListener("click", () => { const a = read(); if (!a) return; fd.items[idx] = { ...libraryItem(food, it.meal, a), time: it.time }; finish(); });
    s.el.querySelector("[data-remove]").addEventListener("click", () => { fd.items.splice(idx, 1); finish(); });
  }

  /* ---------- live bits ---------- */
  function refresh() {
    const d = state.day, fd = d.food || {};
    const g = goalsFor(t, d.day_type);
    const q = sel => root.querySelector(sel);
    q("[data-btitle]").textContent = g.kcal ? `Budget: ${fmt(g.kcal)} kcal` : "Food";
    q("[data-kcal]").textContent = fmt(fd.kcal);
    const ring = q("[data-ring]"), C = 2 * Math.PI * 52, eaten = fd.kcal || 0;
    if (g.kcal) {
      const left = g.kcal - eaten;
      q("[data-left]").textContent = fmt(Math.abs(left));
      q("[data-leftlbl]").textContent = left >= 0 ? "kcal left" : "kcal over";
      ring.style.strokeDasharray = `${C * Math.min(1, eaten / g.kcal)} ${C}`;
      ring.style.opacity = eaten ? 1 : 0;
      ring.classList.toggle("over", left < -150);
      q(".ring").classList.toggle("is-over", left < -150);
    } else {
      q("[data-left]").textContent = fmt(fd.kcal); q("[data-leftlbl]").textContent = "kcal"; ring.style.strokeDasharray = `0 ${C}`;
    }
    q("[data-pleft]").textContent = fd.protein != null || eaten ? `${fmt(Math.max(0, g.protein - (fd.protein || 0)))} g` : `${fmt(g.protein)} g`;
    for (const [k] of MACROS) {
      const el = q(`[data-mac="${k}"]`), v = fd[k], goal = g[k];
      el.querySelector("[data-v]").textContent = fmt(v);
      el.querySelector("[data-g]").textContent = goal ? ` / ${fmt(goal)} g` : " g";
      const bar = el.querySelector(".bar i"), togo = el.querySelector("[data-togo]");
      bar.style.width = v != null && goal ? Math.min(100, (v / goal) * 100) + "%" : "0";
      const floor = k === "protein" || k === "fiber";              // goals to reach; carbs and fat are budgets
      bar.className = floor ? (v != null && v >= goal * 0.95 ? "hit" : "") : (v != null && goal && v > goal * 1.1 ? "warn" : "");
      togo.textContent = !goal ? "" : v == null ? `${fmt(goal)} to go` : v >= goal ? (floor ? "hit" : v > goal ? `${fmt(v - goal)} over` : "at goal") : `${fmt(goal - v)} to go`;
    }
    q("[data-sodium]").textContent = fd.sodium != null ? `${fmt(fd.sodium)} mg` : "–";
    const sb = q("[data-stepbar]");
    sb.style.width = d.steps != null ? Math.min(100, (d.steps / (t.steps || 10000)) * 100) + "%" : "0";
    sb.classList.toggle("hit", d.steps != null && d.steps >= (t.steps || 10000));
    const wd = q("[data-wdelta]");
    if (d.weight != null && pw) { const x = d.weight - pw.w; wd.textContent = `${x > 0 ? "+" : x < 0 ? "−" : "±"}${fmt(Math.abs(x), 1)} vs ${md(pw.date)}`; }
    else wd.textContent = pw ? `Last: ${fmt(pw.w, 1)} on ${md(pw.date)}` : "";
    renderMeals();
    renderThumbs();
  }

  function renderThumbs() {
    const box = root.querySelector("[data-thumbs]");
    const imgs = [...(state.day.food?.images || []).map(p => ({ src: RAW + p, path: p })), ...state.pending.map((p, i) => ({ src: p.preview, pending: i }))];
    box.innerHTML = imgs.map(i => `<div class="thumb ${i.pending != null ? "pending" : ""}"><img src="${i.src}" alt="Food screenshot" loading="lazy"><button aria-label="Remove" data-rm="${i.pending != null ? "p" + i.pending : esc(i.path)}">${icon.x}</button></div>`).join("");
  }

  /* ---------- events ---------- */
  root.addEventListener("input", e => {
    const el = e.target; const k = el.dataset.k;
    if (!k) return;
    let v = el.value;
    if ("num" in el.dataset) v = numOrNull(v);
    setPath(state.day, k, v === "" ? null : v);
    if (k.startsWith("food.") && !state.day.food.source) state.day.food.source = state.pending.length || state.day.food.images?.length ? "screenshot" : "manual";
    ctx.changed(); refresh();
  });
  root.addEventListener("blur", e => {
    if (e.target.dataset.k === "steps" && state.day.steps != null) e.target.value = fmt(state.day.steps);
  }, true);

  const pastePanel = root.querySelector(".paste"), ta = root.querySelector("[data-paste]");
  const applyParse = (text) => {
    const r = parseLoseIt(text, stepT);
    const out = root.querySelector("[data-parsed]");
    if (!r) { const rep = parseReportText(text); if (rep) { out.hidden = true; return reviewReport(rep, "pasted report"); } }
    if (!r) { out.hidden = false; out.className = "parsed bad"; out.textContent = "Couldn't find LoseIt numbers in that. Copy the whole page (Ctrl+A) on loseit.com."; return; }
    const patch = d => {
      d.food = { ...(d.food || {}), source: "loseit" };
      for (const k of ["kcal", "protein", "carbs", "fat", "fiber", "sodium"]) if (r[k] != null) d.food[k] = r[k];
      d.food.items = r.items;
      if (r.steps != null && d.steps == null) d.steps = r.steps;
    };
    if (r.date && r.date !== date) {
      out.hidden = false; out.className = "parsed warn";
      out.innerHTML = `This paste is for <b>${md(r.date)}</b>, not ${md(date)}. <button class="link" data-move>Log it on ${md(r.date)}</button> · <button class="link" data-here>Use it here anyway</button>`;
      out.querySelector("[data-move]").onclick = () => ctx.moveTo(r.date, patch);
      out.querySelector("[data-here]").onclick = () => { patch(state.day); ctx.changed(); ctx.rerender(); };
      return;
    }
    patch(state.day); ctx.changed(); ctx.rerender();
    ctx.toast(`Read ${r.items.length} foods · ${fmt(r.kcal)} kcal${r.steps != null ? ` · ${fmt(r.steps)} steps` : r.stepsNote ? " · steps over 10k, type them" : ""}`);
  };
  ta?.addEventListener("paste", () => setTimeout(() => applyParse(ta.value), 30));
  ta?.addEventListener("change", () => applyParse(ta.value));

  root.addEventListener("click", async e => {
    const b = e.target.closest("button"); if (!b) return;
    if ("discard" in b.dataset) return ctx.discardDraft();
    if ("copy" in b.dataset) return copySummary();
    if ("openPaste" in b.dataset) { pastePanel.hidden = false; ta.focus(); return; }
    if ("closePaste" in b.dataset) { pastePanel.hidden = true; if (ta.value.trim()) applyParse(ta.value); return; }
    if ("clip" in b.dataset) {
      try { const txt = await navigator.clipboard.readText(); ta.value = txt; applyParse(txt); }
      catch { ctx.toast("Clipboard blocked. Long-press the box and Paste.", true); ta.focus(); }
      return;
    }
    if (b.dataset.dt) { state.day.day_type = b.dataset.dt; ctx.changed(); root.querySelectorAll("[data-dt]").forEach(x => { const on = x.dataset.dt === b.dataset.dt; x.classList.toggle("on", on); x.setAttribute("aria-checked", on); }); refresh(); return; }
    if (b.dataset.add != null) return openAddFood(b.dataset.add);
    if (b.dataset.edit != null) return openEditItem(Number(b.dataset.edit));
    if (b.dataset.del != null) {
      const fd = state.day.food, items = (fd.items || []).filter((_, i) => i !== Number(b.dataset.del));
      fd.items = items;
      for (const k of ["kcal", "protein", "carbs", "fat", "fiber", "sodium"]) { const vals = items.filter(i => i[k] != null); if (vals.length) fd[k] = Math.round(sumOf(vals, k)); else delete fd[k]; }
      ctx.changed(); refresh(); return;
    }
    if (b.dataset.act) {
      const list = (state.day.activity || "").split(" + ").filter(Boolean);
      const i = list.indexOf(b.dataset.act);
      if (i >= 0) list.splice(i, 1); else list.push(b.dataset.act);
      state.day.activity = list.join(" + ") || null;
      b.classList.toggle("on", i < 0);
      root.querySelector('[data-k="activity"]').value = state.day.activity || "";
      ctx.changed(); return;
    }
    if ("golift" in b.dataset) return ctx.goTab("lift");
    if ("gorun" in b.dataset) return ctx.goTab("run");
    if (b.dataset.rm) {
      if (b.dataset.rm.startsWith("p")) state.pending.splice(Number(b.dataset.rm.slice(1)), 1);
      else state.day.food.images = state.day.food.images.filter(p => p !== b.dataset.rm);
      ctx.changed(); renderThumbs(); return;
    }
    if ("clear" in b.dataset) {
      if (confirm(`Clear everything logged for ${md(date)}? It's removed from the repo when you save.`)) { state.day = {}; state.pending = []; ctx.changed(); ctx.rerender(); }
    }
  });

  /* ---------- LoseIt report PDF ---------- */
  function reviewReport(rep, label) {
    const dates = Object.keys(rep.days).sort();
    const rows = dates.map(d => {
      const f = rep.days[d], cur = (d === date ? state.saved : null) || getDay(d) || {};
      const closed = isClosedDate(d);
      const same = !closed && cur.food?.kcal === f.kcal && cur.food?.protein === f.protein && (f.weight == null || cur.weight === f.weight);
      const status = closed ? "in September's record" : same ? "already logged" : cur.food?.kcal != null || cur.weight != null ? "updates" : "new";
      return { d, f, closed, same, status };
    });
    const pick = rows.filter(r => !r.closed && !r.same).length;
    const s = sheet(`
      <div class="sheet-h"><h2>${esc(rep.title || "LoseIt report")}</h2><button class="iconbtn" data-close aria-label="Close">${icon.x}</button></div>
      <p class="sub">${dates.some(d => rep.days[d].steps != null) ? "Calories, macros, foods, weight and steps." : "Calories, macros, sodium and weight for each day."} Lifts and notes aren't touched.</p>
      <div class="rlist">${rows.map(r => `<label class="rrow ${r.closed ? "off" : ""}">
          <input type="checkbox" data-d="${r.d}" ${!r.closed && !r.same ? "checked" : ""} ${r.closed ? "disabled" : ""}>
          <span class="rd"><b>${parseISO(r.d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</b>
            <small class="num">${fmt(r.f.kcal)} kcal · ${fmt(r.f.protein)} g P${r.f.weight != null ? ` · ${fmt(r.f.weight, 1)} lb` : ""}${r.f.steps != null ? ` · ${fmt(r.f.steps)} steps` : ""}${r.f.items?.length ? ` · ${r.f.items.length} foods` : ""}${r.f.incomplete ? " · partial nutrients" : ""}</small></span>
          <span class="rs ${r.status.replace(/\W+/g, "-")}">${r.status}</span></label>`).join("")}</div>
      <div class="row gap"><button class="btn primary grow" data-apply ${pick ? "" : "disabled"}>${token.get() ? `Apply to <span data-n>${pick}</span> day<span data-pl>${pick === 1 ? "" : "s"}</span>` : "Connect GitHub to import"}</button></div>`, "Import LoseIt report");
    const el = s.el, btn = el.querySelector("[data-apply]");
    el.addEventListener("change", () => { const k = el.querySelectorAll("input[data-d]:checked").length; const n = el.querySelector("[data-n]"); if (n) { n.textContent = k; el.querySelector("[data-pl]").textContent = k === 1 ? "" : "s"; } btn.disabled = token.get() ? !k : false; });
    btn.addEventListener("click", async () => {
      const chosen = [...el.querySelectorAll("input[data-d]:checked")].map(i => i.dataset.d);
      if (!token.get()) { s.close(); return ctx.openSettings(); }
      btn.disabled = true; btn.textContent = "Saving…";
      const ok = await ctx.applyReport(Object.fromEntries(chosen.map(d => [d, rep.days[d]])), label);
      if (ok) s.close(); else { btn.disabled = false; btn.textContent = "Try again"; }
    });
  }
  root.querySelector("[data-pdf]").addEventListener("change", async e => {
    const file = e.target.files[0]; e.target.value = "";
    if (!file) return;
    const lbl = root.querySelector("[data-pdf-label] span"); const was = lbl.textContent; lbl.textContent = "Reading PDF…";
    try {
      const rep = parseLoseItReport(await pdfToLines(file));
      if (!rep) ctx.toast(`That PDF doesn't look like a LoseIt report. Build ${VERSION}.`, true);
      else reviewReport(rep, "the PDF");
    } catch (err) { console.error(err); ctx.toast(`Couldn't read that PDF (${err?.message || err}). Build ${VERSION}.`, true); }
    finally { lbl.textContent = was; }
  });

  root.querySelector("[data-files]")?.addEventListener("change", async e => {
    for (const file of e.target.files) {
      try { state.pending.push(await compressImage(file)); } catch { ctx.toast("Couldn't read that image", true); }
    }
    e.target.value = "";
    state.day.food ??= {};
    if (!state.day.food.source) state.day.food.source = "screenshot";
    ctx.changed(); renderThumbs();
  });

  refresh();
}

function runRowHtml(day, date, future) {
  const plan = plannedOn(date), r = day.run || {};
  if (!plan && r.mi == null && !r.skipped) return "";
  const t = r.skipped ? `<b>Run skipped</b><small>Planned ${plan?.mi ?? r.planned ?? ""} mi</small>`
    : r.mi != null ? `<b>Ran ${fmt(r.mi, Number.isInteger(r.mi) ? 0 : 1)} mi</b><small>${plan ? `Plan ${plan.mi} mi` : "Unplanned run"}</small>`
    : `<b>${plan.mi} mi ${plan.kind === "long" ? "long run" : plan.kind === "race" ? "race" : "easy run"}${plan.optional ? " (optional)" : ""}</b><small>${future ? "Planned" : "Not logged yet"}</small>`;
  return `<button class="liftrow" data-gorun><span class="lr-ico run">${icon.run}</span><span class="lr-t">${t}</span><span class="lr-go">${icon.right}</span></button>`;
}
