// shots.js - shot charts: loading shots, hexagon bins, the half-court drawing, and the "shot diet" table.
// Data from pipeline/fetch_advanced.py (NBA.com ShotChartDetail). Court coordinates are NBA.com's:
// tenths of a foot, basket at (0, 0), x from -250 (left sideline) to 250, y from -47.5 (baseline) toward half court.
import { unpack, esc } from "./ui.js";

const files = new Map();
const getJSON = (path) => {
  if (!files.has(path)) files.set(path, fetch(path).then((r) => { if (!r.ok) throw new Error(`missing ${path}`); return r.json(); }));
  return files.get(path);
};
export const shotZones = (season) => getJSON(`data/${season}/shot_zones.json`);
export async function playerShots(season, id) {
  const c = await getJSON(`data/${season}/shots/p_${String(id % 40).padStart(2, "0")}.json`);
  return unpack(c).filter((s) => s.PLAYER_ID === id);
}

// ---- hexagons (the same math as pipeline/fetch_advanced.py) ----
export function hexOf(x, y, size) {
  const q = (Math.sqrt(3) / 3 * x - y / 3) / size, r = (2 / 3 * y) / size;
  let rx = Math.round(q), rz = Math.round(r), ry = Math.round(-q - r);
  const dx = Math.abs(rx - q), dy = Math.abs(ry - (-q - r)), dz = Math.abs(rz - r);
  if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
  return [rx, rz];
}
const hexCenter = (q, r, size) => [size * (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r), size * 1.5 * r];
function hexPath(cx, cy, s) {
  const pts = [];
  for (let i = 0; i < 6; i++) { const a = Math.PI / 180 * (60 * i - 30); pts.push(`${(cx + s * Math.cos(a)).toFixed(1)},${(cy + s * Math.sin(a)).toFixed(1)}`); }
  return `M${pts.join("L")}Z`;
}
// Bin a player's shots: [q, r, FGA, FGM, expected FGM at league-average zone FG%]
export function binShots(shots, zones, size) {
  const bins = new Map();
  for (const s of shots) {
    const k = hexOf(s.X, s.Y, size).join(",");
    const b = bins.get(k) || [...hexOf(s.X, s.Y, size), 0, 0, 0];
    b[2]++; b[3] += s.M; b[4] += zones[s.Z]?.FG_PCT ?? 0;
    bins.set(k, b);
  }
  return [...bins.values()];
}

// Color: FG% minus league average for the same spots, in percentage points.
export function diffColor(d) {
  if (d == null) return "#8b949e";
  const t = Math.max(-1, Math.min(1, d / 12));          // ±12 points = full color
  return t >= 0 ? `rgb(${Math.round(139 - 104 * t)},${Math.round(148 + 6 * t)},${Math.round(158 - 100 * t)})`   // gray -> green
    : `rgb(${Math.round(139 + 75 * -t)},${Math.round(148 - 80 * -t)},${Math.round(158 - 90 * -t)})`;               // gray -> red
}

// ---- the half court ----
function courtLines() {
  const arcY = Math.sqrt(237.5 ** 2 - 220 ** 2);   // where the 3-point arc meets the corner lines (~89.5)
  return `<g class="court" fill="none">
    <rect x="-250" y="-47.5" width="500" height="470"/>
    <rect x="-80" y="-47.5" width="160" height="190"/><rect x="-60" y="-47.5" width="120" height="190"/>
    <circle cx="0" cy="142.5" r="60"/>
    <path d="M -40 0 A 40 40 0 0 0 40 0"/>
    <line x1="-30" y1="-7.5" x2="30" y2="-7.5"/><circle cx="0" cy="0" r="7.5"/>
    <line x1="-220" y1="-47.5" x2="-220" y2="${arcY}"/><line x1="220" y1="-47.5" x2="220" y2="${arcY}"/>
    <path d="M -220 ${arcY} A 237.5 237.5 0 0 0 220 ${arcY}"/>
    <path d="M -60 422.5 A 60 60 0 0 1 60 422.5"/></g>`;
}

// Draw a chart. mode = "hex" (bins: [q, r, FGA, FGM, expFGM]) or "dots" (shots).
export function courtSVG({ mode, bins = [], shots = [], size = 15, invert = false }) {
  let marks = "";
  if (mode === "dots") {
    marks = shots.map((s) => s.M
      ? `<circle cx="${s.X}" cy="${s.Y}" r="3.2" class="made"/>`
      : `<path d="M${s.X - 3} ${s.Y - 3}L${s.X + 3} ${s.Y + 3}M${s.X + 3} ${s.Y - 3}L${s.X - 3} ${s.Y + 3}" class="miss"/>`).join("");
  } else {
    // Scale hexagon size by shots, measured against a busy (85th-percentile) hexagon so the rim doesn't shrink everything else.
    const counts = bins.map((b) => b[2]).sort((a, b) => a - b);
    const max = Math.max(1, counts[Math.floor(counts.length * 0.85)] || 1);
    marks = bins.filter((b) => b[2] > 0).sort((a, b) => a[2] - b[2]).map(([q, r, fga, fgm, exp]) => {
      const [cx, cy] = hexCenter(q, r, size);
      if (cy > 400) return "";
      const s = size * Math.max(0.35, Math.min(1, Math.sqrt(fga / max)));
      const d = fga >= 5 ? 100 * (fgm - exp) / fga : null;
      return `<path d="${hexPath(cx, cy, s)}" fill="${diffColor(d == null ? null : invert ? -d : d)}"><title>${fga} shots, ${fgm} made (${(100 * fgm / fga).toFixed(0)}%)${d == null ? "" : `, ${d >= 0 ? "+" : ""}${d.toFixed(1)} vs league average from these spots`}</title></path>`;
    }).join("");
  }
  return `<svg class="shot-court" viewBox="-252 -50 504 452" role="img" aria-label="Shot chart">${courtLines()}<g>${marks}</g></svg>`;
}

// ---- shot diet: zone groups ----
export const ZONE_GROUPS = ["Restricted Area", "In The Paint (Non-RA)", "Mid-Range", "Corner 3", "Above the Break 3"];
const groupOf = (basic) => basic.includes("Corner 3") ? "Corner 3" : basic === "Backcourt" ? null : basic;

// counts: { zoneIndex: [FGA, FGM] }  ->  rows per group with frequency, FG% and league comparisons
export function dietRows(counts, zones) {
  const lgTotal = zones.reduce((a, z) => a + z.FGA, 0);
  const total = Object.values(counts).reduce((a, c) => a + c[0], 0);
  return ZONE_GROUPS.map((g) => {
    let fga = 0, fgm = 0, lgA = 0, lgM = 0, exp = 0;
    zones.forEach((z, i) => {
      if (groupOf(z.BASIC) !== g) return;
      lgA += z.FGA; lgM += z.FGM;
      const c = counts[i]; if (c) { fga += c[0]; fgm += c[1]; exp += c[0] * z.FG_PCT; }
    });
    const three = g.includes("3");
    return { ZONE: g, FGA: fga, FGM: fgm, FREQ: total ? fga / total : null, LG_FREQ: lgA / lgTotal,
      FG_PCT: fga ? fgm / fga : null, LG_FG_PCT: lgM / lgA, DIFF: fga ? (fgm - exp) / fga : null,
      PPS: fga ? fgm * (three ? 3 : 2) / fga : null, LG_PPS: lgM * (three ? 3 : 2) / lgA };
  });
}

export function dietBar(rows) {
  const colors = ["#ff7a1a", "#e0a24a", "#8b949e", "#4f8cff", "#2b5fbf"];
  return `<div class="diet">${rows.map((r, i) => r.FREQ ? `<span style="width:${(100 * r.FREQ).toFixed(1)}%;background:${colors[i]}" title="${esc(r.ZONE)}: ${(100 * r.FREQ).toFixed(1)}% of shots (league ${(100 * r.LG_FREQ).toFixed(1)}%)">${r.FREQ > 0.07 ? (100 * r.FREQ).toFixed(0) + "%" : ""}</span>` : "").join("")}</div>
    <div class="diet-legend">${rows.map((r, i) => `<span><i style="background:${colors[i]}"></i>${esc(r.ZONE)}</span>`).join("")}</div>`;
}
