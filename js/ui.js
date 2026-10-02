// Shared UI helpers.
import { iso, parseISO, todayISO, addDays } from "./store.js?v=202610021923";

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export function h(s) { const t = document.createElement("template"); t.innerHTML = s.trim(); return t.content.firstElementChild; }
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const fmt = (n, d = 0) => (n == null || n === "" || isNaN(n) ? "–" : Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
export const numOrNull = v => { if (v == null) return null; const s = String(v).replace(/,/g, "").trim(); if (s === "") return null; const x = Number(s); return isNaN(x) ? null : x; };
export const md = s => parseISO(s).toLocaleDateString("en-US", { month: "short", day: "numeric" });
export const wdLong = s => parseISO(s).toLocaleDateString("en-US", { weekday: "long" });

export const icon = {
  today: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17M8.5 14.5l2.2 2.2 4.8-4.8"/></svg>`,
  lift: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/></svg>`,
  trends: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 19.5h17M5 15.5l4.5-5 3.5 3 6-7"/><circle cx="19" cy="6.5" r="1.2" fill="currentColor"/></svg>`,
  gear: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>`,
  left: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>`,
  right: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>`,
  check: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`,
  x: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  paste: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="12" height="17" rx="2.5"/><path d="M9 4.5V3.5h6v1M9.5 10h5M9.5 13.5h5M9.5 17h3"/></svg>`,
  camera: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.4-2h5l1.4 2h1.6A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z"/><circle cx="12" cy="12.5" r="3.3"/></svg>`,
  doc: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3.5H7.5A2.5 2.5 0 0 0 5 6v12a2.5 2.5 0 0 0 2.5 2.5h9A2.5 2.5 0 0 0 19 18V8.5z"/><path d="M14 3.5v5h5M9 13h6M9 16.5h4"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`,
};

// Date header + week strip. status(date) -> {food, lift, social, draft}
export function dateNav(container, date, onPick, status) {
  const today = todayISO();
  const d = parseISO(date);
  const monday = addDays(date, -((d.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const rel = date === today ? "Today" : date === addDays(today, -1) ? "Yesterday" : date === addDays(today, 1) ? "Tomorrow" : wdLong(date);
  const el = h(`<div class="datenav">
    <div class="dn-top">
      <button class="iconbtn" data-nav="-1" aria-label="Previous day">${icon.left}</button>
      <label class="dn-title">
        <span class="dn-rel">${esc(rel)}</span>
        <span class="dn-date">${parseISO(date).toLocaleDateString("en-US", { month: "long", day: "numeric" })}</span>
        <input type="date" value="${date}" aria-label="Pick a date">
      </label>
      <button class="iconbtn" data-nav="1" aria-label="Next day">${icon.right}</button>
    </div>
    <div class="week">${days.map(x => {
      const s = status(x) || {};
      return `<button class="wk ${x === date ? "sel" : ""} ${x === today ? "today" : ""} ${x > today ? "future" : ""}" data-date="${x}">
        <span class="wl">${parseISO(x).toLocaleDateString("en-US", { weekday: "narrow" })}</span>
        <span class="wn">${parseISO(x).getDate()}</span>
        <span class="dots">${s.food ? '<i class="df"></i>' : ""}${s.lift ? '<i class="dl"></i>' : ""}${s.social ? '<i class="ds"></i>' : ""}${s.draft ? '<i class="dd"></i>' : ""}</span>
      </button>`;
    }).join("")}</div>
    ${date !== today ? `<button class="pill today-pill" data-today>Jump to today</button>` : ""}
  </div>`);
  el.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.nav) onPick(addDays(date, Number(b.dataset.nav)));
    else if (b.dataset.date) onPick(b.dataset.date);
    else if ("today" in b.dataset) onPick(today);
  });
  const inp = el.querySelector("input[type=date]");
  inp.addEventListener("change", () => inp.value && onPick(inp.value));
  container.appendChild(el);
  return el;
}

// Bottom sheet. Returns { el, close }.
export function sheet(inner, label = "Dialog") {
  const wrap = h(`<div class="sheet-wrap"><div class="sheet" role="dialog" aria-label="${esc(label)}">${inner}</div></div>`);
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add("open"));
  const close = () => { wrap.classList.remove("open"); setTimeout(() => wrap.remove(), 200); };
  wrap.addEventListener("click", e => { if (e.target === wrap || e.target.closest("[data-close]")) close(); });
  return { el: wrap, close };
}
