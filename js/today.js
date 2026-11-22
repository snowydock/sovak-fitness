import { store, targetsFor, compressImage, todayISO, addDays, getDay, RAW, parseISO, plannedOn } from "./store.js?v=202611222036";
import { h, esc, fmt, numOrNull, md, icon, dateNav, sheet } from "./ui.js?v=202611222036";
import { parseLoseIt, parseReportText, parseLoseItReport, pdfToLines } from "./parsers.js?v=202611222036";
import { isClosedDate, token } from "./store.js?v=202611222036";
import { buildSummary } from "./summary.js?v=202611222036";
import { VERSION } from "./version.js?v=202611222036";

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
function addFoodBtn(label = "Add food") {
  const id = store.program?.claudeSession;
  return id ? `<a class="btn small add" href="claude://code/${esc(id)}">${icon.plus || "+"}<span>${label}</span></a>` : "";
}
function mealsHtml(f, canAdd) {
  const items = (f.items || []).map((it, idx) => ({ ...it, idx }));
  const viaClaude = f.source === "claude";
  const groups = [...MEALS, "Other"].map(m => [m, items.filter(i => (i.meal || "Other") === m)])
    .filter(([m, g]) => g.length || ALWAYS.includes(m));
  return groups.map(([m, g]) => {
    const title = m === "Other" && !viaClaude ? "From Lose It" : m;
    if (!g.length) return `<div class="card meal-card empty"><div class="row between"><h3>${title}</h3>${canAdd ? addFoodBtn() : ""}</div></div>`;
    const line = MACROS.filter(([k]) => g.some(i => i[k] != null)).map(([k, l]) => `${fmt(sumOf(g, k))} g ${l.toLowerCase()}`).join(" · ");
    return `<div class="card meal-card">
      <div class="row between"><h3>${title}<b class="num">${fmt(sumOf(g, "kcal"))}</b></h3>${canAdd && m !== "Other" ? addFoodBtn() : ""}</div>
      ${line ? `<p class="mac-line">${line}</p>` : ""}
      <ul class="foods">${g.map(i => `<li><span>${esc(i.name)}${i.basis === "estimate" ? ' <em class="est" title="Estimated from a photo or description">est.</em>' : ""}<small>${esc([i.time, i.qty].filter(Boolean).join(" · "))}</small></span><b class="num">${fmt(i.kcal)}</b>${viaClaude ? `<button class="del" data-del="${i.idx}" aria-label="Remove ${esc(i.name)}">${icon.x}</button>` : ""}</li>`).join("")}</ul>
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
  const srcTag = f.source ? `<span class="tag">${f.source?.startsWith("loseit") ? "from LoseIt" : f.source === "claude" ? "from Claude" : f.source === "screenshot" ? "screenshots" : "typed"}</span>` : "";
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
  root.appendChild(h(`<section class="meals"><div class="row between sec-h"><h2>Meals</h2><small class="fine">${store.program?.claudeSession && !future ? "Add food opens Claude" : ""}</small></div><div data-meals></div></section>`));
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
