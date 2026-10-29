// Roadwise on the web: the Android app's core (search, routes with live traffic, turn-by-turn voice,
// reports, incidents, the traffic map) for phones that can't or won't install the APK.
// Positions are [lng, lat] throughout, as MapLibre and GeoJSON have them.

const { SUPABASE_URL, SUPABASE_KEY } = window.ROADWISE;
const TRAFFIC = `${SUPABASE_URL}/functions/v1/traffic`;
const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const PHOTON = "https://photon.komoot.io/api/";
const OSRM = "https://router.project-osrm.org/route/v1/driving/";
const KL = [101.6869, 3.139];

const TRAFFIC_MIN_ZOOM = 10;
const TRAFFIC_SLOW_BELOW = 0.75;
const INCIDENTS_MIN_ZOOM = 11;
const INCIDENTS_REFRESH_MS = 3 * 60_000;
const REPORTS_REFRESH_MS = 2 * 60_000;
const REPORT_MAX_AGE_MIN = 120, REPORT_FRESH_MIN = 20, REPORT_OLDEST_OPACITY = 0.35;
const SAME_PLACE_METERS = 60;
// Navigation, as the Android Navigator.
const ADVANCE_METERS = 25, ARRIVE_METERS = 30, NEAR_METERS = 60, FAR_METERS = 400;
const OFF_ROUTE_METERS = 50, OFF_ROUTE_UPDATES = 3, THEN_SHOWN_METERS = 400;
const NEAR_END_METERS = 100, PARKING_SPEED = 3; // m/s, about 11 km/h

const REPORT_TYPES = [
  { key: "police", label: "Police", color: "#2F6FED", icon: "👮", short: "Police", subtypes: [
    ["visible", "Police", "👮", "Police"], ["hidden", "Hidden police", "🕵️", "Hidden"], ["mobile_camera", "Mobile speed camera", "📸", "Camera"]] },
  { key: "accident", label: "Accident", color: "#D93025", icon: "💥", short: "Crash", subtypes: [
    ["minor", "Minor accident", "🚗", "Minor"], ["major", "Serious accident", "🚑", "Serious"]] },
  { key: "traffic", label: "Traffic jam", color: "#9334E6", icon: "🚗", short: "Traffic", subtypes: [
    ["slow", "Slow traffic", "🐢", "Slow"], ["heavy", "Heavy traffic", "🚙", "Heavy"], ["standstill", "Traffic at a standstill", "🛑", "Stopped"]] },
  { key: "hazard", label: "Hazard", color: "#F29900", icon: "⚠️", short: "Hazard", subtypes: [
    ["pothole", "Pothole", "🕳️", "Pothole"], ["object", "Object on the road", "📦", "Object"], ["stopped_vehicle", "Stopped vehicle", "🚘", "Car"],
    ["animal", "Animal on the road", "🐄", "Animal"], ["signal_out", "Traffic lights out", "🚦", "Lights"], ["roadworks", "Roadworks", "🚧", "Roadworks"],
    ["flood", "Flooding", "🌊", "Flood"], ["slippery", "Slippery road", "💧", "Slippery"], ["low_visibility", "Poor visibility", "🌫️", "Fog"]] },
  { key: "closure", label: "Road closed", color: "#3C4043", icon: "⛔", short: "Closed", subtypes: [] },
].map((t) => ({ ...t, subtypes: t.subtypes.map(([key, title, icon, short]) => ({ key, title, icon, short })) }));

const $ = (id) => document.getElementById(id);
const state = {
  here: null, heading: null, speed: 0, accuracy: 50,
  destination: null, routes: [], selected: 0,
  nav: null, following: true, wakeLock: null,
  reports: [], incidents: [], incidentsAt: 0, incidentsArea: null,
  traffic: localStorage.getItem("traffic") === "1",
  lastSearch: 0,
};

// --- Geometry ---

const rad = (d) => (d * Math.PI) / 180;
function distance(a, b) {
  const dLat = rad(b[1] - a[1]), dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}
function bearing(a, b) {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]));
  const x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
/** The nearest point of [line] to [p]: its distance, the segment it's on and that segment's direction. */
function snap(p, line) {
  const kx = Math.cos(rad(p[1])) * 111320, ky = 110540;
  let best = null;
  for (let i = 0; i < line.length - 1; i++) {
    const ax = (line[i][0] - p[0]) * kx, ay = (line[i][1] - p[1]) * ky;
    const bx = (line[i + 1][0] - p[0]) * kx, by = (line[i + 1][1] - p[1]) * ky;
    const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
    const x = ax + t * dx, y = ay + t * dy, d = Math.hypot(x, y);
    if (!best || d < best.meters) best = { meters: d, segment: i, point: [p[0] + x / kx, p[1] + y / ky] };
  }
  if (best) best.bearing = bearing(line[best.segment], line[best.segment + 1]);
  return best;
}
const angleBetween = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

// --- Formatting ---

function formatDuration(seconds) {
  const mins = Math.max(1, Math.round(seconds / 60));
  return mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`;
}
const clock = (seconds) => new Date(Date.now() + seconds * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
function shortDistance(m) { return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`; }
function spokenDistance(m) {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} kilometers`;
  return m >= 100 ? `${Math.round(m / 50) * 50} meters` : `${Math.round(m / 10) * 10} meters`;
}
const minutesAgo = (t) => { const m = Math.floor((Date.now() - t) / 60000); return m < 1 ? "just now" : `${m} min ago`; };

let toastTimer;
function toast(text) {
  $("toast").textContent = text;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("toast").hidden = true), 3500);
}

let busy = 0;
async function withProgress(work) {
  $("progress").hidden = ++busy === 0;
  try { return await work(); } finally { $("progress").hidden = --busy === 0; }
}

// --- Map ---

const map = new maplibregl.Map({ container: "map", style: STYLE_URL, center: KL, zoom: 11, attributionControl: { compact: true } });
const empty = { type: "FeatureCollection", features: [] };
const fc = (features) => ({ type: "FeatureCollection", features });
const lineFeature = (coords, props = {}) => ({ type: "Feature", geometry: { type: "LineString", coordinates: coords }, properties: props });
const pointFeature = (p, props = {}) => ({ type: "Feature", geometry: { type: "Point", coordinates: p }, properties: props });

map.on("load", () => {
  // 3D buildings hide the route line once the camera tilts for driving.
  for (const l of map.getStyle().layers) if (l.type === "fill-extrusion") map.setLayoutProperty(l.id, "visibility", "none");
  for (const s of ["alts", "route", "slow", "dest", "me", "reports", "incidents"]) map.addSource(s, { type: "geojson", data: empty });
  map.addLayer({ id: "alts", type: "line", source: "alts", paint: { "line-color": "#9AA0A6", "line-width": 7, "line-opacity": 0.8 }, layout: { "line-cap": "round", "line-join": "round" } });
  map.addLayer({ id: "route-casing", type: "line", source: "route", paint: { "line-color": "#1A4DB8", "line-width": 11 }, layout: { "line-cap": "round", "line-join": "round" } });
  map.addLayer({ id: "route", type: "line", source: "route", paint: { "line-color": "#2F6FED", "line-width": 7 }, layout: { "line-cap": "round", "line-join": "round" } });
  map.addLayer({ id: "slow", type: "line", source: "slow", paint: { "line-color": ["get", "color"], "line-width": 6 }, layout: { "line-cap": "round", "line-join": "round" } });
  map.addLayer({ id: "dest", type: "circle", source: "dest", paint: { "circle-color": "#D93025", "circle-radius": 9, "circle-stroke-color": "#fff", "circle-stroke-width": 3 } });
  map.addLayer({ id: "incidents", type: "symbol", source: "incidents", minzoom: INCIDENTS_MIN_ZOOM,
    layout: { "icon-image": ["get", "icon"], "icon-size": 0.8, "icon-allow-overlap": true, "icon-ignore-placement": true } });
  map.addLayer({ id: "reports", type: "symbol", source: "reports",
    layout: { "icon-image": ["get", "icon"], "icon-allow-overlap": true, "icon-ignore-placement": true }, paint: { "icon-opacity": ["get", "opacity"] } });
  map.addLayer({ id: "me", type: "circle", source: "me", paint: { "circle-color": "#2F6FED", "circle-radius": 9, "circle-stroke-color": "#fff", "circle-stroke-width": 3 } });
  showTraffic(state.traffic);
  refreshReports();
  setInterval(refreshReports, REPORTS_REFRESH_MS);
  refreshIncidents();
});
map.on("moveend", () => refreshIncidents());
map.on("dragstart", () => { state.following = false; });
map.on("click", "alts", (e) => selectRoute(e.features[0].properties.index));
map.on("click", "reports", (e) => {
  const r = state.reports.find((x) => x.id === e.features[0].properties.id);
  if (r) toast(`${r.title} · reported ${minutesAgo(r.created)}${r.confirmed > r.created ? ` · still there ${minutesAgo(r.confirmed)}` : ""}`);
});
map.on("click", "incidents", (e) => {
  const inc = state.incidents[e.features[0].properties.i];
  if (inc) toast(`${inc.symbol} ${inc.text || inc.spoken}${inc.delay >= 60 ? ` · +${formatDuration(inc.delay)}` : ""}`);
});

/** A map image of [emoji] on a [color] disc with a white rim, added the first time; returns its name. */
function badge(emoji, color) {
  const name = `badge:${emoji}:${color}`;
  if (map.hasImage(name)) return name;
  const ratio = 2, size = 32 * ratio, c = size / 2;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d");
  g.fillStyle = "#fff"; g.beginPath(); g.arc(c, c, c, 0, 2 * Math.PI); g.fill();
  g.fillStyle = color; g.beginPath(); g.arc(c, c, c - 2.5 * ratio, 0, 2 * Math.PI); g.fill();
  g.font = `${17 * ratio}px sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(emoji, c, c + ratio);
  map.addImage(name, g.getImageData(0, 0, size, size), { pixelRatio: ratio });
  return name;
}

// --- Location ---

function startLocation() {
  if (!navigator.geolocation) return toast("This browser can't share your location");
  let first = true;
  navigator.geolocation.watchPosition((pos) => {
    const c = pos.coords;
    state.here = [c.longitude, c.latitude];
    state.accuracy = c.accuracy || 50;
    state.speed = c.speed || 0;
    if (c.heading != null && !Number.isNaN(c.heading) && state.speed > 2) state.heading = c.heading;
    if (first) { first = false; map.jumpTo({ center: state.here, zoom: 15 }); }
    onLocation();
  }, (e) => toast(e.code === 1 ? "Allow location to see where you are and navigate" : "Can't find your location"),
  { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
}

function onLocation() {
  const nav = state.nav;
  let shown = state.here;
  if (nav) {
    const u = navUpdate(nav, state.here);
    if (u.snapped) shown = u.snapped;
    showNav(u);
  }
  map.getSource("me")?.setData(fc([pointFeature(shown)]));
  if (state.following) {
    map.easeTo({ center: shown, bearing: nav && state.heading != null ? state.heading : map.getBearing(), pitch: nav ? 50 : 0,
      zoom: nav ? Math.max(map.getZoom(), 16) : map.getZoom(), duration: 900 });
  }
}

$("locate").onclick = () => {
  state.following = true;
  if (state.here) map.easeTo({ center: state.here, zoom: Math.max(map.getZoom(), 15) });
  else startLocation();
};

// --- Search ---

let searchTimer, searchRun = 0;
$("search").addEventListener("input", () => {
  const q = $("search").value.trim();
  $("clear").hidden = !q && !state.destination;
  clearTimeout(searchTimer);
  if (q.length < 3) return q ? showResults([]) : showMenu();
  searchTimer = setTimeout(() => search(q, false), 350);
});
$("search").addEventListener("focus", () => { if (!$("search").value) showMenu(); });
$("search").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  clearTimeout(searchTimer);
  const q = $("search").value.trim();
  if (q) { $("search").blur(); search(q, true); }
});
$("clear").onclick = () => {
  $("search").value = "";
  $("clear").hidden = true;
  showResults([]);
  if (!state.nav) clearRoute();
};

/** Photon while typing; on Enter, TomTom's places (houses, shops the free data lacks) are added. */
async function search(q, pressed) {
  const run = ++searchRun;
  const near = state.here ?? map.getCenter().toArray();
  const places = await withProgress(async () => {
    const free = photon(q, near).catch(() => []);
    const tomtom = pressed ? trafficCall(`?q=${encodeURIComponent(q)}&lat=${near[1]}&lon=${near[0]}`)
      .then((o) => o.places.map((p) => ({ name: p.name || p.detail, detail: p.detail, at: [p.lon, p.lat] }))).catch(() => []) : [];
    const all = [...(await free), ...(await tomtom)];
    return all.filter((p, i) => all.findIndex((o) => distance(o.at, p.at) < SAME_PLACE_METERS) === i);
  });
  if (run !== searchRun) return; // A newer search has taken over.
  const words = q.toLowerCase().split(/\W+/).filter((w) => w.length > 1);
  const full = (p) => words.every((w) => p.name.toLowerCase().includes(w));
  places.sort((a, b) => full(b) - full(a) || distance(near, a.at) - distance(near, b.at));
  if (pressed && !places.length) toast("No places found");
  showResults(places.slice(0, 10), near);
}

async function photon(q, near) {
  const res = await fetch(`${PHOTON}?q=${encodeURIComponent(q)}&limit=15&lat=${near[1]}&lon=${near[0]}`);
  const json = await res.json();
  return json.features.map((f) => {
    const p = f.properties;
    const name = p.name || [p.housenumber, p.street].filter(Boolean).join(" ");
    const detail = [...new Set(["street", "city", "state", "country"].map((k) => p[k]).filter((v) => v && v !== name))].join(", ");
    return { name: name || detail, detail, at: f.geometry.coordinates };
  });
}

function showResults(places, near) {
  const list = $("results");
  list.replaceChildren(...places.map((p) => {
    const row = document.createElement("button");
    row.className = "row";
    row.innerHTML = `<span class="pin">📍</span><span class="what"><div class="name"></div><div class="detail"></div></span><span class="far"></span>`;
    row.querySelector(".name").textContent = p.name;
    row.querySelector(".detail").textContent = p.detail;
    row.querySelector(".far").textContent = near ? shortDistance(distance(near, p.at)) : "";
    row.onclick = () => goTo(p);
    return row;
  }));
}

// --- Routes ---

function goTo(place) {
  showResults([]);
  $("search").value = place.name;
  $("search").blur();
  $("clear").hidden = false;
  state.destination = place;
  planRoute(true);
}

async function planRoute(fit) {
  if (!state.here) { startLocation(); return toast("Finding your location…"); }
  const to = state.destination?.at;
  if (!to) return;
  const found = await withProgress(() => fetchRoutes(state.here, to, true));
  if (!found.length) return toast("No driving route found");
  state.routes = found;
  selectRoute(0);
  $("panel").hidden = false;
  if (fit) {
    state.following = false;
    const b = new maplibregl.LngLatBounds();
    found.forEach((r) => r.points.forEach((p) => b.extend(p)));
    map.fitBounds(b, { padding: { top: 120, bottom: 300, left: 50, right: 50 }, pitch: 0, bearing: 0 });
  }
}

/** OSRM's routes, then TomTom's live time for each (through Roadwise's server). */
async function fetchRoutes(from, to, alternatives) {
  const url = `${OSRM}${from.join(",")};${to.join(",")}?overview=full&geometries=geojson&steps=true${alternatives ? "&alternatives=3" : ""}`;
  const json = await fetch(url).then((r) => r.json()).catch(() => null);
  if (json?.code !== "Ok") return [];
  const routes = json.routes.map(parseRoute);
  await Promise.all(routes.map(async (r) => {
    const step = Math.max(1, Math.floor(r.points.length / 600));
    const thin = r.points.filter((_, i) => i % step === 0 || i === r.points.length - 1).map(([lng, lat]) => [lat, lng]);
    const t = await trafficCall("", { route: thin }).catch(() => null);
    if (!t) return;
    r.seconds = t.seconds;
    r.delay = t.delaySeconds || 0;
    r.slow = (t.slow || []).filter((s) => s.points.length >= 2).map((s) => ({
      points: s.points.map(([lat, lng]) => [lng, lat]),
      color: s.level >= 4 || s.kind === "ROAD_CLOSURE" ? "#5F1A1A" : s.level >= 3 ? "#D93025" : "#F29900",
    }));
  }));
  return routes;
}

function parseRoute(r) {
  const steps = [];
  for (const leg of r.legs) for (const s of leg.steps) {
    steps.push({ type: s.maneuver.type, modifier: s.maneuver.modifier ?? null, road: s.name || "", exit: s.maneuver.exit ?? null, at: s.maneuver.location });
  }
  const via = [...new Set(r.legs.flatMap((l) => (l.summary || "").split(", ").filter(Boolean)))].slice(0, 2).join(", ");
  return { points: r.geometry.coordinates, meters: r.distance, seconds: r.duration, delay: 0, slow: [], steps, via };
}

function selectRoute(i) {
  state.selected = i;
  drawRoutes();
  const list = $("routes");
  list.replaceChildren(...state.routes.map((r, k) => {
    const b = document.createElement("button");
    b.className = `route${k === i ? " on" : ""}`;
    const traffic = r.delay >= 60 ? ` · 🚗 +${formatDuration(r.delay)}` : "";
    b.innerHTML = `<span><div class="time"></div><div class="sub"></div></span><span class="sub"></span>`;
    b.querySelector(".time").textContent = formatDuration(r.seconds);
    b.querySelectorAll(".sub")[0].textContent = `${shortDistance(r.meters)}${r.via ? ` · ${r.via}` : ""}${traffic}`;
    b.querySelectorAll(".sub")[1].textContent = clock(r.seconds);
    b.onclick = () => selectRoute(k);
    return b;
  }));
}

function drawRoutes() {
  const r = state.nav?.route ?? state.routes[state.selected];
  const alts = state.nav ? [] : state.routes.map((x, k) => (k === state.selected ? null : lineFeature(x.points, { index: k }))).filter(Boolean);
  map.getSource("alts")?.setData(fc(alts));
  map.getSource("route")?.setData(r ? lineFeature(r.points) : empty);
  map.getSource("slow")?.setData(fc((r?.slow ?? []).map((s) => lineFeature(s.points, { color: s.color }))));
  map.getSource("dest")?.setData(state.destination ? fc([pointFeature(state.destination.at)]) : empty);
}

function clearRoute() {
  state.destination = null;
  state.routes = [];
  drawRoutes();
  $("panel").hidden = true;
}

// --- Navigation ---

$("go").onclick = () => (state.nav ? stopNavigation() : startNavigation());

function startNavigation() {
  const r = state.routes[state.selected];
  if (!r) return;
  state.nav = { route: r, stepIndex: r.steps.length > 1 ? 1 : 0, far: false, near: false, off: 0, rerouting: false,
    startedAt: Date.now(), predicted: r.seconds, cumulative: cumulative(r.points) };
  state.following = true;
  $("searchBox").hidden = true;
  $("banner").hidden = false;
  $("routes").hidden = true;
  $("navInfo").hidden = false;
  $("go").textContent = "■";
  $("go").classList.add("stop");
  drawRoutes();
  keepAwake(true);
  say(instructionFor(r.steps[0]));
  onLocation();
}

function stopNavigation() {
  state.nav = null;
  keepAwake(false);
  $("searchBox").hidden = false;
  $("banner").hidden = true;
  $("routes").hidden = false;
  $("navInfo").hidden = true;
  $("go").textContent = "▶ Start";
  $("go").classList.remove("stop");
  map.easeTo({ pitch: 0, bearing: 0 });
  drawRoutes();
}

function cumulative(points) {
  const c = [0];
  for (let i = 1; i < points.length; i++) c.push(c[i - 1] + distance(points[i - 1], points[i]));
  return c;
}

/** Which maneuver is next, what to say, and whether the driver has left the route (the Android Navigator). */
function navUpdate(nav, here) {
  const steps = nav.route.steps;
  let step = steps[nav.stepIndex], dist = distance(here, step.at);
  while (dist < ADVANCE_METERS && nav.stepIndex < steps.length - 1) {
    step = steps[++nav.stepIndex];
    nav.far = nav.near = false;
    dist = distance(here, step.at);
  }
  const text = instructionFor(step);
  // Near the end, slowing down or stopped counts too: the route ends on the road, the driver may
  // park somewhere (a car park, a basement) it never comes within ARRIVE_METERS of.
  const nearEnd = Math.min(distance(here, nav.route.points.at(-1)), state.destination ? distance(here, state.destination.at) : Infinity);
  const arrived = (step.type === "arrive" && dist < ARRIVE_METERS) || (nearEnd < NEAR_END_METERS && state.speed < PARKING_SPEED);
  let speak = null;
  if (arrived) { if (!nav.near) speak = "You have arrived"; nav.near = true; }
  else if (dist < NEAR_METERS && !nav.near) { speak = text; nav.near = nav.far = true; }
  else if (dist < FAR_METERS && !nav.far) { speak = `In ${spokenDistance(dist)}, ${text[0].toLowerCase()}${text.slice(1)}`; nav.far = true; }

  const s = snap(here, nav.route.points);
  const wrongWay = state.heading != null && state.speed > 4 && s && angleBetween(state.heading, s.bearing) > 70;
  // No rerouting while looking for a spot to park.
  const off = (!s || s.meters > Math.max(OFF_ROUTE_METERS, state.accuracy * 1.5) || wrongWay) && nearEnd >= NEAR_END_METERS;
  nav.off = off ? nav.off + 1 : 0;
  const after = steps.slice(nav.stepIndex + 1).find((x) => x.type === "arrive" || !instructionFor(x).startsWith("Continue straight"));
  const gap = after ? distance(step.at, after.at) : 0;
  let left = 0, secondsLeft = 0;
  if (s) {
    const total = nav.cumulative.at(-1);
    left = Math.max(0, total - nav.cumulative[s.segment] - distance(nav.route.points[s.segment], s.point));
    secondsLeft = total ? (nav.route.seconds * left) / total : 0;
  }
  return { text, dist, speak, arrived, step, then: after && gap < THEN_SHOWN_METERS ? after : null, gap,
    offRoute: nav.off >= OFF_ROUTE_UPDATES, snapped: s && !off && s.meters < 30 ? s.point : null, left, secondsLeft };
}

function showNav(u) {
  const nav = state.nav;
  $("arrow").textContent = symbolFor(u.step);
  $("bannerDistance").textContent = u.arrived ? "Arrived" : shortDistance(u.dist);
  $("bannerText").textContent = bannerFor(u.step);
  $("then").hidden = !u.then;
  if (u.then) $("then").textContent = `Then ${symbolFor(u.then)}  ${shortDistance(u.gap)}`;
  $("navEta").textContent = clock(u.secondsLeft);
  $("navLeft").textContent = `${formatDuration(u.secondsLeft)} · ${shortDistance(u.left)}`;
  if (u.speak) say(u.speak);
  if (u.arrived) {
    const took = (Date.now() - nav.startedAt) / 1000, off = Math.round((took - nav.predicted) / 60);
    toast(`You have arrived · said ${formatDuration(nav.predicted)}, took ${formatDuration(took)} (${off > 0 ? "+" : ""}${off} min)`);
    stopNavigation();
    clearRoute();
    $("search").value = "";
  } else if (u.offRoute && !nav.rerouting) {
    reroute();
  }
}

async function reroute() {
  const nav = state.nav;
  nav.rerouting = true;
  say("Rerouting");
  const [r] = await fetchRoutes(state.here, state.destination.at, false);
  if (state.nav !== nav) return;
  nav.rerouting = false;
  if (!r) return;
  Object.assign(nav, { route: r, stepIndex: r.steps.length > 1 ? 1 : 0, far: false, near: false, off: 0, cumulative: cumulative(r.points) });
  drawRoutes();
}

async function keepAwake(on) {
  try {
    if (on && "wakeLock" in navigator) state.wakeLock = await navigator.wakeLock.request("screen");
    else { await state.wakeLock?.release(); state.wakeLock = null; }
  } catch { /* Not allowed here (e.g. battery saver); directions still work while the screen is on. */ }
}
// The lock is dropped whenever the page is hidden; take it again on coming back.
document.addEventListener("visibilitychange", () => { if (state.nav && document.visibilityState === "visible") keepAwake(true); });

function say(text) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  speechSynthesis.speak(Object.assign(new SpeechSynthesisUtterance(text), { lang: "en-GB" }));
}

function instructionFor(step) {
  const onto = step.road ? ` onto ${step.road}` : "";
  const words = { "sharp left": "sharp left", "sharp right": "sharp right", "slight left": "slightly left", "slight right": "slightly right", uturn: "around" };
  const dir = step.modifier ? words[step.modifier] ?? step.modifier : null;
  const ordinal = (n) => ["first", "second", "third", "fourth", "fifth"][n - 1] ?? `${n}th`;
  switch (step.type) {
    case "depart": return `Head ${dir ?? "out"}${step.road ? ` on ${step.road}` : ""}`;
    case "arrive": return "Arrive at your destination";
    case "roundabout": case "rotary": return step.exit ? `At the roundabout, take the ${ordinal(step.exit)} exit${onto}` : `Enter the roundabout${onto}`;
    case "exit roundabout": case "exit rotary": return `Exit the roundabout${onto}`;
    case "merge": return `Merge${dir ? ` ${dir}` : ""}${onto}`;
    case "on ramp": return `Take the ramp${dir ? ` on the ${dir}` : ""}${onto}`;
    case "off ramp": return `Take the exit${dir ? ` on the ${dir}` : ""}${onto}`;
    case "fork": return `Keep ${dir ?? "ahead"} at the fork${onto}`;
    case "end of road": return `At the end of the road, turn ${dir ?? "ahead"}${onto}`;
    case "new name": case "continue": return step.modifier === "uturn" ? `Make a U-turn${onto}` : `Continue ${dir ?? "straight"}${onto}`;
    default:
      if (!step.modifier || step.modifier === "straight") return `Continue straight${onto}`;
      return step.modifier === "uturn" ? `Make a U-turn${onto}` : `Turn ${dir}${onto}`;
  }
}
function bannerFor(step) {
  if (step.type === "arrive") return "🏁";
  if ((step.type === "roundabout" || step.type === "rotary") && step.exit) return `⟳ ${step.exit}${step.road ? ` · ${step.road}` : ""}`;
  return step.road || instructionFor(step);
}
function symbolFor(step) {
  if (step.type === "arrive") return "🏁";
  if (step.type === "roundabout" || step.type === "rotary") return `⟳${step.exit ?? ""}`;
  return { left: "←", right: "→", "slight left": "↖", "slight right": "↗", "sharp left": "↙", "sharp right": "↘", uturn: "↶" }[step.modifier] ?? "↑";
}

// --- Traffic, incidents, reports ---

function trafficCall(query, body) {
  return fetch(TRAFFIC + query, {
    method: body ? "POST" : "GET",
    headers: { apikey: SUPABASE_KEY, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }).then((r) => { if (!r.ok) throw new Error(`traffic ${r.status}`); return r.json(); });
}

$("trafficButton").onclick = () => {
  state.traffic = !state.traffic;
  localStorage.setItem("traffic", state.traffic ? "1" : "0");
  showTraffic(state.traffic);
};
function showTraffic(on) {
  $("trafficButton").classList.toggle("off", !on);
  if (!map.getSource("alts")) return; // Not loaded yet; the load handler shows it.
  if (map.getLayer("traffic")) map.removeLayer("traffic");
  if (map.getSource("traffic")) map.removeSource("traffic");
  if (!on) return;
  map.addSource("traffic", { type: "vector", tiles: [`${TRAFFIC}?tile={z}/{x}/{y}`], minzoom: TRAFFIC_MIN_ZOOM, maxzoom: 18, attribution: "Traffic © TomTom" });
  map.addLayer({ id: "traffic", type: "line", source: "traffic", "source-layer": "Traffic flow", minzoom: TRAFFIC_MIN_ZOOM,
    filter: ["<", ["get", "traffic_level"], TRAFFIC_SLOW_BELOW],
    paint: { "line-color": ["step", ["get", "traffic_level"], "#C5221F", 0.4, "#F29900"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.5, 14, 2.5, 18, 4], "line-opacity": 0.9 },
    layout: { "line-cap": "round" } }, "alts");
}

const INCIDENT = {
  1: ["💥", "#D93025", "Accident"], 8: ["⛔", "#3C4043", "Road closed"], 9: ["🚧", "#F29900", "Roadworks"], 7: ["🚧", "#F29900", "Roadworks"],
  6: ["🚗", "#9334E6", "Traffic jam"], 14: ["🚘", "#F29900", "Broken-down vehicle"], 3: ["⚠️", "#F29900", "Incident"], 5: ["🌊", "#F29900", "Incident"],
};
/** Incidents around the view: asked for again only on new ground or after a few minutes (each ask uses TomTom quota). */
async function refreshIncidents() {
  if (!map.getSource("incidents") || map.getZoom() < INCIDENTS_MIN_ZOOM) return;
  const v = map.getBounds(), c = v.getCenter(), pad = 0.12;
  const a = state.incidentsArea;
  const covered = a && a.contains(v.getNorthEast()) && a.contains(v.getSouthWest());
  if (covered && Date.now() - state.incidentsAt < INCIDENTS_REFRESH_MS) return;
  const area = new maplibregl.LngLatBounds([c.lng - pad, c.lat - pad], [c.lng + pad, c.lat + pad]);
  state.incidentsArea = area;
  state.incidentsAt = Date.now();
  const bbox = [area.getWest(), area.getSouth(), area.getEast(), area.getNorth()].map((x) => x.toFixed(4)).join(",");
  const list = await trafficCall(`?bbox=${bbox}`).then((o) => o.incidents).catch(() => []);
  state.incidents = list.filter((o) => o.points.length).map((o) => {
    const [symbol, color, spoken] = INCIDENT[o.icon] ?? ["⚠️", "#F29900", "Incident"];
    const p = o.points[Math.floor(o.points.length / 2)];
    return { at: [p[1], p[0]], symbol, color, spoken: o.icon === 3 || o.icon === 5 ? o.text || spoken : spoken, text: o.text, delay: o.delay || 0 };
  });
  map.getSource("incidents").setData(fc(state.incidents.map((inc, i) => pointFeature(inc.at, { i, icon: badge(inc.symbol, inc.color) }))));
}

async function supabase(method, path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}`, ...(body ? { "content-type": "application/json", prefer: "return=minimal" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return body ? null : res.json();
}

async function refreshReports() {
  const rows = await supabase("GET", "live_reports?select=id,type,subtype,lat,lng,created_at,confirmed_at&order=confirmed_at.desc&limit=500").catch(() => null);
  if (!rows) return;
  state.reports = rows.map((r) => {
    const type = REPORT_TYPES.find((t) => t.key === r.type) ?? REPORT_TYPES[3];
    const sub = type.subtypes.find((s) => s.key === r.subtype);
    const created = Date.parse(r.created_at), confirmed = r.confirmed_at ? Date.parse(r.confirmed_at) : created;
    return { id: r.id, at: [r.lng, r.lat], title: sub?.title ?? type.label, icon: sub?.icon ?? type.icon, color: type.color, created, confirmed };
  });
  map.getSource("reports")?.setData(fc(state.reports.map((r) => {
    const minutes = (Date.now() - r.confirmed) / 60000;
    const t = Math.min(1, Math.max(0, (minutes - REPORT_FRESH_MIN) / (REPORT_MAX_AGE_MIN - REPORT_FRESH_MIN)));
    return pointFeature(r.at, { id: r.id, icon: badge(r.icon, r.color), opacity: 1 - t * (1 - REPORT_OLDEST_OPACITY) });
  })));
}

$("reportButton").onclick = () => {
  if (!state.here) { startLocation(); return toast("Finding your location…"); }
  showTiles("What's on the road?", REPORT_TYPES.map((t) => ({ icon: t.icon, label: t.short, color: t.color,
    pick: () => (t.subtypes.length ? showSubtypes(t) : sendReport(t, null)) })));
};
function showSubtypes(t) {
  const tiles = t.subtypes.map((s) => ({ icon: s.icon, label: s.short, color: t.color, pick: () => sendReport(t, s) }));
  if (t.key === "hazard") tiles.push({ icon: t.icon, label: "Other", color: t.color, pick: () => sendReport(t, null) });
  showTiles(t.label, tiles);
}
function showTiles(title, tiles) {
  $("sheetTitle").textContent = title;
  $("tiles").replaceChildren(...tiles.map((t) => {
    const b = document.createElement("button");
    b.className = "tile";
    b.style.background = t.color;
    b.innerHTML = `<b></b><span></span>`;
    b.querySelector("b").textContent = t.icon;
    b.querySelector("span").textContent = t.label;
    b.onclick = t.pick;
    return b;
  }));
  $("sheet").hidden = false;
}
$("sheetClose").onclick = () => ($("sheet").hidden = true);

async function sendReport(type, sub) {
  $("sheet").hidden = true;
  const [lng, lat] = state.here;
  try {
    await supabase("POST", "reports", { type: type.key, lat, lng, ...(sub ? { subtype: sub.key } : {}) });
    toast(`${sub?.icon ?? type.icon} ✓`);
    refreshReports();
  } catch (e) {
    toast(`Couldn't send report: ${e.message}`);
  }
}

// --- Supporting Roadwise ---

let donations = null;
const KOFI_URL = /^https:\/\/(www\.)?ko-fi\.com\/[A-Za-z0-9_]+\/?$/;
const BMAC_URL = /^https:\/\/(www\.)?buymeacoffee\.com\/[A-Za-z0-9_.-]+\/?$/;
supabase("GET", "donations?select=*").then((rows) => {
  const d = rows[0];
  // Only the real pages, whatever the row says.
  if (d) donations = { ...d, kofi_url: KOFI_URL.test(d.kofi_url ?? "") ? d.kofi_url : null, bmac_url: BMAC_URL.test(d.bmac_url ?? "") ? d.bmac_url : null };
}).catch(() => {});

/** What the empty search box offers: donating and asking for a feature. */
function showMenu() {
  const row = (icon, title, detail, onclick) => {
    const b = document.createElement("button");
    b.className = "row";
    b.innerHTML = `<span class="pin"></span><span class="what"><div class="name"></div><div class="detail"></div></span>`;
    b.querySelector(".pin").textContent = icon;
    b.querySelector(".name").textContent = title;
    b.querySelector(".detail").textContent = detail;
    b.onmousedown = (e) => e.preventDefault(); // Keep the keyboard's blur from eating the tap.
    b.onclick = () => { $("search").blur(); showResults([]); onclick(); };
    return b;
  };
  $("results").replaceChildren(
    row("☕", "Support Roadwise", donations ? `RM${donations.raised_rm} of RM${donations.goal_rm} this month` : "Donate with DuitNow", showSupport),
    row("💡", "Request a feature", "What would make Roadwise better for you?", requestFeature),
  );
}

function showSheet(title, ...content) {
  $("sheetTitle").textContent = title;
  $("tiles").replaceChildren(...content);
  $("sheet").hidden = false;
}

function showSupport() {
  const text = document.createElement("p");
  text.className = "sheetText";
  text.textContent = `Roadwise is free, with no ads. Live traffic and the servers cost about RM${donations?.goal_rm ?? 300} a month; ` +
    "donations keep it free for everyone. To give with DuitNow, save or screenshot this QR, then in your bank or Touch 'n Go app " +
    "choose Scan → from gallery. Any amount helps. Thank you!";
  const qr = Object.assign(document.createElement("img"), { src: "duitnow.png", alt: "DuitNow QR", className: "qr" });
  qr.onerror = () => qr.remove(); // Not added yet.
  const links = [["Ko-fi", donations?.kofi_url], ["Buy Me a Coffee", donations?.bmac_url]].filter(([, url]) => url).map(([label, url]) =>
    Object.assign(document.createElement("a"), { className: "primary payLink", href: url, target: "_blank", rel: "noopener", textContent: label }));
  if (links.length) text.textContent += " Or give by card:";
  showSheet("☕ Support Roadwise", text, ...links, qr);
}

function requestFeature() {
  const box = Object.assign(document.createElement("textarea"), { rows: 4, maxLength: 500, placeholder: "What would make Roadwise better for you?" });
  const send = Object.assign(document.createElement("button"), { className: "primary", textContent: "Send" });
  send.onclick = async () => {
    const text = box.value.trim();
    if (text.length < 5) return toast("Tell us a bit more");
    send.disabled = true;
    try {
      await supabase("POST", "feature_requests", { text, source: "web" });
      $("sheet").hidden = true;
      toast("Thanks! 💡 Request sent");
    } catch (e) {
      send.disabled = false;
      toast(`Couldn't send it: ${e.message}`);
    }
  };
  showSheet("💡 Request a feature", box, send);
  box.focus();
}

// --- Start ---

if (!localStorage.getItem("installSeen")) $("install").hidden = false;
$("installOk").onclick = () => { $("install").hidden = true; localStorage.setItem("installSeen", "1"); };
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
startLocation();
