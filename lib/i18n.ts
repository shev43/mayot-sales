import type { Lang } from "@/lib/store";

const dict = {
  uk: {
    title: "MAYOT",
    subtitle: "Яремче · Карпати · 3D sales model",
    layers: "Шари",
    terrain: "Терен", ortho: "Ортофото", contours: "Горизонталі", envelope: "Конверт ТЗ 120×400",
    sketch: "Ескіз архітекторів", s1a: "Stage 1A", s2: "Stage 2", parking: "Паркінг (X-ray)",
    water: "Вода", trees: "Ліс",
    cameras: "Камери",
    Overview: "Огляд", S1A: "S1A", S2: "S2", S3: "S3", Entrance: "В'їзд",
    calibrate: "Калібрування",
    hint: "тягніть — оберт · колесо — масштаб · правою — панорама",
    dataset: "Дані", sketchData: "Ескіз", poaData: "POA",
    assumed: "ASSUMED",
    slope: "ухил",
  },
  en: {
    title: "MAYOT",
    subtitle: "Yaremche · Carpathians · 3D sales model",
    layers: "Layers",
    terrain: "Terrain", ortho: "Orthophoto", contours: "Contours", envelope: "Brief envelope 120×400",
    sketch: "Architects' sketch", s1a: "Stage 1A", s2: "Stage 2", parking: "Parking (X-ray)",
    water: "Water", trees: "Forest",
    cameras: "Cameras",
    Overview: "Overview", S1A: "S1A", S2: "S2", S3: "S3", Entrance: "Entrance",
    calibrate: "Calibrate",
    hint: "drag — orbit · wheel — zoom · right drag — pan",
    dataset: "Data", sketchData: "Sketch", poaData: "POA",
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
