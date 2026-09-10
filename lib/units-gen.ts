/**
 * Допоміжна геометрія генератора юнітів (scripts/generate-units.ts) і тестів.
 * Чиста математика без fs/node — можна імпортувати у сцену.
 *
 * Сцена: метри, Y-up; план (x, north) = (x, −z).
 *
 * Конвенція повороту Unit.rotDeg (three.js: mesh.rotation.y = rotDeg·π/180):
 *   локальна +X (ширина size[0])  → XZ (cos θ, −sin θ)
 *   локальна +Z (глибина size[1]) → XZ (sin θ,  cos θ)  — дивиться НАЗОВНІ (фасад / тераса)
 * Тобто тераса POA-юніта займає локальний діапазон z ∈ [d/2 − terraceDepth, d/2],
 * кімната — z ∈ [−d/2, d/2 − terraceDepth], де d = size[1].
 */
import { heightAt, UPHILL_XZ } from "@/lib/geo";
import type { Orientation } from "@/lib/units";

export type Vec2 = [number, number];

export interface Plate {
  id: string;
  storey: string;
  elev: number;
  y0: number;
  h: number;
  outer: Vec2[];
  holes: Vec2[][];
}

/* ---------------- константи генератора ---------------- */
export const ROOM_DEPTH_M = 7.5;            // ТЗ: глибина відсіку всередину плити
export const ROOM_DEPTH_FALLBACK_M = 6.5;   // ТЗ: якщо не вміщується (hole / контур)
export const MIN_EDGE_M = 4;                // ТЗ: ребра коротші — пропускаємо
export const MIN_TERRACE_DEPTH_M = 2.5;     // ТЗ: мінімальна глибина тераси (POA)
export const UNIT_HEIGHT_M = 3.0;           // ТЗ
export const SLIDE_STEP_M = 0.5;            // ASSUMED: крок ковзання відсіку вздовж ребра
export const EDGE_INSET_M = 0.05;           // ASSUMED: відступ тест-прямокутника від лінії ребра
export const TERRAIN_TOL_M = 1.0;           // критерій тесту: y ≥ heightAt − 1
export const MIN_PLATE_AREA_M2 = 100;       // ASSUMED: дрібніші плити (сходинки, козирки) ігноруємо
export const LEVEL_TOL_M = 0.25;            // ASSUMED: допуск збігу верху плити з рівнем поверху

/* ---------------- полігони ---------------- */

/** прибирає послідовні дублікати та замикаючу точку */
export function cleanRing(ring: number[][]): Vec2[] {
  const out: Vec2[] = [];
  for (const p of ring) {
    const q: Vec2 = [p[0], p[1]];
    const last = out[out.length - 1];
    if (last && Math.hypot(last[0] - q[0], last[1] - q[1]) < 1e-6) continue;
    out.push(q);
  }
  if (out.length > 1) {
    const a = out[0], b = out[out.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6) out.pop();
  }
  return out;
}

export function signedArea(poly: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, z1] = poly[i], [x2, z2] = poly[(i + 1) % poly.length];
    a += x1 * z2 - x2 * z1;
  }
  return a / 2;
}

export const polygonArea = (poly: Vec2[]) => Math.abs(signedArea(poly));

export function polygonCentroid(poly: Vec2[]): Vec2 {
  let cx = 0, cz = 0, a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, z1] = poly[i], [x2, z2] = poly[(i + 1) % poly.length];
    const f = x1 * z2 - x2 * z1;
    a += f; cx += (x1 + x2) * f; cz += (z1 + z2) * f;
  }
  if (Math.abs(a) < 1e-9) {
    const n = poly.length || 1;
    return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (3 * a), cz / (3 * a)];
}

export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  const [px, pz] = p;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

const orient = (a: Vec2, b: Vec2, c: Vec2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const onSeg = (a: Vec2, b: Vec2, c: Vec2) =>
  Math.min(a[0], b[0]) - 1e-9 <= c[0] && c[0] <= Math.max(a[0], b[0]) + 1e-9 &&
  Math.min(a[1], b[1]) - 1e-9 <= c[1] && c[1] <= Math.max(a[1], b[1]) + 1e-9;

/** перетин відрізків (включно з дотиком) */
export function segmentsIntersect(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): boolean {
  const d1 = orient(p3, p4, p1), d2 = orient(p3, p4, p2), d3 = orient(p1, p2, p3), d4 = orient(p1, p2, p4);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  if (Math.abs(d1) < 1e-9 && onSeg(p3, p4, p1)) return true;
  if (Math.abs(d2) < 1e-9 && onSeg(p3, p4, p2)) return true;
  if (Math.abs(d3) < 1e-9 && onSeg(p1, p2, p3)) return true;
  if (Math.abs(d4) < 1e-9 && onSeg(p1, p2, p4)) return true;
  return false;
}

export function polygonsCrossEdges(a: Vec2[], b: Vec2[]): boolean {
  for (let i = 0; i < a.length; i++) {
    const a1 = a[i], a2 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      if (segmentsIntersect(a1, a2, b[j], b[(j + 1) % b.length])) return true;
    }
  }
  return false;
}

/** перетин площ двох простих полігонів (вершина всередині або перетин ребер) */
export function polygonsIntersect(a: Vec2[], b: Vec2[]): boolean {
  if (a.some((p) => pointInPolygon(p, b))) return true;
  if (b.some((p) => pointInPolygon(p, a))) return true;
  return polygonsCrossEdges(a, b);
}

/* ---------------- орієнтація / поворот ---------------- */

export function localAxes(rotDeg: number): { X: Vec2; Z: Vec2 } {
  const t = (rotDeg * Math.PI) / 180;
  return { X: [Math.cos(t), -Math.sin(t)], Z: [Math.sin(t), Math.cos(t)] };
}

/** rotDeg, при якому локальна +Z дивиться вздовж n (XZ) */
export const rotDegFromOutward = (n: Vec2) => (Math.atan2(n[0], n[1]) * 180) / Math.PI;

export const outwardFromRotDeg = (rotDeg: number): Vec2 => localAxes(rotDeg).Z;

/** азимут напрямку XZ у градусах (0 = північ, 90 = схід); план north = −z */
export function bearingDeg(n: Vec2): number {
  const b = (Math.atan2(n[0], -n[1]) * 180) / Math.PI;
  return (b + 360) % 360;
}

const COMPASS: Orientation[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
export const orientationFromOutward = (n: Vec2): Orientation => COMPASS[Math.round(bearingDeg(n) / 45) % 8];

/** одиничний вектор XZ за компасом (північ = −Z, схід = +X); null для невідомого рядка */
export function outwardFromOrientation(o: string): Vec2 | null {
  const i = COMPASS.indexOf(o as Orientation);
  if (i < 0) return null;
  const az = (i * 45 * Math.PI) / 180;
  return [Math.sin(az), -Math.cos(az)];
}

/** прямокутник у локальних координатах юніта: x ∈ [x0,x1] (ширина), z ∈ [z0,z1] (глибина, +z назовні) */
export function localRect(center: Vec2, rotDeg: number, x0: number, x1: number, z0: number, z1: number): Vec2[] {
  const { X, Z } = localAxes(rotDeg);
  const pt = (x: number, z: number): Vec2 => [center[0] + X[0] * x + Z[0] * z, center[1] + X[1] * x + Z[1] * z];
  return [pt(x0, z0), pt(x1, z0), pt(x1, z1), pt(x0, z1)];
}

/** повний слід юніта (як його малює сцена): центр, size[0], size[1], rotDeg */
export const rectPoly = (center: Vec2, w: number, d: number, rotDeg: number) =>
  localRect(center, rotDeg, -w / 2, w / 2, -d / 2, d / 2);

/** глибина тераси POA-юніта (ТЗ: terrace/width, мін 2.5 м); 0 без тераси */
export const terraceDepth = (terrace_m2: number, width: number) =>
  terrace_m2 > 0 ? Math.max(MIN_TERRACE_DEPTH_M, terrace_m2 / width) : 0;

/** частина сліду юніта без тераси (кімната) — для перевірки hole/контуру; inset — відступ усередину, м */
export function roomPolyOfUnit(
  u: { position: [number, number, number]; size: [number, number, number]; rotDeg: number; terrace_m2: number },
  inset = 0,
): Vec2[] {
  const [w, d] = u.size;
  const td = terraceDepth(u.terrace_m2, w);
  return localRect([u.position[0], u.position[2]], u.rotDeg, -w / 2 + inset, w / 2 - inset, -d / 2 + inset, d / 2 - td - inset);
}

/* ---------------- плити ---------------- */

export function parsePlates(raw: unknown): Plate[] {
  const arr = raw as { id: string; storey: string; elev: number; y0: number; h: number; outer: number[][]; holes?: number[][][] }[];
  return arr.map((p) => ({
    id: p.id, storey: p.storey, elev: p.elev, y0: p.y0, h: p.h,
    outer: cleanRing(p.outer),
    holes: (p.holes ?? []).map(cleanRing).filter((h) => h.length >= 3),
  })).filter((p) => p.outer.length >= 3);
}

/** плити, верх яких (y0+h) збігається з рівнем підлоги y; за спаданням площі */
export function platesAtLevel(plates: Plate[], y: number, tol = LEVEL_TOL_M, minArea = MIN_PLATE_AREA_M2): Plate[] {
  return plates
    .filter((p) => Math.abs(p.y0 + p.h - y) <= tol && polygonArea(p.outer) >= minArea)
    .sort((a, b) => polygonArea(b.outer) - polygonArea(a.outer));
}

export interface PlateEdge {
  index: number;
  a: Vec2;
  b: Vec2;
  len: number;
  t: Vec2;   // одиничний уздовж ребра a→b
  n: Vec2;   // одиничний назовні плити
}

export function plateEdges(plate: Plate, minLen = MIN_EDGE_M): PlateEdge[] {
  const poly = plate.outer;
  const out: PlateEdge[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < minLen) continue;
    const t: Vec2 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const left: Vec2 = [-t[1], t[0]];
    const mid: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    // назовні = той бік, де точка біля середини ребра поза полігоном
    const n: Vec2 = pointInPolygon([mid[0] + left[0] * 0.3, mid[1] + left[1] * 0.3], poly) ? [-left[0], -left[1]] : left;
    out.push({ index: i, a, b, len, t, n });
  }
  return out;
}

/* ---------------- розкладка відсіків по периметру ---------------- */

export interface CompartmentRequest {
  key: string;
  net: number;
  terrace: number;
}

export interface Compartment {
  key: string;
  plateId: string;
  edgeIndex: number;
  width: number;
  roomDepth: number;
  terraceDepth: number;
  /** центр повного сліду (кімната + тераса), XZ */
  center: Vec2;
  rotDeg: number;
  outward: Vec2;
  orientation: Orientation;
  /** повний слід (для перевірки перетинів) */
  footprint: Vec2[];
  /** кімната (в межах плити) */
  room: Vec2[];
}

export interface PackOptions {
  existing?: Compartment[];     // вже розкладені на цьому рівні (інший датасет/прохід)
  depths?: number[];            // послідовність глибин; за замовч. [7.5, 6.5]
  step?: number;
  checkTerrain?: boolean;       // y ≥ heightAt − 1 у центрі й перед фасадом
}

const DOWNHILL: Vec2 = [-UPHILL_XZ[0], -UPHILL_XZ[1]];

function edgePoint(e: PlateEdge, s: number, q: number): Vec2 {
  // s уздовж ребра, q всередину плити (від'ємне = назовні)
  return [e.a[0] + e.t[0] * s - e.n[0] * q, e.a[1] + e.t[1] * s - e.n[1] * q];
}

function tryPlaceOnEdge(
  plate: Plate, e: PlateEdge, req: CompartmentRequest, s0: number, floorY: number,
  placed: Compartment[], depths: number[], step: number, checkTerrain: boolean, others: Plate[],
): Compartment | null {
  for (const depth of depths) {
    const w = req.net / depth;
    const td = terraceDepth(req.terrace, w);
    for (let s = s0; s + w <= e.len + 1e-6; s += step) {
      const test = [
        edgePoint(e, s + 0.02, EDGE_INSET_M), edgePoint(e, s + w - 0.02, EDGE_INSET_M),
        edgePoint(e, s + w - 0.02, depth), edgePoint(e, s + 0.02, depth),
      ];
      if (!test.every((p) => pointInPolygon(p, plate.outer))) continue;
      if (polygonsCrossEdges(test, plate.outer)) continue;
      if (plate.holes.some((h) => polygonsIntersect(test, h))) continue;
      const footprint = [edgePoint(e, s, -td), edgePoint(e, s + w, -td), edgePoint(e, s + w, depth), edgePoint(e, s, depth)];
      if (placed.some((c) => polygonsIntersect(footprint, c.footprint))) continue;
      const center = edgePoint(e, s + w / 2, (depth - td) / 2);
      const front = edgePoint(e, s + w / 2, -(td + 1.0));
      // ASSUMED: фасад має відкриватися назовні, а не в іншу плиту цього ж рівня (плити BIMx накладаються)
      const just = edgePoint(e, s + w / 2, -0.5);
      if (others.some((o) => pointInPolygon(front, o.outer) || pointInPolygon(just, o.outer))) continue;
      if (checkTerrain) {
        const hc = heightAt(center[0], center[1]);
        if (hc === null || hc - TERRAIN_TOL_M > floorY) continue;
        const hf = heightAt(front[0], front[1]);
        if (hf !== null && hf - TERRAIN_TOL_M > floorY) continue; // фасад закопаний у схил
      }
      const rotDeg = rotDegFromOutward(e.n);
      return {
        key: req.key, plateId: plate.id, edgeIndex: e.index, width: w, roomDepth: depth, terraceDepth: td,
        center, rotDeg, outward: e.n, orientation: orientationFromOutward(e.n),
        footprint, room: [edgePoint(e, s, 0), edgePoint(e, s + w, 0), edgePoint(e, s + w, depth), edgePoint(e, s, depth)],
      };
    }
  }
  return null;
}

/**
 * Розкладає відсіки вздовж зовнішніх контурів плит (у заданому порядку плит).
 * Ребра обходяться по колу, починаючи з того, що найбільше дивиться вниз по схилу (ASSUMED).
 * Запити беруться по черзі; якщо поточний не влазить на ребро — переходимо до наступного ребра.
 */
export function packPerimeter(plates: Plate[], floorY: number, requests: CompartmentRequest[], opts: PackOptions = {}) {
  const depths = opts.depths ?? [ROOM_DEPTH_M, ROOM_DEPTH_FALLBACK_M];
  const step = opts.step ?? SLIDE_STEP_M;
  const checkTerrain = opts.checkTerrain ?? true;
  const placedAll: Compartment[] = [...(opts.existing ?? [])];
  const placed: Compartment[] = [];
  const queue = [...requests];

  for (const plate of plates) {
    if (queue.length === 0) break;
    const edges = plateEdges(plate);
    if (edges.length === 0) continue;
    const others = plates.filter((p) => p !== plate);
    let start = 0, best = -Infinity;
    edges.forEach((e, i) => { const d = e.n[0] * DOWNHILL[0] + e.n[1] * DOWNHILL[1]; if (d > best) { best = d; start = i; } });
    for (let k = 0; k < edges.length && queue.length; k++) {
      const e = edges[(start + k) % edges.length];
      let s = 0;
      while (queue.length) {
        const c = tryPlaceOnEdge(plate, e, queue[0], s, floorY, placedAll, depths, step, checkTerrain, others);
        if (!c) break;
        placed.push(c); placedAll.push(c); queue.shift();
        // наступний відсік — одразу за цим (s кінця = проєкція на ребро)
        const endPt = c.room[1];
        s = (endPt[0] - e.a[0]) * e.t[0] + (endPt[1] - e.a[1]) * e.t[1];
      }
    }
  }
  return { placed, unplaced: queue };
}

/** кластеризація плит у «корпуси» за близькістю центроїдів (ASSUMED радіус 15 м) */
export function clusterPlates(plates: Plate[], radius = 15): Map<string, number> {
  const centers: Vec2[] = [];
  const map = new Map<string, number>();
  for (const p of plates) {
    const c = polygonCentroid(p.outer);
    let idx = centers.findIndex((q) => Math.hypot(q[0] - c[0], q[1] - c[1]) <= radius);
    if (idx < 0) { centers.push(c); idx = centers.length - 1; }
    map.set(p.id, idx);
  }
  return map;
}

export const buildingLetter = (i: number) => String.fromCharCode(65 + (i % 26)) + (i >= 26 ? String(Math.floor(i / 26)) : "");
