"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { defaultGeoref, defaultEnvelope, SKETCH_BOX_XZ, type Georef, type Envelope, type Vec2 } from "@/lib/geo";

export type LayerKey =
  | "terrain" | "ortho" | "contours" | "envelope" | "sketch" | "roads" | "s1a" | "s2" | "parking" | "water" | "trees";

export type Preset = "Overview" | "Top" | "S1A" | "S2" | "S3" | "Entrance";
export type Lang = "uk" | "en";

interface State {
  layers: Record<LayerKey, boolean>;
  toggleLayer: (k: LayerKey) => void;
  preset: Preset;
  setPreset: (p: Preset) => void;
  presetNonce: number;                 // щоб повторний клік по тому ж пресету теж летів
  georef: Georef;
  setGeoref: (g: Partial<Georef>) => void;
  resetGeoref: () => void;
  envelope: Envelope | null;
  setEnvelope: (e: Partial<Envelope>) => void;
  resetEnvelope: () => void;
  sketchBox: { min: Vec2; max: Vec2; yMin: number; yMax: number } | null;
  setSketchBox: (b: State["sketchBox"]) => void;
  lang: Lang;
  setLang: (l: Lang) => void;
  hour: number;
  month: number;
  setSun: (hour: number, month: number) => void;
}

export const useStore = create<State>()(
  persist(
    (set) => ({
      layers: {
        terrain: true, ortho: true, contours: true, envelope: true, sketch: true, roads: true,
        s1a: true, s2: true, parking: false, water: true, trees: true,
      },
      toggleLayer: (k) => set((s) => ({ layers: { ...s.layers, [k]: !s.layers[k] } })),
      preset: "Overview",
      presetNonce: 0,
      setPreset: (p) => set((s) => ({ preset: p, presetNonce: s.presetNonce + 1 })),
      georef: defaultGeoref(),
      setGeoref: (g) => set((s) => ({ georef: { ...s.georef, ...g } })),
      resetGeoref: () => set({ georef: defaultGeoref() }),
      // Конверт ініціалізується одразу з відомих габаритів ескізу (QA P0):
      // не залежить від того, чи завантажено sketch.glb і чи увімкнено шар.
      envelope: defaultEnvelope(SKETCH_BOX_XZ),
      setEnvelope: (e) =>
        set((s) => ({ envelope: { ...(s.envelope ?? defaultEnvelope(s.sketchBox ?? SKETCH_BOX_XZ)), ...e } })),
      resetEnvelope: () => set((s) => ({ envelope: defaultEnvelope(s.sketchBox ?? SKETCH_BOX_XZ) })),
      sketchBox: null,
      setSketchBox: (b) => set({ sketchBox: b }),
      lang: "uk",
      setLang: (l) => set({ lang: l }),
      hour: 10,
      month: 7,
      setSun: (hour, month) => set({ hour, month }),
    }),
    {
      // v3: georef і envelope НЕ персистяться — єдине джерело правди data/georef.json
      // (зберігається кнопкою на /calibrate). Інакше браузер показує застаріле значення.
      name: "mayot-scene-v3",
      partialize: (s) => ({ layers: s.layers, lang: s.lang }),
    },
  ),
);
