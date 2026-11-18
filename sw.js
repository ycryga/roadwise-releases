// Lets the browser install Mana to the home screen, and opens the app's own files without a
// connection. Always asks the network first, so an update shows on the next launch.
const CACHE = "roadwise";
const FILES = ["./", "index.html", "style.css", "app.js", "geo.js", "route-facts.js", "config.js", "glyphs.js", "vehicles.js", "manifest.webmanifest", "icon.svg", "icon-192.png", "mana-symbol-night.svg", "fonts/pjs-regular.woff2", "fonts/pjs-semibold.woff2", "fonts/pjs-bold.woff2", "fonts/pjs-extrabold.woff2"];

for (const kind of ["saloon", "hatchback", "suv", "mpv", "pickup", "coupe", "arrow"]) {
  FILES.push(`cars3d/${kind}.png`);
  if (kind !== "arrow") FILES.push(`cars3d/${kind}_paint.png`);
}

self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES))));
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request.url, { cache: "no-cache" }) // Check with the server, never a stale browser copy.
      .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request)),
  );
});
