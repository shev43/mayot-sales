/**
 * Геометрія сцени.
 * Сцена: метри, Y-up. origin = min терену з DXF (мм) — див. data/meta.json.
 * План-координати (x, y=north) = (sceneX, -sceneZ).
 * CRS ортофото/топозйомки: UCS-2000 / LCS-26 Ivano-Frankivsk (modified).
 */
import meta from "@/data/meta.json";
import grid from "@/data/heightgrid.json";
import georefFile from "@/data/georef.json";

export type Vec2 = [number, number];

export const META = meta as {
  origin_dxf_mm: number[];
  scene_bbox: { min: number[]; max: number[] };
  uphill_xz: number[];
  slope_pct: number;
  storeys: { name: string; elev: number; y: number }[];
};

type Grid = {
  originX: number;
  originZ: number;
  step: number;
  cols: number;
  rows: number;
  data: (number | null)[];
};
export const GRID = grid as Grid;

/** одиничний вектор «угору по схилу» у площині XZ сцени */
export const UPHILL_XZ: Vec2 = [META.uphill_xz[0], META.uphill_xz[1]];

/** те саме у план-координатах (x, north) */
export const UPHILL_PLAN: Vec2 = [UPHILL_XZ[0], -UPHILL_XZ[1]];

export const SCENE_CENTER_XZ: Vec2 = [
  (META.scene_bbox.min[0] + META.scene_bbox.max[0]) / 2,
  (META.scene_bbox.min[2] + META.scene_bbox.max[2]) / 2,
];

/** висота терену (scene Y) у точці XZ; null поза сіткою */
export function heightAt(x: number, z: number): number | null {
  const fx = (x - GRID.originX) / GRID.step;
  const fz = (z - GRID.originZ) / GRID.step;
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  if (i < 0 || j < 0 || i >= GRID.cols - 1 || j >= GRID.rows - 1) return null;
  const at = (ii: number, jj: number) => GRID.data[jj * GRID.cols + ii];
  const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
  const vals = [a, b, c, d].filter((v): v is number => v !== null);
  if (vals.length === 0) return null;
  if (vals.length < 4) return vals.reduce((s, v) => s + v, 0) / vals.length;
  const tx = fx - i, tz = fz - j;
  return (a! * (1 - tx) + b! * tx) * (1 - tz) + (c! * (1 - tx) + d! * tx) * tz;
}

/* ---------------- геоприв'язка ---------------- */

export interface Georef {
  dx: number;     // м, зсув по Easting
  dy: number;     // м, зсув по Northing
  rotDeg: number; // поворот план-координат, град, CCW
  scale: number;
}

type GeorefFile = {
  crs: string;
  pixel_m: number;
  tfw: number[];
  width_px: number;
  height_px: number;
  width_m: number;
  height_m: number;
  corners_crs: { ul: number[]; lr: number[] };
  local_to_crs: { dx: number | null; dy: number | null; rotDeg: number | null; scale: number };
};
export const GEOREF_FILE = georefFile as GeorefFile;

/** початкове припущення: центр терену на центр ортофото, без повороту */
export function defaultGeoref(): Georef {
  const f = GEOREF_FILE;
  const g = f.local_to_crs;
  if (g.dx !== null && g.dy !== null && g.rotDeg !== null) {
    return { dx: g.dx, dy: g.dy, rotDeg: g.rotDeg, scale: g.scale ?? 1 };
  }
  const [A, , , E, C, F] = f.tfw;
  const cE = C + (f.width_px * A) / 2;
  const cN = F + (f.height_px * E) / 2;
  const cx = SCENE_CENTER_XZ[0];
  const cy = -SCENE_CENTER_XZ[1];
  return { dx: cE - cx, dy: cN - cy, rotDeg: 0, scale: 1 };
}

/** локальна сцена (x, z) → CRS (E, N) */
export function localToCrs(x: number, z: number, g: Georef): Vec2 {
  const px = x, py = -z;
  const r = (g.rotDeg * Math.PI) / 180;
  const c = Math.cos(r), s = Math.sin(r);
  return [g.scale * (c * px - s * py) + g.dx, g.scale * (s * px + c * py) + g.dy];
}

/** CRS → UV ортофото (v=0 зверху зображення) */
export function crsToUv(E: number, N: number): Vec2 {
  const f = GEOREF_FILE;
  const [A, , , Ez, C, F] = f.tfw;
  return [(E - C) / (f.width_px * A), (F - N) / (f.height_px * -Ez)];
}

export function localToUv(x: number, z: number, g: Georef): Vec2 {
  const [E, N] = localToCrs(x, z, g);
  return crsToUv(E, N);
}

/* ---------------- конверт ТЗ 120×400 ---------------- */

export const ENVELOPE = { width: 120, length: 400, left: 16, center: 80, right: 24 } as const;

export interface Envelope {
  cx: number;     // центр, scene X
  cz: number;     // центр, scene Z
  rotDeg: number; // додатковий поворот відносно напрямку схилу
}

/** ASSUMED-посадка: ch.0 — на нижньому краю ескізу, вісь = угору по схилу */
export function defaultEnvelope(sketch: { min: Vec2; max: Vec2 } | null): Envelope {
  if (!sketch) return { cx: SCENE_CENTER_XZ[0], cz: SCENE_CENTER_XZ[1], rotDeg: 0 };
  const u = UPHILL_XZ;
  const corners: Vec2[] = [
    [sketch.min[0], sketch.min[1]], [sketch.max[0], sketch.min[1]],
    [sketch.min[0], sketch.max[1]], [sketch.max[0], sketch.max[1]],
  ];
  const c: Vec2 = [(sketch.min[0] + sketch.max[0]) / 2, (sketch.min[1] + sketch.max[1]) / 2];
  const proj = corners.map((p) => (p[0] - c[0]) * u[0] + (p[1] - c[1]) * u[1]);
  const lo = Math.min(...proj);
  // центр конверта = нижній край ескізу + 200 м угору
  return { cx: c[0] + u[0] * (lo + ENVELOPE.length / 2), cz: c[1] + u[1] * (lo + ENVELOPE.length / 2), rotDeg: 0 };
}

/** осі конверта у площині XZ: u — угору (chainage), w — від LEFT до RIGHT */
export function envelopeAxes(env: Envelope): { u: Vec2; w: Vec2 } {
  const base = Math.atan2(UPHILL_XZ[1], UPHILL_XZ[0]) + (env.rotDeg * Math.PI) / 180;
  const u: Vec2 = [Math.cos(base), Math.sin(base)];
  // Стоячи обличчям униз по схилу (−u): LEFT — ліворуч. У план-координатах left(f) = (−fy, fx);
  // у XZ (z = −y) це дає w = (−u_z, −u_x)·(−1)… рахуємо через план і повертаємо в XZ:
  const fPlan: Vec2 = [-u[0], u[1]];        // facing downhill, plan (x, north)
  const leftPlan: Vec2 = [-fPlan[1], fPlan[0]];
  const w: Vec2 = [-leftPlan[0], leftPlan[1]]; // від LEFT до RIGHT у XZ = −left
  return { u, w };
}

/** точка конверта за chainage (0..400) та поперечною відстанню від LEFT-краю (0..120) */
export function envelopePoint(env: Envelope, chainage: number, across: number): Vec2 {
  const { u, w } = envelopeAxes(env);
  const s = chainage - ENVELOPE.length / 2;
  const t = across - ENVELOPE.width / 2;
  return [env.cx + u[0] * s + w[0] * t, env.cz + u[1] * s + w[1] * t];
}

/** контур для драпірування по терену: точки кожні `step` м із висотою */
export function drapedPolyline(pts: Vec2[], step = 5, lift = 0.6): number[] {
  const out: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(L / step));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const y = (heightAt(x, z) ?? 0) + lift;
      if (k > 0) out.push(x, y, z);
      if (k < n) out.push(x, y, z);
    }
  }
  return out;
}
