import { distance } from "./geo.js";

function tracePieces(points) {
  const step = Math.max(1, Math.ceil(points.length / 4000));
  const sparse = points.filter((_, i) => i % step === 0 || i === points.length - 1);
  const pieces = []; let piece = [], meters = 0;
  for (const p of sparse) {
    const gap = piece.length ? distance(piece.at(-1), p) : 0;
    if (meters + gap > 150000 && piece.length > 1) { pieces.push(piece); piece = [piece.at(-1)]; meters = 0; }
    piece.push(p); meters += gap;
  }
  if (piece.length > 1) pieces.push(piece);
  return pieces;
}
function encodeTrace(points) {
  let out = "", last = [0, 0];
  for (const p of points) {
    const next = [Math.round(p[1] * 1e6), Math.round(p[0] * 1e6)];
    next.forEach((n, i) => {
      const d = n - last[i]; let v = d < 0 ? ~(d << 1) : d << 1;
      while (v >= 32) { out += String.fromCharCode((32 | (v & 31)) + 63); v >>>= 5; }
      out += String.fromCharCode(v + 63);
    }); last = next;
  }
  return out;
}
function traceFacts(json) {
  if (!Array.isArray(json.edges) || !json.edges.length) throw new Error("No route facts");
  const lights = new Set(); let toll = false;
  for (const e of json.edges) {
    const node = e.end_node || {};
    if (node.traffic_signal || e.traffic_signal) lights.add(e.end_shape_index);
    const malaysiaExpressway = json.admins?.[node.admin_index]?.country_code === "MY" && e.road_class === "motorway" && e.names?.some(n => /^E\d+$/.test(n));
    toll ||= !!e.toll || ["toll_booth", "toll_gantry"].includes(node.type) || !!malaysiaExpressway;
  }
  return { lights: lights.size, hasTolls: toll };
}

export { tracePieces, encodeTrace, traceFacts };
