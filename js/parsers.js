// Text parsers: the LoseIt web page (Ctrl+A dump) and Mike's Apple Notes lift blocks.

const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const n = s => (s == null ? null : Number(String(s).replace(/,/g, "")));
const isNum = s => /^-?[\d,]+(\.\d+)?$/.test(s);
const QTY = /\b(serving|servings|gram|grams|g|each|ounce|ounces|oz|fluid|container|cup|cups|slice|slices|piece|pieces|pint|pints|tablespoon|tablespoons|tbsp|teaspoon|tsp|bottle|bottles|can|cans|package|packages|bar|bars|scoop|scoops|large|medium|small|pound|lb|ml|liter)\b/i;

export function parseLoseIt(text, stepThreshold = 10000) {
  if (!text || !/lose it|budget|my nutrients|snacks:|breakfast:/i.test(text)) return null;
  const out = { kcal: null, protein: null, carbs: null, fat: null, fiber: null, sodium: null, sugars: null, items: [], date: null, steps: null, stepsNote: null };

  const dm = text.match(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+([A-Z][a-z]{2})\s+(\d{1,2}),\s+(\d{4})/);
  if (dm && MONTHS[dm[2]]) out.date = `${dm[4]}-${String(MONTHS[dm[2]]).padStart(2, "0")}-${String(dm[3]).padStart(2, "0")}`;

  const lines = text.split(/\r?\n/).map(l => l.replace(/\s+/g, " ").trim()).filter(Boolean);

  // Calories: the "Food" label in the summary row is followed by the number.
  for (let i = 0; i < lines.length - 1; i++) {
    if (/^food$/i.test(lines[i]) && isNum(lines[i + 1])) { out.kcal = n(lines[i + 1]); break; }
    if (/^food calories consumed$/i.test(lines[i]) && isNum(lines[i + 1])) { out.kcal = n(lines[i + 1]); break; }
  }

  const grab = (re) => { const m = text.match(re); return m ? n(m[1]) : null; };
  out.protein = grab(/(?:^|\n)\s*Protein\s+([\d,.]+)\s*g/i);
  out.carbs = grab(/(?:^|\n)\s*Carbohydrates\s+([\d,.]+)\s*g/i);
  out.fat = grab(/(?:^|\n)\s*Fat\s+([\d,.]+)\s*g/i);
  out.fiber = grab(/(?:^|\n)\s*Fiber\s+([\d,.]+)\s*g/i);
  out.sodium = grab(/(?:^|\n)\s*Sodium\s+([\d,.]+)\s*mg/i);
  out.sugars = grab(/(?:^|\n)\s*Sugars\s+([\d,.]+)\s*g/i);

  // Food items: name / quantity / calories triples, between the first meal header and "Exercise:".
  const start = lines.findIndex(l => /^(breakfast|lunch|dinner|snacks):\s*\d/i.test(l));
  let end = lines.findIndex((l, i) => i > start && /^exercise:/i.test(l));
  if (end < 0) end = lines.length;
  if (start >= 0) {
    const seg = lines.slice(start, end).filter(l => !/^(breakfast|lunch|dinner|snacks):/i.test(l) && !/^no food logged/i.test(l));
    for (let i = 0; i + 2 < seg.length + 0; i++) {
      const [name, qty, cal] = [seg[i], seg[i + 1], seg[i + 2]];
      if (!isNum(name) && isNum(cal) && (QTY.test(qty) || /\d/.test(qty)) && !isNum(qty)) {
        out.items.push({ name, qty, kcal: n(cal) });
        i += 2;
      }
    }
    if (out.kcal == null && out.items.length) out.kcal = out.items.reduce((s, x) => s + x.kcal, 0);
  }

  // Steps: LoseIt only says how many remain until the 10k bonus.
  const sm = text.match(/([\d,]+)\s+more steps until calorie bonus/i);
  if (sm) out.steps = stepThreshold - n(sm[1]);
  else if (/bonus achieved/i.test(text)) out.stepsNote = `Over ${stepThreshold.toLocaleString()}: type the exact count`;

  const found = ["kcal", "protein", "carbs", "fat"].filter(k => out[k] != null).length;
  return found ? out : null;
}

// Apple Notes lift block -> [{name, weight, sets:[...], drop:{weight,reps}|null, sessionHint}]
export function parseNotes(text, program) {
  if (!text) return null;
  const lines = text.split(/\r?\n/).map(l => l.replace(/[\t ]+/g, " ").trim()).filter(Boolean);
  const all = Object.values(program.sessions).flat().map(e => e.name);
  const norm = s => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const resolve = raw => {
    const r = norm(raw);
    if (program.aliases?.[r]) return program.aliases[r];
    const exact = all.find(nm => norm(nm) === r);
    if (exact) return exact;
    // best token overlap
    const rt = new Set(r.split(" "));
    let best = null, bs = 0;
    for (const nm of all) {
      const t = norm(nm).split(" ");
      const s = t.filter(w => rt.has(w)).length / Math.max(t.length, rt.size);
      if (s > bs) { bs = s; best = nm; }
    }
    return bs >= 0.5 ? best : raw.replace(/\s+/g, " ").trim();
  };
  let session = null;
  const out = [];
  let cur = null;
  for (const line of lines) {
    const sm = line.match(/^-{2,}\s*(.+?)\s*-{2,}$/);
    if (sm) { const raw = sm[1].trim(); session = Object.keys(program.sessions).find(k => k.toLowerCase() === raw.toLowerCase()) || raw; continue; }
    const hm = line.match(/^(?:superset:\s*)?(.+?)\s*(?:(\d+(?:\.\d+)?)\s*(?:lbs?)?)?\s*(?:_+\s*)?\(\s*(\d+)\s*x\s*([^)]*)\)/i);
    if (hm) {
      cur = { name: resolve(hm[1]), weight: hm[2] ? Number(hm[2]) : null, sets: [], drop: null };
      out.push(cur);
      continue;
    }
    if (cur && /\bs\d+\b/i.test(line)) {
      const sets = [...line.matchAll(/\bs(\d+)\s+(\d+)/gi)].map(m => Number(m[2]));
      cur.sets.push(...sets);
      const dm = line.match(/\+\s*(?:drop\s*)?(\d+)\s*$/i);
      if (dm) cur.drop = { weight: null, reps: Number(dm[1]) };
      continue;
    }
  }
  const exs = out.filter(e => e.sets.length || e.weight != null);
  if (!exs.length) return null;
  if (!session) {
    // infer the session from which program list holds most of the names
    let best = null, bs = 0;
    for (const [s, list] of Object.entries(program.sessions)) {
      const c = exs.filter(e => list.some(x => x.name === e.name)).length;
      if (c > bs) { bs = c; best = s; }
    }
    session = best;
  }
  return { session, exercises: exs };
}

/* ---------- LoseIt reports (weekly/daily PDF, or table text copied out of one) ---------- */
const SUMMARY_COLS = { "Budget": "budget", "Food": "kcal", "Exer.": "exercise", "Net": "net", "+/-": "delta", "Weight": "weight" };
const NUTRIENT_COLS = { "Fat (g)": "fat", "SatF (g)": "satfat", "Chol (mg)": "chol", "Sod (mg)": "sodium", "Carbs (g)": "carbs", "Fib (g)": "fiber", "Sug (g)": "sugars", "Prot (g)": "protein" };
const ROW_DATE = /^([A-Z][a-z]{2})\s+(\d{1,2}),\s+(\d{2,4})\b\s*(.*)$/;

function headerOrder(line, cols) {
  const found = Object.keys(cols).map(k => [k, line.indexOf(k)]).filter(([, i]) => i >= 0).sort((a, b) => a[1] - b[1]);
  return found.length >= 3 ? found.map(([k]) => cols[k]) : null;
}

// Daily report: summary, itemized log, nutrients, steps.
const FULL_MONTHS = { January: 1, February: 2, March: 3, April: 4, May: 5, June: 6, July: 7, August: 8, September: 9, October: 10, November: 11, December: 12 };
export function parseDailyReport(lines) {
  const L = lines.map(l => l.replace(/\t+/g, " | ").replace(/\s*\|\s*/g, " | ").replace(/ {2,}/g, " ").trim()).filter(Boolean);
  const t = L.find(l => /daily report for/i.test(l));
  const dm = t && t.match(/daily report for\s+([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})/i);
  if (!dm || !FULL_MONTHS[dm[1]]) return null;
  const date = `${dm[3]}-${String(FULL_MONTHS[dm[1]]).padStart(2, "0")}-${String(dm[2]).padStart(2, "0")}`;
  const flat = L.map(l => l.replace(/ \| /g, " "));
  const val = (re, from = 0, to = flat.length) => { for (let i = from; i < to; i++) { const m = flat[i].match(re); if (m) return n(m[1]); } return null; };
  const f = { incomplete: false, items: [] };
  f.kcal = val(/^Food Calories\s+([\d,.]+)/i);
  f.weight = val(/^Weight\s+([\d,.]+)/i);
  // nutrients block: from "Nutrients" to "Goals"
  const ni = flat.findIndex(l => /^n\s?utrients$/i.test(l));
  const gi = flat.findIndex((l, i) => i > ni && /^goals$/i.test(l));
  const nEnd = gi > 0 ? gi : flat.length;
  if (ni >= 0) {
    f.fat = val(/^Fat\s+([\d,.]+)\s*g/i, ni, nEnd);
    f.satfat = val(/^Saturated Fat\s+([\d,.]+)\s*g/i, ni, nEnd);
    f.chol = val(/^Cholesterol\s+([\d,.]+)\s*mg/i, ni, nEnd);
    f.sodium = val(/^Sodium\s+([\d,.]+)\s*mg/i, ni, nEnd);
    f.carbs = val(/^Carbohydrates\s+([\d,.]+)\s*g/i, ni, nEnd);
    f.fiber = val(/^Fiber\s+([\d,.]+)\s*g/i, ni, nEnd);
    f.sugars = val(/^Sugars?\s+([\d,.]+)\s*g/i, ni, nEnd);
    f.protein = val(/^Protein\s+([\d,.]+)\s*g/i, ni, nEnd);
  }
  f.steps = val(/^Steps\s+([\d,]+)\s*steps/i);
  // itemized log: between "Daily Log" and the "Exercise" row (only when cells are separated)
  const li = L.findIndex(l => /^daily log$/i.test(l));
  const ei = L.findIndex((l, i) => i > li && /^exercise \| /i.test(l));
  if (li >= 0) for (const l of L.slice(li + 1, ei > 0 ? ei : (ni > 0 ? ni : L.length))) {
    if (/^nutrient data missing/i.test(l)) { if (/sod|fib|prot|carb|fat/i.test(l)) f.incomplete = true; continue; }
    const c = l.split(" | ");
    if (c.length < 3 || !isNum(c.at(-1))) continue;                  // meal headers ("Snacks | 2,046") have 2 cells
    f.items.push({ name: c[0], qty: c.slice(1, -1).join(" ").replace(/(\d) ½/, "$1½"), kcal: n(c.at(-1)) });
  }
  if (f.kcal == null && f.protein == null) return null;
  return { title: t, days: { [date]: f } };
}

// lines: one string per visual row (cells separated by whitespace, tabs or " | ")
export function parseLoseItReport(lines) {
  if (lines.some(l => /daily report for/i.test(l))) return parseDailyReport(lines);
  const days = {};
  let cols = null;
  let title = null;
  for (const raw of lines) {
    const line = raw.replace(/\s*\|\s*/g, " ").replace(/\s+/g, " ").trim();
    if (!line) continue;
    if (!title && /report/i.test(line)) title = line;
    const s = headerOrder(line, SUMMARY_COLS); if (s) { cols = s; continue; }
    const nh = headerOrder(line, NUTRIENT_COLS); if (nh) { cols = nh; continue; }
    if (/^(totals|daily avg|percent)\b/i.test(line)) { cols = null; continue; }
    const m = line.match(ROW_DATE);
    if (!m || !cols || !MONTHS[m[1]]) continue;
    const vals = m[4].split(" ");
    if (vals.length < cols.length) continue;
    const yr = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const date = `${yr}-${String(MONTHS[m[1]]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
    const d = (days[date] ||= {});
    cols.forEach((c, i) => {
      const v = vals[i];
      if (v == null || v === "-") { d[c] = null; return; }
      if (v.includes("*")) d.incomplete = true;            // LoseIt marks partial nutrient data with *
      const x = n(v.replace(/[*%]/g, ""));
      d[c] = Number.isFinite(x) ? x : null;
    });
  }
  // keep only days that actually have something logged
  for (const [k, d] of Object.entries(days)) if (d.kcal == null && d.weight == null && d.protein == null) delete days[k];
  return Object.keys(days).length ? { title, days } : null;
}

// If a pasted block is report-table text rather than the LoseIt web page, parse it as a report.
export function parseReportText(text) {
  if (!/daily summary|nutrients|weekly report|daily report/i.test(text || "")) return null;
  return parseLoseItReport(text.split(/\r?\n/));
}

// PDF -> rows of text, rebuilt from pdf.js glyph positions. pdfjs is loaded lazily (1.6 MB).
export async function pdfToLines(file) {
  const pdfjs = await import("./vendor/pdf.min.mjs?v=202610021933");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdf.worker.min.mjs" + new URL(import.meta.url).search, import.meta.url).href;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    const rows = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const y = it.transform[5], x = it.transform[4];
      let row = rows.find(r => Math.abs(r.y - y) <= 2.5);
      if (!row) rows.push(row = { y, cells: [] });
      row.cells.push({ x, s: it.str.trim() });
    }
    rows.sort((a, b) => b.y - a.y).forEach(r => out.push(r.cells.sort((a, b) => a.x - b.x).map(c => c.s).join(" | ")));
  }
  return out;
}
