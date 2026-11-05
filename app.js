// Mana on the web: the Android app's core (search, routes with live traffic, turn-by-turn voice,
// reports, incidents, the traffic map) for phones that can't or won't install the APK.
// Positions are [lng, lat] throughout, as MapLibre and GeoJSON have them.

const { SUPABASE_URL, SUPABASE_KEY } = window.ROADWISE;
const TRAFFIC = `${SUPABASE_URL}/functions/v1/traffic`;
const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const PHOTON = "https://photon.komoot.io/api/";
const PHOTON_REVERSE = "https://photon.komoot.io/reverse";
const OSRM = "https://router.project-osrm.org/route/v1/driving/";
const KL = [101.6869, 3.139];

const TRAFFIC_MIN_ZOOM = 10;
const TRAFFIC_SLOW_BELOW = 0.75;
const INCIDENTS_MIN_ZOOM = 11;
const CLUSTER_MAX_ZOOM = 13;
const INCIDENTS_REFRESH_MS = 3 * 60_000;
const REPORTS_REFRESH_MS = 2 * 60_000;
const REPORT_MAX_AGE_MIN = 120, REPORT_FRESH_MIN = 20, REPORT_OLDEST_OPACITY = 0.35;
const SAME_PLACE_METERS = 60;
/** "Where to?" in the browser's language: Malay gets "Ke mana?", as the app does. */
const SEARCH_HINT = /^ms\b/i.test(navigator.language) ? "Ke mana?" : "Where to?";
const MAX_STOPS = 8;
const STOP_REACHED_METERS = 60;
const OSRM_TABLE = "https://router.project-osrm.org/table/v1/driving/";
// Navigation, as the Android Navigator.
const ADVANCE_METERS = 25, ARRIVE_METERS = 30, NEAR_METERS = 60, FAR_METERS = 400;
const OFF_ROUTE_METERS = 50, OFF_ROUTE_UPDATES = 3, THEN_SHOWN_METERS = 400;
const NEAR_END_METERS = 100, PARKING_SPEED = 3; // m/s, about 11 km/h
const DRIVER_PLACES_KM = 50;
/** While driving the car sits this far down the screen, with the road ahead above it (as the app). */
const CAR_Y = 0.72;
/** Only re-zoom when the speed has moved the zoom this much, so it doesn't pump at every fix. */
const SPEED_ZOOM_STEP = 0.25;
/** The driving zoom for a speed, as the app: 17 up to 50 km/h, 15.8 at 80, 14.6 from 110. */
const speedZoom = (kmh) => 17 - (Math.min(110, Math.max(50, kmh)) - 50) * 0.04;
const TURN_ARROW_BEFORE_M = 30, TURN_ARROW_AFTER_M = 20, MAX_TURN_ARROWS = 20;
/** Roads drawn this much wider than the map style, so they read at a glance (as the app's ROAD_WIDTH). */
const ROAD_WIDTH = 2;
// Kinds of stop offered as tiles while driving and as Nearby in the search list, as the app's Places.stopShortcuts.
// Each with its OpenStreetMap tags, as the app's Places categories (and a name check where the tag is too broad).
const STOP_KINDS = [["petrol", "Petrol station", "fuel", ["amenity:fuel"]],
  ["food", "Food", "food", ["amenity:restaurant", "amenity:fast_food", "amenity:food_court"]], ["toilet", "Toilet", "toilet", ["amenity:toilets"]],
  ["rest area", "Rest area", "rest-area", ["highway:rest_area", "highway:services"]], ["convenience store", "Convenience store", "store", ["shop:convenience"]],
  ["mosque", "Mosque", "mosque", ["amenity:place_of_worship"], /masjid|surau|mosque|musolla|musalla/i]];
/** How far around a kind of place is looked for, as the app's NEARBY_SEARCH_KM. */
const NEARBY_KM = 10;
const NEUTRAL_TILE = "#80868B";
/** TomTom search is asked only when the free search finds fewer places than this (as the app). */
const TOMTOM_SEARCH_BELOW = 3;
/** Mana's daily share of TomTom's free traffic is used up (the server answers 429) until midnight. */
let trafficPaused = false;
const TRAFFIC_PAUSED = "Live traffic paused until tomorrow";

// Kinds of place drivers can add, as the Android DriverPlaces (and supabase/places.sql).
const PLACE_KINDS = [
  ["food", "Food"], ["cafe", "Cafe"], ["shop", "Shop"], ["convenience", "Convenience store"],
  ["petrol", "Petrol station"], ["workshop", "Car workshop"], ["clinic", "Clinic"], ["pharmacy", "Pharmacy"],
  ["mosque", "Mosque or surau"], ["parking", "Parking"], ["toilet", "Toilet"], ["other", "Something else"],
].map(([key, label]) => ({ key, label }));

const REPORT_TYPES = [
  { key: "police", label: "Police", color: "#2457E6", glyph: "local_police", short: "Police", subtypes: [
    ["visible", "Police", "Police", "local_police"], ["hidden", "Hidden police", "Hidden", "visibility_off"], ["mobile_camera", "Mobile speed camera", "Camera", "photo_camera"]] },
  { key: "accident", label: "Accident", color: "#CE1126", glyph: "car_crash", short: "Crash", subtypes: [
    ["minor", "Minor accident", "Minor", "minor_crash"], ["major", "Serious accident", "Serious", "emergency"]] },
  { key: "traffic", label: "Traffic jam", color: "#9334E6", glyph: "traffic_jam", short: "Traffic", subtypes: [
    ["slow", "Slow traffic", "Slow", "speed"], ["heavy", "Heavy traffic", "Heavy", "traffic_jam"], ["standstill", "Traffic at a standstill", "Stopped", "traffic_jam"]] },
  { key: "hazard", label: "Hazard", color: "#F29900", glyph: "warning", short: "Hazard", subtypes: [
    ["pothole", "Pothole", "Pothole", "tire_repair"], ["object", "Object on the road", "Object", "inventory_2"], ["stopped_vehicle", "Stopped vehicle", "Car", "car_repair"],
    ["animal", "Animal on the road", "Animal", "pets"], ["signal_out", "Traffic lights out", "Lights", "traffic"], ["roadworks", "Roadworks", "Roadworks", "construction"],
    ["flood", "Flooding", "Flood", "flood"], ["slippery", "Slippery road", "Slippery", "water_drop"], ["low_visibility", "Poor visibility", "Fog", "foggy"]] },
  { key: "closure", label: "Road closed", color: "#5F6368", glyph: "block", short: "Closed", subtypes: [] },
].map((t) => ({ ...t, subtypes: t.subtypes.map(([key, title, short, glyph]) => ({ key, title, short, glyph })) }));

const $ = (id) => document.getElementById(id);
/** An icon from the sprite in index.html, as markup. */
const icon = (name) => `<svg class="ico" aria-hidden="true"><use href="#i-${name}"/></svg>`;
function readSavedPlace(slot) {
  try {
    const p = JSON.parse(localStorage.getItem(`mana.${slot}`));
    return p && typeof p.name === "string" && typeof p.detail === "string" && Array.isArray(p.at) &&
      p.at.length === 2 && Number.isFinite(p.at[0]) && Number.isFinite(p.at[1]) &&
      Math.abs(p.at[0]) <= 180 && Math.abs(p.at[1]) <= 90 ? p : null;
  } catch { return null; }
}
const state = {
  here: null, heading: null, speed: 0, speedKmh: null, accuracy: 50,
  home: readSavedPlace("home"), work: readSavedPlace("work"), savingSlot: null,
  destination: null, routes: [], selected: 0,
  stops: [], origin: null, picking: null, // stops in visiting order; a start other than here (planning only); "stop" | "origin" while searching for one
  nav: null, following: true, wakeLock: null,
  reports: [], incidents: [], incidentsAt: 0, incidentsArea: null,
  traffic: localStorage.getItem("traffic") === "1",
  lastSearch: 0,
  addingPlace: false, // the next tap on the map picks where a missing place is
  reportingFeature: false, // the next tap on the map is where a road feature is (Menu → Report a road feature)
  features: [], featuresWarned: new Set(), featuresAsked: new Set(), featuresClosest: {},
};

// Permanent road features drivers report (docs/road-reports/PLAN.md, phase 1), as the app's RoadFeatureType.
const ROAD_FEATURES = [
  { key: "speed_camera", label: "Camera", glyph: "speed_camera", color: "#5F3DC4", limit: true, warn: 600, spoken: "Speed camera ahead", ask: "Speed camera here?" },
  { key: "speed_bump", label: "Bump", glyph: "speed_bump", color: "#E37400", limit: false, warn: 150, spoken: "Speed bump ahead", ask: "Speed bump here?" },
  { key: "u_turn", label: "U-turn", glyph: "u_turn", color: "#2457E6", limit: false, warn: 0, spoken: "", ask: "U-turn here?" },
  { key: "speed_limit", label: "Limit", glyph: "speed_limit", color: "#CE1126", limit: true, warn: 0, spoken: "", ask: "Speed limit sign here?" },
];
const SPEED_LIMITS = [30, 40, 50, 60, 70, 80, 90, 100, 110];
/** A feature further than this from the route is on another road (as the app's FEATURE_ON_ROUTE_METERS). */
const FEATURE_ON_ROUTE_METERS = 35;
/** A random id made once per browser, so one browser counts as one driver (as the app's install id). */
function deviceId() {
  try {
    let id = localStorage.getItem("mana.device");
    if (!id) { id = crypto.randomUUID(); localStorage.setItem("mana.device", id); }
    return id;
  } catch { return crypto.randomUUID(); }
}

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
/** The part of [line] between where [from] and then [to] land on it (the end is looked for after the start). */
function along(line, from, to) {
  const a = snap(from, line);
  const b = a && snap(to, line.slice(a.segment));
  if (!b) return [];
  return [a.point, ...line.slice(a.segment + 1, a.segment + b.segment + 1), b.point];
}
const angleBetween = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

// --- Formatting ---

function formatDuration(seconds) {
  const mins = Math.max(1, Math.round(seconds / 60));
  return mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`;
}
const clock = (seconds) => new Date(Date.now() + seconds * 1000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
function shortDistance(m) { return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`; }
/** "7.7 km · No tolls · traffic +9 min", each number kept on the same line as its unit (as the app's joinWhole). */
const joinWhole = (parts) => parts.filter(Boolean).map((p) => p.replace(/(\d) /g, "$1\u00A0")).join("  ·  ");
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
let shownResults = [], shownResultsNear = null, searchReturn = null;
const empty = { type: "FeatureCollection", features: [] };
const fc = (features) => ({ type: "FeatureCollection", features });
const lineFeature = (coords, props = {}) => ({ type: "Feature", geometry: { type: "LineString", coordinates: coords }, properties: props });
const pointFeature = (p, props = {}) => ({ type: "Feature", geometry: { type: "Point", coordinates: p }, properties: props });

map.on("load", () => {
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim(); // Named colours in style.css.
  // 3D buildings hide the route line once the camera tilts for driving.
  for (const l of map.getStyle().layers) if (l.type === "fill-extrusion") map.setLayoutProperty(l.id, "visibility", "none");
  // Roads wider than the style draws them (railways and footpaths stay as they are).
  for (const l of map.getStyle().layers) {
    if (l.type !== "line" || l["source-layer"] !== "transportation" || UNROADS.some((w) => l.id.includes(w))) continue;
    map.setPaintProperty(l.id, "line-width", scaleWidth(map.getPaintProperty(l.id, "line-width") ?? 1, ROAD_WIDTH));
  }
  for (const s of ["alts", "route", "driven", "slow", "dest", "stops", "me", "search-results"]) map.addSource(s, { type: "geojson", data: empty });
  // Reports and incidents close together show as one numbered bubble until zoomed in to street level.
  for (const s of ["reports", "incidents"]) map.addSource(s, { type: "geojson", data: empty, cluster: true, clusterMaxZoom: CLUSTER_MAX_ZOOM, clusterRadius: 40 });
  map.addLayer({ id: "alts", type: "line", source: "alts", paint: { "line-color": css("--mana-route-alt"), "line-width": 7, "line-opacity": 0.8 }, layout: { "line-cap": "round", "line-join": "round" } });
  map.addLayer({ id: "driven", type: "line", source: "driven", paint: { "line-color": css("--mana-route-driven"), "line-width": 7 }, layout: { "line-cap": "round", "line-join": "round" } });
  map.addLayer({ id: "route-casing", type: "line", source: "route", paint: { "line-color": css("--mana-route-casing"), "line-width": 13 }, layout: { "line-cap": "round", "line-join": "round" } });
  map.addLayer({ id: "route", type: "line", source: "route", paint: { "line-color": css("--mana-route"), "line-width": 8 }, layout: { "line-cap": "round", "line-join": "round" } });
  map.addLayer({ id: "slow", type: "line", source: "slow", paint: { "line-color": ["get", "color"], "line-width": 6 }, layout: { "line-cap": "round", "line-join": "round" } });
  // The destination: a pin standing on the spot, and the ring it sends out when it drops (hidden at rest).
  map.addLayer({ id: "stops", type: "circle", source: "stops", paint: { "circle-color": "#fff", "circle-radius": 11, "circle-stroke-color": css("--mana-via"), "circle-stroke-width": 3 } });
  map.addLayer({ id: "stop-numbers", type: "symbol", source: "stops",
    layout: { "text-field": ["get", "n"], "text-font": ["Noto Sans Bold"], "text-size": 13, "text-allow-overlap": true, "text-ignore-placement": true },
    paint: { "text-color": css("--mana-via") } });
  map.addLayer({ id: "dest-ring", type: "circle", source: "dest", paint: { "circle-color": css("--mana-destination"), "circle-radius": 0, "circle-opacity": 0, "circle-pitch-alignment": "map" } });
  map.addImage("dest-pin", destPinImage(), { pixelRatio: 2 });
  map.addLayer({ id: "dest", type: "symbol", source: "dest",
    layout: { "icon-image": "dest-pin", "icon-anchor": "bottom", "icon-allow-overlap": true, "icon-ignore-placement": true } });
  for (const [s, minzoom] of [["incidents", INCIDENTS_MIN_ZOOM], ["reports", 0]]) {
    // A small plain grey dot, no number, so it never looks like a numbered search result.
    map.addLayer({ id: `${s}-clusters`, type: "circle", source: s, minzoom, filter: ["has", "point_count"],
      paint: { "circle-color": css("--mana-cluster"), "circle-opacity": 0.75, "circle-radius": 7, "circle-stroke-color": "#fff", "circle-stroke-width": 1.5 } });
    map.on("click", `${s}-clusters`, (e) => map.easeTo({ center: e.lngLat, zoom: Math.max(map.getZoom() + 2, CLUSTER_MAX_ZOOM + 1) }));
  }
  map.addLayer({ id: "incidents", type: "symbol", source: "incidents", minzoom: INCIDENTS_MIN_ZOOM, filter: ["!", ["has", "point_count"]],
    layout: { "icon-image": ["get", "icon"], "icon-size": 0.8, "icon-allow-overlap": true, "icon-ignore-placement": true } });
  map.addSource("features", { type: "geojson", data: empty });
  map.addLayer({ id: "features", type: "symbol", source: "features", minzoom: 12,
    layout: { "icon-image": ["get", "icon"], "icon-size": 0.8, "icon-allow-overlap": true, "icon-ignore-placement": true } });
  map.addLayer({ id: "reports", type: "symbol", source: "reports", filter: ["!", ["has", "point_count"]],
    layout: { "icon-image": ["get", "icon"], "icon-allow-overlap": true, "icon-ignore-placement": true }, paint: { "icon-opacity": ["get", "opacity"] } });
  // While driving: one white arrow at the next turn (see drawTurnArrow).
  map.addSource("turn", { type: "geojson", data: empty });
  map.addLayer({ id: "turn-line", type: "line", source: "turn", filter: ["==", ["geometry-type"], "LineString"],
    paint: { "line-color": "#fff", "line-width": 5 }, layout: { "line-cap": "round", "line-join": "round" } });
  map.addImage("turn-head", turnHeadImage(), { pixelRatio: 2 });
  map.addLayer({ id: "turn-head", type: "symbol", source: "turn", filter: ["==", ["geometry-type"], "Point"],
    layout: { "icon-image": "turn-head", "icon-rotate": ["get", "bearing"], "icon-rotation-alignment": "map", "icon-pitch-alignment": "map",
      "icon-allow-overlap": true, "icon-ignore-placement": true } });
  map.addImage("mana-car", carImage(), { pixelRatio: 2 });
  map.addLayer({ id: "me", type: "symbol", source: "me", layout: {
    "icon-image": "mana-car", "icon-size": 0.9, "icon-rotate": ["get", "heading"],
    "icon-rotation-alignment": "map", "icon-allow-overlap": true, "icon-ignore-placement": true,
  } });
  map.addLayer({ id: "search-result-pins", type: "circle", source: "search-results", paint: { "circle-color": css("--mana-accent"), "circle-radius": 17, "circle-stroke-color": "#fff", "circle-stroke-width": 3 } });
  map.addLayer({ id: "search-result-numbers", type: "symbol", source: "search-results",
    layout: { "text-field": ["get", "n"], "text-font": ["Noto Sans Bold"], "text-size": 14, "text-allow-overlap": true, "text-ignore-placement": true },
    paint: { "text-color": "#fff" } });
  setSearchCandidates(shownResults);
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
map.on("click", "features", (e) => {
  const f = state.features.find((x) => x.id === e.features[0].properties.id);
  if (f) reportChange(f);
});
map.on("click", "incidents", (e) => {
  const inc = state.incidents[e.features[0].properties.i];
  if (inc) toast(`${inc.text || inc.spoken}${inc.delay >= 60 ? ` · +${formatDuration(inc.delay)}` : ""}`);
});
map.on("click", "search-result-pins", (e) => {
  const place = shownResults[Number(e.features[0].properties.i)];
  if (place) choose(place);
});
map.on("mouseenter", "search-result-pins", () => { map.getCanvas().style.cursor = "pointer"; });
map.on("mouseleave", "search-result-pins", () => { map.getCanvas().style.cursor = ""; });

/** The destination pin (as the app's ic_dest_pin): red, white rim and centre, 40px. */
function destPinImage() {
  const size = 80, g = Object.assign(document.createElement("canvas"), { width: size, height: size }).getContext("2d");
  g.scale(size / 24, size / 24);
  const pin = new Path2D("M12,1.9C8.07,1.9 4.9,5.07 4.9,9c0,5.3 7.1,13.1 7.1,13.1s7.1,-7.8 7.1,-13.1c0,-3.93 -3.17,-7.1 -7.1,-7.1z");
  g.fillStyle = "#CE1126"; g.fill(pin); // --mana-destination
  g.strokeStyle = "#FFFFFF"; g.lineWidth = 1.4; g.lineJoin = "round"; g.stroke(pin);
  g.fillStyle = "#FFFFFF"; g.beginPath(); g.arc(12, 9, 2.7, 0, 2 * Math.PI); g.fill();
  return g.getImageData(0, 0, size, size);
}

/** The head of the turn arrow (the app's ic_turn_arrowhead): white with a navy edge, pointing up. */
function turnHeadImage() {
  const size = 52, g = Object.assign(document.createElement("canvas"), { width: size, height: size }).getContext("2d");
  g.scale(size / 24, size / 24);
  const head = new Path2D("M12,2 L21,20 L12,15.5 L3,20 Z");
  g.fillStyle = "#FFFFFF"; g.fill(head);
  g.strokeStyle = "#12358F"; g.lineWidth = 1.5; g.lineJoin = "round"; g.stroke(head);
  return g.getImageData(0, 0, size, size);
}

/**
 * The stretch of [line] from [before] metres ahead of the turn at [at] to [after] metres past it, as the
 * app's turnArrowLine: the one arrow on the route while driving.
 */
function turnArrowLine(line, at, before, after) {
  if (!line.length) return [];
  let i = 0;
  line.forEach((p, k) => { if (distance(p, at) < distance(line[i], at)) i = k; });
  const walk = (step, meters) => {
    const out = [];
    let left = meters, k = i;
    while (line[k + step]) {
      const a = line[k], b = line[k + step], d = distance(a, b);
      if (d >= left) { const f = left / d; out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]); break; }
      out.push(b); left -= d; k += step;
    }
    return out;
  };
  return [...walk(-1, before).reverse(), line[i], ...walk(1, after)];
}

/**
 * A white arrow at every turn still ahead, from [step] (the next one) on, so coming turns show well
 * before reaching them; none for going straight on or arriving. No step clears them.
 */
function drawTurnArrow(step) {
  const r = state.nav?.route;
  const from = r && step ? r.steps.indexOf(step) : -1;
  const isTurn = (s) => !["depart", "arrive"].includes(s.type) && s.modifier !== "straight";
  const ahead = from < 0 ? [] : r.steps.slice(from).filter(isTurn).slice(0, MAX_TURN_ARROWS);
  const lines = ahead.map((s) => turnArrowLine(r.points, s.at, TURN_ARROW_BEFORE_M, TURN_ARROW_AFTER_M)).filter((l) => l.length >= 2);
  map.getSource("turn")?.setData(fc(lines.flatMap((l) => [lineFeature(l), pointFeature(l.at(-1), { bearing: bearing(l.at(-2), l.at(-1)) })])));
}

/**
 * A style width [factor] times wider (as the app's scaleWidth): a zoom curve's outputs are scaled, as are
 * the older {stops} functions; anything else is multiplied whole.
 */
function scaleWidth(w, factor) {
  const scale = (v) => (typeof v === "number" ? v * factor : ["*", factor, v]);
  if (typeof w === "number") return w * factor;
  if (w && Array.isArray(w.stops)) return { ...w, stops: w.stops.map(([z, v]) => [z, scale(v)]) };
  if (Array.isArray(w) && w[0] === "interpolate") return w.map((v, i) => (i >= 4 && i % 2 === 0 ? scale(v) : v));
  if (Array.isArray(w) && w[0] === "step") return w.map((v, i) => (i >= 2 && i % 2 === 0 ? scale(v) : v));
  return w == null ? w : ["*", factor, w];
}

/** While driving the map shows only what matters on the road: shop, park and other place icons go. */
function showPlaceIcons(on) {
  for (const l of map.getStyle()?.layers ?? []) if (l["source-layer"] === "poi") map.setLayoutProperty(l.id, "visibility", on ? "visible" : "none");
}

/** The vehicle chosen in Menu → Your vehicle (saved in this browser); the saloon unless changed. */
const vehicle = () => { try { return window.VEHICLES?.[localStorage.getItem("mana.vehicle")] ? localStorage.getItem("mana.vehicle") : "saloon"; } catch { return "saloon"; } };
const vehicleLabel = (kind) => window.VEHICLES?.[kind]?.label ?? "Saloon";

/** Car colours (Menu → Car colour): the vehicle's own paint, or one of these over it (as Android's CarColour). */
const CAR_COLOURS = { original: ["Original", null, 1], blue: ["Mana blue", "#2F6FED", 1], red: ["Ruby red", "#C62828", 1],
  white: ["Pearl white", "#F8FAFC", 1], silver: ["Silver", "#B8C2CC", 1], forest: ["Forest green", "#15803D", 2],
  cyan: ["Cyber cyan", "#06B6D4", 3], obsidian: ["Midnight obsidian", "#1E293B", 4], gold: ["Diraja gold", "#CA8A04", 5] };
const carColour = () => { try { return CAR_COLOURS[localStorage.getItem("mana.carColour")] ? localStorage.getItem("mana.carColour") : "original"; } catch { return "original"; } };
/** Each vehicle's paint: the body colour first, then the shades that go with it. Glass, tyres and lights keep theirs; the Mana arrow is a mark, not a car. */
const PAINT = { saloon: ["#C62828", "#B71C1C", "#A31515"], hatchback: ["#2457E6", "#1D4ED8", "#1E40AF"], suv: ["#F8FAFC", "#002B7F"],
  mpv: ["#CBD5E1", "#64748B"], pickup: ["#15803D", "#166534"], coupe: ["#F59E0B", "#D97706"] };
const hsl = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l];
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, d / (1 - Math.abs(2 * l - 1)), l];
};
const hex = ([h, s, l]) => {
  const f = (n) => { const k = (n + h / 30) % 12; return Math.round(255 * (l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
  return "#" + [0, 8, 4].map((n) => f(n).toString(16).padStart(2, "0")).join("").toUpperCase();
};
/**
 * The vehicle's colours with [to] painted over its paint: the body becomes [to], and each shade keeps how much
 * darker (or lighter) it was than the body. Pale paint gets a grey outline, so a white car still shows on a light map.
 */
function repaint(kind, to) {
  const paint = PAINT[kind];
  if (!to || !paint) return (c) => c;
  const base = hsl(paint[0])[2], [h, s, l] = hsl(to);
  const shade = (c) => {
    const lc = hsl(c)[2];
    return hex([h, s, lc <= base ? l * lc / base : l + (1 - l) * (lc - base) / (1 - base)]);
  };
  const map = new Map(paint.map((c) => [c, shade(c)]));
  return (c, onPaint) => map.get(c) ?? (onPaint && c === "#FFFFFF" && l > 0.8 ? "#64748B" : c);
}

/** The chosen vehicle seen from above, facing north before GPS heading rotation (as Android's ic_nav_car*). */
function carImage(kind = vehicle()) {
  const g = carCanvas(kind).getContext("2d");
  return g.getImageData(0, 0, 96, 96);
}
function carCanvas(kind, colour = carColour()) {
  const size = 96, canvas = Object.assign(document.createElement("canvas"), { width: size, height: size }), g = canvas.getContext("2d");
  g.scale(2, 2);
  const paint = repaint(kind, CAR_COLOURS[colour]?.[1]);
  const draw = (d, fill, stroke = null, width = 1) => {
    const p = new Path2D(d), painted = fill && paint(fill) !== fill;
    if (fill) { g.fillStyle = paint(fill); g.fill(p); }
    if (stroke) { g.strokeStyle = paint(stroke, painted); g.lineWidth = width; g.lineJoin = "round"; g.stroke(p); }
  };
  const other = window.VEHICLES?.[kind];
  if (other) { for (const p of other.paths) draw(p.d, p.fill, p.stroke, p.width); return canvas; }
  draw("M15.5 16.6 13.4 17.4V19.2h2.1z M32.5 16.6 34.6 17.4V19.2h-2.1z", "#B71C1C", "#fff", .6);
  draw("M17.3 3.6h13.4q1.8 0 1.8 1.8v37.2q0 1.8-1.8 1.8H17.3q-1.8 0-1.8-1.8V5.4q0-1.8 1.8-1.8z", "#C62828", "#fff", 1.4);
  draw("M16.2 2.4h15.6v1.9H16.2z M16.2 43.7h15.6v1.9H16.2z", "#CFD3D8");
  draw("M16.6 4.9h4v2.5h-4z M27.4 4.9h4v2.5h-4z", "#FFF59D");
  draw("M21.4 5.1h5.2V7h-5.2z", "#3C4043");
  draw("M21 8.5v7 M27 8.5v7", null, "#A31515", .5);
  draw("M17.4 16.6h13.2l-1.3 5H18.7z M18.7 21.6h10.6v11.6H18.7z M18.7 33.2h10.6l1.1 4H17.6z", "#1F2A36");
  draw("M16.5 22l1.6.3v10.2l-1.6.3z M31.5 22l-1.6.3v10.2l1.6.3z", "#1F2A36");
  draw("M16.4 41.4h3.8v1.8h-3.8z M27.8 41.4h3.8v1.8h-3.8z", "#FF8A65");
  return canvas;
}

/** The current vehicle in each car colour (the palette in Your vehicle); the one in use is marked. Back to the vehicles after. */
function chooseCarColour() {
  const now = carColour();
  const level = cachedLevel()?.level ?? 1, points = cachedLevel()?.points ?? 0;
  showSheet("Car colour", ...Object.entries(CAR_COLOURS).map(([key, [label, , unlockLevel]]) => {
    const b = document.createElement("button");
    const locked = unlockLevel > level;
    const lockText = locked ? `Level ${unlockLevel} · ${LEVELS[unlockLevel - 1][0] - points} more points` : "";
    b.className = `menuRow${locked ? " lockedColour" : ""}`;
    b.setAttribute("aria-label", locked ? `${label}, Locked, ${lockText.replace(" · ", ", ")}` : key === now ? `${label}, In use` : label);
    b.innerHTML = `<img class="vehicle" alt=""><span class="label"></span><span class="value"></span>`;
    b.querySelector("img").src = carCanvas(vehicle(), key).toDataURL();
    b.querySelector(".label").textContent = label;
    b.querySelector(".value").textContent = lockText || (key === now ? "In use" : "");
    if (locked) b.querySelector(".value").insertAdjacentHTML("afterbegin", '<svg class="colourLock" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18 8h-1V6a5 5 0 0 0-10 0v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2ZM9 6a3 3 0 0 1 6 0v2H9Z"/></svg>');
    b.onclick = () => {
      if (locked) return toast(lockText);
      try { localStorage.setItem("mana.carColour", key); } catch { return toast("Couldn't save it in your browser"); }
      if (map.hasImage("mana-car")) map.updateImage("mana-car", carImage());
      chooseVehicle();
    };
    return b;
  }));
}

/** The vehicles to drive as, each in its own colours; the one in use is marked. Back to the Menu after. */
function chooseVehicle() {
  const now = vehicle();
  showSheet("Your vehicle", ...["saloon", ...Object.keys(window.VEHICLES ?? {})].map((kind) => {
    const b = document.createElement("button");
    b.className = "menuRow";
    b.innerHTML = `<img class="vehicle" alt=""><span class="label"></span><span class="value"></span>`;
    b.querySelector("img").src = carCanvas(kind).toDataURL();
    b.querySelector(".label").textContent = vehicleLabel(kind);
    b.querySelector(".value").textContent = kind === now ? "In use" : "";
    b.onclick = () => {
      try { localStorage.setItem("mana.vehicle", kind); } catch { return toast("Couldn't save it in your browser"); }
      if (map.hasImage("mana-car")) map.updateImage("mana-car", carImage(kind));
      showMenu();
    };
    return b;
  }));
  // A small palette next to the title opens the car colours (not for the Mana arrow, which keeps its own).
  if (PAINT[now]) $("sheetTitle").append(Object.assign(document.createElement("button"), {
    className: "titleAction", innerHTML: icon("palette"), title: "Car colour", ariaLabel: "Car colour", onclick: chooseCarColour }));
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
  document.querySelector('meta[name="theme-color"]').content = on ? "#1E2227" : "#002B7F";
  // The day navy-family route blue is too dark on the night map.
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (map.getLayer("route")) {
    map.setPaintProperty("route", "line-color", css(on ? "--mana-route-night" : "--mana-route"));
    map.setPaintProperty("route-casing", "line-color", css(on ? "--mana-route-casing-night" : "--mana-route-casing"));
  }
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
    state.speedKmh = c.speed == null || !Number.isFinite(c.speed) ? null : Math.round(c.speed * 3.6);
    if (c.heading != null && !Number.isNaN(c.heading) && state.speed > 2) state.heading = c.heading;
    if (first) {
      first = false;
      if (state.following) map.jumpTo({ center: state.here, zoom: 15 });
    }
    onLocation();
  }, (e) => toast(e.code === 1 ? "Allow location to see where you are and navigate" : "Can't find your location"),
  { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
}

function onLocation() {
  const nav = state.nav;
  let shown = state.here;
  if (nav && state.stops.length && distance(state.here, state.stops[0].at) < STOP_REACHED_METERS) {
    say(`Arriving at ${shown(state.stops.shift())}`);
    drawRoutes();
  }
  if (nav) {
    const u = navUpdate(nav, state.here);
    if (u.snapped) shown = u.snapped;
    showNav(u);
    checkFeatures(state.here);
  }
  moveCar(shown, state.heading ?? 0);
  updateTheme();
  if (state.following) {
    // Driving: closer in town, further out on highways, with the car low so more of the road ahead shows.
    const want = speedZoom(state.speed * 3.6);
    const zoom = !nav ? map.getZoom() : Math.abs(want - map.getZoom()) >= SPEED_ZOOM_STEP ? want : map.getZoom();
    map.easeTo({ center: shown, bearing: nav && state.heading != null ? state.heading : map.getBearing(), pitch: nav ? 50 : 0,
      zoom, padding: { top: nav ? innerHeight * (2 * CAR_Y - 1) : 0, bottom: 0, left: 0, right: 0 },
      duration: CAR_GLIDE_MS, easing: (t) => t }); // linear, as the car's glide, so the car stays put on screen
  }
}

/**
 * The car glides from where it is to each new fix, in step with the camera, instead of jumping once a
 * second (phones give about one fix a second). Big jumps and reduced motion move it at once.
 */
const CAR_GLIDE_MS = 1000;
let car = null, carFrame = 0;
function carAt(now) {
  const t = Math.min(1, (now - car.start) / CAR_GLIDE_MS);
  const turn = ((car.toHeading - car.fromHeading + 540) % 360) - 180; // the short way round
  return { at: car.from.map((v, i) => v + (car.to[i] - v) * t), heading: (car.fromHeading + turn * t + 360) % 360 };
}
function moveCar(at, heading) {
  const now = performance.now();
  const from = car && !reducedMotion() ? carAt(now) : null;
  const glide = from && distance(from.at, at) < 200;
  car = { from: glide ? from.at : at, to: at, fromHeading: glide ? from.heading : heading, toHeading: heading, start: now };
  if (!carFrame) drawCar();
}
function drawCar() {
  const now = performance.now(), { at, heading } = carAt(now);
  map.getSource("me")?.setData(fc([pointFeature(at, { heading })]));
  carFrame = now - car.start < CAR_GLIDE_MS ? requestAnimationFrame(drawCar) : 0;
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
  if (searchReturn && q !== searchReturn.query) {
    searchReturn = null;
    history.replaceState(null, "", location.href);
  }
  // Clear stays while the list is open, even with nothing typed, so one tap closes it.
  showClear(!!q || !!state.destination || document.activeElement === $("search"));
  clearTimeout(searchTimer);
  if (q.length < 3) return q ? showResults([]) : state.picking ? startPicking(state.picking) : state.savingSlot ? showMapPickRow() : showSaved();
  searchTimer = setTimeout(() => search(q, false), 350);
});
$("search").addEventListener("focus", () => { if (!$("search").value && !state.picking && !state.savingSlot) { showSaved(); showClear(true); } });
$("search").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  submitSearch();
});
$("submitSearch").onclick = submitSearch;
function submitSearch() {
  clearTimeout(searchTimer);
  const q = $("search").value.trim();
  if (q) { $("search").blur(); search(q, true); }
}
/** The search bar's right-hand slot: Clear while searching or showing a place, the Menu otherwise. */
function showClear(on) {
  $("clear").hidden = !on;
  $("menuButton").hidden = on;
  $("levelButton").hidden = on || !SUPABASE_URL;
}
$("menuButton").onclick = () => showMenu();
$("clear").onclick = () => {
  if (state.picking) return stopPicking();
  if (state.savingSlot) { state.savingSlot = null; $("search").placeholder = SEARCH_HINT; }
  $("search").value = "";
  showClear(false);
  showResults([]);
  $("search").blur();
  if (!state.nav) clearRoute();
};

/** Photon while typing; on Enter, TomTom's places (houses, shops the free data lacks) are added. */
async function search(q, pressed) {
  const run = ++searchRun;
  if (pressed) state.following = false;
  const near = state.here ?? map.getCenter().toArray();
  // Typed or pasted coordinates ("3.43999, 101.69213"): that exact spot, as in the app.
  const at = coordsIn(q);
  if (at) {
    const spot = { name: `📍 ${at[1].toFixed(5)}, ${at[0].toFixed(5)}`, detail: "", at };
    return pressed ? choose(spot) : showResults([spot], near); // Enter goes straight there.
  }
  const kind = STOP_KINDS.find(([word]) => word === q.trim().toLowerCase());
  const places = await withProgress(async () => {
    if (kind) return photonNearby(kind, near).catch(() => []);
    const drivers = driverPlaces(q, near);
    const free = await photon(q, near).catch(() => []);
    // TomTom only when the free search finds little: its free share is ~75 searches a day for everyone.
    const tomtom = pressed && free.length < TOMTOM_SEARCH_BELOW ? await trafficCall(`?q=${encodeURIComponent(q)}&lat=${near[1]}&lon=${near[0]}`)
      .then((o) => o.places.map((p) => ({ name: p.name || p.detail, detail: p.detail, at: [p.lon, p.lat] }))).catch(() => []) : [];
    const all = [...free, ...tomtom];
    // Driver-added places aren't merged away: they're there because the map lacks them.
    return [...all.filter((p, i) => all.findIndex((o) => distance(o.at, p.at) < SAME_PLACE_METERS) === i), ...(await drivers)];
  });
  if (run !== searchRun) return; // A newer search has taken over.
  // Names with every word typed come first, then nearest first; list numbers and map pins follow this order.
  const words = q.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1);
  const full = (p) => !kind && words.length > 0 && words.every((w) => p.name.toLowerCase().includes(w));
  const searchable = [...places].sort((a, b) => full(b) - full(a) || distance(near, a.at) - distance(near, b.at));
  if (pressed && !searchable.length) toast(kind ? `No ${kind[1].toLowerCase()} found nearby` : "No places found");
  let routable = searchable;
  // Only on a pressed search: while typing this would ask the free routing server on every key.
  if (pressed && !state.picking && searchable.length) {
    try {
      const candidates = searchable.slice(0, 25);
      const coords = [near, ...candidates.map((p) => p.at)];
      const table = await fetch(`${OSRM_TABLE}${coords.map((p) => p.join(",")).join(";")}?sources=0&destinations=${candidates.map((_, i) => i + 1).join(";")}`)
        .then((r) => r.json());
      if (run !== searchRun) return;
      if (table.code === "Ok") routable = candidates.filter((_, i) => table.durations?.[0]?.[i] != null);
    } catch { /* Search remains usable when the routing service is unavailable. */ }
  }
  const visible = routable.slice(0, 10);
  if (pressed && searchable.length && !visible.length) toast("No driving route found to these places");
  showResults(visible, near, pressed);
}

/** Places drivers added that the map doesn't have, whose name contains [q], within DRIVER_PLACES_KM. */
async function driverPlaces(q, near) {
  const name = q.replace(/[*%,()\\]/g, " ").trim();
  if (name.length < 2) return [];
  const dLat = DRIVER_PLACES_KM / 111, dLng = DRIVER_PLACES_KM / (111 * Math.max(0.1, Math.cos(rad(near[1]))));
  const box = `lat=gte.${near[1] - dLat}&lat=lte.${near[1] + dLat}&lng=gte.${near[0] - dLng}&lng=lte.${near[0] + dLng}`;
  const rows = await supabase("GET", `live_driver_places?select=id,name,kind,lat,lng&name=ilike.${encodeURIComponent(`*${name}*`)}&${box}&limit=20`).catch(() => []);
  return rows.map((r) => ({ name: r.name, detail: `${PLACE_KINDS.find((k) => k.key === r.kind)?.label ?? "Place"} · added by drivers`, at: [r.lng, r.lat], driverId: r.id }));
}

/** [lng, lat] from text like "3.4399898, 101.6921296" (the app's SharedLocation pattern), or null. */
function coordsIn(text) {
  const m = /(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/.exec(text);
  if (!m) return null;
  const lat = Number(m[1]), lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat || lng) ? [lng, lat] : null;
}

async function photon(q, near) {
  return photonPlaces(await fetch(`${PHOTON}?q=${encodeURIComponent(q)}&limit=15&lat=${near[1]}&lon=${near[0]}`));
}

/** Places of one of the STOP_KINDS around [near], by their map tags rather than their names (as the app's Places.near). */
async function photonNearby([, , , tags, nameHint], near) {
  const filter = tags.map((t) => `&osm_tag=${encodeURIComponent(t)}`).join("");
  const places = await photonPlaces(await fetch(`${PHOTON_REVERSE}?lat=${near[1]}&lon=${near[0]}&radius=${NEARBY_KM}&limit=10${filter}`));
  return places.filter((p) => !nameHint || nameHint.test(p.name));
}

async function photonPlaces(res) {
  const json = await res.json();
  return json.features.map((f) => {
    const p = f.properties;
    const name = p.name || [p.housenumber, p.street].filter(Boolean).join(" ");
    const detail = [...new Set(["street", "city", "state", "country"].map((k) => p[k]).filter((v) => v && v !== name))].join(", ");
    return { name: name || detail, detail, at: f.geometry.coordinates };
  });
}

function showResults(places, near, fit = false) {
  shownResults = fit ? places : [];
  shownResultsNear = fit ? near : null;
  setSearchCandidates(shownResults);
  const outsideView = fit && places.length && !places.some((p) => map.getBounds().contains(p.at));
  if (places.length && (fit || outsideView)) {
    if (places.length > 1 && places.slice(1).some((p) => distance(places[0].at, p.at) > 100)) {
      const bounds = new maplibregl.LngLatBounds();
      places.forEach((p) => bounds.extend(p.at));
      map.fitBounds(bounds, { padding: { top: innerHeight * 0.45, bottom: innerHeight * 0.25, left: 48, right: 96 }, maxZoom: 16, duration: 500 });
    } else {
      const [lng, lat] = places[0].at;
      const bounds = new maplibregl.LngLatBounds([lng - 0.003, lat - 0.003], [lng + 0.003, lat + 0.003]);
      map.fitBounds(bounds, { padding: { top: innerHeight * 0.45, bottom: innerHeight * 0.25, left: 48, right: 96 }, maxZoom: 16, duration: 500 });
    }
  }
  const list = $("results");
  list.classList.toggle("submitted", fit);
  list.replaceChildren(...places.map((p, i) => {
    const row = document.createElement("button");
    row.className = "row";
    row.innerHTML = `<span class="pin">${icon("pin")}</span><span class="what"><div class="name"></div><div class="detail"></div></span><span class="far"></span>`;
    if (fit) {
      row.querySelector(".pin").classList.add("candidate-number");
      row.querySelector(".pin").textContent = String(i + 1);
    }
    row.querySelector(".name").textContent = shown(p);
    row.querySelector(".detail").textContent = shortAddress(p.detail);
    row.querySelector(".far").textContent = near ? shortDistance(distance(near, p.at)) : "";
    row.onclick = () => choose(p);
    return row;
  }));
  // With the map in view below: as many whole rows as fit, never one cut in half.
  list.style.maxHeight = "";
  if (fit && places.length) {
    const cap = innerHeight * 0.36;
    let h = 4; // the list's top padding (the bottom one would show a sliver of the next row)
    for (const row of list.children) { if (h + row.offsetHeight > cap && h > 4) break; h += row.offsetHeight; }
    list.style.maxHeight = `${h}px`;
  }
}

/** The name to show or say: dropped pins and typed coordinates keep a "📍 " in their name, never shown. */
const shown = (place) => place.name.replace(/^📍 /, "");
/** An address without what every Malaysian one repeats: the country and postcode. State names stay. */
const shortAddress = (detail) => detail.split(", ").map((part) => part.replace(/(?<![\d.])\d{5}(?![\d.])/g, "").trim())
  .filter((part) => part && part !== "Malaysia").join(", ");

function setSearchCandidates(places) {
  map.getSource("search-results")?.setData(fc(places.map((p, i) => pointFeature(p.at, { i, n: String(i + 1) }))));
}

// --- Routes ---

/** A picked place: show where it is first; routes come with Directions. */
function goTo(place) {
  searchReturn = shownResults.length && $("results").classList.contains("submitted")
    ? { query: $("search").value, places: shownResults.slice(), near: shownResultsNear } : null;
  if (searchReturn) history.pushState({ roadwiseSearchResult: true }, "", location.href);
  showResults([]);
  $("search").value = shown(place);
  $("search").blur();
  showClear(true);
  clearRoute();
  state.destination = place;
  drawRoutes(); // Just the destination pin, hidden until the map gets there.
  ++pinDrop;
  map.setPaintProperty("dest", "icon-opacity", 0);
  $("placeName").textContent = shown(place);
  // How far first, in bold: what a driver judges a place by at a glance. Then the address.
  const away = state.here ? `<b>${shortDistance(distance(state.here, place.at))} away</b>` : "";
  const where = shortAddress(place.detail).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  $("placeDetail").innerHTML = [away, where].filter(Boolean).join("  ·  ");
  showSaveState();
  $("placeFlag").hidden = !place.driverId;
  // Coordinates and map taps are named "📍 …": usually a spot the map has nothing for.
  $("placeAdd").hidden = !!place.driverId || !place.name.startsWith("📍");
  showCard($("placeCard"));
  state.following = false;
  map.easeTo({ center: place.at, zoom: Math.max(map.getZoom(), 15.5), pitch: 0, bearing: 0, duration: 700 });
  setTimeout(dropPin, reducedMotion() ? 0 : 720); // Once the map has arrived.
}
function restoreSearchResults() {
  if (!searchReturn) return;
  const saved = searchReturn;
  searchReturn = null;
  clearRoute();
  $("search").value = saved.query;
  showClear(true);
  showResults(saved.places, saved.near, true);
}
window.addEventListener("popstate", restoreSearchResults);
$("placeGo").onclick = () => { hideCard($("placeCard")); planRoute(true); };
$("routeAddStop").onclick = () => startPicking("stop");
/** Home or Work already at the destination's spot, if either is. */
const savedAs = (place) => place && ["home", "work"].find((slot) => state[slot] && distance(state[slot].at, place.at) < 30);
/** Save reads "Saved" once the place is Home or Work. */
function showSaveState() {
  const saved = !!savedAs(state.destination);
  for (const id of ["placeSave", "routeSave"]) {
    $(id).querySelector("span").textContent = saved ? "Saved" : "Save";
    $(id).setAttribute("aria-label", saved ? "Saved" : "Save this place");
  }
}
$("placeSave").onclick = $("routeSave").onclick = () => {
  const choice = (slot, label) => Object.assign(document.createElement("button"), { className: "pill wide",
    innerHTML: `${icon(slot)}<span>${label}</span>`, onclick: () => { hideCard($("sheet")); saveHomeWork(slot, state.destination); } });
  showSheet("Save as", choice("home", "Home"), choice("work", "Work"));
};
$("placeClose").onclick = () => searchReturn ? history.back() : $("clear").onclick();
$("placeAdd").onclick = () => addMissingPlace(state.destination.at);
$("placeFlag").onclick = () => {
  const place = state.destination;
  if (!place?.driverId) return;
  const text = Object.assign(document.createElement("p"), { className: "sheetText",
    textContent: "Added by drivers. If it isn't there, or the name is wrong, say so: after a few drivers do, it's taken off search." });
  const send = Object.assign(document.createElement("button"), { className: "primary", textContent: "Not here" });
  send.onclick = async () => {
    send.disabled = true;
    try {
      await supabase("POST", "driver_place_flags", { place_id: place.driverId });
      hideCard($("sheet"));
      toast("Thanks, noted");
    } catch (e) {
      send.disabled = false;
      toast(`Couldn't send it: ${e.message}`);
    }
  };
  showSheet(place.name, text, send);
};

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
// The map buttons and the speed sign sit just above whichever card is along the bottom.
const stackObserver = new ResizeObserver(() => {
  const h = Math.max(...["panel", "placeCard"].map((id) => ($(id).hidden ? 0 : $(id).offsetHeight)));
  document.documentElement.style.setProperty("--stack", `${h}px`);
});
for (const id of ["panel", "placeCard"]) stackObserver.observe($(id));
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
    const t = await trafficCall("", { route: thin }).catch((e) => { trafficPaused = e.message === "traffic 429"; return null; });
    if (!t) return;
    trafficPaused = false;
    r.seconds = t.seconds;
    r.delay = t.delaySeconds || 0;
    r.limits = (t.limits || []).filter((s) => s.points.length >= 2).map((s) => ({
      kmh: s.kmh, points: s.points.map(([lat, lng]) => [lng, lat]),
    }));
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
    const traffic = r.delay >= 60 ? `traffic +${formatDuration(r.delay)}` : k === i && trafficPaused ? TRAFFIC_PAUSED : "";
    b.innerHTML = `<span><div class="time"></div><div class="sub"></div></span><span class="sub"></span>`;
    b.querySelector(".time").textContent = formatDuration(r.seconds);
    b.querySelectorAll(".sub")[0].textContent = joinWhole([shortDistance(r.meters), traffic, r.via && `via ${r.via}`]);
    b.querySelectorAll(".sub")[1].textContent = clock(r.seconds);
    b.onclick = () => selectRoute(k);
    return b;
  }));
}

function drawRoutes() {
  const r = state.nav?.route ?? state.routes[state.selected];
  const alts = state.nav ? [] : state.routes.map((x, k) => (k === state.selected ? null : lineFeature(x.points, { index: k }))).filter(Boolean);
  map.getSource("alts")?.setData(fc(alts));
  const progress = state.nav?.progress;
  const segment = progress && r ? Math.max(0, Math.min(progress.segment, r.points.length - 2)) : -1;
  const driven = segment >= 0 ? [...r.points.slice(0, segment + 1), progress.point] : [];
  const remaining = segment >= 0 ? [progress.point, ...r.points.slice(segment + 1)] : r?.points;
  map.getSource("driven")?.setData(driven.length > 1 ? fc([lineFeature(driven)]) : empty);
  map.getSource("route")?.setData(remaining ? lineFeature(remaining) : empty);
  // Drawn on the route's own line: TomTom's version of the road runs a little beside it.
  map.getSource("slow")?.setData(fc((r?.slow ?? []).map((s) => along(r.points, s.points[0], s.points.at(-1)))
    .map((points, i) => points.length >= 2 && lineFeature(points, { color: r.slow[i].color })).filter(Boolean)));
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
  if (state.savingSlot) return saveHomeWork(state.savingSlot, place);
  const kind = state.picking;
  if (!kind) return goTo(place);
  stopPicking();
  if (kind === "origin") state.origin = place;
  else if (state.stops.length >= MAX_STOPS) return toast(`Up to ${MAX_STOPS} stops`);
  else state.stops.push(place);
  if (state.nav) return reroute(); // Driving: carry on, through the new stop.
  planRoute(kind === "origin");
}

/** [typing]: put the cursor in the box for a search the driver types in. */
function startPicking(kind, typing = true) {
  state.picking = kind;
  $("search").value = "";
  $("search").placeholder = kind === "origin" ? "Start from: search a place" : "Add a stop: search a place";
  showClear(true);
  showResults([]);
  // Picking where to start: going back to here comes first.
  if (kind === "origin" && state.origin) {
    const b = document.createElement("button");
    b.className = "row";
    b.innerHTML = `<span class="pin">${icon("locate")}</span><span class="what"><div class="name">Your location</div><div class="detail">Start from where you are now</div></span>`;
    b.onmousedown = (e) => e.preventDefault(); // Keep the keyboard's blur from eating the tap.
    b.onclick = startFromHere;
    $("results").replaceChildren(b);
  }
  if (typing) $("search").focus();
}

/** Back to routing from where the phone is, after planning from another start. */
function startFromHere() {
  if (state.picking) stopPicking();
  state.origin = null;
  planRoute(true);
}

function stopPicking() {
  state.picking = null;
  $("search").placeholder = SEARCH_HINT;
  $("search").value = state.destination?.name ?? "";
  showClear(!!state.destination);
  showResults([]);
  $("search").blur();
  // Driving: the turn banner comes back once the stop is picked or the search is closed.
  if (state.nav) { $("searchBox").hidden = true; $("banner").hidden = false; }
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
  $("go").hidden = !!state.origin || !!state.nav;
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
    row("●", o ? `From ${shown(o)} · planning only` : "From your location", () => startPicking("origin"),
      ...(o ? [button("locate", "Start from your location", startFromHere)] : [])),
    ...state.stops.map((p, i) => row(String(i + 1), shown(p), null,
      ...(i > 0 ? [button("up", "Move stop earlier", () => moveStop(i, i - 1))] : []),
      ...(i < state.stops.length - 1 ? [button("down", "Move stop later", () => moveStop(i, i + 1))] : []),
      button("close", "Remove stop", () => removeStop(p)))),
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

$("go").onclick = () => startNavigation();
$("exit").onclick = () => stopNavigation();
$("navAddStop").onclick = () => showStopTiles();

function startNavigation() {
  if (state.origin) return; // Planning from elsewhere: nothing to navigate from here.
  const r = state.routes[state.selected];
  if (!r) return;
  state.nav = { route: r, stepIndex: r.steps.length > 1 ? 1 : 0, far: false, near: false, off: 0, rerouting: false, progress: null,
    startedAt: Date.now(), predicted: r.seconds, cumulative: cumulative(r.points) };
  state.following = true;
  $("searchBox").hidden = true;
  $("banner").hidden = false;
  $("routes").hidden = true;
  $("routeActions").hidden = true;
  $("navInfo").hidden = false;
  $("speedView").hidden = false;
  $("go").hidden = true;
  showPlaceIcons(false);
  $("trafficButton").hidden = true;
  showTraffic(state.traffic);
  // Shown from the start; each update moves it on to the next turn.
  drawTurnArrow(r.steps.find((x) => !["depart", "arrive"].includes(x.type)));
  drawRoutes();
  renderTrip();
  keepAwake(true);
  say(instructionFor(r.steps[0]));
  loadFeatures(r.points);
  onLocation();
}

function stopNavigation() {
  state.nav = null;
  keepAwake(false);
  $("searchBox").hidden = false;
  $("banner").hidden = true;
  $("routes").hidden = false;
  $("routeActions").hidden = false;
  $("navInfo").hidden = true;
  $("speedView").hidden = true;
  $("go").hidden = !!state.origin;
  hideCard($("sheet"));
  showPlaceIcons(true);
  $("trafficButton").hidden = false;
  showTraffic(state.traffic);
  drawTurnArrow(null);
  map.easeTo({ pitch: 0, bearing: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 } });
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
    offRoute: nav.off >= OFF_ROUTE_UPDATES, snapped: s && !off && s.meters < 30 ? s.point : null, progress: s, left, secondsLeft };
}

/** A new turn slides up into the banner, quick enough to read at a glance; the distance count itself doesn't move. */
function bannerIn() {
  if (reducedMotion()) return;
  for (const el of [$("arrow"), $("bannerDistance").parentElement])
    el.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 180, easing: "cubic-bezier(.2, 0, 0, 1)" });
}

function showNav(u) {
  const nav = state.nav;
  nav.progress = u.progress;
  const segment = u.progress?.segment ?? 0;
  const points = nav.route.points;
  const travelled = u.progress ? [...points.slice(0, segment + 1), u.progress.point] : [];
  const remaining = u.progress ? [u.progress.point, ...points.slice(segment + 1)] : points;
  map.getSource("driven")?.setData(travelled.length > 1 ? fc([lineFeature(travelled)]) : empty);
  map.getSource("route")?.setData(lineFeature(remaining));
  const limit = speedLimitAt(state.here, nav.route.limits || []);
  $("currentSpeed").textContent = state.speedKmh == null ? "–" : String(state.speedKmh);
  $("speedLimit").textContent = limit == null ? "–" : String(limit);
  $("speedLimit").hidden = false;
  $("speedView").classList.toggle("speeding", limit != null && state.speedKmh != null && state.speedKmh > limit + 5);
  $("arrow").textContent = symbolFor(u.step);
  if (u.step !== nav.arrowFor) { nav.arrowFor = u.step; drawTurnArrow(u.step); bannerIn(); }
  $("bannerDistance").textContent = u.arrived ? "Arrived" : shortDistance(u.dist);
  $("bannerText").textContent = bannerFor(u.step);
  $("then").hidden = !u.then;
  if (u.then) $("then").textContent = `Then ${symbolFor(u.then)}  ${shortDistance(u.gap)}`;
  $("navEta").textContent = clock(u.secondsLeft);
  $("navLeft").textContent = joinWhole([formatDuration(u.secondsLeft), shortDistance(u.left)]);
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

const SIGN_REACH_METERS = 3000;
function limitSignFacesRoute(f) {
  const hit = snap(f.at, state.nav.route.points);
  return hit != null && (f.heading == null || angleBetween(f.heading, hit.bearing) <= 60);
}
function limitSignAt(at) {
  const nav = state.nav;
  if (!nav) return null;
  const position = (p) => {
    const hit = snap(p, nav.route.points);
    return hit && hit.meters <= FEATURE_ON_ROUTE_METERS ? nav.cumulative[hit.segment] + distance(nav.route.points[hit.segment], hit.point) : null;
  };
  const here = position(at);
  if (here == null) return null;
  let latest = null, latestAlong = -Infinity;
  for (const f of state.features) {
    if (f.kind.key !== "speed_limit" || !f.confirmed || !f.limit) continue;
    if (!limitSignFacesRoute(f)) continue;
    const along = position(f.at);
    if (along != null && along <= here && here - along < SIGN_REACH_METERS && along >= latestAlong) { latest = f; latestAlong = along; }
  }
  return latest;
}
function reportLimitChange() {
  if (!state.nav || !state.here) return;
  const sign = limitSignAt(state.here);
  const current = speedLimitAt(state.here, state.nav.route.limits || []);
  showTiles("Speed limit changed?", [...SPEED_LIMITS.map((kmh) => ({ sign: kmh, selected: kmh === current,
    color: ROAD_FEATURES.find((f) => f.key === "speed_limit").color, pick: async () => {
      hideCard($("sheet"));
      try {
        if (sign) await supabase("POST", "road_feature_votes", { feature_id: sign.id, yes: true, change: true, value: kmh, device_id: deviceId() });
        else { await sendFeature(ROAD_FEATURES.find((f) => f.key === "speed_limit"), null, kmh, true); return; }
        toast("Reported. Other drivers will check it.");
      } catch { toast("Couldn't send. Try again later."); }
    } })), closeTile]);
}
$("speedLimit").onclick = reportLimitChange;

function speedLimitAt(at, limits) {
  const sign = limitSignAt(at);
  if (sign) return sign.limit;
  let nearest = null;
  for (const limit of limits) {
    const candidate = snap(at, limit.points);
    if (candidate && (!nearest || candidate.meters < nearest.meters)) nearest = { meters: candidate.meters, kmh: limit.kmh };
  }
  return nearest?.meters < 25 ? nearest.kmh : null;
}

async function reroute() {
  const nav = state.nav;
  nav.rerouting = true;
  say("Rerouting");
  const [r] = await fetchRoutes([state.here, ...state.stops.map((p) => p.at), state.destination.at], false);
  if (state.nav !== nav) return;
  nav.rerouting = false;
  if (!r) return;
  Object.assign(nav, { route: r, stepIndex: r.steps.length > 1 ? 1 : 0, far: false, near: false, off: 0, progress: null, cumulative: cumulative(r.points) });
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
  const ordinal = (n) => ["first", "second", "fourth", "fifth"][n - 1] ?? `${n}th`;
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
  // Today's free share is used up: say so, and how drivers can keep it on.
  if (state.traffic && trafficPaused) {
    const support = Object.assign(document.createElement("button"), { className: "primary", textContent: "Support" });
    support.onclick = showSupport;
    showSheet(TRAFFIC_PAUSED, support);
  }
};
function showTraffic(on) {
  $("trafficButton").classList.toggle("off", !on);
  if (!map.getSource("alts")) return; // Not loaded yet; the load handler shows it.
  if (map.getLayer("traffic")) map.removeLayer("traffic");
  if (map.getSource("traffic")) map.removeSource("traffic");
  // Not while driving: the route shows its own slow stretches, and TomTom's lines (offset from the
  // map's roads, one per direction on divided roads) would peek out beside it as a second line.
  if (!on || state.nav) return;
  map.addSource("traffic", { type: "vector", tiles: [`${TRAFFIC}?tile={z}/{x}/{y}`], minzoom: TRAFFIC_MIN_ZOOM, maxzoom: 18, attribution: "Traffic © TomTom" });
  map.addLayer({ id: "traffic", type: "line", source: "traffic", "source-layer": "Traffic flow", minzoom: TRAFFIC_MIN_ZOOM,
    filter: ["<", ["get", "traffic_level"], TRAFFIC_SLOW_BELOW],
    paint: { "line-color": ["step", ["get", "traffic_level"], "#C5221F", 0.4, "#F29900"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.5, 14, 2.5, 18, 4], "line-opacity": 0.9 },
    layout: { "line-cap": "round" } }, "alts");
}

const INCIDENT = {
  1: ["car_crash", "#CE1126", "Accident"], 8: ["block", "#5F6368", "Road closed"], 9: ["construction", "#F29900", "Roadworks"], 7: ["construction", "#F29900", "Roadworks"],
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

/** [read]: a POST that answers with rows (an rpc function), not just "done". */
/** Adds a row with this browser's id, for levels; a database without the column yet (levels.sql) still gets it. */
async function addMine(table, row) {
  try { await supabase("POST", table, { ...row, device_id: deviceId() }); } catch (e) {
    if (!e.message.startsWith("400")) throw e;
    await supabase("POST", table, row);
  }
}
async function supabase(method, path, body, read = false) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}`, ...(body ? { "content-type": "application/json", ...(read ? {} : { prefer: "return=minimal" }) } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return body && !read ? null : res.json();
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

const closeTile = { sprite: "close", label: "Close", color: NEUTRAL_TILE, pick: () => (hideCard($("sheet"))) };
$("reportButton").onclick = () => {
  if (!state.here) { startLocation(); return toast("Finding your location…"); }
  showTiles("Report", [...REPORT_TYPES.map((t) => ({ glyph: t.glyph, label: t.short, color: t.color,
    pick: () => (t.subtypes.length ? showSubtypes(t) : sendReport(t, null)) })),
    { glyph: "road_feature", label: "Road feature", color: "#002B7F", pick: () => showFeatureTiles(null) }, closeTile]);
};

/** A fixed thing on the road: where you are now ([at] null), or a spot tapped on the map. */
function showFeatureTiles(at) {
  showTiles("What's on the road?", [...ROAD_FEATURES.map((f) => ({ glyph: f.glyph, label: f.label, color: f.color,
    pick: () => (f.limit ? showLimitTiles(f, at) : sendFeature(f, at, null)) })),
    at ? closeTile : { sprite: "back", label: "Back", color: NEUTRAL_TILE, pick: $("reportButton").onclick }]);
}
/** The limit as big signs; a camera's limit can be left out. */
function showLimitTiles(f, at) {
  showTiles("Speed limit (km/h)", [...SPEED_LIMITS.map((kmh) => ({ sign: kmh, label: String(kmh), color: f.color, pick: () => sendFeature(f, at, kmh) })),
    ...(f.key === "speed_camera" ? [{ glyph: f.glyph, label: "Not sure", color: f.color, pick: () => sendFeature(f, at, null) }] : []),
    { sprite: "back", label: "Back", color: NEUTRAL_TILE, pick: () => showFeatureTiles(at) }]);
}
async function sendFeature(f, at, limit, limitChange = false) {
  hideCard($("sheet"));
  const [lng, lat] = at ?? state.here;
  try {
    await supabase("POST", "road_features", { kind: f.key, lat, lng, heading: !at && state.heading != null ? Math.round(state.heading) % 360 : null,
      value: limit, device_id: deviceId() });
    toast(limitChange ? "Reported. Other drivers will check it." : `Reported: ${f.label}. Other drivers will confirm it.`);
  } catch (e) {
    toast(limitChange ? "Couldn't send. Try again later." : `Couldn't send it: ${e.message}`);
  }
}
function startReportingFeature() {
  state.reportingFeature = true;
  toast("Tap the spot on the map");
}

/** Mana's own road features around [points] (a route), with whether they're confirmed yet. */
async function loadFeatures(points) {
  state.features = []; state.featuresWarned = new Set(); state.featuresAsked = new Set(); state.featuresClosest = {};
  map.getSource("features")?.setData(empty);
  if (!points?.length) return;
  const lngs = points.map((p) => p[0]), lats = points.map((p) => p[1]), pad = 0.01;
  const [s, n, w, e] = [Math.min(...lats) - pad, Math.max(...lats) + pad, Math.min(...lngs) - pad, Math.max(...lngs) + pad];
  const found = [];
  for (let lat = s; lat < n; lat += 1) for (let lng = w; lng < e; lng += 1) {
    const rows = await supabase("POST", "rpc/road_features_in", { south: lat, west: lng, north: Math.min(lat + 1, n), east: Math.min(lng + 1, e) }, true).catch(() => []);
    for (const r of rows) {
      const kind = ROAD_FEATURES.find((f) => f.key === r.kind);
      if (kind && !found.some((x) => x.id === r.id)) found.push({ id: r.id, kind, at: [r.lng, r.lat], limit: r.value, heading: r.heading, confirmed: r.confirmed, changing: r.changing, changeValue: r.change_value });
    }
  }
  // Only the ones on the route: a feature on a road you're not taking isn't worth a word.
  state.features = found.filter((f) => snap(f.at, points)?.meters <= FEATURE_ON_ROUTE_METERS);
  map.getSource("features")?.setData(fc(state.features.filter((f) => f.confirmed && f.kind.key !== "speed_limit")
    .map((f) => pointFeature(f.at, { id: f.id, icon: badge(f.kind.glyph, f.kind.color) }))));
}

/** While driving: say confirmed cameras and bumps ahead; after passing an unconfirmed one (or one with a road change reported), ask. */
function checkFeatures(here) {
  if (!state.nav || !state.features.length) return;
  for (const f of state.features) {
    const d = distance(here, f.at);
    if (f.confirmed && f.kind.spoken && !state.featuresWarned.has(f.id) && d < f.kind.warn && (f.kind.key !== "speed_bump" || state.speed * 3.6 >= 20)) {
      state.featuresWarned.add(f.id);
      say(f.kind.spoken + (f.kind.key === "speed_camera" && f.limit ? `, limit ${f.limit}` : ""));
      return;
    }
    if ((f.confirmed && (!f.changing || (f.kind.key === "speed_limit" && !f.changeValue))) || state.featuresAsked.has(f.id)) continue;
    if (f.kind.key === "speed_limit" && !limitSignFacesRoute(f)) continue;
    const closest = Math.min(d, state.featuresClosest[f.id] ?? d);
    state.featuresClosest[f.id] = closest;
    if (closest < 60 && d > closest + 80) {
      state.featuresAsked.add(f.id);
      askFeature(f);
      return;
    }
  }
}
/** Report a road change on a confirmed feature (road_changes.sql): it stays until passing drivers agree it's gone. */
function reportChange(f) {
  showTiles(`${f.kind.label}: report a road change`, [{ glyph: f.kind.glyph, label: "It's gone", color: NEUTRAL_TILE, pick: async () => {
    hideCard($("sheet"));
    try {
      await supabase("POST", "road_feature_votes", { feature_id: f.id, yes: false, change: true, device_id: deviceId() });
      state.featuresAsked.add(f.id);
      toast("Reported. Other drivers will check it.");
    } catch { toast("Couldn't send. Try again later."); }
  } }, closeTile]);
}
function askFeature(f) {
  const value = f.kind.key === "speed_limit" ? (f.confirmed && f.changing && f.changeValue ? f.changeValue : f.limit) : undefined;
  const question = f.kind.key === "speed_limit" ? `Speed limit ${value} here?` : f.kind.ask;
  const answer = (yes) => async () => {
    hideCard($("sheet"));
    try { await supabase("POST", "road_feature_votes", { feature_id: f.id, yes, value, device_id: deviceId() }); toast("Thanks!"); } catch { /* A missed vote isn't worth bothering the driver. */ }
  };
  showTiles(question, [{ glyph: f.kind.glyph, label: "Yes", color: f.kind.color, pick: answer(true) },
    { sprite: "close", label: "No", color: NEUTRAL_TILE, pick: answer(false) }]);
  setTimeout(() => { if ($("sheetTitle").textContent === question) hideCard($("sheet")); }, 15000);
}
function showSubtypes(t) {
  const tiles = t.subtypes.map((s) => ({ glyph: s.glyph, label: s.short, color: t.color, pick: () => sendReport(t, s) }));
  if (t.key === "hazard") tiles.push({ glyph: t.glyph, label: "Other", color: t.color, pick: () => sendReport(t, null) });
  tiles.push({ sprite: "back", label: "Back", color: NEUTRAL_TILE, pick: $("reportButton").onclick });
  showTiles(t.short, tiles);
}
/** Big tiles, three to a row: a report glyph (glyphs.js) or an icon from the sprite, and one word. */
function showTiles(title, tiles) {
  $("sheetTitle").textContent = title;
  $("tiles").replaceChildren(...tiles.map((t) => {
    const b = document.createElement("button");
    b.className = "tile";
    if (t.selected) { b.classList.add("currentLimit"); b.setAttribute("aria-current", "true"); }
    b.style.setProperty("--tile", t.color);
    // A speed limit tile is the number in a red ring, like the real sign.
    b.innerHTML = t.sign ? `<b class="limitSign"></b>` : t.sprite ? `<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-${t.sprite}"/></svg><span></span>`
      : `<svg viewBox="0 -960 960 960" aria-hidden="true"><path/></svg><span></span>`;
    if (t.sign) { b.querySelector("b").textContent = t.sign; b.setAttribute("aria-label", `${t.sign} km/h${t.selected ? ", current" : ""}`); if (t.selected) { const label = document.createElement("span"); label.textContent = "Current"; b.append(label); } }
    else {
      if (!t.sprite) b.querySelector("path").setAttribute("d", GLYPHS[t.glyph]);
      b.querySelector("span").textContent = t.label;
    }
    b.onclick = t.pick;
    return b;
  }));
  $("sheetClose").hidden = true; // The tiles have their own Close.
  showCard($("sheet"));
}

/**
 * Add stop while driving: kinds of stop as tiles, so the turn banner stays in view; one tap searches
 * (no keyboard). Search… is for anything else.
 */
function showStopTiles() {
  const pick = (word) => {
    hideCard($("sheet"));
    $("banner").hidden = true;
    $("searchBox").hidden = false;
    startPicking("stop", !word);
    if (word) { $("search").value = word; search(word, true); }
  };
  showTiles("Add stop", [...STOP_KINDS.map(([word, label, sprite]) => ({ sprite, label, color: "#2457E6", pick: () => pick(word) })),
    { sprite: "search", label: "Search", color: NEUTRAL_TILE, pick: () => pick(null) }, closeTile]);
}
$("sheetClose").onclick = () => (hideCard($("sheet")));

async function sendReport(type, sub) {
  hideCard($("sheet"));
  const [lng, lat] = state.here;
  try {
    await addMine("reports", { type: type.key, lat, lng, ...(sub ? { subtype: sub.key } : {}) });
    toast(`Reported: ${sub?.title ?? type.label}`);
    refreshReports();
  } catch (e) {
    toast(`Couldn't send report: ${e.message}`);
  }
}

// --- Supporting Mana ---

let donations = null;
const KOFI_URL = /^https:\/\/(www\.)?ko-fi\.com\/[A-Za-z0-9_]+\/?$/;
const BMAC_URL = /^https:\/\/(www\.)?buymeacoffee\.com\/[A-Za-z0-9_.-]+\/?$/;
supabase("GET", "donations?select=*").then((rows) => {
  const d = rows[0];
  // Only the real pages, whatever the row says.
  if (d) donations = { ...d, kofi_url: KOFI_URL.test(d.kofi_url ?? "") ? d.kofi_url : null, bmac_url: BMAC_URL.test(d.bmac_url ?? "") ? d.bmac_url : null };
}).catch(() => {});

/**
 * Home and Work side by side, then kinds of place nearby: what the empty search box offers
 * (settings and the rest are in the Menu).
 */
function showSaved() {
  const tile = (sprite, label, detail, onclick) => {
    const b = document.createElement("button");
    b.className = "row half";
    b.innerHTML = `<span class="pin">${icon(sprite)}</span><span class="what"><div class="name"></div><div class="detail"></div></span>`;
    b.querySelector(".name").textContent = label;
    b.querySelector(".detail").textContent = detail;
    b.onmousedown = (e) => e.preventDefault(); // Keep the keyboard's blur from eating the tap.
    b.onclick = () => { $("search").blur(); onclick(); };
    return b;
  };
  const pair = (...tiles) => { const p = Object.assign(document.createElement("div"), { className: "pair" }); p.append(...tiles); return p; };
  const slot = (key, label) => tile(key, label, state[key] ? shown(state[key]) : "Tap to set",
    () => { showResults([]); state[key] ? goTo(state[key]) : startSaving(key); });
  // One tap searches around here, no typing (as the app's Nearby).
  const kinds = STOP_KINDS.map(([word, label, sprite]) => tile(sprite, label, "", () => { $("search").value = word; search(word, true); }));
  const pairs = [];
  for (let i = 0; i < kinds.length; i += 2) pairs.push(pair(...kinds.slice(i, i + 2)));
  $("results").replaceChildren(pair(slot("home", "Home"), slot("work", "Work")),
    Object.assign(document.createElement("div"), { className: "menuGroup", textContent: "Nearby" }), ...pairs);
}

/** The Menu, from the ☰ in the search bar, in groups as the app's (the web has no driving settings). */
/** Driver levels (docs/levels/PLAN.md): the server works out points from what other drivers confirmed (levels.sql). */
const LEVELS = [[0, "Novice"], [100, "Scout"], [300, "Road Hero"], [750, "Captain"], [1500, "King of the Road"]];
/** The last answer, kept in this browser so the Menu shows it at once (and offline). */
const cachedLevel = () => { try { return JSON.parse(localStorage.getItem("mana.level")) ?? null; } catch { return null; } };
async function fetchLevel() {
  const [l] = await supabase("POST", "rpc/my_points", { device: deviceId() }, true);
  try { localStorage.setItem("mana.level", JSON.stringify(l)); } catch { /* Shown, just not kept. */ }
  return l;
}
/** The level sign (design/levels/level-sign.svg): a navy direction sign with the level [n] on it. */
const levelSign = (n) => `<svg class="levelSign" viewBox="0 0 256 256" aria-hidden="true"><path fill="#7A8599" d="M87 150H105V226H87Z"/>` +
  `<path fill="#002B7F" d="M36 36H176L236 96L176 156H36A16 16 0 0 1 20 140V52A16 16 0 0 1 36 36Z"/>` +
  `<path fill="none" stroke="#fff" stroke-width="10" stroke-linejoin="round" d="M40 56H167L207 96L167 136H40Z"/>` +
  `<text x="114" y="96" dy=".35em" text-anchor="middle" fill="#fff" font-weight="700" font-size="78">${n}</text></svg>`;
/** Approved badge masters; CSS switches the pair with the existing root night class. */
const LEVEL_BADGES = [
  { path: "M76 224 H124 V216 L112 216 V144 H176 L216 104 L176 64 H44 L32 76 V132 L44 144 H88 V216 L76 216 Z M180 104 L152 76 H136 L164 104 L136 132 H152 Z", day: "#002B7F", night: "#8FAEFF" },
  { path: "M76 224 H124 V216 L112 216 V164 H128 V152 H112 V144 H176 L216 104 L176 64 H44 L32 76 V132 L44 144 H88 V152 H72 V164 H88 V216 L76 216 Z M132 104 L108 80 H96 L120 104 L96 128 H108 Z M180 104 L156 80 H144 L168 104 L144 128 H156 Z", day: "#15803D", night: "#4ADE80" },
  { path: "M44 224 H156 V216 L144 216 L112 184 V144 H184 L224 104 L184 64 H40 L28 76 V132 L40 144 H88 V184 L56 216 L44 216 Z M64 216 L88 192 V216 Z M136 216 L112 192 V216 Z M108 104 L88 84 H78 L98 104 L78 124 H88 Z M148 104 L128 84 H118 L138 104 L118 124 H128 Z M188 104 L168 84 H158 L178 104 L158 124 H168 Z", day: "#0E7490", night: "#22D3EE" },
  { path: "M52 224 H148 V216 H136 V144 H188 L228 104 L188 64 H36 L24 76 V132 L36 144 H64 V216 H52 Z M84 144 H116 V172 H84 Z M84 184 H116 V216 H84 Z M94 104 L74 84 H64 L84 104 L64 124 H74 Z M126 104 L106 84 H96 L116 104 L96 124 H106 Z M158 104 L138 84 H128 L148 104 L128 124 H138 Z M190 104 L170 84 H160 L180 104 L160 124 H170 Z", day: "#334155", night: "#CBD5E1" },
  { path: "M16 224 H184 V216 H176 L136 176 V144 H192 L232 104 L192 64 H32 L20 76 V132 L32 144 H64 V176 L24 216 H16 Z M44 216 L64 196 V216 Z M156 216 L136 196 V216 Z M84 144 H116 V172 H84 Z M84 184 H116 V216 H84 Z M90 104 L70 84 H60 L80 104 L60 124 H70 Z M117 104 L97 84 H87 L107 104 L87 124 H97 Z M144 104 L124 84 H114 L134 104 L114 124 H124 Z M171 104 L151 84 H141 L161 104 L141 124 H151 Z M198 104 L178 84 H168 L188 104 L168 124 H178 Z", day: "#A16207", night: "#FACC15" },
];
const levelBadge = (n) => {
  const b = LEVEL_BADGES[n - 1];
  return `<svg class="levelSign levelBadge" viewBox="12 32 224 224" role="img" aria-label="Level ${n}, ${LEVELS[n - 1][1]}" style="--badge-day:${b.day};--badge-night:${b.night}"><path fill="currentColor" fill-rule="evenodd" d="${b.path}"/></svg>`;
};
const NO_LEVEL = { points: 0, level: 1, title: "Novice", next_level_at: 100 };
/** The sign in the search bar, beside the Menu; tapping it opens Your level. */
function showLevelBadge(l) {
  const b = $("levelButton");
  b.innerHTML = levelSign(l.level);
  b.title = b.ariaLabel = `Level ${l.level}, ${l.title}, ${l.points} points. Opens Your level`;
}
function refreshLevel() { fetchLevel().then(showLevelBadge).catch(() => {}); }
if (SUPABASE_URL) {
  showLevelBadge(cachedLevel() ?? NO_LEVEL);
  $("levelButton").hidden = false;
  $("levelButton").onclick = showLevel;
  refreshLevel();
  // Points come in as other drivers confirm, so the sign catches up whenever the page is looked at again.
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshLevel(); });
}

/** A row on a level page, as in the Menu: [sprite] or a level sign, [label], and [value] on the right. */
function levelRow(lead, label, value, onclick) {
  const b = Object.assign(document.createElement(onclick ? "button" : "div"), { className: onclick ? "menuRow" : "menuRow still" });
  b.innerHTML = `${lead}<span class="label"></span><span class="value"></span>`;
  b.querySelector(".label").textContent = label;
  b.querySelector(".value").textContent = value ?? "";
  if (onclick) b.onclick = onclick;
  return b;
}
const backButton = () => Object.assign(document.createElement("button"), { className: "plain", textContent: "Back", onclick: showLevel });

/**
 * Your level, first page: the sign, your title and points, how far the next level is. How to earn points
 * and the levels are a tap away, each on its own page, so no page holds everything.
 */
function showLevel() {
  const l = cachedLevel() ?? NO_LEVEL;
  const from = LEVELS.filter(([at]) => at <= l.points).at(-1)?.[0] ?? 0;
  const next = LEVELS.find(([at]) => at === l.next_level_at);
  const head = Object.assign(document.createElement("div"), { className: "levelHead" });
  head.innerHTML = `${levelBadge(l.level)}<div><div class="levelTitle"></div><div class="levelPoints"></div></div>`;
  head.querySelector(".levelTitle").textContent = l.title;
  head.querySelector(".levelPoints").textContent = `${l.points} points`;
  // The road to the next level: covered in blue, your own car on it, the next level's sign at its end.
  const pct = l.next_level_at ? Math.round(100 * (l.points - from) / (l.next_level_at - from)) : 100;
  const bar = Object.assign(document.createElement("div"), { className: "levelRoad" });
  bar.setAttribute("role", "img");
  bar.ariaLabel = next ? `${pct}% of the way to Level ${l.level + 1}, ${next[1]}` : "Top level";
  bar.innerHTML = `<div class="road"><div class="covered"></div></div><img class="roadCar" alt="">${next ? levelBadge(l.level + 1) : ""}`;
  bar.style.setProperty("--p", pct / 100);
  bar.querySelector(".roadCar").src = carCanvas(vehicle()).toDataURL();
  showSheet("Your level", head, bar,
    Object.assign(document.createElement("p"), { className: "sheetText", textContent: next ? `${next[0] - l.points} more for ${next[1]}` : "The top level. Thank you for all your help!" }),
    levelRow(icon("answer"), "How you earn points", null, showEarnPoints),
    levelRow(icon("level"), "Levels", null, showAllLevels));
}

/** How points are earned: one row each, the points on the right, and when they come. */
function showEarnPoints() {
  showSheet("How you earn points",
    ...[["road-feature", "A road feature you reported is confirmed", 30], ["add-location", "A place you added is still there after a week", 20],
      ["report", "Another driver confirms your report", 10], ["toll", "A toll fare you sent becomes the fare", 10],
      ["answer", "Your Yes or No matches what other drivers say", 3]].map(([sprite, label, points]) => levelRow(icon(sprite), label, `+${points}`)),
    Object.assign(document.createElement("p"), { className: "sheetText muted",
      textContent: "Points count once other drivers agree, so they come in over the next days. They belong to this browser: clearing it starts again from 0." }),
    backButton());
}

/** The five levels, each with its sign and the points it takes; yours says so. */
function showAllLevels() {
  const now = (cachedLevel() ?? NO_LEVEL).level;
  showSheet("Levels", ...LEVELS.map(([at, title], i) => levelRow(levelBadge(i + 1), title, i + 1 === now ? "You're here" : `${at} points`)), backButton());
}

function showMenu() {
  $("search").blur();
  showResults([]);
  const group = (title) => Object.assign(document.createElement("div"), { className: "menuGroup", textContent: title });
  const row = (sprite, label, value, onclick) => {
    const b = document.createElement("button");
    b.className = "menuRow";
    b.innerHTML = `${icon(sprite)}<span class="label"></span><span class="value"></span>`;
    b.querySelector(".label").textContent = label;
    b.querySelector(".value").textContent = value ?? "";
    b.onclick = () => { hideCard($("sheet")); onclick(); };
    return b;
  };
  showSheet("Menu",
    group("Driving"), row("car", "Your vehicle", vehicleLabel(vehicle()), chooseVehicle),
    group("Help other drivers"),
    row("road-feature", "Report a road feature", null, startReportingFeature),
    row("add-location", "Add a place missing from the map", null, startAddingPlace),
    group("Support"),
    // Progress shows once something has been given: "RM0 of RM300" reads as nobody cares.
    row("coffee", "Support Mana", donations?.raised_rm > 0 ? `RM${donations.raised_rm} of RM${donations.goal_rm}` : null, showSupport),
    row("lightbulb", "Report a bug or idea", null, requestFeature),
    group("About"),
    // The app's About text (credits, privacy, licences), published next to the site by publish-web.sh.
    row("info", "About, privacy & licences", null, () => open("about.txt", "_blank", "noopener")),
  );
}

function saveHomeWork(slot, place) {
  if (!slot || !place) return;
  const saved = { name: place.name, detail: place.detail || "", at: place.at.slice() };
  try { localStorage.setItem(`mana.${slot}`, JSON.stringify(saved)); }
  catch { return toast("Couldn't save this place in your browser"); }
  state[slot] = saved;
  if (state.savingSlot) {
    state.savingSlot = null;
    $("search").placeholder = SEARCH_HINT;
    $("search").value = "";
    showClear(false);
    showResults([]);
  }
  toast(`Saved as ${slot === "home" ? "Home" : "Work"}`);
  if (state.destination) showSaveState();
}
function startSaving(slot) {
  state.savingSlot = slot;
  $("search").value = "";
  $("search").placeholder = `Set ${slot === "home" ? "Home" : "Work"}: search or tap the map`;
  showClear(true);
  showMapPickRow();
  $("search").focus();
}
function showMapPickRow() {
  const row = document.createElement("button");
  row.className = "row";
  row.innerHTML = `<span class="pin">${icon("pin")}</span><span class="what"><div class="name">Choose on map</div><div class="detail">Tap the location to save ${state.savingSlot === "home" ? "Home" : "Work"}</div></span>`;
  row.onmousedown = (e) => e.preventDefault();
  row.onclick = () => toast("Tap the map to choose a location");
  $("results").replaceChildren(row);
}

// --- Places drivers add ---

function startAddingPlace() {
  state.addingPlace = true;
  toast("Tap the spot on the map");
}
map.on("click", (e) => {
  if (state.savingSlot) {
    const [lng, lat] = e.lngLat.toArray();
    saveHomeWork(state.savingSlot, { name: `📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}`, detail: "Map pin", at: [lng, lat] });
    return;
  }
  if (state.reportingFeature) { state.reportingFeature = false; return showFeatureTiles(e.lngLat.toArray()); }
  if (!state.addingPlace) return;
  state.addingPlace = false;
  addMissingPlace(e.lngLat.toArray());
});

/** A place the map doesn't have, at [at], for every driver: what kind, then its name. */
function addMissingPlace(at) {
  showSheet("What kind of place?", ...PLACE_KINDS.map((kind) => {
    const b = document.createElement("button");
    b.className = "tile kind";
    b.textContent = kind.label;
    b.onclick = () => askMissingName(at, kind);
    return b;
  }));
}

function askMissingName(at, kind) {
  const text = Object.assign(document.createElement("p"), { className: "sheetText",
    textContent: "Every Mana driver will find it in search. Please only add shops and other places open to the public, not homes." });
  const label = Object.assign(document.createElement("label"), { className: "fieldLabel", htmlFor: "missingPlaceName", textContent: "Place name" });
  const name = Object.assign(document.createElement("input"), { id: "missingPlaceName", type: "text", maxLength: 60, placeholder: "e.g. Kedai Makan Pak Ali" });
  const osmBox = Object.assign(document.createElement("input"), { type: "checkbox", checked: true });
  const osm = Object.assign(document.createElement("label"), { className: "check" });
  osm.append(osmBox, " Also tell OpenStreetMap, so it can go on the real map");
  const add = Object.assign(document.createElement("button"), { className: "primary", textContent: "Add" });
  add.onclick = async () => {
    const n = name.value.trim();
    if (n.length < 2) return toast("Type the place's name");
    add.disabled = true;
    try {
      await addMine("driver_places", { name: n, kind: kind.key, lat: at[1], lng: at[0] });
    } catch (e) {
      add.disabled = false;
      return toast(`Couldn't add it: ${e.message}`);
    }
    hideCard($("sheet"));
    toast(`Added ${n}`);
    // Only a bonus: the place is already in Mana. Sent blind, as the notes API's answer isn't needed.
    if (osmBox.checked) {
      const note = `Missing place: ${n} (${kind.label.toLowerCase()}). Added by a driver in the Mana app; please check before mapping.`;
      fetch("https://api.openstreetmap.org/api/0.6/notes", { method: "POST", mode: "no-cors",
        body: new URLSearchParams({ lat: at[1], lon: at[0], text: note }) }).catch(() => {});
    }
  };
  showSheet(kind.label, text, label, name, osm, add);
  name.focus();
}

function showSheet(title, ...content) {
  $("sheetTitle").textContent = title;
  $("tiles").replaceChildren(...content);
  $("sheetClose").hidden = false;
  showCard($("sheet"));
}

function showSupport() {
  const text = document.createElement("p");
  text.className = "sheetText";
  text.textContent = `Mana is free, with no ads. Live traffic and the servers cost about RM${donations?.goal_rm ?? 300} a month; ` +
    "donations keep it free for everyone. To give with DuitNow, save or screenshot this QR, then in your bank or Touch 'n Go app " +
    "choose Scan → from gallery. Any amount helps. Thank you!";
  const qr = Object.assign(document.createElement("img"), { src: "duitnow.png", alt: "DuitNow QR", className: "qr" });
  qr.onerror = () => qr.remove(); // Not added yet.
  const links = [["Ko-fi", donations?.kofi_url], ["Buy Me a Coffee", donations?.bmac_url]].filter(([, url]) => url).map(([label, url]) =>
    Object.assign(document.createElement("a"), { className: "primary payLink", href: url, target: "_blank", rel: "noopener", textContent: label }));
  if (links.length) text.textContent += " Or give by card:";
  showSheet("Support Mana", text, ...links, qr);
}

function requestFeature() {
  const box = Object.assign(document.createElement("textarea"), { rows: 4, maxLength: 500, placeholder: "What went wrong, or what would make Mana better?" });
  const send = Object.assign(document.createElement("button"), { className: "primary", textContent: "Send" });
  send.onclick = async () => {
    const text = box.value.trim();
    if (text.length < 5) return toast("Tell us a bit more");
    send.disabled = true;
    try {
      await supabase("POST", "feature_requests", { text, source: "web", app_version: window.ROADWISE?.VERSION ?? null });
      hideCard($("sheet"));
      toast("Thanks! Sent");
    } catch (e) {
      send.disabled = false;
      toast(`Couldn't send it: ${e.message}`);
    }
  };
  showSheet("Report a bug or idea", box, send);
  box.focus();
}

// --- Start ---

$("reportGlyph").setAttribute("d", GLYPHS.campaign);

if (!localStorage.getItem("installSeen")) $("install").hidden = false;
$("installOk").onclick = () => { $("install").hidden = true; localStorage.setItem("installSeen", "1"); };
$("search").placeholder = SEARCH_HINT;
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

// A newer version published since this page loaded: show the Update button. Browsers can otherwise
// keep the old files for a while after a publish.
async function checkForUpdate() {
  const mine = window.ROADWISE?.VERSION;
  if (!mine) return; // A local copy, not a published one.
  try {
    const text = await fetch("config.js", { cache: "no-store" }).then((r) => r.text());
    const latest = /VERSION:\s*"([^"]+)"/.exec(text)?.[1];
    if (latest && latest !== mine) $("update").hidden = false;
  } catch { /* Offline: check again later. */ }
}
$("update").onclick = async () => {
  $("update").textContent = "Updating…";
  try {
    for (const r of (await navigator.serviceWorker?.getRegistrations?.()) ?? []) await r.unregister();
    for (const k of await caches.keys()) await caches.delete(k);
    await Promise.all(["./", "index.html", "style.css", "app.js", "config.js", "glyphs.js", "sw.js"]
      .map((f) => fetch(f, { cache: "reload" }).catch(() => {})));
  } catch { /* Reload anyway. */ }
  location.reload();
};
setTimeout(checkForUpdate, 5000);
setInterval(checkForUpdate, 30 * 60_000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) checkForUpdate(); });
startLocation();
