/**
 * Генератор юнітів:  cd mayot-sales && npx tsx scripts/generate-units.ts
 *
 *  → data/units.sketch.json  149 номерів ескізу Stage 3 (BIMx-зони «Номер») як периметральні
 *                            відсіки на реальних плитах перекриттів (data/floorplates.json).
 *  → data/units.poa.json     213 юнітів POA: S3 (135, POA_TYPES) на тих самих плитах тим самим
 *                            методом; S1A/S2 — з data/masterplan.json, якщо він є, інакше
 *                            процедурний fallback (коробки вгору по схилу вздовж UPHILL_XZ).
 *
 * Плита поверху = плита, ВЕРХ якої (y0 + h) збігається з рівнем підлоги поверху з meta.json
 * (scripts/extract-sketch.py підписує плиту поверхом, що містить її НИЗ: «6 ПОВЕРХ» → верх 78.02 = «Рівень +39.0»).
 * Позиція юніта: y = y0 + h плити = рівень підлоги поверху.
 *
 * Змінні середовища (для тестів; за замовчуванням не потрібні):
 *   MASTERPLAN_JSON=<шлях>  — інший masterplan.json замість data/masterplan.json
 *   UNITS_OUT_DIR=<тека>    — куди писати units.*.json (за замовч. data/)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { META, heightAt, defaultEnvelope, envelopeAxes, envelopePoint, ENVELOPE, type Vec2 } from "@/lib/geo";
import {
  BASE_PRICE_PER_M2, POA_ANCHOR_SELLABLE_M2, POA_TYPES, TERRACE_COEF, sellable, totals,
  type Orientation, type Stage, type Unit, type UnitsFile, type View,
} from "@/lib/units";
import {
  buildingLetter, clusterPlates, orientationFromOutward, outwardFromOrientation, outwardFromRotDeg, packPerimeter,
  parsePlates, platesAtLevel, polygonArea, polygonsIntersect, rectPoly, rotDegFromOutward, terraceDepth,
  ROOM_DEPTH_M, UNIT_HEIGHT_M, type Compartment, type CompartmentRequest, type Plate,
} from "@/lib/units-gen";

const ROOT = resolve(__dirname, "..");
const DATA = resolve(ROOT, "data");
const OUT_DIR = process.env.UNITS_OUT_DIR ? resolve(process.env.UNITS_OUT_DIR) : DATA;
const MASTERPLAN_PATH = process.env.MASTERPLAN_JSON ? resolve(process.env.MASTERPLAN_JSON) : resolve(DATA, "masterplan.json");
const readJson = <T,>(name: string): T => JSON.parse(readFileSync(resolve(DATA, name), "utf8")) as T;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** bbox ескізу Stage 3 у сцені (GLB) — як sketchBox у сторі; ТЗ */
const SKETCH_BOX = { min: [113.8, -335.3] as Vec2, max: [263.1, -99.4] as Vec2 };
const LEVEL_H_FALLBACK = 3.3;   // ТЗ: рівні по 3.3 м (fallback S1A/S2)
const PLINTH_M = 0.3;           // ASSUMED: підлога 1-го рівня fallback-корпусу над тереном у центрі сліду
const BLOCK_GAP_M = 8;          // ASSUMED: розрив між корпусами в ряду
const CHALET_GAP_M = 3;         // ASSUMED: розрив між шале
const ROW_ACROSS_CENTER = ENVELOPE.left + ENVELOPE.center / 2; // 56 м: вісь центральної смуги конверта

const issues: string[] = [];
const log = (...a: unknown[]) => console.log(...a);

/* ---------------- вхідні дані ---------------- */

type Zone = { guid: string; id: string; category: string; floor: number; storey: string; elev: number; area_m2: number };
const zonesFile = readJson<{ zones: Zone[] }>("sketch-zones.json");
const rooms = zonesFile.zones.filter((z) => z.category === "Номер");
const plates = parsePlates(readJson<unknown>("floorplates.json"));

/** поверхи з номерами, знизу вгору; floorIdx 1..N (ASSUMED: нумерація «поверх у корпусі» знизу) */
const roomStoreys = Array.from(new Set(rooms.map((z) => z.storey)))
  .map((name) => {
    const st = META.storeys.find((s) => s.name === name);
    if (!st) throw new Error(`storey ${name} відсутній у meta.json`);
    return { name, elev: st.elev, y: st.y };
  })
  .sort((a, b) => a.y - b.y)
  .map((s, i) => ({ ...s, floorIdx: i + 1 }));

const levelPlates = new Map<string, Plate[]>();
for (const s of roomStoreys) {
  const ps = platesAtLevel(plates, s.y);
  if (ps.length === 0) {
    // fallback: плити, підписані цим поверхом (їх верх — рівень поверху вище)
    const byLabel = plates.filter((p) => p.storey === s.name).sort((a, b) => polygonArea(b.outer) - polygonArea(a.outer));
    issues.push(`${s.name}: немає плити з верхом на y=${s.y.toFixed(2)}, взято плити за підписом (${byLabel.length})`);
    levelPlates.set(s.name, byLabel);
  } else levelPlates.set(s.name, ps);
}
const usedPlates = roomStoreys.flatMap((s) => levelPlates.get(s.name)!);
const plateById = new Map(usedPlates.map((p) => [p.id, p] as const));
const clusters = clusterPlates(usedPlates);
const buildingOf = (plateId: string) => buildingLetter(clusters.get(plateId) ?? 0);
/** підлога юніта = верх плити (y0 + h), ТЗ */
const floorYOfPlate = (plateId: string, fallbackY: number) => { const p = plateById.get(plateId); return p ? p.y0 + p.h : fallbackY; };

/* ---------------- спільні хелпери ---------------- */

/** ASSUMED: вид за орієнтацією; «waterworld» — два нижні рівні S3, що дивляться вниз по схилу (аквапарк біля підніжжя ескізу) */
function viewFor(stage: Stage, orientation: Orientation, floorIdx: number): View {
  const down = orientation === "S" || orientation === "SE" || orientation === "SW";
  if (stage === "S3" && down && floorIdx <= 2) return "waterworld";
  if (down) return "valley";
  if (orientation === "E" || orientation === "W") return "forest";
  return "ridge";
}

interface UnitSeed {
  stage: Stage; building: string; floor: number; storey: string; type: string;
  net: number; terrace: number; orientation: Orientation;
  position: [number, number, number]; size: [number, number, number]; rotDeg: number;
  dataset: Unit["dataset"]; source: Unit["source"]; zoneId?: string;
}

const counters = new Map<string, number>();
function makeUnit(s: UnitSeed): Unit {
  const k = `${s.dataset}|${s.stage}|${s.building}|${s.floor}`;
  const idx = (counters.get(k) ?? 0) + 1;
  counters.set(k, idx);
  const net = +s.net.toFixed(2), terrace = +s.terrace.toFixed(1);
  const sell = sellable(net, terrace);
  return {
    id: `${s.stage}-${s.building}-${s.floor}-${String(idx).padStart(2, "0")}`,
    stage: s.stage, building: s.building, floor: s.floor, storey: s.storey, type: s.type,
    net_m2: net, terrace_m2: terrace, terrace_coef: TERRACE_COEF, sellable_m2: sell,
    orientation: s.orientation, view: viewFor(s.stage, s.orientation, s.floor),
    price_per_m2: BASE_PRICE_PER_M2, price: Math.round(sell * BASE_PRICE_PER_M2),
    wave: 3, status: "available", held_until: null, token: null,
    position: s.position, size: s.size, rotDeg: r2(s.rotDeg),
    dataset: s.dataset, source: s.source, ...(s.zoneId ? { zoneId: s.zoneId } : {}),
  };
}

/** хвилі: перші 30 % юнітів стадії (за id) = 1, наступні 40 % = 2, решта = 3 (ТЗ) */
function assignWaves(units: Unit[]) {
  for (const stage of ["S1A", "S2", "S3"] as Stage[]) {
    const list = units.filter((u) => u.stage === stage).sort((a, b) => a.id.localeCompare(b.id));
    const n1 = Math.round(list.length * 0.3), n2 = Math.round(list.length * 0.7);
    list.forEach((u, i) => { u.wave = i < n1 ? 1 : i < n2 ? 2 : 3; });
  }
}

function seedFromCompartment(
  c: Compartment, storey: (typeof roomStoreys)[number], dataset: Unit["dataset"], type: string,
  net: number, terrace: number, source: Unit["source"], zoneId?: string,
): UnitSeed {
  return {
    stage: "S3", building: buildingOf(c.plateId), floor: storey.floorIdx, storey: storey.name, type,
    net, terrace, orientation: c.orientation,
    position: [r3(c.center[0]), r3(floorYOfPlate(c.plateId, storey.y)), r3(c.center[1])],
    size: [r2(c.width), r2(c.roomDepth + c.terraceDepth), UNIT_HEIGHT_M],
    rotDeg: c.rotDeg, dataset, source, zoneId,
  };
}

/* ---------------- 1) датасет «sketch» ---------------- */

function generateSketch(): UnitsFile {
  const units: Unit[] = [];
  let carry: (CompartmentRequest & { zone: Zone })[] = [];
  const placedByLevel = new Map<string, Compartment[]>();
  for (const st of roomStoreys) {
    const own = rooms.filter((z) => z.storey === st.name).sort((a, b) => a.id.localeCompare(b.id))
      .map((z) => ({ key: z.guid, net: z.area_m2, terrace: 0, zone: z }));
    const reqs = [...own, ...carry];
    const { placed, unplaced } = packPerimeter(levelPlates.get(st.name)!, st.y, reqs);
    placedByLevel.set(st.name, placed);
    const byKey = new Map(reqs.map((r) => [r.key, r]));
    for (const c of placed) {
      const z = byKey.get(c.key)!.zone;
      units.push(makeUnit(seedFromCompartment(c, st, "sketch", "Room", z.area_m2, 0, "zone", z.guid)));
    }
    const ownUnplaced = unplaced.filter((r) => (r as typeof own[number]).zone.storey === st.name).length;
    const plateIds = Array.from(new Set(placed.map((c) => c.plateId)));
    log(`  sketch ${st.name.padEnd(11)} y=${st.y.toFixed(2)}  номерів ${own.length}${carry.length ? ` (+${carry.length} перенесених)` : ""} → розкладено ${placed.length}, не вмістилось ${unplaced.length}; плит ${plateIds.length} [${plateIds.map(buildingOf).join(",")}]`);
    if (ownUnplaced) issues.push(`sketch ${st.name}: ${ownUnplaced} номер(ів) не вмістилось на контурах плит рівня — перенесено на наступний рівень`);
    carry = unplaced as typeof reqs;
  }
  if (carry.length) issues.push(`sketch: ${carry.length} номер(ів) не вмістилось узагалі (пропущено): ${carry.map((r) => r.zone.id).join(", ")}`);
  assignWaves(units);
  return {
    dataset: "sketch",
    generatedFrom: "floorplates.json (периметральні відсіки на плитах рівня, глибина 7.5/6.5 м) + sketch-zones.json (площі зон «Номер»); тераси 0",
    totals: totals(units), units,
  };
}

/* ---------------- 2) датасет «poa» — S3 ---------------- */

function generatePoaS3(): Unit[] {
  const types = POA_TYPES.S3;
  const total = types.reduce((s, t) => s + t.count, 0);
  // кількість на поверх ∝ кількості номерів ескізу (найбільші залишки) — ASSUMED
  const cnt = roomStoreys.map((s) => rooms.filter((z) => z.storey === s.name).length);
  const sum = cnt.reduce((a, b) => a + b, 0);
  const raw = cnt.map((c) => (c * total) / sum);
  const alloc = raw.map(Math.floor);
  let rest = total - alloc.reduce((a, b) => a + b, 0);
  raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]).slice(0, rest).forEach(([, i]) => alloc[i]++);
  // типи: Chalet80 — найнижчі рівні, XL65 — верхні, Family50 — решта (ASSUMED)
  const chalet = types.find((t) => t.type === "Chalet80")!, xl = types.find((t) => t.type === "XL65")!, fam = types.find((t) => t.type === "Family50")!;
  const slots: { storey: (typeof roomStoreys)[number]; t: typeof chalet }[] = [];
  roomStoreys.forEach((s, i) => { for (let k = 0; k < alloc[i]; k++) slots.push({ storey: s, t: fam }); });
  for (let i = 0; i < chalet.count; i++) slots[i].t = chalet;
  for (let i = 0; i < xl.count; i++) slots[slots.length - 1 - i].t = xl;

  const units: Unit[] = [];
  const placedByLevel = new Map<string, Compartment[]>();
  const reqMeta = new Map<string, { t: typeof chalet }>();
  let carry: CompartmentRequest[] = [];
  const emit = (placed: Compartment[], st: (typeof roomStoreys)[number]) => {
    for (const c of placed) {
      const t = reqMeta.get(c.key)!.t;
      units.push(makeUnit(seedFromCompartment(c, st, "poa", t.type, t.net, t.terrace, "generated")));
    }
  };
  for (const st of roomStoreys) {
    const own = slots.filter((s) => s.storey === st).map((s, i) => {
      const key = `${st.name}#${i}`; reqMeta.set(key, { t: s.t });
      return { key, net: s.t.net, terrace: s.t.terrace };
    });
    const reqs = [...own, ...carry];
    const { placed, unplaced } = packPerimeter(levelPlates.get(st.name)!, st.y, reqs);
    placedByLevel.set(st.name, placed);
    emit(placed, st);
    log(`  poa    ${st.name.padEnd(11)} y=${st.y.toFixed(2)}  слотів ${own.length}${carry.length ? ` (+${carry.length})` : ""} → розкладено ${placed.length}, залишок ${unplaced.length}`);
    if (unplaced.length) issues.push(`poa S3 ${st.name}: ${unplaced.length} × ${Array.from(new Set(unplaced.map((r) => reqMeta.get(r.key)!.t.type))).join("/")} не вмістилось на відкритих (незакопаних) ребрах рівня — перенесено на наступний рівень`);
    carry = unplaced;
  }
  if (carry.length) {
    // другий прохід: залишок — на будь-який рівень із вільним контуром (знизу вгору)
    for (const st of roomStoreys) {
      if (!carry.length) break;
      const { placed, unplaced } = packPerimeter(levelPlates.get(st.name)!, st.y, carry, { existing: placedByLevel.get(st.name) });
      placedByLevel.get(st.name)!.push(...placed);
      emit(placed, st);
      if (placed.length) issues.push(`poa S3: ${placed.length} юніт(ів) перенесено на ${st.name} (2-й прохід)`);
      carry = unplaced;
    }
  }
  if (carry.length) issues.push(`poa S3: ${carry.length} юніт(ів) не вмістилось узагалі: ${carry.map((r) => reqMeta.get(r.key)!.t.type).join(", ")}`);
  return units;
}

/* ---------------- 2) датасет «poa» — S1A / S2 ---------------- */

/** data/masterplan.json (lib/masterplan.ts іншого агента) — читаємо лише потрібну підмножину полів */
type MpUnit = {
  type: string; position: [number, number, number]; size: [number, number, number]; rotDeg: number;
  orientation?: string; facing_xz?: [number, number]; terrace_m2?: number;
};
type MpLevel = { index?: number; y: number; footprint: number[][]; units: MpUnit[] };
type MpBuilding = { id: string; kind?: string; levels: MpLevel[] };
type Masterplan = { stages: Partial<Record<"S1A" | "S2", { buildings: MpBuilding[] }>> };

const ORIENTATIONS: Orientation[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

function fromMasterplan(stage: "S1A" | "S2", mp: Masterplan): { units: Unit[]; missing: { type: string; count: number }[] } {
  const pool = new Map<string, UnitSeed[]>();
  for (const b of mp.stages[stage]?.buildings ?? []) {
    const stripped = b.id.replace(new RegExp(`^${stage}-?`), "") || b.id;
    const building = b.kind === "chalet" || /^CH\d*$/i.test(stripped) ? "Chalet" : stripped;
    // рівні знизу вгору (у masterplan.json index 0 = ВЕРХНІЙ рівень корпусу) → floor 1 = найнижчий
    const levels = [...(b.levels ?? [])].sort((a, c) => a.y - c.y);
    levels.forEach((lvl, k) => {
      for (const u of lvl.units ?? []) {
        const t = POA_TYPES[stage].find((q) => q.type === u.type);
        if (!t) { issues.push(`masterplan ${stage}/${b.id}: невідомий тип ${u.type} — пропущено`); continue; }
        // напрямок тераси: facing_xz → orientation → локальна +Z за rotDeg; далі rotDeg нормуємо
        // до конвенції lib/units-gen.ts (локальна +Z = назовні/тераса), ширина лишається вздовж фасаду
        const facing: Vec2 =
          (Array.isArray(u.facing_xz) && Math.hypot(u.facing_xz[0], u.facing_xz[1]) > 1e-6
            ? [u.facing_xz[0] / Math.hypot(u.facing_xz[0], u.facing_xz[1]), u.facing_xz[1] / Math.hypot(u.facing_xz[0], u.facing_xz[1])] as Vec2
            : null) ??
          (u.orientation ? outwardFromOrientation(u.orientation) : null) ??
          outwardFromRotDeg(u.rotDeg ?? 0);
        const orientation = ORIENTATIONS.includes(u.orientation as Orientation) ? (u.orientation as Orientation) : orientationFromOutward(facing);
        const seed: UnitSeed = {
          stage, building, floor: k + 1, storey: `${stage}-L${k + 1}`, type: t.type, net: t.net,
          terrace: t.terrace, orientation,   // net/тераса — FIXED за POA_TYPES (anchor); фізична тераса лишається в masterplan.json
          position: [r3(u.position[0]), r3(u.position[1] ?? lvl.y), r3(u.position[2])],
          size: [r2(u.size[0]), r2(u.size[1]), r2(u.size[2] ?? UNIT_HEIGHT_M)], rotDeg: rotDegFromOutward(facing),
          dataset: "poa", source: "generated",
        };
        if (!pool.has(t.type)) pool.set(t.type, []);
        pool.get(t.type)!.push(seed);
      }
    });
  }
  const units: Unit[] = [];
  const missing: { type: string; count: number }[] = [];
  for (const t of POA_TYPES[stage]) {
    const have = pool.get(t.type) ?? [];
    have.slice(0, t.count).forEach((s) => units.push(makeUnit(s)));
    if (have.length < t.count) missing.push({ type: t.type, count: t.count - have.length });
    if (have.length > t.count) issues.push(`masterplan ${stage}: ${t.type} ${have.length} > ${t.count} за POA_TYPES — зайві пропущено`);
  }
  return { units, missing };
}

/** chainage/across точки XZ у конверті ТЗ (ch.0 — нижній край ескізу, вгору по схилу) */
const ENV = defaultEnvelope(SKETCH_BOX);
const AXES = envelopeAxes(ENV);
const chainageOf = (p: Vec2) => (p[0] - ENV.cx) * AXES.u[0] + (p[1] - ENV.cz) * AXES.u[1] + ENVELOPE.length / 2;

/** локальний напрямок «вниз по схилу» (одиничний, XZ) з різниць висот ±r м; fallback — −u конверта.
 *  ASSUMED: база різниць r = 10 м; ухил < 2 % вважаємо плоским (беремо вісь конверта) */
function localDownhill(x: number, z: number, r = 10): Vec2 {
  const hx1 = heightAt(x + r, z), hx0 = heightAt(x - r, z), hz1 = heightAt(x, z + r), hz0 = heightAt(x, z - r);
  if (hx1 === null || hx0 === null || hz1 === null || hz0 === null) return [-AXES.u[0], -AXES.u[1]];
  const gx = (hx1 - hx0) / (2 * r), gz = (hz1 - hz0) / (2 * r);
  const g = Math.hypot(gx, gz);
  if (g < 0.02) return [-AXES.u[0], -AXES.u[1]];
  return [-gx / g, -gz / g];
}

/** сліди 1-го рівня вже розкладених fallback-корпусів (S1A і S2 не мають перетинатися) */
const fallbackFootprints: Vec2[][] = [];

let s2c0Cache: number | null = null;
function s2Chainage0(): number {
  if (s2c0Cache !== null) return s2c0Cache;
  const s3Max = Math.max(...usedPlates.flatMap((p) => p.outer.map(chainageOf)));
  s2c0Cache = Math.max(200, s3Max + 8);            // не накладатися на верхні плити ескізу
  if (s2c0Cache > 200) issues.push(`fallback S2: смугу chainage зсунуто з 200 на ${s2c0Cache.toFixed(0)} м, бо плити ескізу сягають chainage ${s3Max.toFixed(0)}`);
  return s2c0Cache;
}

/**
 * Fallback S1A/S2 (ASSUMED усе, крім смуг chainage і кроку рівнів із ТЗ):
 * ряди корпусів-коробок упоперек конверта; кожен ряд повернуто вздовж ЛОКАЛЬНОЇ горизонталі
 * терену (фасади/тераси — вниз по локальному схилу ≈ SE), рівні по 3.3 м; підлога 1-го рівня
 * корпусу — над найвищою точкою терену під центрами його юнітів (+PLINTH_M).
 * Корпус: n рівнів × набір типів у ряд уздовж фасаду; шале — окремі однорівневі коробки.
 */
function fallbackStage(stage: "S1A" | "S2", need: { type: string; count: number }[]): Unit[] {
  const s2c0 = s2Chainage0();
  const tdef = (type: string) => POA_TYPES[stage].find((t) => t.type === type)!;
  const remaining = new Map(need.map((n) => [n.type, n.count]));
  const take = (type: string, n: number) => { const k = Math.min(n, remaining.get(type) ?? 0); remaining.set(type, (remaining.get(type) ?? 0) - k); return k; };

  type Row = { cBack: number; blocks: { building: string; levels: number; types: string[] }[]; gap: number };
  const rows: Row[] = [];
  if (stage === "S2") {
    const blocks: Row["blocks"] = [];
    for (const b of ["A", "B"]) {
      const perLevel: string[] = [];
      const std = Math.ceil(take("Std40", 18) / 3), dlx = Math.ceil(take("Dlx50", 3) / 3);
      for (let i = 0; i < std; i++) perLevel.push("Std40");
      for (let i = 0; i < dlx; i++) perLevel.push("Dlx50");
      if (perLevel.length) blocks.push({ building: b, levels: 3, types: perLevel });
    }
    // ASSUMED: корпуси A/B — на 10 м вище початку смуги S2 (ТЗ: chainage 200–320)
    if (blocks.length) rows.push({ cBack: s2c0 + 10, blocks, gap: BLOCK_GAP_M });
    const nCh = take("Chalet80", 6);
    // ASSUMED: шале — верхній ряд смуги S2 (+55 м, задня стіна ≤ 318), щоб не дивитись у спину корпусам A/B
    if (nCh) rows.push({ cBack: Math.min(s2c0 + 55, 318), blocks: Array.from({ length: nCh }, () => ({ building: "Chalet", levels: 1, types: ["Chalet80"] })), gap: CHALET_GAP_M });
  } else {
    const blocks: Row["blocks"] = [];
    for (const b of ["A", "B"]) {
      const perLevel: string[] = [];
      const s = Math.ceil(take("S42", 12) / 3), m = Math.ceil(take("M52", 3) / 3);
      for (let i = 0; i < s; i++) perLevel.push("S42");
      for (let i = 0; i < m; i++) perLevel.push("M52");
      if (perLevel.length) blocks.push({ building: b, levels: 3, types: perLevel });
    }
    if (blocks.length) rows.push({ cBack: 345, blocks, gap: BLOCK_GAP_M }); // ASSUMED: задня стіна S1A на chainage 345 (ТЗ: смуга 320–400)
  }
  remaining.forEach((n, t) => { if (n > 0) issues.push(`fallback ${stage}: ${n} × ${t} не розміщено`); });

  const units: Unit[] = [];
  const budget = new Map(need.map((n) => [n.type, n.count]));

  /** розкладка ряду при заданому chainage задньої стіни (без зміни бюджету) */
  const layoutRow = (row: Row, cBack: number): UnitSeed[] => {
    const seeds: UnitSeed[] = [];
    const b2 = new Map(budget);
    const widths = row.blocks.map((b) => b.types.reduce((s, t) => s + tdef(t).net / ROOM_DEPTH_M, 0));
    const total = widths.reduce((a, b) => a + b, 0) + row.gap * (row.blocks.length - 1);
    // вісь ряду: центр — на осі конверта, напрямок — локальна горизонталь терену (ASSUMED)
    const rc = envelopePoint(ENV, cBack - ROOM_DEPTH_M / 2, ROW_ACROSS_CENTER);
    const down = localDownhill(rc[0], rc[1]);
    // уздовж ряду від LEFT до RIGHT (як w конверта): перпендикуляр до down з тим самим знаком, що й AXES.w
    let along: Vec2 = [-down[1], down[0]];
    if (along[0] * AXES.w[0] + along[1] * AXES.w[1] < 0) along = [-along[0], -along[1]];
    const rotDeg = rotDegFromOutward(down), orientation = orientationFromOutward(down);
    const at = (dBack: number, s: number): Vec2 => [rc[0] + down[0] * dBack + along[0] * s, rc[1] + down[1] * dBack + along[1] * s];
    let across = -total / 2;
    row.blocks.forEach((b, bi) => {
      const bw = widths[bi];
      // підлога 1-го рівня: над найвищим тереном під центрами юнітів корпусу
      let hMax = -Infinity, a0 = across;
      for (const type of b.types) {
        const t = tdef(type), w = t.net / ROOM_DEPTH_M, td = terraceDepth(t.terrace, w);
        const [px, pz] = at(td / 2, a0 + w / 2);
        const h = heightAt(px, pz);
        if (h === null) throw new Error(`fallback ${stage}: терен відсутній під корпусом ${b.building}`);
        hMax = Math.max(hMax, h); a0 += w;
      }
      const baseY = hMax + PLINTH_M;
      for (let k = 0; k < b.levels; k++) {
        let a = across;
        for (const type of b.types) {
          const t = tdef(type);
          if ((b2.get(type) ?? 0) <= 0) { a += t.net / ROOM_DEPTH_M; continue; }
          b2.set(type, b2.get(type)! - 1);
          const w = t.net / ROOM_DEPTH_M, td = terraceDepth(t.terrace, w);
          // rc — центр смуги кімнат (±3.75 м); слід = кімната + тераса назовні, тож його центр зсунуто на td/2 вниз по схилу
          const [px, pz] = at(td / 2, a + w / 2);
          seeds.push({
            stage, building: b.building, floor: k + 1, storey: `${stage}-L${k + 1}`, type, net: t.net, terrace: t.terrace,
            orientation, position: [r3(px), r3(baseY + k * LEVEL_H_FALLBACK), r3(pz)],
            size: [r2(w), r2(ROOM_DEPTH_M + td), UNIT_HEIGHT_M], rotDeg, dataset: "poa", source: "generated",
          });
          a += w;
        }
      }
      across += bw + row.gap;
    });
    return seeds;
  };
  const footprint = (s: UnitSeed) => rectPoly([s.position[0], s.position[2]], s.size[0], s.size[1], s.rotDeg);
  const inScene = (s: UnitSeed) => {
    const b = META.scene_bbox;
    return footprint(s).every((p) => p[0] >= b.min[0] && p[0] <= b.max[0] && p[1] >= b.min[2] && p[1] <= b.max[2]);
  };
  for (const row of rows) {
    // ряд не має накладатися на плити ескізу (усі рівні) і на вже розкладені fallback-корпуси;
    // інакше — крок 4 м угору, до 25 спроб (ASSUMED)
    let cBack = row.cBack, seeds: UnitSeed[] = [];
    for (let tries = 0; tries < 25; tries++, cBack += 4) {
      seeds = layoutRow(row, cBack);
      const fps = seeds.filter((s) => s.floor === 1).map(footprint);
      const hitPlate = fps.some((f) => usedPlates.some((p) => polygonsIntersect(f, p.outer)));
      const hitPrev = fps.some((f) => fallbackFootprints.some((g) => polygonsIntersect(f, g)));
      if (!hitPlate && !hitPrev && seeds.every(inScene)) break;
      seeds = [];
    }
    if (!seeds.length) throw new Error(`fallback ${stage}: ряд (cBack ${row.cBack}) не вдалося розмістити без накладань`);
    if (cBack !== row.cBack) issues.push(`fallback ${stage}: ряд ${row.blocks.map((b) => b.building).filter((v, i, a) => a.indexOf(v) === i).join("/")} зсунуто вгору з chainage ${row.cBack.toFixed(0)} на ${cBack.toFixed(0)} м (накладання на плити ескізу / інший ряд)`);
    for (const s of seeds) { budget.set(s.type, budget.get(s.type)! - 1); units.push(makeUnit(s)); }
    fallbackFootprints.push(...seeds.filter((s) => s.floor === 1).map(footprint));
  }
  return units;
}

function generatePoa(): UnitsFile {
  const s3 = generatePoaS3();
  let mp: Masterplan | null = null;
  if (existsSync(MASTERPLAN_PATH)) {
    try { mp = JSON.parse(readFileSync(MASTERPLAN_PATH, "utf8")) as Masterplan; }
    catch (e) { issues.push(`masterplan: ${MASTERPLAN_PATH} не читається (${(e as Error).message}) — fallback`); }
  }
  const rest: Unit[] = [];
  const srcNotes: string[] = [];
  for (const stage of ["S1A", "S2"] as const) {
    if (mp?.stages?.[stage]?.buildings?.length) {
      const { units, missing } = fromMasterplan(stage, mp);
      rest.push(...units);
      if (missing.length) {
        issues.push(`masterplan ${stage}: бракує ${missing.map((m) => `${m.count}×${m.type}`).join(", ")} — добрано fallback`);
        rest.push(...fallbackStage(stage, missing));
        srcNotes.push(`${stage}: masterplan.json + fallback`);
      } else srcNotes.push(`${stage}: masterplan.json`);
    } else {
      rest.push(...fallbackStage(stage, POA_TYPES[stage].map((t) => ({ type: t.type, count: t.count }))));
      srcNotes.push(`${stage}: fallback`);
    }
  }
  const units = [...rest.filter((u) => u.stage === "S1A"), ...rest.filter((u) => u.stage === "S2"), ...s3];

  // ASSERT: Σ sellable ∈ anchor ±3 %; інакше — корекція net у межах ±5 % (anchor не чіпаємо)
  const sum = units.reduce((s, u) => s + u.sellable_m2, 0);
  const delta = sum - POA_ANCHOR_SELLABLE_M2;
  log(`  poa Σ sellable = ${sum.toFixed(1)} м² (anchor ${POA_ANCHOR_SELLABLE_M2}, Δ ${delta >= 0 ? "+" : ""}${delta.toFixed(1)} = ${((100 * delta) / POA_ANCHOR_SELLABLE_M2).toFixed(2)} %)`);
  if (Math.abs(delta) > 0.03 * POA_ANCHOR_SELLABLE_M2) {
    const terr = units.reduce((s, u) => s + u.terrace_m2 * TERRACE_COEF, 0);
    const netSum = units.reduce((s, u) => s + u.net_m2, 0);
    const f = Math.min(1.05, Math.max(0.95, (POA_ANCHOR_SELLABLE_M2 - terr) / netSum));
    for (const u of units) {
      u.net_m2 = +(u.net_m2 * f).toFixed(1);
      u.sellable_m2 = sellable(u.net_m2, u.terrace_m2);
      u.price = Math.round(u.sellable_m2 * u.price_per_m2);
    }
    const sum2 = units.reduce((s, u) => s + u.sellable_m2, 0);
    log(`  poa корекція net ×${f.toFixed(4)} → Σ sellable = ${sum2.toFixed(1)} м² (Δ ${(sum2 - POA_ANCHOR_SELLABLE_M2).toFixed(1)})`);
    issues.push(`poa: Σ sellable ${sum.toFixed(1)} поза ±3 % від ${POA_ANCHOR_SELLABLE_M2}; net скориговано ×${f.toFixed(4)} → ${sum2.toFixed(1)}`);
  }
  assignWaves(units);
  const gen = `S3: floorplates.json (периметральні відсіки на плитах рівня, POA_TYPES, тераса назовні від ребра); ${srcNotes.join("; ")}`;
  return {
    dataset: "poa",
    generatedFrom: srcNotes.every((s) => s.endsWith("masterplan.json")) ? gen : `fallback — ${gen}`,
    anchor_sellable_m2: POA_ANCHOR_SELLABLE_M2,
    totals: totals(units), units,
  };
}

/* ---------------- main ---------------- */

log(`Плити: ${plates.length}; поверхи з номерами: ${roomStoreys.map((s) => `${s.name}(${s.floorIdx})`).join(", ")}`);
for (const st of roomStoreys) {
  const ps = levelPlates.get(st.name)!;
  log(`  ${st.name.padEnd(11)} y=${st.y.toFixed(2)}: ${ps.map((p) => `${buildingOf(p.id)}:${polygonArea(p.outer).toFixed(0)}м²`).join(" ")}`);
}
log("— sketch —");
const sketch = generateSketch();
log("— poa —");
const poa = generatePoa();

const check = (f: UnitsFile) => {
  const bad = f.units.filter((u) => {
    const [x, y, z] = u.position; const b = META.scene_bbox;
    const h = heightAt(x, z);
    return x < b.min[0] || x > b.max[0] || z < b.min[2] || z > b.max[2] || y < b.min[1] || y > b.max[1] || h === null || y < h - 1;
  });
  if (bad.length) issues.push(`${f.dataset}: ${bad.length} юніт(ів) поза bbox/під тереном: ${bad.slice(0, 5).map((u) => u.id).join(", ")}`);
};
check(sketch); check(poa);

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(resolve(OUT_DIR, "units.sketch.json"), JSON.stringify(sketch, null, 1));
writeFileSync(resolve(OUT_DIR, "units.poa.json"), JSON.stringify(poa, null, 1));
if (OUT_DIR !== DATA) log(`→ ${OUT_DIR}`);
log(`sketch: ${sketch.totals.keys} юнітів, net ${sketch.totals.net_m2} м², sellable ${sketch.totals.sellable_m2} м²`);
log(`poa:    ${poa.totals.keys} юнітів (${(["S1A", "S2", "S3"] as Stage[]).map((s) => `${s}=${poa.units.filter((u) => u.stage === s).length}`).join(", ")}), net ${poa.totals.net_m2}, terrace ${poa.totals.terrace_m2}, sellable ${poa.totals.sellable_m2} м², revenue ${poa.totals.revenue_usd.toLocaleString("en-US")} USD; ${poa.generatedFrom}`);
if (issues.length) { log("ISSUES:"); issues.forEach((i) => log("  - " + i)); } else log("ISSUES: немає");
