import { store, targetsFor, compressImage, todayISO, addDays, getDay, RAW } from "./store.js";
import { h, esc, fmt, numOrNull, md, icon, dateNav } from "./ui.js";
import { parseLoseIt } from "./parsers.js";

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
    <div class="row between"><h2>Food</h2>${f.source ? `<span class="tag">${f.source === "loseit" ? "from LoseIt" : f.source === "screenshot" ? "screenshots" : "typed"}</span>` : ""}</div>
    <div class="meter">
      <div class="m-row"><span class="m-big num" data-kcal>–</span><span class="m-of num">${t.kcal ? `/ ${fmt(t.kcal)} kcal` : "kcal"}</span><span class="m-delta num" data-kdelta></span></div>
      <div class="bar"><i data-kbar></i>${t.kcal ? `<b class="tick" style="left:${(t.kcal / (t.kcal * 1.5)) * 100}%"></b>` : ""}</div>
      <div class="m-row small"><span>Protein</span><span class="num" data-pro>–</span><span class="m-of num">/ ${fmt(t.protein)} g</span></div>
      <div class="bar thin"><i data-pbar class="pro"></i></div>
    </div>
    <div class="row gap wrap tools">
      <button class="btn soft" data-open-paste>${icon.paste}<span>Paste LoseIt</span></button>
      <label class="btn soft">${icon.camera}<span>Screenshots</span><input type="file" accept="image/*" multiple hidden data-files></label>
    </div>
    <div class="paste" hidden>
      <textarea rows="4" placeholder="On loseit.com: Ctrl+A, copy, paste here. Macros, foods and steps fill in automatically." data-paste></textarea>
      <div class="row gap"><button class="btn ghost small" data-clip>Paste from clipboard</button><button class="btn ghost small" data-close-paste>Done</button></div>
    </div>
    <div class="parsed" data-parsed hidden></div>
    <div class="thumbs" data-thumbs></div>
    <div class="grid3">
      ${[["kcal", "Calories", ""], ["protein", "Protein", "g"], ["carbs", "Carbs", "g"], ["fat", "Fat", "g"], ["fiber", "Fiber", "g"], ["sodium", "Sodium", "mg"]].map(([k, l, u]) =>
        `<label class="field compact"><span>${l}</span><div class="inwrap"><input inputmode="decimal" data-k="food.${k}" data-num value="${f[k] != null ? f[k] : ""}">${u ? `<em>${u}</em>` : ""}</div></label>`).join("")}
    </div>
    ${f.items?.length ? `<details class="items"><summary>${f.items.length} foods logged</summary><ul>${f.items.map(i => `<li><span>${esc(i.name)}<small>${esc(i.qty || "")}</small></span><b class="num">${fmt(i.kcal)}</b></li>`).join("")}</ul></details>` : ""}
    <p class="fine">Screenshots are saved to the public repo. On screenshot days, type at least calories and protein.</p>
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

  /* ---------- Monthly ---------- */
  const m = day.monthly || {};
  const monthly = h(`<details class="card form monthly" ${date.endsWith("-01") || m.bf != null || m.waist != null ? "open" : ""}>
    <summary><h2>Monthly check-in</h2><small>1st of the month, fasted</small></summary>
    <div class="fields2">
      <label class="field"><span>Hume body fat</span><div class="inwrap"><input inputmode="decimal" data-k="monthly.bf" data-num value="${m.bf ?? ""}"><em>%</em></div></label>
      <label class="field"><span>Waist (navel)</span><div class="inwrap"><input inputmode="decimal" data-k="monthly.waist" data-num value="${m.waist ?? ""}"><em>in</em></div></label>
    </div>
  </details>`);
  root.appendChild(monthly);

  root.appendChild(h(`<div class="center"><button class="link danger" data-clear>Clear this day</button></div>`));

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
  ta.addEventListener("paste", () => setTimeout(() => applyParse(ta.value), 30));
  ta.addEventListener("change", () => applyParse(ta.value));

  root.addEventListener("click", async e => {
    const b = e.target.closest("button"); if (!b) return;
    if ("discard" in b.dataset) return ctx.discardDraft();
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

  root.querySelector("[data-files]").addEventListener("change", async e => {
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
