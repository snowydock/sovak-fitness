// Keeps a copy of the app and its data on the phone so it opens in airplane mode.
// Online: always fetch fresh (and refresh the copy). Offline: serve the copy and never
// touch the network, because any request in airplane mode triggers iOS's full-screen alert.
// Only same-origin GETs are handled; GitHub API calls pass straight through (the app skips
// them itself when offline).
const CACHE = "sf-v1";

self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(["./", "index.html", "manifest.webmanifest"])).catch(() => {}));
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

// One cache entry per file: drop ?v= / ?t= so new releases replace old copies instead of piling up.
const keyFor = url => { const u = new URL(url); return u.origin + u.pathname; };

async function fromCache(req) {
  const c = await caches.open(CACHE);
  return (await c.match(keyFor(req.url))) ||
    (req.mode === "navigate" ? await c.match(keyFor(new URL("./", self.registration.scope).href)) : undefined) ||
    new Response("", { status: 504, statusText: "offline" });
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    if (self.navigator.onLine === false) return fromCache(req);
    try {
      const res = await fetch(req);
      if (res.ok && res.type === "basic") {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(keyFor(req.url), copy)).catch(() => {});
      }
      return res;
    } catch {
      return fromCache(req);
    }
  })());
});
