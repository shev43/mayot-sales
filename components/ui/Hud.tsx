"use client";
import Link from "next/link";
import { useStore, type LayerKey, type Preset } from "@/lib/store";
import { t } from "@/lib/i18n";
import { META } from "@/lib/geo";

const LAYERS: LayerKey[] = ["ortho", "contours", "envelope", "sketch", "roads", "parking"];
const PRESETS: Preset[] = ["Overview", "Top", "S3", "S2", "S1A", "Entrance"];

export default function Hud() {
  const { layers, toggleLayer, preset, setPreset, lang, setLang } = useStore();
  return (
    <>
      <section className="panel absolute left-4 top-4 w-[272px] p-4">
        <p className="eyebrow">{t(lang, "subtitle")}</p>
        <h1 className="font-display text-[26px] font-medium leading-none tracking-tight">{t(lang, "title")}</h1>
        <p className="mt-1 text-[11px] text-stone">
          {t(lang, "slope")} {META.slope_pct.toFixed(1)} % · 329,9 × 623,3 м
        </p>

        <div className="mt-4">
          <p className="eyebrow mb-1.5">{t(lang, "layers")}</p>
          <div className="flex flex-wrap gap-1.5">
            {LAYERS.map((k) => (
              <button key={k} className="btn" aria-pressed={layers[k]} onClick={() => toggleLayer(k)}>
                {t(lang, k)}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <p className="eyebrow mb-1.5">{t(lang, "cameras")}</p>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button key={p} className="btn" aria-pressed={preset === p} onClick={() => setPreset(p)}>
                {t(lang, p)}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <Link href="/calibrate" className="btn">{t(lang, "calibrate")}</Link>
          <button className="btn" onClick={() => setLang(lang === "uk" ? "en" : "uk")}>
            {lang === "uk" ? "EN" : "UA"}
          </button>
        </div>
      </section>

      <p className="panel absolute bottom-4 right-4 px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-stone">
        {t(lang, "hint")}
      </p>
    </>
  );
}
