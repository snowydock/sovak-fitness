import { store, targetsFor, compressImage, todayISO, addDays, getDay, RAW, parseISO } from "./store.js?v=202610021933";
import { h, esc, fmt, numOrNull, md, icon, dateNav, sheet } from "./ui.js?v=202610021933";
import { parseLoseIt, parseReportText, parseLoseItReport, pdfToLines } from "./parsers.js?v=202610021933";
import { isClosedDate, token } from "./store.js?v=202610021933";
import { buildSummary } from "./summary.js?v=202610021933";
import { VERSION } from "./version.js?v=202610021933";

const DAY_TYPES = [["normal", "Normal"], ["light_social", "Light social"], ["heavy_social", "Heavy social"], ["travel", "Travel"]];
const ACTS = ["Flag football", "Run", "Walk", "Cardio", "Sport"];

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

  /* ---------- Morning ---------- */
  const pw = prevWeight(date);
  const morning = h(`<section class="card form">
    <h2>Morning</h2>
    <div class="fields2">
      <label class="field"><span>Weigh-in</span>
        <div class="inwrap"><input inputmode="decimal" enterkeyhint="next" data-k="weight" data-num placeholder="${pw ? fmt(pw.w, 1) : "lb"}" value="${day.weight ?? ""}"><em>lb</em></div>
        <small class="hint" data-wdelta></small></label>
      <label class="field"><span>Steps</span>
        <div class="inwrap"><input inputmode="numeric" enterkeyhint="next" data-k="steps" data-num placeholder="${fmt(t.steps || 10000)}" value="${day.steps != null ? fmt(day.steps) : ""}"></div>
        <div class="minibar"><i data-stepbar></i></div></label>
    </div>
  </section>`);
  root.appendChild(morning);

  /* ---------- Food ---------- */
  const f = day.food || {};
  const savedImgs = f.images || [];
  const food = h(`<section class="card form">
    <div class="row between"><h2>Food</h2>${f.source ? `<span class="tag">${f.source?.startsWith("loseit") ? "from LoseIt" : f.source === "screenshot" ? "screenshots" : "typed"}</span>` : ""}</div>
    <div class="meter">
      <div class="m-row"><span class="m-big num" data-kcal>–</span><span class="m-of num">${t.kcal ? `/ ${fmt(t.kcal)} kcal` : "kcal"}</span><span class="m-delta num" data-kdelta></span></div>
      <div class="bar"><i data-kbar></i>${t.kcal ? `<b class="tick" style="left:${(t.kcal / (t.kcal * 1.5)) * 100}%"></b>` : ""}</div>
      <div class="m-row small"><span>Protein</span><span class="num" data-pro>–</span><span class="m-of num">/ ${fmt(t.protein)} g</span></div>
      <div class="bar thin"><i data-pbar class="pro"></i></div>
    </div>
    <label class="btn primary wide" data-pdf-label>${icon.doc}<span>Import LoseIt report (PDF)</span><input type="file" accept="application/pdf,.pdf" hidden data-pdf></label>
    <div class="parsed" data-parsed hidden></div>
    <div class="thumbs" data-thumbs></div>
    <div class="grid3">
      ${[["kcal", "Calories", ""], ["protein", "Protein", "g"], ["carbs", "Carbs", "g"], ["fat", "Fat", "g"], ["fiber", "Fiber", "g"], ["sodium", "Sodium", "mg"]].map(([k, l, u]) =>
        `<label class="field compact"><span>${l}</span><div class="inwrap"><input inputmode="decimal" data-k="food.${k}" data-num value="${f[k] != null ? f[k] : ""}">${u ? `<em>${u}</em>` : ""}</div></label>`).join("")}
    </div>
    ${f.items?.length ? `<details class="items"><summary>${f.items.length} foods logged</summary><ul>${f.items.map(i => `<li><span>${esc(i.name)}<small>${esc(i.qty || "")}</small></span><b class="num">${fmt(i.kcal)}</b></li>`).join("")}</ul></details>` : ""}
    <p class="fine">In LoseIt: Daily Report → Share → Save to Files, then import it here. Or type the numbers.</p>
  </section>`);
  root.appendChild(food);

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
    const kcal = fd.kcal, pro = fd.protein;
    root.querySelector("[data-kcal]").textContent = fmt(kcal);
    root.querySelector("[data-pro]").textContent = pro != null ? fmt(pro) + " g" : "–";
    const kd = root.querySelector("[data-kdelta]");
    if (t.kcal && kcal != null) { const diff = kcal - t.kcal; kd.textContent = (diff > 0 ? "+" : "") + fmt(diff); kd.className = "m-delta num " + (diff > 150 ? "over" : diff < -150 ? "under" : "ok"); }
    else kd.textContent = "";
    const kb = root.querySelector("[data-kbar]");
    kb.style.width = kcal != null && t.kcal ? Math.min(100, (kcal / (t.kcal * 1.5)) * 100) + "%" : "0";
    kb.className = kcal != null && t.kcal && kcal > t.kcal + 150 ? "over" : "";
    root.querySelector("[data-pbar]").style.width = pro != null ? Math.min(100, (pro / (t.protein || 180)) * 100) + "%" : "0";
    root.querySelector("[data-pbar]").classList.toggle("hit", pro != null && pro >= (t.protein || 180) * 0.95);
    const sb = root.querySelector("[data-stepbar]");
    sb.style.width = d.steps != null ? Math.min(100, (d.steps / (t.steps || 10000)) * 100) + "%" : "0";
    sb.classList.toggle("hit", d.steps != null && d.steps >= (t.steps || 10000));
    const wd = root.querySelector("[data-wdelta]");
    if (d.weight != null && pw) { const x = d.weight - pw.w; wd.textContent = `${x > 0 ? "+" : x < 0 ? "−" : "±"}${fmt(Math.abs(x), 1)} vs ${md(pw.date)}`; }
    else wd.textContent = pw ? `Last: ${fmt(pw.w, 1)} on ${md(pw.date)}` : "";
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
    if (b.dataset.dt) { state.day.day_type = b.dataset.dt; ctx.changed(); root.querySelectorAll("[data-dt]").forEach(x => { const on = x.dataset.dt === b.dataset.dt; x.classList.toggle("on", on); x.setAttribute("aria-checked", on); }); return; }
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
