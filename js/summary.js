// "Copy for Claude": a compact, paste-ready check-in for the monthly coaching chat.
import { merged, liftHistory, targetsFor, addDays, parseISO } from "./store.js?v=202610022245";
import { fmt, md } from "./ui.js?v=202610022245";

const DT = { normal: "Normal", light_social: "Light social", heavy_social: "Heavy social", travel: "Travel" };
const n = v => (v == null || v === "" || isNaN(v) ? null : Number(v));
const sign = x => (x > 0 ? "+" : x < 0 ? "−" : "±") + fmt(Math.abs(x), Number.isInteger(x) ? 0 : 1);
const wd = d => parseISO(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

// One row per date (CSV + saved log), with the open day's unsaved edits laid over its own date.
function rows(date, day) {
  const map = new Map(merged().daily.map(r => [r.date, {
    d: r.date, w: n(r.weight_lb), kcal: n(r.calories), p: n(r.protein_g), steps: n(r.steps), dt: r.day_type,
  }]));
  const f = day.food || {};
  map.set(date, { d: date, w: n(day.weight), kcal: n(f.kcal), p: n(f.protein), steps: n(day.steps), dt: day.day_type || "normal" });
  return map;
}

export function buildSummary(date, day, { dirty = false } = {}) {
  const t = targetsFor(date);
  const all = rows(date, day);
  const f = day.food || {};
  const L = [];

  L.push(`Check-in · ${wd(date)}${t.phase ? ` · ${t.phase.label || t.phase.name}` : ""}${dirty ? " (not saved yet)" : ""}`);

  // Weight
  if (day.weight != null) {
    let prev = null;
    for (let i = 1; i <= 14 && !prev; i++) { const r = all.get(addDays(date, -i)); if (r?.w != null) prev = { d: addDays(date, -i), w: r.w }; }
    const wk = [...Array(7)].map((_, i) => all.get(addDays(date, -i))?.w).filter(v => v != null);
    const avg = wk.reduce((s, v) => s + v, 0) / wk.length;
    L.push(`Weight ${fmt(day.weight, 1)}${prev ? ` (${sign(+(day.weight - prev.w).toFixed(1))} vs ${md(prev.d)})` : ""}${wk.length >= 3 ? ` · 7-day avg ${fmt(avg, 1)}` : ""}`);
  } else L.push("Weight: no weigh-in");

  // Food
  if (f.kcal != null) {
    const parts = [`${fmt(f.kcal)}${t.kcal ? ` / ${fmt(t.kcal)} kcal (${sign(f.kcal - t.kcal)})` : " kcal"}`];
    if (f.protein != null) parts.push(`P ${fmt(f.protein)}${t.protein ? `/${fmt(t.protein)}` : ""}g`);
    if (f.carbs != null) parts.push(`C ${fmt(f.carbs)}g`);
    if (f.fat != null) parts.push(`F ${fmt(f.fat)}g`);
    if (f.fiber != null) parts.push(`Fiber ${fmt(f.fiber)}g`);
    if (f.sodium != null) parts.push(`Na ${fmt(f.sodium)}mg`);
    L.push(`Food ${parts.join(" · ")}${f.incomplete ? " (some nutrients missing)" : ""}`);
    if (f.items?.length) L.push(`Ate: ${f.items.map(i => { const seg = i.name.split(/,\s*/); return `${(seg.length > 1 ? seg.slice(0, -1) : seg).join(", ")}${i.kcal != null ? ` ${fmt(i.kcal)}` : ""}`; }).join("; ")}`);
  } else L.push("Food: not logged");

  // Steps + day
  L.push(day.steps != null ? `Steps ${fmt(day.steps)}${t.steps ? ` / ${fmt(t.steps)}` : ""}` : "Steps: not logged");
  const acts = day.activity ? ` · ${day.activity}` : "";
  L.push(`Day: ${DT[day.day_type || "normal"] || day.day_type}${acts}`);

  // Lift
  const ex = (day.lift?.exercises || []).filter(e => (e.sets || []).some(v => v != null && v !== ""));
  if (ex.length) {
    const hist = liftHistory().filter(r => r.date < date && r.set_type !== "drop");
    const lines = ex.map(e => {
      const reps = e.sets.filter(v => v != null && v !== "");
      const w = n(e.weight) ?? n(e.target);
      const past = hist.filter(r => r.exercise === e.name);
      const best = past.length ? Math.max(...past.map(r => n(r.weight_lb) || 0)) : null;
      const up = w != null && best != null && w > best ? ` ↑ from ${fmt(best)}` : "";
      const drop = e.drop?.reps ? ` + drop ${e.drop.weight ? fmt(e.drop.weight) + "×" : ""}${e.drop.reps}` : "";
      return `  ${e.name} ${w ? fmt(w) + "×" : ""}${reps.join("/")}${drop}${up}`;
    });
    L.push(`Lift: ${day.lift.session || "Other"}`, ...lines);
  } else L.push("Lift: none");

  if (day.notes?.trim()) L.push(`Notes: ${day.notes.trim()}`);
  if (day.monthly?.bf != null || day.monthly?.waist != null)
    L.push(`Monthly: ${day.monthly.bf != null ? `Hume BF ${fmt(day.monthly.bf, 1)}%` : ""}${day.monthly.bf != null && day.monthly.waist != null ? " · " : ""}${day.monthly.waist != null ? `waist ${fmt(day.monthly.waist, 1)} in` : ""}`);

  // Week so far (Mon → this date)
  const mon = addDays(date, -((parseISO(date).getDay() + 6) % 7));
  const days = []; for (let d = mon; d <= date; d = addDays(d, 1)) days.push(d);
  const wr = days.map(d => all.get(d)).filter(Boolean);
  const fed = wr.filter(r => r.kcal != null);
  const liftDays = new Set(liftHistory().filter(r => r.date >= mon && r.date < date).map(r => r.date));
  if (ex.length) liftDays.add(date);
  const parts = [`${fed.length}/${days.length} days logged`];
  if (fed.length) {
    const avgK = fed.reduce((s, r) => s + r.kcal, 0) / fed.length;
    parts.push(`avg ${fmt(avgK)} kcal`);
    const net = fed.reduce((s, r) => s + r.kcal - (targetsFor(r.d).kcal || 0), 0);
    if (t.kcal) parts.push(`${sign(Math.round(net))} vs target`);
    const pr = fed.filter(r => r.p != null);
    if (pr.length) parts.push(`avg P ${fmt(pr.reduce((s, r) => s + r.p, 0) / pr.length)}g`);
  }
  const st = wr.filter(r => r.steps != null);
  if (st.length) parts.push(`avg steps ${fmt(st.reduce((s, r) => s + r.steps, 0) / st.length)}`);
  parts.push(`lifts ${liftDays.size}/3`);
  const soc = wr.filter(r => /social/.test(r.dt || "")).length;
  if (soc) parts.push(`${soc} social`);
  L.push(`Week so far (${md(mon)}–${md(date)}): ${parts.join(" · ")}`);

  return L.join("\n");
}
