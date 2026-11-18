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

function cumulative(points) {
  const c = [0];
  for (let i = 1; i < points.length; i++) c.push(c[i - 1] + distance(points[i - 1], points[i]));
  return c;
}

function positionAlong(points, cumulative, hit) {
  return cumulative[hit.segment] + distance(points[hit.segment], hit.point);
}

export { rad, distance, bearing, snap, along, angleBetween, cumulative, positionAlong };
