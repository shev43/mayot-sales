import type { Lang } from "@/lib/store";

const dict = {
  uk: {
    title: "MAYOT",
    subtitle: "Яремче · Карпати · 3D sales model",
    tagline: "Яремче · Карпати",
    headline: "Родинний курорт на південному схилі",
    stage3: "Третя черга", unitsWord: "апартаментів", amenities: "Water World · Kids City",
    slopeLabel: "Ухил ділянки", elevLabel: "Відмітки", sunLabel: "Сонце", georefLabel: "Прив'язка", georefValue: "зйомка 1:500",
    m: "м", m2: "м²",
    layers: "Шари", layersTitle: "Шари сцени",
    terrain: "Терен", ortho: "Ортофото", contours: "Горизонталі", envelope: "Межі за завданням",
    sketch: "Ескіз архітекторів", roads: "Існуючі дороги", s1a: "Stage 1A", s2: "Stage 2", parking: "Паркінг наскрізь",
    water: "Вода", trees: "Ліс",
    cameras: "Камери",
    Overview: "Огляд", Top: "Зверху", S1A: "Перша", S2: "Друга", S3: "Третя черга", Entrance: "В'їзд",
    calibrate: "Калібрування",
    hint: "Перетягніть, щоб обернути · колесо — масштаб",
    dataset: "Дані", sketchData: "Ескіз", poaData: "За завданням",
    hour: "Година", sold: "Продано", of: "із",
    assumed: "ASSUMED",
    slope: "ухил",
  },
  en: {
    title: "MAYOT",
    subtitle: "Yaremche · Carpathians · 3D sales model",
    tagline: "Yaremche · Carpathians",
    headline: "A family resort on the southern slope",
    stage3: "Stage 3", unitsWord: "apartments", amenities: "Water World · Kids City",
    slopeLabel: "Site slope", elevLabel: "Elevations", sunLabel: "Sun", georefLabel: "Georeference", georefValue: "survey 1:500",
    m: "m", m2: "m²",
    layers: "Layers", layersTitle: "Scene layers",
    terrain: "Terrain", ortho: "Orthophoto", contours: "Contours", envelope: "Brief boundaries",
    sketch: "Architects' sketch", roads: "Existing roads", s1a: "Stage 1A", s2: "Stage 2", parking: "Parking see-through",
    water: "Water", trees: "Forest",
    cameras: "Cameras",
    Overview: "Overview", Top: "Top", S1A: "Stage 1A", S2: "Stage 2", S3: "Stage 3", Entrance: "Entrance",
    calibrate: "Calibrate",
    hint: "Drag to orbit · wheel to zoom",
    dataset: "Data", sketchData: "Sketch", poaData: "Brief",
    hour: "Hour", sold: "Sold", of: "of",
    assumed: "ASSUMED",
    slope: "slope",
  },
} as const;

export type Key = keyof typeof dict.uk;
export function t(lang: Lang, k: Key): string {
  return dict[lang][k] ?? dict.uk[k];
}
export const fmtUSD = (n: number) =>
  "$" + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
/** 19.68 → "19,7" (uk) / "19.7" (en) */
export const fmtDec = (lang: Lang, n: number, digits = 1) =>
  n.toFixed(digits).replace(".", lang === "uk" ? "," : ".");
