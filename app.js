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
const MAX_STOPS = 8;
const STOP_REACHED_METERS = 60;
const OSRM_TABLE = "https://router.project-osrm.org/table/v1/driving/";
// Navigation, as the Android Navigator.
const ADVANCE_METERS = 25, ARRIVE_METERS = 30, NEAR_METERS = 60, FAR_METERS = 400;
const OFF_ROUTE_METERS = 50, OFF_ROUTE_UPDATES = 3, THEN_SHOWN_METERS = 400;
const NEAR_END_METERS = 100, PARKING_SPEED = 3; // m/s, about 11 km/h

const REPORT_TYPES = [
  { key: "police", label: "Police", color: "#2F6FED", icon: "👮", glyph: "local_police", short: "Police", subtypes: [
    ["visible", "Police", "👮", "Police", "local_police"], ["hidden", "Hidden police", "🕵️", "Hidden", "visibility_off"], ["mobile_camera", "Mobile speed camera", "📸", "Camera", "photo_camera"]] },
  { key: "accident", label: "Accident", color: "#D93025", icon: "💥", glyph: "car_crash", short: "Crash", subtypes: [
    ["minor", "Minor accident", "🚗", "Minor", "minor_crash"], ["major", "Serious accident", "🚑", "Serious", "emergency"]] },
  { key: "traffic", label: "Traffic jam", color: "#9334E6", icon: "🚗", glyph: "traffic_jam", short: "Traffic", subtypes: [
    ["slow", "Slow traffic", "🐢", "Slow", "speed"], ["heavy", "Heavy traffic", "🚙", "Heavy", "traffic_jam"], ["standstill", "Traffic at a standstill", "🛑", "Stopped", "traffic_jam"]] },
  { key: "hazard", label: "Hazard", color: "#F29900", icon: "⚠️", glyph: "warning", short: "Hazard", subtypes: [
    ["pothole", "Pothole", "🕳️", "Pothole", "tire_repair"], ["object", "Object on the road", "📦", "Object", "inventory_2"], ["stopped_vehicle", "Stopped vehicle", "🚘", "Car", "car_repair"],
    ["animal", "Animal on the road", "🐄", "Animal", "pets"], ["signal_out", "Traffic lights out", "🚦", "Lights", "traffic"], ["roadworks", "Roadworks", "🚧", "Roadworks", "construction"],
    ["flood", "Flooding", "🌊", "Flood", "flood"], ["slippery", "Slippery road", "💧", "Slippery", "water_drop"], ["low_visibility", "Poor visibility", "🌫️", "Fog", "foggy"]] },
  { key: "closure", label: "Road closed", color: "#3C4043", icon: "⛔", glyph: "block", short: "Closed", subtypes: [] },
].map((t) => ({ ...t, subtypes: t.subtypes.map(([key, title, icon, short, glyph]) => ({ key, title, icon, short, glyph })) }));

const $ = (id) => document.getElementById(id);
/** An icon from the sprite in index.html, as markup. */
const icon = (name) => `<svg class="ico" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const state = {
  here: null, heading: null, speed: 0, accuracy: 50,
  destination: null, routes: [], selected: 0,
  stops: [], origin: null, picking: null, // stops in visiting order; a start other than here (planning only); "stop" | "origin" while searching for one
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
  for (const s of ["alts", "route", "slow", "dest", "stops", "me", "reports", "incidents"]) map.addSource(s, { type: "geojson", data: empty });
  map.addLayer({ id: "alts", type: "line", source: "alts", paint: { "line-color": "#9AA0A6", "line-width": 7, "line-opacity": 0.8 }, layout: { "line-cap": "round", "line-join": "round" } });
  map.addLayer({ id: "route-casing", type: "line", source: "route", paint: { "line-color": "#1A4DB8", "line-width": 11 }, layout: { "line-cap": "round", "line-join": "round" } });
  map.addLayer({ id: "route", type: "line", source: "route", paint: { "line-color": "#2F6FED", "line-width": 7 }, layout: { "line-cap": "round", "line-join": "round" } });
  map.addLayer({ id: "slow", type: "line", source: "slow", paint: { "line-color": ["get", "color"], "line-width": 6 }, layout: { "line-cap": "round", "line-join": "round" } });
  // The destination: a pin standing on the spot, and the ring it sends out when it drops (hidden at rest).
  map.addLayer({ id: "stops", type: "circle", source: "stops", paint: { "circle-color": "#fff", "circle-radius": 11, "circle-stroke-color": "#1A4DB8", "circle-stroke-width": 3 } });
  map.addLayer({ id: "stop-numbers", type: "symbol", source: "stops",
    layout: { "text-field": ["get", "n"], "text-font": ["Noto Sans Bold"], "text-size": 13, "text-allow-overlap": true, "text-ignore-placement": true },
    paint: { "text-color": "#1A4DB8" } });
  map.addLayer({ id: "dest-ring", type: "circle", source: "dest", paint: { "circle-color": "#EA4335", "circle-radius": 0, "circle-opacity": 0, "circle-pitch-alignment": "map" } });
  map.addImage("dest-pin", destPinImage(), { pixelRatio: 2 });
  map.addLayer({ id: "dest", type: "symbol", source: "dest",
    layout: { "icon-image": "dest-pin", "icon-anchor": "bottom", "icon-allow-overlap": true, "icon-ignore-placement": true } });
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
map.on("click", "stops", (e) => { const stop = state.stops[e.features[0].properties.i]; if (stop) removeStop(stop); });
map.on("click", "reports", (e) => {
  const r = state.reports.find((x) => x.id === e.features[0].properties.id);
  if (r) toast(`${r.title} · reported ${minutesAgo(r.created)}${r.confirmed > r.created ? ` · still there ${minutesAgo(r.confirmed)}` : ""}`);
});
map.on("click", "incidents", (e) => {
  const inc = state.incidents[e.features[0].properties.i];
  if (inc) toast(`${inc.text || inc.spoken}${inc.delay >= 60 ? ` · +${formatDuration(inc.delay)}` : ""}`);
});

/** The destination pin (as the app's ic_dest_pin): red, white rim and centre, 40px. */
function destPinImage() {
  const size = 80, g = Object.assign(document.createElement("canvas"), { width: size, height: size }).getContext("2d");
  g.scale(size / 24, size / 24);
  const pin = new Path2D("M12,1.9C8.07,1.9 4.9,5.07 4.9,9c0,5.3 7.1,13.1 7.1,13.1s7.1,-7.8 7.1,-13.1c0,-3.93 -3.17,-7.1 -7.1,-7.1z");
  g.fillStyle = "#EA4335"; g.fill(pin);
  g.strokeStyle = "#FFFFFF"; g.lineWidth = 1.4; g.lineJoin = "round"; g.stroke(pin);
  g.fillStyle = "#FFFFFF"; g.beginPath(); g.arc(12, 9, 2.7, 0, 2 * Math.PI); g.fill();
  return g.getImageData(0, 0, size, size);
}

/**
 * The pin falls onto the place, settles, and sends out one soft ring where it lands, once the map
 * has arrived. One-shot; instant with reduced motion.
 */
let pinDrop = 0;
function dropPin() {
  const run = ++pinDrop;
  const rest = () => {
    map.setLayoutProperty("dest", "icon-offset", [0, 0]);
    map.setPaintProperty("dest", "icon-opacity", 1);
    map.setPaintProperty("dest-ring", "circle-opacity", 0);
  };
  if (reducedMotion()) return rest();
  const backOut = (t) => 1 + 2.6 * (t - 1) ** 3 + 1.6 * (t - 1) ** 2; // a small overshoot to settle
  const start = performance.now();
  const frame = (now) => {
    if (run !== pinDrop) return;
    // Frame times can be a hair earlier than performance.now() at the start: clamp to 0..1.
    const t = Math.min(1, Math.max(0, (now - start) / 420));
    map.setLayoutProperty("dest", "icon-offset", [0, -56 * (1 - backOut(t))]);
    map.setPaintProperty("dest", "icon-opacity", Math.min(1, t * 4));
    if (t < 1) return requestAnimationFrame(frame);
    const ringStart = performance.now();
    const ring = (now2) => {
      if (run !== pinDrop) return;
      const u = Math.min(1, Math.max(0, (now2 - ringStart) / 600)), e = 1 - (1 - u) ** 2;
      map.setPaintProperty("dest-ring", "circle-radius", 4 + 24 * e);
      map.setPaintProperty("dest-ring", "circle-opacity", 0.35 * (1 - e));
      if (u < 1) requestAnimationFrame(ring); else rest();
    };
    requestAnimationFrame(ring);
  };
  requestAnimationFrame(frame);
}

/** A map image of the [glyph] icon in white on a [color] disc with a white rim and a soft shadow; returns its name. */
function badge(glyph, color) {
  const name = `badge:${glyph}:${color}`;
  if (map.hasImage(name)) return name;
  const ratio = 2, size = 36 * ratio, c = size / 2, r = c - 2 * ratio;
  const g = Object.assign(document.createElement("canvas"), { width: size, height: size }).getContext("2d");
  g.fillStyle = "rgba(0,0,0,.24)"; g.beginPath(); g.arc(c, c + ratio, r, 0, 2 * Math.PI); g.fill();
  g.fillStyle = "#fff"; g.beginPath(); g.arc(c, c, r, 0, 2 * Math.PI); g.fill();
  g.fillStyle = color; g.beginPath(); g.arc(c, c, r - 2.5 * ratio, 0, 2 * Math.PI); g.fill();
  const box = 19 * ratio; // the icon, 19px, centred
  g.save(); g.translate(c - box / 2, c - box / 2); g.scale(box / 960, box / 960); g.translate(0, 960);
  g.fillStyle = "#fff"; g.fill(new Path2D(GLYPHS[glyph])); g.restore();
  map.addImage(name, g.getImageData(0, 0, size, size), { pixelRatio: ratio });
  return name;
}

// --- Night colours (as the Android app's MapTheme and RoadColors) ---

const NIGHT = { background: "#1E2227", land: "#252A30", green: "#1F2B25", water: "#15233A", building: "#2E333A",
  label: "#C9CED6", dim: "#4A5058", major: "#50565E", minor: "#3A3F46", casing: "#15181B" };
const UNROADS = ["rail", "transit", "path", "pedestrian", "aeroway", "ferry", "cable", "pier"];
const MAJOR = ["motorway", "trunk", "primary", "major"];
/** The style's own day value of each paint property night changed, to put back in the morning. */
const dayPaint = new Map();
let night = false;

/** Whether the sun is down at [lng, lat] now, to within a few minutes (MapTheme.isNight). */
function isNight([lng, lat], now = new Date()) {
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((now - start) / 86400000);
  const declination = rad(-23.44 * Math.cos((2 * Math.PI / 365) * (dayOfYear + 10)));
  const cosHourAngle = -Math.tan(rad(lat)) * Math.tan(declination);
  if (cosHourAngle <= -1) return false;
  if (cosHourAngle >= 1) return true;
  const halfDayHours = (Math.acos(cosHourAngle) * 180) / Math.PI / 15;
  const hoursFromNoon = ((((now.getUTCHours() + now.getUTCMinutes() / 60 - (12 - lng / 15)) % 24) + 36) % 24) - 12;
  return Math.abs(hoursFromNoon) > halfDayHours;
}

function updateTheme() {
  if (!state.here || !map.getSource("me")) return;
  const want = isNight(state.here);
  if (want !== night) applyNight(want);
}

function applyNight(on) {
  night = on;
  document.documentElement.classList.toggle("night", on);
  document.querySelector('meta[name="theme-color"]').content = on ? "#1E2227" : "#2F6FED";
  const paint = (id, prop, value) => {
    const key = `${id}|${prop}`;
    if (on) {
      if (!dayPaint.has(key)) dayPaint.set(key, map.getPaintProperty(id, prop));
      map.setPaintProperty(id, prop, value);
    } else if (dayPaint.has(key)) {
      map.setPaintProperty(id, prop, dayPaint.get(key));
      dayPaint.delete(key);
    }
  };
  for (const l of map.getStyle().layers) {
    const layer = l["source-layer"], id = l.id;
    if (l.type === "background") paint(id, "background-color", NIGHT.background);
    if (l.source !== "openmaptiles") continue;
    if (l.type === "fill" && layer !== "transportation") {
      const c = layer === "water" ? NIGHT.water : layer === "building" ? NIGHT.building
        : ["park", "wood", "grass", "wetland"].some((w) => id.includes(w)) ? NIGHT.green : NIGHT.land;
      paint(id, "fill-color", c);
      paint(id, "fill-outline-color", c);
    } else if (l.type === "line" && layer === "waterway") paint(id, "line-color", NIGHT.water);
    else if (l.type === "line" && layer === "park") paint(id, "line-color", NIGHT.dim);
    else if (l.type === "line" && layer === "transportation") {
      paint(id, "line-color", UNROADS.some((w) => id.includes(w)) ? NIGHT.dim : id.includes("casing") ? NIGHT.casing
        : MAJOR.some((w) => id.includes(w)) ? NIGHT.major : NIGHT.minor);
    } else if (l.type === "symbol") {
      paint(id, "text-color", NIGHT.label);
      paint(id, "text-halo-color", NIGHT.background);
    }
  }
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
  if (nav && state.stops.length && distance(state.here, state.stops[0].at) < STOP_REACHED_METERS) {
    say(`Arriving at ${state.stops.shift().name}`);
    drawRoutes();
  }
  if (nav) {
    const u = navUpdate(nav, state.here);
    if (u.snapped) shown = u.snapped;
    showNav(u);
  }
  map.getSource("me")?.setData(fc([pointFeature(shown)]));
  updateTheme();
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
$("search").addEventListener("focus", () => { if (!$("search").value && !state.picking) showMenu(); });
$("search").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  clearTimeout(searchTimer);
  const q = $("search").value.trim();
  if (q) { $("search").blur(); search(q, true); }
});
$("clear").onclick = () => {
  if (state.picking) return stopPicking();
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
    row.innerHTML = `<span class="pin">${icon("pin")}</span><span class="what"><div class="name"></div><div class="detail"></div></span><span class="far"></span>`;
    row.querySelector(".name").textContent = p.name;
    row.querySelector(".detail").textContent = p.detail;
    row.querySelector(".far").textContent = near ? shortDistance(distance(near, p.at)) : "";
    row.onclick = () => choose(p);
    return row;
  }));
}

// --- Routes ---

/** A picked place: show where it is first; routes come with Directions. */
function goTo(place) {
  showResults([]);
  $("search").value = place.name;
  $("search").blur();
  $("clear").hidden = false;
  clearRoute();
  state.destination = place;
  drawRoutes(); // Just the destination pin, hidden until the map gets there.
  ++pinDrop;
  map.setPaintProperty("dest", "icon-opacity", 0);
  $("placeName").textContent = place.name;
  $("placeDetail").textContent = [place.detail, state.here && `${shortDistance(distance(state.here, place.at))} away`].filter(Boolean).join("  ·  ");
  showCard($("placeCard"));
  state.following = false;
  map.easeTo({ center: place.at, zoom: Math.max(map.getZoom(), 15.5), pitch: 0, bearing: 0, duration: 700 });
  setTimeout(dropPin, reducedMotion() ? 0 : 720); // Once the map has arrived.
}
$("placeGo").onclick = () => { hideCard($("placeCard")); planRoute(true); };
$("placeClose").onclick = () => $("clear").onclick();

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
function showCard(el) {
  clearTimeout(el.hideTimer);
  if (el.hidden) { el.hidden = false; void el.offsetHeight; } // Start from the hidden pose.
  el.classList.add("in");
}
function hideCard(el) {
  if (el.hidden) return;
  el.classList.remove("in");
  el.hideTimer = setTimeout(() => (el.hidden = true), reducedMotion() ? 0 : 160);
}

async function planRoute(fit) {
  if (!state.here) { startLocation(); return toast("Finding your location…"); }
  const to = state.destination?.at;
  if (!to) return;
  const from = state.origin?.at ?? state.here;
  const found = await withProgress(() => fetchRoutes([from, ...state.stops.map((p) => p.at), to], true));
  if (!found.length) return toast("No driving route found");
  state.routes = found;
  selectRoute(0);
  renderTrip();
  hideCard($("placeCard"));
  showCard($("panel"));
  if (fit) {
    state.following = false;
    const b = new maplibregl.LngLatBounds();
    found.forEach((r) => r.points.forEach((p) => b.extend(p)));
    map.fitBounds(b, { padding: { top: 120, bottom: 300, left: 50, right: 50 }, pitch: 0, bearing: 0 });
  }
}

/** OSRM's routes through [points] (start, stops, destination), then TomTom's live time for each. Choices only come between two points. */
async function fetchRoutes(points, alternatives) {
  const alt = alternatives && points.length === 2 ? "&alternatives=3" : "";
  const url = `${OSRM}${points.map((p) => p.join(",")).join(";")}?overview=full&geometries=geojson&steps=true${alt}`;
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
  r.legs.forEach((leg, l) => leg.steps.forEach((s) => {
    // Stops in the middle aren't a "depart" or "arrive" for the driver.
    if ((s.maneuver.type === "depart" && l > 0) || (s.maneuver.type === "arrive" && l < r.legs.length - 1)) return;
    steps.push({ type: s.maneuver.type, modifier: s.maneuver.modifier ?? null, road: s.name || "", exit: s.maneuver.exit ?? null, at: s.maneuver.location });
  }));
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
  map.getSource("stops")?.setData(fc(state.stops.map((p, i) => pointFeature(p.at, { i, n: String(i + 1) }))));
}

function clearRoute() {
  state.destination = null;
  state.stops = [];
  state.origin = null;
  renderTrip();
  state.routes = [];
  drawRoutes();
  hideCard($("panel"));
  hideCard($("placeCard"));
}

// --- The trip: where it starts, and its stops in order ---

function choose(place) {
  const kind = state.picking;
  if (!kind) return goTo(place);
  stopPicking();
  if (kind === "origin") state.origin = place;
  else if (state.stops.length >= MAX_STOPS) return toast(`Up to ${MAX_STOPS} stops`);
  else state.stops.push(place);
  planRoute(kind === "origin");
}

function startPicking(kind) {
  state.picking = kind;
  $("search").value = "";
  $("search").placeholder = kind === "origin" ? "Start from: search a place" : "Add a stop: search a place";
  $("clear").hidden = false;
  showResults([]);
  $("search").focus();
}

function stopPicking() {
  state.picking = null;
  $("search").placeholder = "Where to?";
  $("search").value = state.destination?.name ?? "";
  $("clear").hidden = !state.destination;
  showResults([]);
  $("search").blur();
}

function removeStop(stop) {
  state.stops = state.stops.filter((p) => p !== stop);
  state.nav ? reroute() : planRoute(false);
}

function moveStop(from, to) {
  state.stops.splice(to, 0, state.stops.splice(from, 1)[0]);
  planRoute(false);
}

/** The trip on the route card before starting: From (tap to plan from elsewhere), stops with earlier / later / remove, Add stop, Best order. */
function renderTrip() {
  const el = $("trip");
  $("go").hidden = !!state.origin;
  if (state.nav || !state.destination) return el.replaceChildren();
  const button = (name, label, onclick) => Object.assign(document.createElement("button"), { className: "btn", ariaLabel: label, innerHTML: icon(name), onclick });
  const row = (lead, text, onclick, ...buttons) => {
    const r = document.createElement("div");
    r.className = "tripRow";
    const n = Object.assign(document.createElement("span"), { className: "n", textContent: lead });
    const what = Object.assign(document.createElement(onclick ? "button" : "span"), { className: "what", textContent: text });
    if (onclick) what.onclick = onclick;
    r.append(n, what, ...buttons);
    return r;
  };
  const link = (text, onclick) => Object.assign(document.createElement("button"), { className: "tripLink", textContent: text, onclick });
  const o = state.origin;
  el.replaceChildren(
    row("●", o ? `From ${o.name} · planning only` : "From your location", () => startPicking("origin"),
      ...(o ? [button("close", "Start from your location", () => { state.origin = null; planRoute(true); })] : [])),
    ...state.stops.map((p, i) => row(String(i + 1), p.name, null,
      ...(i > 0 ? [button("up", "Move stop earlier", () => moveStop(i, i - 1))] : []),
      ...(i < state.stops.length - 1 ? [button("down", "Move stop later", () => moveStop(i, i + 1))] : []),
      button("close", "Remove stop", () => removeStop(p)))),
    ...(state.stops.length < MAX_STOPS ? [link("+ Add stop", () => startPicking("stop"))] : []),
    ...(state.stops.length >= 2 ? [link("Best order", bestOrder)] : []),
  );
}

/**
 * The quickest order to visit the stops: [seconds][i][j] drives from point i to j, point 0 is the
 * start and the last the destination. Every order is tried (at most 8! = 40,320); null legs never win.
 */
function bestOrderOf(seconds) {
  const end = seconds.length - 1;
  let best = [...Array(end - 1).keys()].map((k) => k + 1), bestTime = Infinity;
  const visit = (order, left, time) => {
    if (time >= bestTime) return;
    const from = order.at(-1) ?? 0;
    if (!left.length) {
      const last = seconds[from][end];
      if (last != null && time + last < bestTime) { bestTime = time + last; best = [...order]; }
      return;
    }
    for (const next of left) {
      const leg = seconds[from][next];
      if (leg == null) continue;
      visit([...order, next], left.filter((k) => k !== next), time + leg);
    }
  };
  visit([], best, 0);
  return best;
}

async function bestOrder() {
  const from = state.origin?.at ?? state.here, to = state.destination?.at;
  if (!from || !to) return;
  const points = [from, ...state.stops.map((p) => p.at), to];
  const json = await withProgress(() => fetch(OSRM_TABLE + points.map((p) => p.join(",")).join(";")).then((r) => r.json()).catch(() => null));
  if (json?.code !== "Ok") return toast("Couldn't work out the best order. Check your connection.");
  const order = bestOrderOf(json.durations).map((i) => state.stops[i - 1]);
  if (order.every((p, i) => p === state.stops[i])) return toast("Already in the best order");
  state.stops = order;
  planRoute(false);
  toast("Stops reordered, quickest first");
}

// --- Navigation ---

$("go").onclick = () => (state.nav ? stopNavigation() : startNavigation());

function startNavigation() {
  if (state.origin) return; // Planning from elsewhere: nothing to navigate from here.
  const r = state.routes[state.selected];
  if (!r) return;
  state.nav = { route: r, stepIndex: r.steps.length > 1 ? 1 : 0, far: false, near: false, off: 0, rerouting: false,
    startedAt: Date.now(), predicted: r.seconds, cumulative: cumulative(r.points) };
  state.following = true;
  $("searchBox").hidden = true;
  $("banner").hidden = false;
  $("routes").hidden = true;
  $("navInfo").hidden = false;
  $("go").innerHTML = `${icon("stop")}`;
  $("go").setAttribute("aria-label", "Stop navigation");
  $("go").classList.add("stop");
  drawRoutes();
  renderTrip();
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
  $("go").innerHTML = `${icon("navigation")} Start`;
  $("go").removeAttribute("aria-label");
  $("go").classList.remove("stop");
  map.easeTo({ pitch: 0, bearing: 0 });
  drawRoutes();
  renderTrip();
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
  const [r] = await fetchRoutes([state.here, ...state.stops.map((p) => p.at), state.destination.at], false);
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
  1: ["car_crash", "#D93025", "Accident"], 8: ["block", "#3C4043", "Road closed"], 9: ["construction", "#F29900", "Roadworks"], 7: ["construction", "#F29900", "Roadworks"],
  6: ["traffic_jam", "#9334E6", "Traffic jam"], 14: ["car_repair", "#F29900", "Broken-down vehicle"], 3: ["warning", "#F29900", "Incident"], 5: ["flood", "#F29900", "Incident"],
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
    const [glyph, color, spoken] = INCIDENT[o.icon] ?? ["warning", "#F29900", "Incident"];
    const p = o.points[Math.floor(o.points.length / 2)];
    return { at: [p[1], p[0]], glyph, color, spoken: o.icon === 3 || o.icon === 5 ? o.text || spoken : spoken, text: o.text, delay: o.delay || 0 };
  });
  map.getSource("incidents").setData(fc(state.incidents.map((inc, i) => pointFeature(inc.at, { i, icon: badge(inc.glyph, inc.color) }))));
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
    return { id: r.id, at: [r.lng, r.lat], title: sub?.title ?? type.label, glyph: sub?.glyph ?? type.glyph, color: type.color, created, confirmed };
  });
  map.getSource("reports")?.setData(fc(state.reports.map((r) => {
    const minutes = (Date.now() - r.confirmed) / 60000;
    const t = Math.min(1, Math.max(0, (minutes - REPORT_FRESH_MIN) / (REPORT_MAX_AGE_MIN - REPORT_FRESH_MIN)));
    return pointFeature(r.at, { id: r.id, icon: badge(r.glyph, r.color), opacity: 1 - t * (1 - REPORT_OLDEST_OPACITY) });
  })));
}

$("reportButton").onclick = () => {
  if (!state.here) { startLocation(); return toast("Finding your location…"); }
  showTiles("What's on the road?", REPORT_TYPES.map((t) => ({ glyph: t.glyph, label: t.short, color: t.color,
    pick: () => (t.subtypes.length ? showSubtypes(t) : sendReport(t, null)) })));
};
function showSubtypes(t) {
  const tiles = t.subtypes.map((s) => ({ glyph: s.glyph, label: s.short, color: t.color, pick: () => sendReport(t, s) }));
  if (t.key === "hazard") tiles.push({ glyph: t.glyph, label: "Other", color: t.color, pick: () => sendReport(t, null) });
  showTiles(t.label, tiles);
}
function showTiles(title, tiles) {
  $("sheetTitle").textContent = title;
  $("tiles").replaceChildren(...tiles.map((t) => {
    const b = document.createElement("button");
    b.className = "tile";
    b.style.background = t.color;
    b.innerHTML = `<svg viewBox="0 -960 960 960" aria-hidden="true"><path/></svg><span></span>`;
    b.querySelector("path").setAttribute("d", GLYPHS[t.glyph]);
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
    b.querySelector(".pin").innerHTML = icon;
    b.querySelector(".name").textContent = title;
    b.querySelector(".detail").textContent = detail;
    b.onmousedown = (e) => e.preventDefault(); // Keep the keyboard's blur from eating the tap.
    b.onclick = () => { $("search").blur(); showResults([]); onclick(); };
    return b;
  };
  $("results").replaceChildren(
    row(icon("coffee"), "Support Roadwise", donations ? `RM${donations.raised_rm} of RM${donations.goal_rm} this month` : "Donate with DuitNow", showSupport),
    row(icon("lightbulb"), "Request a feature", "What would make Roadwise better for you?", requestFeature),
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
  showSheet("Support Roadwise", text, ...links, qr);
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
      toast("Thanks! Request sent");
    } catch (e) {
      send.disabled = false;
      toast(`Couldn't send it: ${e.message}`);
    }
  };
  showSheet("Request a feature", box, send);
  box.focus();
}

// --- Start ---

$("reportGlyph").setAttribute("d", GLYPHS.campaign);

if (!localStorage.getItem("installSeen")) $("install").hidden = false;
$("installOk").onclick = () => { $("install").hidden = true; localStorage.setItem("installSeen", "1"); };
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
startLocation();
