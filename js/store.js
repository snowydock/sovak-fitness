// Data layer: reads the closed-month CSVs + open-month log files, writes log files via the GitHub API.
export const OWNER = "snowydock", REPO = "sovak-fitness", BRANCH = "main";
const API = `https://api.github.com/repos/${OWNER}/${REPO}`;
export const RAW = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/`;

/* ---------- small utils ---------- */
export const pad = n => String(n).padStart(2, "0");
export const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseISO = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const todayISO = () => iso(new Date());
export const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); };
export const monthOf = s => s.slice(0, 7);

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
export const prefs = ls;

export function parseCSV(text) {
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c == '"') { if (text[i + 1] == '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c == '"') q = true;
    else if (c == ",") { row.push(f); f = ""; }
    else if (c == "\n" || c == "\r") { if (c == "\r" && text[i + 1] == "\n") i++; row.push(f); f = ""; if (row.some(x => x !== "")) rows.push(row); row = []; }
    else f += c;
  }
  if (f !== "" || row.length) { row.push(f); if (row.some(x => x !== "")) rows.push(row); }
  const head = rows.shift() || [];
  return rows.map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? "").trim()])));
}

/* ---------- base64 (UTF-8 safe) ---------- */
export function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function b64decode(b64) {
  const bin = atob(b64.replace(/\n/g, ""));
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/* ---------- token ---------- */
export const token = {
  get: () => ls.get("sf_token") || "",
  set: t => ls.set("sf_token", t.trim()),
  clear: () => ls.del("sf_token"),
};

async function gh(path, opts = {}) {
  const t = token.get();
  const r = await fetch(API + path, {
    ...opts,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      ...(opts.headers || {}),
    },
    cache: "no-store",
  });
  return r;
}

export async function testToken() {
  const r = await gh("");
  if (r.status === 401) return { ok: false, msg: "GitHub rejected the token (expired or mistyped)." };
  if (!r.ok) return { ok: false, msg: `GitHub said ${r.status}. Check the token has access to ${REPO}.` };
  const j = await r.json();
  if (!j.permissions?.push) return { ok: false, msg: "Token can read but not write. Give it Contents: Read and write." };
  return { ok: true, msg: "Connected. Saves go straight to the repo." };
}

async function readFile(path) {
  const r = await gh(`/contents/${path}?ref=${BRANCH}`);
  if (r.status === 404) return { text: null, sha: null };
  if (!r.ok) throw new Error(`read ${path}: ${r.status}`);
  const j = await r.json();
  return { text: b64decode(j.content), sha: j.sha };
}

async function writeFile(path, base64, sha, message) {
  const r = await gh(`/contents/${path}`, {
    method: "PUT",
    body: JSON.stringify({ message, content: base64, branch: BRANCH, ...(sha ? { sha } : {}) }),
  });
  if (!r.ok) {
    const e = new Error(`write ${path}: ${r.status}`); e.status = r.status;
    try { e.detail = (await r.json()).message; } catch {}
    throw e;
  }
  return (await r.json()).content.sha;
}

/* ---------- the in-memory store ---------- */
export const store = {
  program: null,
  csv: { daily: [], lifts: [], body: [], phases: [] },
  log: {},          // { "YYYY-MM": { days: { "YYYY-MM-DD": {...} } } }
  shas: {},         // sha per month file, when read through the API
  listeners: new Set(),
};
export const onChange = fn => store.listeners.add(fn);
const emit = () => store.listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });

function monthsBetween(a, b) {
  const out = []; let [y, m] = a.split("-").map(Number); const [y2, m2] = b.split("-").map(Number);
  while (y < y2 || (y === y2 && m <= m2)) { out.push(`${y}-${pad(m)}`); m++; if (m > 12) { m = 1; y++; } }
  return out;
}

async function fetchText(path) {
  const r = await fetch(path, { cache: "no-cache" });
  if (!r.ok) return null;
  return r.text();
}

export async function loadAll() {
  const [prog, daily, lifts, body, phases] = await Promise.all([
    fetchText("data/program.json"),
    fetchText("data/daily.csv"), fetchText("data/lifts.csv"),
    fetchText("data/body.csv"), fetchText("data/phases.csv"),
  ]);
  store.program = JSON.parse(prog);
  store.csv = { daily: parseCSV(daily || ""), lifts: parseCSV(lifts || ""), body: parseCSV(body || ""), phases: parseCSV(phases || "") };
  // Closed months live in the CSVs; open months start the month after the last CSV row.
  const lastCSV = store.csv.daily.at(-1)?.date;
  const start = lastCSV ? monthOf(addDays(lastCSV.slice(0, 8) + "28", 7)) : monthOf(todayISO());
  const months = monthsBetween(start < monthOf(todayISO()) ? start : monthOf(todayISO()), monthOf(todayISO()));
  await Promise.all(months.map(loadMonth));
  emit();
}

// Prefer the API (fresh) when a token exists; fall back to the Pages copy (may lag ~1 min after a save).
export const hasMonth = ym => !!store.log[ym];
export async function loadMonth(ym) {
  if (token.get()) {
    try {
      const { text, sha } = await readFile(`log/${ym}.json`);
      store.log[ym] = text ? JSON.parse(text) : { version: 1, days: {} };
      store.shas[ym] = sha;
      return;
    } catch (e) { console.warn("API read failed, using Pages copy", e); }
  }
  const t = await fetchText(`log/${ym}.json`);
  store.log[ym] = t ? JSON.parse(t) : { version: 1, days: {} };
}

export const getDay = date => store.log[monthOf(date)]?.days?.[date] || null;

export function isEmptyDay(d) {
  if (!d) return true;
  const f = d.food || {};
  const hasFood = ["kcal", "protein", "carbs", "fat"].some(k => f[k] != null) || (f.images || []).length;
  const hasLift = d.lift?.exercises?.length;
  return d.weight == null && d.steps == null && !hasFood && !hasLift && !d.notes && !d.activity &&
    (!d.day_type || d.day_type === "normal") && d.monthly?.bf == null && d.monthly?.waist == null;
}

// Save one day: read the month fresh, replace that day, write back. Retries once on a sha race.
export async function saveDay(date, day, images = []) {
  if (!token.get()) throw Object.assign(new Error("no token"), { code: "no_token" });
  const ym = monthOf(date);
  // 1) upload any new screenshots first, so the day row can point at them
  const paths = [];
  for (let i = 0; i < images.length; i++) {
    const p = `log/img/${date}-${Date.now().toString(36)}-${i}.jpg`;
    await writeFile(p, images[i], null, `log ${date}: screenshot`);
    paths.push(p);
  }
  if (paths.length) day = { ...day, food: { ...(day.food || {}), images: [...(day.food?.images || []), ...paths] } };

  const attempt = async () => {
    const { text, sha } = await readFile(`log/${ym}.json`);
    const doc = text ? JSON.parse(text) : { version: 1, days: {} };
    doc.days ||= {};
    if (isEmptyDay(day)) delete doc.days[date];
    else doc.days[date] = { ...day, updated: new Date().toISOString() };
    doc.days = Object.fromEntries(Object.entries(doc.days).sort(([a], [b]) => a.localeCompare(b)));
    const body = JSON.stringify(doc, null, 2) + "\n";
    const newSha = await writeFile(`log/${ym}.json`, b64encode(body), sha, `log ${date}`);
    store.log[ym] = doc; store.shas[ym] = newSha;
  };
  try { await attempt(); }
  catch (e) { if (e.status === 409 || e.status === 422) await attempt(); else throw e; }
  emit();
  return getDay(date);
}

// Patch many days at once (one commit per month file). patches: { "YYYY-MM-DD": day => newDay }
export async function saveMany(patches, message) {
  if (!token.get()) throw Object.assign(new Error("no token"), { code: "no_token" });
  const byMonth = {};
  for (const [date, fn] of Object.entries(patches)) (byMonth[monthOf(date)] ||= {})[date] = fn;
  for (const [ym, fns] of Object.entries(byMonth)) {
    const attempt = async () => {
      const { text, sha } = await readFile(`log/${ym}.json`);
      const doc = text ? JSON.parse(text) : { version: 1, days: {} };
      doc.days ||= {};
      for (const [date, fn] of Object.entries(fns)) {
        const next = fn(JSON.parse(JSON.stringify(doc.days[date] || {})));
        if (isEmptyDay(next)) delete doc.days[date]; else doc.days[date] = { ...next, updated: new Date().toISOString() };
      }
      doc.days = Object.fromEntries(Object.entries(doc.days).sort(([a], [b]) => a.localeCompare(b)));
      const newSha = await writeFile(`log/${ym}.json`, b64encode(JSON.stringify(doc, null, 2) + "\n"), sha, message);
      store.log[ym] = doc; store.shas[ym] = newSha;
    };
    try { await attempt(); } catch (e) { if (e.status === 409 || e.status === 422) await attempt(); else throw e; }
  }
  emit();
}
export const isClosedDate = date => store.csv.daily.some(r => r.date === date);

/* ---------- drafts (per-device convenience) ---------- */
export const drafts = {
  get: date => { try { return JSON.parse(ls.get("sf_draft_" + date)); } catch { return null; } },
  set: (date, d) => ls.set("sf_draft_" + date, JSON.stringify(d)),
  clear: date => ls.del("sf_draft_" + date),
};

/* ---------- merged view for the dashboard ---------- */
// Closed months live in the CSVs and win. Open-month days come from the log files.
export function merged() {
  const today = todayISO();
  const csvDates = new Set(store.csv.daily.map(r => r.date));
  const csvLiftDates = new Set(store.csv.lifts.map(r => r.date));
  const daily = [...store.csv.daily];
  const lifts = [...store.csv.lifts];
  const body = [...store.csv.body];
  const bodyDates = new Set(body.map(b => b.date));
  const s = v => (v == null ? "" : String(v));
  for (const ym of Object.keys(store.log).sort()) {
    for (const [date, d] of Object.entries(store.log[ym].days || {})) {
      if (date > today) continue;
      const f = d.food || {};
      if (!csvDates.has(date) && (f.kcal != null || d.weight != null)) {
        daily.push({
          date, weight_lb: s(d.weight), calories: s(f.kcal), protein_g: s(f.protein), carbs_g: s(f.carbs),
          fat_g: s(f.fat), fiber_g: s(f.fiber), sodium_mg: s(f.sodium), steps: s(d.steps),
          day_type: d.day_type || "normal", activity: [d.lift?.session, d.activity].filter(Boolean).join(" + "), notes: d.notes || "",
        });
      }
      if (!csvLiftDates.has(date) && d.lift?.exercises?.length) {
        for (const ex of d.lift.exercises) {
          (ex.sets || []).forEach((reps, i) => { if (reps != null && reps !== "") lifts.push({ date, session: d.lift.session || "", exercise: ex.name, weight_lb: s(ex.weight ?? 0), set: String(i + 1), reps: String(reps), set_type: "working" }); });
          if (ex.drop?.reps) lifts.push({ date, session: d.lift.session || "", exercise: ex.name, weight_lb: s(ex.drop.weight ?? 0), set: String((ex.sets || []).length), reps: String(ex.drop.reps), set_type: "drop" });
        }
      }
      if (!bodyDates.has(date) && (d.monthly?.bf != null || d.monthly?.waist != null)) {
        body.push({ date, weight_lb: s(d.weight), body_fat_pct: s(d.monthly.bf), waist_in: s(d.monthly.waist), source: "log" });
      }
    }
  }
  daily.sort((a, b) => a.date.localeCompare(b.date));
  body.sort((a, b) => a.date.localeCompare(b.date));
  return { daily, lifts, body, phases: store.csv.phases, program: store.program };
}

/* ---------- lift history (all sources, for targets) ---------- */
export function liftHistory() {
  const { lifts } = merged();
  // include future-dated and today's log lifts too (merged() drops future days)
  const seen = new Set(lifts.map(l => l.date + "|" + l.exercise));
  for (const ym of Object.keys(store.log)) for (const [date, d] of Object.entries(store.log[ym].days || {})) {
    for (const ex of d.lift?.exercises || []) {
      if (seen.has(date + "|" + ex.name)) continue;
      (ex.sets || []).forEach((reps, i) => { if (reps != null && reps !== "") lifts.push({ date, session: d.lift.session, exercise: ex.name, weight_lb: String(ex.weight ?? 0), set: String(i + 1), reps: String(reps), set_type: "working" }); });
    }
  }
  return lifts;
}

export function phaseFor(date) {
  return store.csv.phases.find(p => p.start <= date && date <= p.end) || null;
}
export function targetsFor(date) {
  const p = phaseFor(date), t = store.program?.targets || {};
  return {
    kcal: p?.kcal_target ? Number(p.kcal_target) : null,
    protein: p?.protein_target_g ? Number(p.protein_target_g) : t.protein,
    steps: p?.steps_target ? Number(p.steps_target) : t.steps,
    phase: p,
  };
}

/* ---------- image compression for screenshots ---------- */
export async function compressImage(file, max = 1400, q = 0.72) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const dataURL = c.toDataURL("image/jpeg", q);
    return { preview: dataURL, base64: dataURL.split(",")[1] };
  } finally { URL.revokeObjectURL(url); }
}
