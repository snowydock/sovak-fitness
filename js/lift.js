import { store, liftHistory, todayISO, getDay } from "./store.js?v=202610022245";
import { h, esc, fmt, numOrNull, md, icon, dateNav } from "./ui.js?v=202610022245";
import { parseNotes } from "./parsers.js?v=202610022245";

function sessionKey(name = "") {
  if (/upper\s*a/i.test(name)) return "Upper A";
  if (/upper\s*b/i.test(name)) return "Upper B";
  if (/lower|squat|rdl|leg/i.test(name)) return "Lower";
  return null;
}

// Rotation: whichever session was done longest ago (never = first).
function suggestSession(date, hist, rotation) {
  const last = {};
  for (const r of hist) { if (r.date >= date) continue; const k = sessionKey(r.session); if (k && (!last[k] || r.date > last[k])) last[k] = r.date; }
  return [...rotation].sort((a, b) => (last[a] || "").localeCompare(last[b] || "") || rotation.indexOf(a) - rotation.indexOf(b))[0];
}

function lastFor(name, date, hist) {
  const rows = hist.filter(r => r.exercise === name && r.date < date && r.set_type !== "drop");
  if (!rows.length) return null;
  const d = rows.reduce((m, r) => (r.date > m ? r.date : m), "");
  const sets = rows.filter(r => r.date === d).sort((a, b) => Number(a.set) - Number(b.set));
  return { date: d, w: Math.max(...sets.map(s => Number(s.weight_lb) || 0)), reps: sets.map(s => Number(s.reps)) };
}

function targetFor(spec, last) {
  if (spec?.bw) return { w: 0, why: "Bodyweight", dir: "same" };
  if (!last) return { w: spec?.start ?? null, why: spec?.start ? "Starting weight" : "", dir: "start" };
  if (!spec) return { w: last.w, why: "Match last time", dir: "same" };
  const full = last.reps.length >= spec.sets && last.reps.every(r => r >= spec.hi);
  if (full) {
    if (spec.db && last.w >= 50) return { w: 50, why: "DBs maxed: add reps or slow the lowering", dir: "same" };
    return { w: last.w + (spec.inc || 5), why: `Hit ${spec.hi}s on every set last time`, dir: "up" };
  }
  const short = last.reps.length < spec.sets ? `Log all ${spec.sets} sets` : `Get every set to ${spec.hi}`;
  return { w: last.w, why: short, dir: "same" };
}

export function renderLift(root, ctx) {
  const { state } = ctx;
  const date = state.date, prog = store.program;
  const hist = liftHistory().filter(r => r.date !== date);
  const rotation = prog.rotation;
  const suggested = suggestSession(date, hist, rotation);

  state.day.lift ??= { session: suggested, exercises: [] };
  const L = state.day.lift;
  L.session ||= suggested;
  const template = prog.sessions[L.session] || [];

  // Build the working list: template order first, then any extras already entered.
  const byName = Object.fromEntries((L.exercises || []).map(e => [e.name, e]));
  const rows = template.map(spec => byName[spec.name] || { name: spec.name, weight: null, sets: Array(spec.sets).fill(null), drop: null });
  for (const e of L.exercises || []) if (!template.some(s => s.name === e.name)) rows.push(e);
  rows.forEach(r => { const spec = template.find(s => s.name === r.name); while (spec && r.sets.length < spec.sets) r.sets.push(null); });
  L.exercises = rows;

  dateNav(root, date, ctx.pickDate, ctx.status);
  if (state.restored) root.appendChild(h(`<div class="banner"><span>Unsaved changes from earlier on this phone.</span><button class="link" data-discard>Discard</button></div>`));

  const top = h(`<section class="card form">
    <div class="row between"><h2>Session</h2><span class="tag">Next up: ${esc(suggested)}</span></div>
    <div class="seg">${[...rotation, "Other"].map(s => `<button class="${L.session === s ? "on" : ""}" data-session="${s}">${s}</button>`).join("")}</div>
    <div class="stats3">
      <div><b class="num" data-st-ex>0</b><small>exercises</small></div>
      <div><b class="num" data-st-sets>0</b><small>sets</small></div>
      <div><b class="num" data-st-vol>0</b><small>lb volume</small></div>
    </div>
    <div class="tools one">
      <button class="btn soft" data-notes>${icon.paste}<span>Paste from Notes</span></button>
    </div>
    <div class="paste" hidden data-notes-panel>
      <textarea rows="5" placeholder="Paste an Apple Notes block (--- UPPER B --- … s1 12 s2 12 s3 12)" data-notes-ta></textarea>
      <div class="row gap"><button class="btn primary small" data-notes-apply>Fill in</button><button class="btn ghost small" data-notes-close>Cancel</button></div>
    </div>
  </section>`);
  root.appendChild(top);

  const list = h(`<div class="exlist"></div>`);
  root.appendChild(list);

  rows.forEach((ex, i) => {
    const spec = template.find(s => s.name === ex.name);
    const last = lastFor(ex.name, date, hist);
    const tg = targetFor(spec, last);
    ex.target = tg.w;
    const range = spec ? `${spec.sets} × ${spec.lo}–${spec.hi}` : "";
    const lastTxt = last ? `Last ${last.w ? fmt(last.w) : "BW"} × ${last.reps.join("/")} · ${md(last.date)}` : "No history yet";
    const showDrop = spec?.drop || ex.drop;
    const card = h(`<article class="ex" data-i="${i}">
      <header>
        <div class="ex-t"><b>${esc(ex.name)}</b>${spec?.ss ? `<span class="ss">SS ${spec.ss}</span>` : ""}<small>${range}${range ? " · " : ""}${lastTxt}</small></div>
        <span class="ex-check">${icon.check}</span>
      </header>
      ${tg.why ? `<div class="target ${tg.dir}">${tg.dir === "up" ? "▲ " : ""}<b class="num">${spec?.bw ? "BW" : fmt(tg.w)}</b> · ${esc(tg.why)}</div>` : ""}
      ${spec?.note ? `<div class="exnote">${esc(spec.note)}</div>` : ""}
      <div class="ex-row">
        ${spec?.bw ? "" : `<label class="wt"><input inputmode="decimal" data-f="weight" placeholder="${tg.w ?? "lb"}" value="${ex.weight ?? ""}" aria-label="${esc(ex.name)} weight"><em>lb</em></label>`}
        <div class="sets">${ex.sets.map((v, j) => `<input inputmode="numeric" data-set="${j}" placeholder="${last?.reps[j] ?? spec?.hi ?? ""}" value="${v ?? ""}" aria-label="Set ${j + 1} reps">`).join("")}
          <button class="addset" data-addset aria-label="Add a set">${icon.plus}</button></div>
      </div>
      ${showDrop ? `<div class="drop ${ex.drop ? "" : "off"}">
        ${ex.drop ? `<span>Drop</span><label class="wt sm"><input inputmode="decimal" data-f="dropw" placeholder="${spec?.name === "Concentration Curl" ? 15 : Math.max(0, (tg.w || 0) - 5)}" value="${ex.drop.weight ?? ""}"><em>lb</em></label><span>×</span><input class="dropr" inputmode="numeric" data-f="dropr" value="${ex.drop.reps ?? ""}" placeholder="reps"><button class="link" data-dropoff>remove</button>` : `<button class="link" data-dropon>+ drop set</button>`}
      </div>` : ""}
    </article>`);
    list.appendChild(card);
  });

  const add = h(`<section class="card form addex">
    <div class="row gap"><div class="inwrap grow"><input data-newname placeholder="Add an exercise (e.g. Bulgarian Split Squat)"></div><button class="btn soft" data-add>${icon.plus}<span>Add</span></button></div>
    <div class="row between"><button class="link danger" data-clearlift>Clear this lift</button><span class="fine">Blank sets aren't saved.</span></div>
  </section>`);
  root.appendChild(add);

  function refresh() {
    let ex = 0, sets = 0, vol = 0;
    rows.forEach((r, i) => {
      const done = r.sets.filter(v => v != null && v !== "");
      if (done.length) ex++;
      sets += done.length;
      const w = r.weight ?? r.target ?? 0;
      vol += done.reduce((s, v) => s + v * w, 0) + (r.drop?.reps ? r.drop.reps * (r.drop.weight ?? 0) : 0);
      const spec = template.find(s => s.name === r.name);
      list.children[i]?.classList.toggle("done", done.length >= (spec?.sets || r.sets.length) && done.length > 0);
      list.children[i]?.classList.toggle("started", done.length > 0);
    });
    top.querySelector("[data-st-ex]").textContent = `${ex}/${rows.length}`;
    top.querySelector("[data-st-sets]").textContent = sets;
    top.querySelector("[data-st-vol]").textContent = fmt(vol);
  }

  root.addEventListener("input", e => {
    const card = e.target.closest(".ex"); if (!card) return;
    const ex = rows[Number(card.dataset.i)];
    const v = numOrNull(e.target.value);
    if (e.target.dataset.set != null) ex.sets[Number(e.target.dataset.set)] = v;
    else if (e.target.dataset.f === "weight") ex.weight = v;
    else if (e.target.dataset.f === "dropw") ex.drop.weight = v;
    else if (e.target.dataset.f === "dropr") ex.drop.reps = v;
    ctx.changed(); refresh();
  });

  root.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if ("discard" in b.dataset) return ctx.discardDraft();
    if (b.dataset.session) {
      L.session = b.dataset.session;
      L.exercises = rows.filter(r => r.sets.some(v => v != null && v !== ""));
      ctx.changed(); return ctx.rerender();
    }
    const card = b.closest(".ex"); const ex = card ? rows[Number(card.dataset.i)] : null;
    if ("addset" in b.dataset) { ex.sets.push(null); ctx.changed(); ctx.rerender(); return; }
    if ("dropon" in b.dataset) { ex.drop = { weight: null, reps: null }; ctx.changed(); ctx.rerender(); return; }
    if ("dropoff" in b.dataset) { ex.drop = null; ctx.changed(); ctx.rerender(); return; }
    if ("add" in b.dataset) {
      const inp = root.querySelector("[data-newname]"); const name = inp.value.trim(); if (!name) return inp.focus();
      L.exercises.push({ name, weight: null, sets: [null, null, null], drop: null });
      ctx.changed(); ctx.rerender(); return;
    }
    if ("clearlift" in b.dataset) { if (confirm("Clear every set for this lift?")) { state.day.lift = { session: L.session, exercises: [] }; ctx.changed(); ctx.rerender(); } return; }
    if ("notes" in b.dataset) { const p = root.querySelector("[data-notes-panel]"); p.hidden = false; p.querySelector("textarea").focus(); return; }
    if ("notesClose" in b.dataset) { root.querySelector("[data-notes-panel]").hidden = true; return; }
    if ("notesApply" in b.dataset) {
      const r = parseNotes(root.querySelector("[data-notes-ta]").value, prog);
      if (!r) return ctx.toast("Couldn't read that block. Each exercise needs a line like “RDL 150 (3x8-10)”.", true);
      L.session = r.session && prog.sessions[r.session] ? r.session : L.session;
      L.exercises = r.exercises.map(x => ({ name: x.name, weight: x.weight, sets: x.sets, drop: x.drop }));
      ctx.changed(); ctx.rerender();
      ctx.toast(`Filled ${r.exercises.length} exercises${r.session ? ` · ${r.session}` : ""}`);
    }
  });

  refresh();
}
