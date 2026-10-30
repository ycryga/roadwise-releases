// Lets the browser install Mana to the home screen, and opens the app's own files without a
// connection. Always asks the network first, so an update shows on the next launch.
const CACHE = "roadwise";
const FILES = ["./", "index.html", "style.css", "app.js", "config.js", "glyphs.js", "manifest.webmanifest", "icon.svg", "icon-192.png"];

self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES))));
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request.url, { cache: "no-cache" }) // Check with the server, never a stale browser copy.
      .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request)),
  );
});
