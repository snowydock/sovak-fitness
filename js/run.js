// Run tab: the Cleveland plan slotted onto the calendar, with each run logged against it.
import { store, todayISO, addDays, parseISO, plannedOn, planWeek, planRuns, runHistory } from "./store.js?v=202611031824";
import { h, esc, fmt, numOrNull, md, icon, dateNav } from "./ui.js?v=202611031824";

const EFFORT = [["easy", "Easy"], ["steady", "Steady"], ["hard", "Hard"], ["very_hard", "Very hard"]];
const PAIN = [["none", "None"], ["niggle", "Niggle"], ["pain", "Pain"]];
const RATIOS = ["1:1", "2:1", "3:1", "4:1", "5:1", "Continuous"];
const KIND = { easy: "Easy run", long: "Long run", race: "Race day" };
const DAYN = { tue: "Tue", thu: "Thu", sat: "Sat", sun: "Sun" };

// "26:40", "1:05:30", "26" (minutes) -> seconds
export function parseTime(s) {
  s = String(s ?? "").trim(); if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s) * 60);
  const p = s.split(":").map(Number); if (p.some(isNaN)) return null;
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : null;
}
export function fmtTime(sec) {
  if (sec == null) return "";
  sec = Math.round(sec); const hh = Math.floor(sec / 3600), mm = Math.floor(sec % 3600 / 60), ss = sec % 60;
  return hh ? `${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}` : `${mm}:${String(ss).padStart(2, "0")}`;
}
export const pace = (mi, sec) => (mi > 0 && sec > 0 ? fmtTime(sec / mi) : null);
const mi1 = v => fmt(v, Number.isInteger(v) ? 0 : 1);

export function renderRun(root, ctx) {
  const { state } = ctx;
  const date = state.date, today = todayISO(), m = store.marathon;
  dateNav(root, date, ctx.pickDate, ctx.status);
  if (!m) { root.appendChild(h(`<section class="card"><p class="err">No marathon plan found (data/marathon.json).</p></section>`)); return; }
  if (state.restored) root.appendChild(h(`<div class="banner"><span>Unsaved changes from earlier on this phone.</span><button class="link" data-discard>Discard</button></div>`));

  const hist = runHistory().filter(r => r.date !== date);
  const cur = state.day.run && (state.day.run.mi != null || state.day.run.sec != null || state.day.run.skipped) ? { date, ...state.day.run } : null;
  const runs = [...hist, ...(cur ? [cur] : [])];
  const logged = d => runs.find(r => r.date === d);
  const plan = plannedOn(date);
  const wk = planWeek(date) || planWeek(m.start);
  const future = date > today;

  /* ---------- hero: countdown + this week ---------- */
  const daysLeft = Math.round((parseISO(m.race.date) - parseISO(today)) / 864e5);
  const doneMi = runs.filter(r => r.date >= wk.mon && r.date <= wk.sun && !r.skipped).reduce((s, r) => s + (r.mi || 0), 0);
  const totalMi = runs.filter(r => !r.skipped).reduce((s, r) => s + (r.mi || 0), 0);
  const longest = Math.max(0, ...runs.filter(r => !r.skipped).map(r => r.mi || 0));
  root.appendChild(h(`<section class="card hero">
    <div class="label">${esc(m.race.name)} · ${parseISO(m.race.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
    <div class="big num">${daysLeft > 0 ? fmt(daysLeft) : daysLeft === 0 ? "0" : "✓"}<small>${daysLeft > 0 ? "days to go" : daysLeft === 0 ? "race day" : "done"}</small></div>
    <div class="delta">Week <b>${wk.wk}</b> of ${m.weeks.length} · ${esc(wk.phase)}${wk.cutback ? " · cutback" : ""}</div>
    <div class="m-row small"><span>This week</span><span class="num" style="margin-left:auto">${mi1(doneMi)} / ${mi1(wk.total)} mi</span></div>
    <div class="bar"><i style="width:${Math.min(100, wk.total ? doneMi / wk.total * 100 : 0)}%"></i></div>
    <div class="tiles">
      <div class="tile"><div class="k">Logged</div><div class="v num">${mi1(totalMi)}<small>mi</small></div><div class="n">${(n => `${n} run${n === 1 ? "" : "s"}`)(runs.filter(r => !r.skipped).length)}</div></div>
      <div class="tile"><div class="k">Longest</div><div class="v num">${mi1(longest)}<small>mi</small></div><div class="n">Peak plan: 18</div></div>
    </div>
  </section>`));

  /* ---------- the run for this date ---------- */
  const r = state.day.run ||= {};
  const planLine = plan
    ? `<div class="runplan"><span class="rk ${plan.kind}">${KIND[plan.kind]}</span><b class="num">${mi1(plan.mi)} mi</b>${plan.optional ? `<span class="tag">optional</span>` : ""}<small>${esc(m.modes[plan.mode] || "")}</small></div>`
    : `<p class="sub">No run planned ${date === today ? "today" : "this day"}. ${({ 1: "Monday is Lower day.", 3: "Wednesday is Upper A.", 5: "Friday is Upper B.", 0: "Sunday is rest." })[parseISO(date).getDay()] || ""} Log one anyway if you ran.</p>`;
  const card = h(`<section class="card form">
    <div class="row between"><h2>${plan ? `${DAYN[plan.day]} · week ${plan.wk}` : "Run"}</h2>${r.skipped ? `<span class="tag">Skipped</span>` : cur ? `<span class="tag">Logged</span>` : ""}</div>
    ${planLine}
    ${wk.note && plan && wk.note !== m.modes[plan.mode] ? `<p class="fine" style="margin:0 0 12px">${esc(wk.note)}</p>` : ""}
    ${future ? `<p class="fine">Log it here after you run.</p>` : `
    <div class="fields2">
      <label class="field"><span>Distance</span><div class="inwrap"><input inputmode="decimal" data-r="mi" placeholder="${plan ? plan.mi : "0"}" value="${r.mi ?? ""}"><em>mi</em></div></label>
      <label class="field"><span>Time</span><div class="inwrap"><input inputmode="numeric" data-r="time" placeholder="mm:ss" value="${fmtTime(r.sec)}"><em data-pace></em></div></label>
    </div>
    <div class="field" style="margin-top:14px"><span>Run : walk</span></div>
    <div class="chips">${RATIOS.map(x => `<button class="chip ${r.ratio === x ? "on" : ""}" data-ratio="${x}">${x}</button>`).join("")}</div>
    <div class="field"><span>Effort</span></div>
    <div class="seg">${EFFORT.map(([v, l]) => `<button class="${r.effort === v ? "on" : ""}" data-effort="${v}">${l}</button>`).join("")}</div>
    <div class="field"><span>Aches or pain</span></div>
    <div class="seg">${PAIN.map(([v, l]) => `<button class="${(r.pain || "none") === v && r.pain ? "on" : ""} ${v !== "none" ? "soc" : ""}" data-pain="${v}">${l}</button>`).join("")}</div>
    ${r.pain && r.pain !== "none" ? `<label class="field"><span>Where, and when it started</span><div class="inwrap"><input data-r="where" placeholder="e.g. left shin, mile 2" value="${esc(r.where || "")}"></div></label>` : ""}
    <label class="field" style="margin-top:12px"><span>Avg heart rate (optional)</span><div class="inwrap"><input inputmode="numeric" data-r="hr" placeholder="bpm" value="${r.hr ?? ""}"><em>bpm</em></div></label>
    <label class="field" style="margin-top:12px"><span>How it went</span><textarea rows="2" data-r="note" placeholder="Walk breaks, weather, legs, fueling…">${esc(r.note || "")}</textarea></label>
    <div class="row between" style="margin-top:12px">
      ${plan ? `<button class="link" data-skip>${r.skipped ? "Undo skip" : "Mark skipped"}</button>` : "<span></span>"}
      <button class="link danger" data-clearrun>Clear run</button>
    </div>`}
  </section>`);
  root.appendChild(card);

  const paceEl = card.querySelector("[data-pace]");
  const showPace = () => { if (paceEl) { const p = pace(r.mi, r.sec); paceEl.textContent = p ? `${p}/mi` : ""; } };
  showPace();

  /* ---------- this week ---------- */
  const weekCard = h(`<section class="card">
    <h2>Week ${wk.wk}</h2>
    <p class="sub">${md(wk.mon)}–${md(wk.sun)} · ${mi1(wk.total)} mi planned${wk.note ? ` · ${esc(wk.note)}` : ""}</p>
    <div class="rlist">${wk.runs.map(p => runRow(p, logged(p.date), today, date)).join("") || `<p class="fine">No runs this week.</p>`}</div>
  </section>`);
  root.appendChild(weekCard);

  /* ---------- coming up ---------- */
  const next = planRuns().filter(p => p.date > wk.sun).slice(0, 4);
  if (next.length) root.appendChild(h(`<section class="card"><h2>Coming up</h2>
    <div class="rlist">${next.map(p => runRow(p, logged(p.date), today, date)).join("")}</div></section>`));

  /* ---------- full plan ---------- */
  const rowsHtml = m.weeks.map(w => {
    const mon = addDays(m.start, (w.wk - 1) * 7), sun = addDays(mon, 6);
    const done = runs.filter(x => x.date >= mon && x.date <= sun && !x.skipped).reduce((s, x) => s + (x.mi || 0), 0);
    const tot = ["tue", "thu", "sat", "sun"].reduce((s, k) => s + (w[k] || 0), 0);
    const cell = k => w[k] == null ? "–" : `${mi1(w[k])}${(w.optional || []).includes(k) ? "?" : ""}`;
    return `<tr${w.wk === wk.wk ? ' style="font-weight:700"' : ""}><td>${w.wk} · ${md(mon)}</td><td>${cell("tue")}</td><td>${cell("thu")}</td><td>${w.sun != null ? `<b>${w.sun}</b>` : cell("sat")}</td><td>${mi1(tot)}</td><td>${mon <= today ? mi1(done) : ""}</td></tr>`;
  }).join("");
  root.appendChild(h(`<section class="card"><details class="table"><summary>Full plan · 28 weeks</summary><div class="wrap"><table>
    <thead><tr><th>Week</th><th>Tue</th><th>Thu</th><th>Sat</th><th>Plan</th><th>Done</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
    <p class="fine">? = optional. Week 28's long column is race Sunday. Missed a week? Repeat the last week you completed.</p></details></section>`));

  /* ---------- events ---------- */
  root.addEventListener("input", e => {
    const k = e.target.dataset.r; if (!k) return;
    if (k === "mi" || k === "hr") r[k] = numOrNull(e.target.value);
    else if (k === "time") r.sec = parseTime(e.target.value);
    else r[k] = e.target.value || null;
    if (k === "mi" || k === "time") { if (r.mi != null || r.sec != null) r.skipped = null; showPace(); }
    if (plan && (k === "mi" || k === "time")) r.planned = plan.mi;
    ctx.changed();
  });
  root.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if ("discard" in b.dataset) return ctx.discardDraft();
    if (b.dataset.go) return ctx.pickDate(b.dataset.go);
    if (b.dataset.ratio) { r.ratio = r.ratio === b.dataset.ratio ? null : b.dataset.ratio; ctx.changed(); return ctx.rerender(); }
    if (b.dataset.effort) { r.effort = r.effort === b.dataset.effort ? null : b.dataset.effort; ctx.changed(); return ctx.rerender(); }
    if (b.dataset.pain) { r.pain = b.dataset.pain; if (r.pain === "none") r.where = null; ctx.changed(); return ctx.rerender(); }
    if ("skip" in b.dataset) {
      if (r.skipped) r.skipped = null; else { Object.assign(r, { skipped: true, planned: plan?.mi, mi: null, sec: null }); }
      ctx.changed(); return ctx.rerender();
    }
    if ("clearrun" in b.dataset) { state.day.run = {}; ctx.changed(); return ctx.rerender(); }
  });
}

function runRow(p, done, today, sel) {
  const past = p.date < today;
  const st = done?.skipped ? `<span class="rs">Skipped</span>`
    : done?.mi != null ? `<span class="rs new">${mi1(done.mi)} mi${done.sec ? ` · ${pace(done.mi, done.sec) || ""}` : ""}</span>`
    : past ? `<span class="rs" style="color:var(--bad)">Missed?</span>`
    : p.date === today ? `<span class="rs updates">Today</span>` : "";
  return `<button class="rrow runrow ${p.date === sel ? "sel" : ""}" data-go="${p.date}">
    <span class="rd"><b>${DAYN[p.day]} ${md(p.date)} · ${mi1(p.mi)} mi${p.optional ? " (optional)" : ""}</b><small>${KIND[p.kind]} · ${esc(store.marathon.modes[p.mode] || "")}</small></span>${st}</button>`;
}
