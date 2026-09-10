"use client";
/**
 * Стор юнітів: датасет (Ескіз | POA), фільтри, вибір/ховер, статуси (overrides).
 * Дані беруться з data/units.sketch.json та data/units.poa.json (контракт lib/units.ts).
 * Похідні (units з накладеними статусами, visibleIds, visibleTotals, facets)
 * перераховуються синхронно в recompute() після кожної дії — 362 юніти, це дешево.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useEffect, useMemo, useState } from "react";
import {
  totals as computeTotals,
  POA_TYPES,
  type Dataset, type Orientation, type Stage, type Unit, type UnitsFile, type UnitStatus, type View,
} from "@/lib/units";
import sketchFile from "@/data/units.sketch.json";
import poaFile from "@/data/units.poa.json";
import { asset } from "@/lib/asset";

/* ---------------- дані ---------------- */

export const FILES: Record<Dataset, UnitsFile> = {
  sketch: sketchFile as unknown as UnitsFile,
  poa: poaFile as unknown as UnitsFile,
};

export const STAGES: Stage[] = ["S1A", "S2", "S3"];
export const VIEWS: View[] = ["valley", "forest", "ridge", "waterworld"];
export const STATUSES: UnitStatus[] = ["available", "held", "reserved", "sold"];

/** порядок типів: за стадією з POA_TYPES, далі — невідомі (напр. «Room» ескізу) */
const TYPE_ORDER: string[] = (() => {
  const seen: string[] = [];
  for (const st of STAGES) for (const t of POA_TYPES[st]) if (!seen.includes(t.type)) seen.push(t.type);
  return seen;
})();

/* ---------------- фільтри ---------------- */

/** [min, max]; null = без обмеження (Infinity не переживає JSON у persist) */
export type Range = [number | null, number | null];

export interface Filters {
  stage: Stage[];        // порожньо = усі
  type: string[];
  area: Range;           // за sellable_m2 (ASSUMED: «площа» у фільтрі = sellable)
  price: Range;          // USD
  floor: number[];
  view: View[];
  status: UnitStatus[];
}

export const EMPTY_FILTERS: Filters = {
  stage: [], type: [], area: [null, null], price: [null, null], floor: [], view: [], status: [],
};

export function isFilterActive(f: Filters): boolean {
  return f.stage.length > 0 || f.type.length > 0 || f.floor.length > 0 || f.view.length > 0 || f.status.length > 0
    || f.area[0] !== null || f.area[1] !== null || f.price[0] !== null || f.price[1] !== null;
}

/** чиста функція: які юніти проходять фільтр */
export function applyFilters(units: Unit[], f: Filters): Unit[] {
  const inRange = (v: number, r: Range) => (r[0] === null || v >= r[0]) && (r[1] === null || v <= r[1]);
  return units.filter((u) =>
    (f.stage.length === 0 || f.stage.includes(u.stage)) &&
    (f.type.length === 0 || f.type.includes(u.type)) &&
    (f.floor.length === 0 || f.floor.includes(u.floor)) &&
    (f.view.length === 0 || f.view.includes(u.view)) &&
    (f.status.length === 0 || f.status.includes(u.status)) &&
    inRange(u.sellable_m2, f.area) &&
    inRange(u.price, f.price),
  );
}

/** значення, що реально є в датасеті — для кнопок і меж повзунків */
export interface Facets {
  stages: Stage[];
  types: string[];
  floors: number[];
  views: View[];
  statuses: UnitStatus[];
  area: [number, number];   // sellable, м² (floor/ceil)
  price: [number, number];  // USD (floor/ceil до 1000)
}

export function computeFacets(units: Unit[]): Facets {
  const stages = STAGES.filter((s) => units.some((u) => u.stage === s));
  const typeSet = Array.from(new Set(units.map((u) => u.type)));
  const types = typeSet.sort((a, b) => {
    const ia = TYPE_ORDER.indexOf(a), ib = TYPE_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
  });
  const floors = Array.from(new Set(units.map((u) => u.floor))).sort((a, b) => a - b);
  const views = VIEWS.filter((v) => units.some((u) => u.view === v));
  const statuses = STATUSES;
  let a0 = Infinity, a1 = -Infinity, p0 = Infinity, p1 = -Infinity;
  for (const u of units) {
    if (u.sellable_m2 < a0) a0 = u.sellable_m2;
    if (u.sellable_m2 > a1) a1 = u.sellable_m2;
    if (u.price < p0) p0 = u.price;
    if (u.price > p1) p1 = u.price;
  }
  if (units.length === 0) { a0 = 0; a1 = 0; p0 = 0; p1 = 0; }
  return {
    stages, types, floors, views, statuses,
    area: [Math.floor(a0), Math.ceil(a1)],
    price: [Math.floor(p0 / 1000) * 1000, Math.ceil(p1 / 1000) * 1000],
  };
}

/* ---------------- статуси ---------------- */

export interface StatusOverride { status: UnitStatus; held_until: number | null; token: number | null }

/** ключ override: id юніта може збігатися в обох датасетах, тому додаємо датасет */
export const overrideKey = (dataset: Dataset, id: string) => `${dataset}:${id}`;

export function applyOverrides(base: Unit[], dataset: Dataset, overrides: Record<string, StatusOverride>): Unit[] {
  return base.map((u) => {
    const o = overrides[overrideKey(dataset, u.id)];
    return o ? { ...u, status: o.status, held_until: o.held_until, token: o.token } : u;
  });
}

/* ---------------- геометрія для камери «Вид з тераси» ---------------- */

/** напрямок орієнтації у площині XZ сцени (північ = −Z, схід = +X) */
export function orientationDir(o: Orientation): [number, number] {
  const k = Math.SQRT1_2;
  switch (o) {
    case "N": return [0, -1];
    case "NE": return [k, -k];
    case "E": return [1, 0];
    case "SE": return [k, k];
    case "S": return [0, 1];
    case "SW": return [-k, k];
    case "W": return [-1, 0];
    case "NW": return [-k, -k];
  }
}

/** азимут орієнтації, град (N=0, E=90) */
export const orientationDeg = (o: Orientation) => ({ N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 }[o]);

export const EYE_HEIGHT_M = 1.6;        // ТЗ: +1,6 м над підлогою
const TERRACE_LOOK_DIST_M = 40;         // ASSUMED: ціль погляду за 40 м від тераси
const TERRACE_LOOK_DROP_M = 2;          // ASSUMED: легкий нахил погляду вниз на схил

/** точка ока на краю тераси (+1,6 м) і ціль у бік orientation — для CameraControls.setLookAt */
export function terraceViewpoint(u: Unit): { eye: [number, number, number]; target: [number, number, number] } {
  const [dx, dz] = orientationDir(u.orientation);
  const edge = u.size[1] / 2 + 0.3;    // ASSUMED: край тераси = грань боксу + 0,3 м
  const ex = u.position[0] + dx * edge, ey = u.position[1] + EYE_HEIGHT_M, ez = u.position[2] + dz * edge;
  return {
    eye: [ex, ey, ez],
    target: [ex + dx * TERRACE_LOOK_DIST_M, ey - TERRACE_LOOK_DROP_M, ez + dz * TERRACE_LOOK_DIST_M],
  };
}

/* ---------------- стор ---------------- */

interface Derived {
  units: Unit[];                       // поточний датасет із накладеними overrides
  unitById: Record<string, Unit>;
  visibleIds: string[];                // після фільтрів (порядок як у файлі)
  visibleTotals: UnitsFile["totals"];  // totals() по видимих
  facets: Facets;
}

export interface UnitsState extends Derived {
  dataset: Dataset;
  selectedId: string | null;
  hoverId: string | null;
  filters: Filters;
  overrides: Record<string, StatusOverride>;

  setDataset: (d: Dataset) => void;
  select: (id: string | null) => void;
  hover: (id: string | null) => void;
  setFilter: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  /** перемкнути одне значення у списковому фільтрі (stage/type/floor/view/status) */
  toggleFilterValue: (key: "stage" | "type" | "floor" | "view" | "status", value: Stage | string | number | View | UnitStatus) => void;
  resetFilters: () => void;
  setStatus: (id: string, status: UnitStatus, opts?: { held_until?: number | null; token?: number | null }) => void;
  clearStatus: (id: string) => void;
  /** held з простроченим held_until → available */
  expireHolds: (now?: number) => void;
  recompute: () => void;
}

function derive(dataset: Dataset, overrides: Record<string, StatusOverride>, filters: Filters): Derived {
  const units = applyOverrides(FILES[dataset].units, dataset, overrides);
  const unitById: Record<string, Unit> = {};
  for (const u of units) unitById[u.id] = u;
  const visible = applyFilters(units, filters);
  return {
    units, unitById,
    visibleIds: visible.map((u) => u.id),
    visibleTotals: computeTotals(visible),
    facets: computeFacets(units),
  };
}

const INITIAL_DATASET: Dataset = "sketch";

export const useUnitsStore = create<UnitsState>()(
  persist(
    (set, get) => ({
      ...derive(INITIAL_DATASET, {}, EMPTY_FILTERS),
      dataset: INITIAL_DATASET,
      selectedId: null,
      hoverId: null,
      filters: EMPTY_FILTERS,
      overrides: {},

      recompute: () => set((s) => derive(s.dataset, s.overrides, s.filters)),
      setDataset: (dataset) =>
        set((s) => ({ dataset, selectedId: null, hoverId: null, ...derive(dataset, s.overrides, s.filters) })),
      select: (id) => set({ selectedId: id }),
      hover: (id) => { if (get().hoverId !== id) set({ hoverId: id }); },
      setFilter: (key, value) =>
        set((s) => {
          const filters = { ...s.filters, [key]: value };
          return { filters, ...derive(s.dataset, s.overrides, filters) };
        }),
      toggleFilterValue: (key, value) =>
        set((s) => {
          const cur = s.filters[key] as (typeof value)[];
          const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
          const filters = { ...s.filters, [key]: next } as Filters;
          return { filters, ...derive(s.dataset, s.overrides, filters) };
        }),
      resetFilters: () => set((s) => ({ filters: EMPTY_FILTERS, ...derive(s.dataset, s.overrides, EMPTY_FILTERS) })),
      setStatus: (id, status, opts) =>
        set((s) => {
          const key = overrideKey(s.dataset, id);
          const prev = s.overrides[key];
          const overrides = {
            ...s.overrides,
            [key]: {
              status,
              held_until: opts?.held_until !== undefined ? opts.held_until : status === "held" ? prev?.held_until ?? null : null,
              token: opts?.token !== undefined ? opts.token : prev?.token ?? null,
            },
          };
          return { overrides, ...derive(s.dataset, overrides, s.filters) };
        }),
      clearStatus: (id) =>
        set((s) => {
          const overrides = { ...s.overrides };
          delete overrides[overrideKey(s.dataset, id)];
          return { overrides, ...derive(s.dataset, overrides, s.filters) };
        }),
      expireHolds: (now = Date.now()) =>
        set((s) => {
          let changed = false;
          const overrides = { ...s.overrides };
          for (const [k, o] of Object.entries(overrides)) {
            if (o.status === "held" && o.held_until !== null && o.held_until < now) {
              overrides[k] = { status: "available", held_until: null, token: null };
              changed = true;
            }
          }
          return changed ? { overrides, ...derive(s.dataset, overrides, s.filters) } : {};
        }),
    }),
    {
      name: "mayot-units-v1",
      partialize: (s) => ({ dataset: s.dataset, filters: s.filters, overrides: s.overrides }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Pick<UnitsState, "dataset" | "filters" | "overrides">>;
        const dataset: Dataset = p.dataset === "poa" || p.dataset === "sketch" ? p.dataset : current.dataset;
        const filters: Filters = { ...EMPTY_FILTERS, ...(p.filters ?? {}) };
        const overrides = p.overrides ?? {};
        return { ...current, dataset, filters, overrides, ...derive(dataset, overrides, filters) };
      },
    },
  ),
);

/* ---------------- хуки-селектори ---------------- */

/** true після монтування — панелі з persist-станом рендеряться лише на клієнті (без hydration mismatch) */
export function useMounted(): boolean {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

export function useSelectedUnit(): Unit | null {
  const id = useUnitsStore((s) => s.selectedId);
  const byId = useUnitsStore((s) => s.unitById);
  return id ? byId[id] ?? null : null;
}

export function useVisibleUnits(): Unit[] {
  const ids = useUnitsStore((s) => s.visibleIds);
  const byId = useUnitsStore((s) => s.unitById);
  return useMemo(() => ids.map((id) => byId[id]).filter(Boolean), [ids, byId]);
}

/* ---------------- підписи (i18n модуля; lib/i18n.ts не чіпаємо) ---------------- */

export type UiLang = "uk" | "en";

export const LABELS = {
  uk: {
    view: { valley: "долина", forest: "ліс", ridge: "хребет", waterworld: "Water World" },
    status: { available: "вільно", held: "hold", reserved: "резерв", sold: "продано" },
    orientation: { N: "північ", NE: "пн-сх", E: "схід", SE: "пд-сх", S: "південь", SW: "пд-зх", W: "захід", NW: "пн-зх" },
    stage: { S1A: "Stage 1A", S2: "Stage 2", S3: "Stage 3" },
    floor: "поверх", floorShort: "пов.", wave: "хвиля",
    dataset: { sketch: "Ескіз", poa: "POA" },
  },
  en: {
    view: { valley: "valley", forest: "forest", ridge: "ridge", waterworld: "Water World" },
    status: { available: "available", held: "held", reserved: "reserved", sold: "sold" },
    orientation: { N: "north", NE: "NE", E: "east", SE: "SE", S: "south", SW: "SW", W: "west", NW: "NW" },
    stage: { S1A: "Stage 1A", S2: "Stage 2", S3: "Stage 3" },
    floor: "floor", floorShort: "fl.", wave: "wave",
    dataset: { sketch: "Sketch", poa: "POA" },
  },
} as const;

export const STATUS_COLORS: Record<UnitStatus, string> = {
  available: "#7fbf9c",
  held: "#c9a96e",
  reserved: "#e6dcc8",
  sold: "#6c6a66",
};

/* ---------------- галерея ---------------- */

/** ASSUMED: пул рендерів за стадією (public/gallery/render-01..20.webp); мініатюри обираються за хешем id */
export const GALLERY_POOL: Record<Stage, number[]> = {
  S1A: [1, 3, 4, 6, 7, 9],
  S2: [7, 9, 10, 12, 13, 14],
  S3: [1, 2, 5, 8, 11, 15, 16, 17, 18, 19],
};
export const GALLERY_RENDERS = 20;

/** n шляхів до мініатюр для юніта — детерміновано за стадією та id */
export function galleryFor(u: Pick<Unit, "id" | "stage">, n = 3): string[] {
  const pool = GALLERY_POOL[u.stage] ?? GALLERY_POOL.S3;
  let h = 0;
  for (let i = 0; i < u.id.length; i++) h = (h * 31 + u.id.charCodeAt(i)) >>> 0;
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(asset(`/gallery/render-${String(pool[(h + i) % pool.length]).padStart(2, "0")}.webp`));
  return out;
}

/** 12 345,6 → "12 346" (тонкі пробіли між тисячами, без десяткових) */
export const fmtInt = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
export const fmtM2 = (n: number) => (Math.round(n * 10) / 10).toFixed(1).replace(".", ",");
