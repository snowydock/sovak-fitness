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
