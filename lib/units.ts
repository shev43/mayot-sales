/**
 * Єдиний контракт даних юніта. Генерується scripts/generate-units.ts у
 * data/units.sketch.json та data/units.poa.json; споживається сценою, картками,
 * фільтрами та Launch Mode. Координати — сцена (метри, Y-up), як у lib/geo.ts.
 */
export type Stage = "S1A" | "S2" | "S3";
export type UnitStatus = "available" | "held" | "reserved" | "sold";
export type Dataset = "sketch" | "poa";
export type Orientation = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
export type View = "valley" | "forest" | "ridge" | "waterworld";

export interface Unit {
  id: string;                 // "S3-B-2-14"
  stage: Stage;
  building: string;           // "A" | "B" | ... | "Chalet"
  floor: number;              // поверх у корпусі (1 = перший над землею)
  storey: string;             // назва рівня з data/meta.json (для S3) або "S2-L2" тощо
  type: string;               // "S42" | "M52" | "Std40" | "Dlx50" | "Chalet80" | "Family50" | "XL65" | "Room" (ескіз)
  net_m2: number;
  terrace_m2: number;
  terrace_coef: number;       // 0.30 (FIXED, ТЗ §27)
  sellable_m2: number;        // net + terrace × coef
  orientation: Orientation;   // куди дивиться тераса
  view: View;
  price_per_m2: number;       // USD, базова 4000 (ТЗ)
  price: number;              // sellable × price_per_m2
  wave: 1 | 2 | 3;
  status: UnitStatus;
  held_until: number | null;  // epoch ms
  token: number | null;       // EOI token, що тримає/купив
  position: [number, number, number]; // центр підлоги юніта, сцена (x, y, z)
  size: [number, number, number];     // [ширина вздовж фасаду, глибина, висота], м
  rotDeg: number;             // поворот навколо Y, град (0 = ширина вздовж +X)
  dataset: Dataset;
  source: "zone" | "generated";
  zoneId?: string;            // GUID зони BIMx для датасету «Ескіз»
}

export interface UnitsFile {
  dataset: Dataset;
  generatedFrom: string;      // коротко: звідки геометрія і площі
  anchor_sellable_m2?: number;  // 11747 для POA
  totals: { keys: number; net_m2: number; terrace_m2: number; sellable_m2: number; revenue_usd: number };
  units: Unit[];
}

export const TERRACE_COEF = 0.3;
export const BASE_PRICE_PER_M2 = 4000;
export const POA_ANCHOR_SELLABLE_M2 = 11747;

/** Типи юнітів за ТЗ §28–30 (FIXED): net, тераса, кількість по стадіях */
export const POA_TYPES: Record<Stage, { type: string; count: number; net: number; terrace: number }[]> = {
  S1A: [ { type: "S42", count: 24, net: 42, terrace: 12 }, { type: "M52", count: 6, net: 52, terrace: 18 } ],
  S2:  [ { type: "Std40", count: 36, net: 40, terrace: 10 }, { type: "Dlx50", count: 6, net: 50, terrace: 15 }, { type: "Chalet80", count: 6, net: 80, terrace: 30 } ],
  S3:  [ { type: "Family50", count: 105, net: 50, terrace: 10 }, { type: "XL65", count: 18, net: 65, terrace: 18 }, { type: "Chalet80", count: 12, net: 80, terrace: 30 } ],
};

export const sellable = (net: number, terrace: number, coef = TERRACE_COEF) => +(net + terrace * coef).toFixed(1);

export function totals(units: Unit[]): UnitsFile["totals"] {
  const t = { keys: units.length, net_m2: 0, terrace_m2: 0, sellable_m2: 0, revenue_usd: 0 };
  for (const u of units) { t.net_m2 += u.net_m2; t.terrace_m2 += u.terrace_m2; t.sellable_m2 += u.sellable_m2; t.revenue_usd += u.price; }
  t.net_m2 = +t.net_m2.toFixed(1); t.terrace_m2 = +t.terrace_m2.toFixed(1); t.sellable_m2 = +t.sellable_m2.toFixed(1); t.revenue_usd = Math.round(t.revenue_usd);
  return t;
}
