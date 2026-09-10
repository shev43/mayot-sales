/**
 * Тести генератора юнітів (scripts/generate-units.ts → data/units.sketch.json, data/units.poa.json)
 * і його геометрії (lib/units-gen.ts). Запуск: npx vitest run tests/units.test.ts
 *
 * Перевіряємо ЗГЕНЕРОВАНІ файли у data/ (контракт lib/units.ts), геометрію відсіків проти
 * data/floorplates.json / терену, а також запуск генератора з синтетичним masterplan.json
 * (гілка S1A/S2 «з мастерплану») у тимчасову теку.
 */
import { describe, it, expect, afterAll } from "vitest";
import { execFileSync } from "child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { fileURLToPath } from "url";
import { META, heightAt, defaultEnvelope, envelopePoint } from "@/lib/geo";
import {
  BASE_PRICE_PER_M2, POA_ANCHOR_SELLABLE_M2, POA_TYPES, TERRACE_COEF, sellable, totals,
  type Stage, type Unit, type UnitsFile,
} from "@/lib/units";
import {
  MIN_TERRACE_DEPTH_M, orientationFromOutward, outwardFromRotDeg, packPerimeter, parsePlates, platesAtLevel,
  pointInPolygon, polygonsIntersect, rectPoly, roomPolyOfUnit, terraceDepth, type Plate,
} from "@/lib/units-gen";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const readJson = <T,>(rel: string): T => JSON.parse(readFileSync(resolve(ROOT, rel), "utf8")) as T;

const sketch = readJson<UnitsFile>("data/units.sketch.json");
const poa = readJson<UnitsFile>("data/units.poa.json");
const plates = parsePlates(readJson<unknown>("data/floorplates.json"));
const zones = readJson<{ zones: { guid: string; category: string; storey: string; area_m2: number }[] }>("data/sketch-zones.json");
const rooms = zones.zones.filter((z) => z.category === "Номер");

const STAGES: Stage[] = ["S1A", "S2", "S3"];
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const within = (v: number, target: number, pct: number) => Math.abs(v - target) <= (pct / 100) * target;
const storeyY = (name: string) => META.storeys.find((s) => s.name === name)?.y;

/* ------------------------------------------------------------------ */
/*  Датасет «sketch» — 149 номерів ескізу Stage 3                       */
/* ------------------------------------------------------------------ */

describe("units.sketch.json", () => {
  it("149 юнітів, Σ net 6 837 ±1 %", () => {
    expect(sketch.dataset).toBe("sketch");
    expect(sketch.units).toHaveLength(149);
    expect(sketch.totals.keys).toBe(149);
    const net = sum(sketch.units.map((u) => u.net_m2));
    expect(within(net, 6837, 1)).toBe(true);
    expect(Math.abs(net - sum(rooms.map((z) => z.area_m2)))).toBeLessThan(0.5); // = Σ площ зон «Номер»
    expect(sketch.totals.terrace_m2).toBe(0);
  });

  it("кожен юніт — це зона BIMx «Номер»: zoneId унікальний, net = площа зони, тераса 0", () => {
    const byGuid = new Map(rooms.map((z) => [z.guid, z]));
    const seen = new Set<string>();
    for (const u of sketch.units) {
      expect(u.zoneId, u.id).toBeTruthy();
      expect(seen.has(u.zoneId!), `дубль zoneId ${u.zoneId}`).toBe(false);
      seen.add(u.zoneId!);
      const z = byGuid.get(u.zoneId!);
      expect(z, `zoneId ${u.zoneId} не є зоною «Номер»`).toBeTruthy();
      expect(u.net_m2).toBeCloseTo(z!.area_m2, 1);
      expect(u.terrace_m2).toBe(0);
      expect(u.type).toBe("Room");
      expect(u.source).toBe("zone");
      expect(u.stage).toBe("S3");
      expect(u.dataset).toBe("sketch");
    }
    expect(seen.size).toBe(rooms.length);
  });

  it("відсік: висота 3 м, ширина × глибина = net, підлога = рівень поверху з meta.json", () => {
    for (const u of sketch.units) {
      const [w, d, h] = u.size;
      expect(h).toBe(3);
      expect(d === 7.5 || d === 6.5, `${u.id}: глибина ${d}`).toBe(true);
      expect(Math.abs(w * d - u.net_m2), `${u.id}: w×d=${w * d} ≠ net ${u.net_m2}`).toBeLessThan(0.3);
      const y = storeyY(u.storey);
      expect(y, `${u.id}: storey ${u.storey} нема у meta.json`).toBeDefined();
      expect(u.position[1]).toBeCloseTo(y!, 1); // y = y0 + h плити = рівень підлоги поверху
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Датасет «poa» — 213 юнітів (S1A 30, S2 48, S3 135)                  */
/* ------------------------------------------------------------------ */

describe("units.poa.json", () => {
  it("213 юнітів, Σ sellable у ±3 % від anchor 11 747", () => {
    expect(poa.dataset).toBe("poa");
    expect(poa.units).toHaveLength(213);
    expect(poa.anchor_sellable_m2).toBe(POA_ANCHOR_SELLABLE_M2);
    const s = sum(poa.units.map((u) => u.sellable_m2));
    expect(within(s, POA_ANCHOR_SELLABLE_M2, 3), `Σ sellable ${s}`).toBe(true);
    expect(within(poa.totals.sellable_m2, POA_ANCHOR_SELLABLE_M2, 3)).toBe(true);
  });

  it("кількість за стадіями/типами = POA_TYPES; тераса за типом, net у межах ±5 % від типу", () => {
    for (const stage of STAGES) {
      const list = poa.units.filter((u) => u.stage === stage);
      expect(list).toHaveLength(sum(POA_TYPES[stage].map((t) => t.count)));
      for (const t of POA_TYPES[stage]) {
        const ofType = list.filter((u) => u.type === t.type);
        expect(ofType, `${stage}/${t.type}`).toHaveLength(t.count);
        for (const u of ofType) {
          expect(u.terrace_m2).toBe(t.terrace);
          expect(within(u.net_m2, t.net, 5), `${u.id}: net ${u.net_m2} vs ${t.net}`).toBe(true);
        }
      }
    }
  });

  it("хвилі: перші 30 % юнітів стадії (за id) = 1, наступні 40 % = 2, решта = 3", () => {
    for (const stage of STAGES) {
      const list = poa.units.filter((u) => u.stage === stage).sort((a, b) => a.id.localeCompare(b.id));
      const n1 = Math.round(list.length * 0.3), n2 = Math.round(list.length * 0.7);
      list.forEach((u, i) => expect(u.wave, `${u.id} #${i}`).toBe(i < n1 ? 1 : i < n2 ? 2 : 3));
    }
  });

  it("S3: тераса — окрема частина глибини назовні, ≥ 2.5 м; кімната = net типу", () => {
    for (const u of poa.units.filter((q) => q.stage === "S3")) {
      const t = POA_TYPES.S3.find((q) => q.type === u.type)!;
      const [w, d, h] = u.size;
      const td = terraceDepth(u.terrace_m2, w);
      expect(h).toBe(3);
      expect(td).toBeGreaterThanOrEqual(MIN_TERRACE_DEPTH_M);
      expect(td).toBeGreaterThanOrEqual(u.terrace_m2 / w - 1e-9);
      const room = d - td;
      expect(room === 7.5 || room === 6.5 || Math.abs(room - 7.5) < 0.01 || Math.abs(room - 6.5) < 0.01, `${u.id}: кімната ${room}`).toBe(true);
      expect(Math.abs(w * room - t.net), `${u.id}: w×room=${w * room} ≠ ${t.net}`).toBeLessThan(0.3);
      expect(u.source).toBe("generated");
      expect(u.position[1]).toBeCloseTo(storeyY(u.storey)!, 1);
    }
  });

  it("S1A/S2: storey = <stage>-L<floor>, будівлі позначені, джерело у generatedFrom", () => {
    for (const u of poa.units.filter((q) => q.stage !== "S3")) {
      expect(u.storey).toBe(`${u.stage}-L${u.floor}`);
      expect(u.floor).toBeGreaterThanOrEqual(1);
      expect(u.building.length).toBeGreaterThan(0);
      if (u.type === "Chalet80") expect(u.building).toBe("Chalet");
      expect(u.source).toBe("generated");
    }
    expect(poa.generatedFrom).toMatch(/masterplan\.json|fallback/);
  });
});

/* ------------------------------------------------------------------ */
/*  Спільні інваріанти обох датасетів                                  */
/* ------------------------------------------------------------------ */

describe.each([sketch, poa])("$dataset: спільні інваріанти", (f) => {
  it("sellable = net + terrace × 0.3, ціна = sellable × 4000, totals узгоджені", () => {
    for (const u of f.units) {
      expect(u.terrace_coef).toBe(TERRACE_COEF);
      expect(u.sellable_m2).toBe(sellable(u.net_m2, u.terrace_m2));
      expect(u.sellable_m2).toBeCloseTo(u.net_m2 + u.terrace_m2 * 0.3, 1);
      expect(u.price_per_m2).toBe(BASE_PRICE_PER_M2);
      expect(u.price).toBe(Math.round(u.sellable_m2 * u.price_per_m2));
      expect(u.status).toBe("available");
      expect(u.held_until).toBeNull();
      expect(u.token).toBeNull();
      expect(u.dataset).toBe(f.dataset);
    }
    expect(f.totals).toEqual(totals(f.units));
  });

  it("id унікальні у форматі STAGE-BUILDING-FLOOR-NN", () => {
    const ids = new Set<string>();
    for (const u of f.units) {
      expect(u.id).toMatch(/^S(1A|2|3)-[A-Za-z0-9]+-\d+-\d{2}$/);
      expect(u.id.startsWith(`${u.stage}-${u.building}-${u.floor}-`)).toBe(true);
      expect(ids.has(u.id), `дубль id ${u.id}`).toBe(false);
      ids.add(u.id);
    }
  });

  it("позиція у межах scene_bbox і y ≥ heightAt − 1", () => {
    const b = META.scene_bbox;
    for (const u of f.units) {
      const [x, y, z] = u.position;
      expect(x, u.id).toBeGreaterThanOrEqual(b.min[0]);
      expect(x, u.id).toBeLessThanOrEqual(b.max[0]);
      expect(y, u.id).toBeGreaterThanOrEqual(b.min[1]);
      expect(y, u.id).toBeLessThanOrEqual(b.max[1]);
      expect(z, u.id).toBeGreaterThanOrEqual(b.min[2]);
      expect(z, u.id).toBeLessThanOrEqual(b.max[2]);
      const h = heightAt(x, z);
      expect(h, `${u.id}: поза сіткою висот`).not.toBeNull();
      expect(y, `${u.id}: y=${y} < терен ${h} − 1`).toBeGreaterThanOrEqual(h! - 1);
    }
  });

  it("orientation відповідає rotDeg (локальна +Z = назовні → компас, північ = −Z)", () => {
    for (const u of f.units) expect(orientationFromOutward(outwardFromRotDeg(u.rotDeg)), u.id).toBe(u.orientation);
  });

  it("S3: відсік стоїть на плиті свого рівня і не лежить у hole", () => {
    for (const u of f.units.filter((q) => q.stage === "S3")) {
      const level = platesAtLevel(plates, u.position[1]);
      expect(level.length, `${u.id}: немає плит із верхом на y=${u.position[1]}`).toBeGreaterThan(0);
      const room = roomPolyOfUnit(u, 0.1); // ASSUMED: відступ 10 см від краю (кімната стоїть точно на лінії ребра)
      const plate = level.find((p) => room.every((c) => pointInPolygon(c, p.outer)));
      expect(plate, `${u.id}: кімната поза контурами плит рівня`).toBeDefined();
      expect(plate!.holes.some((hole) => polygonsIntersect(room, hole)), `${u.id}: кімната у hole`).toBe(false);
    }
  });

  it("сліди відсіків одного рівня не перетинаються", () => {
    // ASSUMED допуски тесту: слід зменшено на 2 см (сусідні відсіки дотикаються), один рівень = |Δy| ≤ 0.5 м
    const fp = (u: Unit) => rectPoly([u.position[0], u.position[2]], u.size[0] - 0.02, u.size[1] - 0.02, u.rotDeg);
    const us = f.units;
    const polys = us.map(fp);
    for (let i = 0; i < us.length; i++) {
      for (let j = i + 1; j < us.length; j++) {
        if (Math.abs(us[i].position[1] - us[j].position[1]) > 0.5) continue;
        expect(polygonsIntersect(polys[i], polys[j]), `${us[i].id} × ${us[j].id}`).toBe(false);
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/*  lib/units-gen.ts — розкладка по периметру на синтетичній плиті     */
/* ------------------------------------------------------------------ */

describe("lib/units-gen.ts", () => {
  it("sellable(): 50/10 → 53, 80/30 → 89, 42/12 → 45.6", () => {
    expect(sellable(50, 10)).toBe(53);
    expect(sellable(80, 30)).toBe(89);
    expect(sellable(42, 12)).toBe(45.6);
  });

  it("компас: назовні −Z = N, +X = E, +Z = S, −X = W", () => {
    expect(orientationFromOutward([0, -1])).toBe("N");
    expect(orientationFromOutward([1, 0])).toBe("E");
    expect(orientationFromOutward([0, 1])).toBe("S");
    expect(orientationFromOutward([-1, 0])).toBe("W");
    expect(orientationFromOutward([Math.SQRT1_2, -Math.SQRT1_2])).toBe("NE");
  });

  it("packPerimeter: відсіки 7.5 м уздовж контуру, обминають hole, не перетинаються, дивляться назовні", () => {
    // квадратна плита 30×30 з hole біля західного ребра
    const plate: Plate = {
      id: "T", storey: "T", elev: 0, y0: 9.7, h: 0.3,
      outer: [[0, 0], [30, 0], [30, 30], [0, 30]],
      holes: [[[2, 10], [10, 10], [10, 20], [2, 20]]],
    };
    const reqs = Array.from({ length: 12 }, (_, i) => ({ key: `r${i}`, net: 45, terrace: 0 }));
    const { placed, unplaced } = packPerimeter([plate], 10, reqs, { checkTerrain: false });
    expect(placed.length + unplaced.length).toBe(12);
    expect(placed.length).toBeGreaterThanOrEqual(8);
    for (const c of placed) {
      expect(c.roomDepth).toBe(7.5);
      expect(c.width).toBeCloseTo(6, 6);
      expect(c.room.every((p) => pointInPolygon(p, [[-0.01, -0.01], [30.01, -0.01], [30.01, 30.01], [-0.01, 30.01]]))).toBe(true);
      expect(polygonsIntersect(roomPolyOfUnit({ position: [c.center[0], 10, c.center[1]], size: [c.width, c.roomDepth, 3], rotDeg: c.rotDeg, terrace_m2: 0 }, 0.05), plate.holes[0])).toBe(false);
      // назовні: центр + outward × 5 м — поза плитою
      expect(pointInPolygon([c.center[0] + c.outward[0] * 5, c.center[1] + c.outward[1] * 5], plate.outer)).toBe(false);
      expect(orientationFromOutward(c.outward)).toBe(c.orientation);
    }
    for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
      expect(polygonsIntersect(placed[i].footprint.map(([x, z]) => [x, z] as [number, number]), placed[j].footprint)).toBe(false);
    }
    // ребро коротше 4 м пропускається
    const tiny: Plate = { ...plate, id: "tiny", outer: [[0, 0], [3, 0], [3, 3], [0, 3]] };
    expect(packPerimeter([tiny], 10, reqs.slice(0, 1), { checkTerrain: false }).placed).toHaveLength(0);
  });

  it("POA: тераса назовні, глибина = terrace/ширина, мін 2.5 м", () => {
    const plate: Plate = { id: "T", storey: "T", elev: 0, y0: 9.7, h: 0.3, outer: [[0, 0], [40, 0], [40, 40], [0, 40]], holes: [] };
    const { placed } = packPerimeter([plate], 10, [{ key: "f", net: 50, terrace: 10 }, { key: "ch", net: 80, terrace: 30 }], { checkTerrain: false });
    expect(placed).toHaveLength(2);
    const fam = placed.find((c) => c.key === "f")!, ch = placed.find((c) => c.key === "ch")!;
    expect(fam.terraceDepth).toBe(MIN_TERRACE_DEPTH_M);              // 10 / 6.67 = 1.5 → мін 2.5
    expect(ch.terraceDepth).toBeCloseTo(30 / (80 / 7.5), 6);         // 2.81 м
    for (const c of placed) {
      // кімната всередині плити, тераса — назовні (центр тераси поза плитою)
      expect(c.room.every((p) => pointInPolygon(p, [[-0.01, -0.01], [40.01, -0.01], [40.01, 40.01], [-0.01, 40.01]]))).toBe(true);
      const tc: [number, number] = [c.center[0] + c.outward[0] * (c.roomDepth + c.terraceDepth) / 2 - c.outward[0] * c.terraceDepth / 2,
        c.center[1] + c.outward[1] * (c.roomDepth + c.terraceDepth) / 2 - c.outward[1] * c.terraceDepth / 2];
      expect(pointInPolygon(tc, plate.outer)).toBe(false);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Генератор із masterplan.json (S1A/S2 із позицій мастерплану)        */
/* ------------------------------------------------------------------ */

describe("scripts/generate-units.ts + masterplan.json", () => {
  const tmp = mkdtempSync(join(tmpdir(), "mayot-units-"));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  it("бере позиції S1A/S2 з мастерплану, S3 лишає з плит; generatedFrom без «fallback»", () => {
    const ENV = defaultEnvelope({ min: [113.8, -335.3], max: [263.1, -99.4] });
    type MpUnit = { type: string; position: [number, number, number]; size: [number, number, number]; rotDeg: number; orientation: string; terrace_m2: number };
    const mkLevel = (chainage: number, k: number, types: string[], stage: "S1A" | "S2") => {
      // одна підлога на рівень: найвищий терен під рядом + 0.3 + k × 3.3 (як у fallback/мастерплані)
      const xz = types.map((_, i) => envelopePoint(ENV, chainage, 20 + i * 6));
      const y = +(Math.max(...xz.map(([x, z]) => heightAt(x, z) ?? 100)) + 0.3 + k * 3.3).toFixed(3);
      const units: MpUnit[] = types.map((type, i) => {
        const t = POA_TYPES[stage].find((q) => q.type === type)!;
        const [x, z] = xz[i];
        return { type, position: [+x.toFixed(3), y, +z.toFixed(3)], size: [6, 10, 3], rotDeg: 0, orientation: "S", terrace_m2: t.terrace };
      });
      return { y, footprint: [], units };
    };
    const rep = (type: string, n: number) => Array.from({ length: n }, () => type);
    const mp = {
      stages: {
        S1A: { buildings: [{ id: "S1A-A", levels: [0, 1, 2].map((k) => mkLevel(350, k, [...rep("S42", 8), ...rep("M52", 2)], "S1A")) }] },
        S2: {
          buildings: [
            { id: "S2-A", levels: [0, 1, 2].map((k) => mkLevel(260, k, [...rep("Std40", 12), ...rep("Dlx50", 2)], "S2")) },
            ...[1, 2, 3, 4, 5, 6].map((i) => ({ id: `S2-CH${i}`, levels: [mkLevel(300 + i * 0.01, 0, ["Chalet80"], "S2")] })),
          ],
        },
      },
    };
    const mpPath = join(tmp, "masterplan.json");
    writeFileSync(mpPath, JSON.stringify(mp));
    const out = execFileSync(process.execPath, [resolve(ROOT, "node_modules/tsx/dist/cli.mjs"), resolve(ROOT, "scripts/generate-units.ts")], {
      cwd: ROOT, env: { ...process.env, MASTERPLAN_JSON: mpPath, UNITS_OUT_DIR: tmp }, stdio: "pipe", encoding: "utf8",
    });
    expect(out).toContain("poa:");
    const gen = JSON.parse(readFileSync(join(tmp, "units.poa.json"), "utf8")) as UnitsFile;
    expect(gen.units).toHaveLength(213);
    expect(gen.generatedFrom.startsWith("fallback")).toBe(false);
    expect(gen.generatedFrom).toContain("masterplan.json");
    // позиції S1A/S2 = позиції мастерплану (множини)
    const key = (p: number[]) => p.map((v) => v.toFixed(2)).join(",");
    for (const stage of ["S1A", "S2"] as const) {
      const want = new Set(mp.stages[stage].buildings.flatMap((b) => b.levels.flatMap((l) => l.units.map((u) => key(u.position)))));
      const got = gen.units.filter((u) => u.stage === stage).map((u) => key(u.position));
      expect(got).toHaveLength(want.size);
      for (const k of got) expect(want.has(k), `${stage}: позиція ${k} не з мастерплану`).toBe(true);
    }
    const chalets = gen.units.filter((u) => u.stage === "S2" && u.type === "Chalet80");
    expect(chalets).toHaveLength(6);
    for (const u of chalets) expect(u.building).toBe("Chalet");
    // рівні знизу вгору: floor 1 = найнижчий
    const s1a = gen.units.filter((u) => u.stage === "S1A");
    const yByFloor = [1, 2, 3].map((f) => s1a.filter((u) => u.floor === f).map((u) => u.position[1]));
    expect(Math.max(...yByFloor[0])).toBeLessThan(Math.min(...yByFloor[1]));
    expect(Math.max(...yByFloor[1])).toBeLessThan(Math.min(...yByFloor[2]));
    // S3 ідентичний до data/units.poa.json (детермінований), sketch теж
    const s3 = (f: UnitsFile) => f.units.filter((u) => u.stage === "S3").map((u) => [u.id, u.type, ...u.position, ...u.size, u.rotDeg]);
    expect(s3(gen)).toEqual(s3(poa));
    const genSketch = JSON.parse(readFileSync(join(tmp, "units.sketch.json"), "utf8")) as UnitsFile;
    expect(genSketch.totals).toEqual(sketch.totals);
    expect(genSketch.units.map((u) => u.id)).toEqual(sketch.units.map((u) => u.id));
    expect(within(gen.totals.sellable_m2, POA_ANCHOR_SELLABLE_M2, 3)).toBe(true);
  });
});
