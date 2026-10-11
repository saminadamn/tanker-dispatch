// Service worker: lets drivers and colony reps open the app with no signal.
// App files come from the network when online and from the cache when offline; API calls always go to the network,
// and driver actions made offline are queued by app.js and sent when the phone is back online.
const CACHE = "tanker-shell-v4";
const SHELL = ["./", "index.html", "styles.css", "app.js", "config.js", "manifest.webmanifest", "icon.svg",
  "https://cdn.tailwindcss.com/3.4.17"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => null)))));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const isShell = url.origin === location.origin || url.hostname.endsWith("tailwindcss.com") ||
    url.hostname.endsWith("googleapis.com") || url.hostname.endsWith("gstatic.com") || url.hostname === "cdnjs.cloudflare.com";
  if (!isShell) return; // API: network only, never stale data
  // App files: network first so a new deploy shows immediately; the cache is the offline fallback.
  // Fonts and the Tailwind script rarely change: cache first.
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    if (url.origin === location.origin) {
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        return (await cache.match(req, { ignoreSearch: true })) || (await cache.match("index.html"));
      }
    }
    const cached = await cache.match(req);
    if (cached) return cached;
    const res = await fetch(req);
    if (res.ok || res.type === "opaque") cache.put(req, res.clone());
    return res;
  }));
});
