"use client";
import Link from "next/link";
import type { CSSProperties } from "react";
import { useStore, type LayerKey, type Preset } from "@/lib/store";
import { t, fmtDec } from "@/lib/i18n";
import { META } from "@/lib/geo";
import { fmtHour, HOUR_MIN, HOUR_MAX, HOUR_STEP, MONTH_MIN, MONTH_MAX } from "@/lib/sun";
import { useUnitsStore, useMounted, FILES, fmtInt } from "@/lib/unitsStore";
import type { Dataset } from "@/lib/units";
import LayerIcon from "./LayerIcon";

const LAYERS: LayerKey[] = ["ortho", "contours", "envelope", "sketch", "roads", "parking"];
const PRESETS: Preset[] = ["Overview", "Top", "S3", "S2", "S1A", "Entrance"];
const DATASETS: Dataset[] = ["sketch", "poa"];
const MONTH_FULL = {
  uk: ["січень", "лютий", "березень", "квітень", "травень", "червень", "липень", "серпень", "вересень", "жовтень", "листопад", "грудень"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
} as const;

// Відмітки терену (Балтійська система): сцена Y=0 ↔ DXF Z = origin_dxf_mm[2]; DXF Z=0 ↔ z0_baltic_m
const Z0 = META.z0_baltic_m + META.origin_dxf_mm[2] / 1000;
const ELEV = [Math.round(Z0 + META.scene_bbox.min[1]), Math.round(Z0 + META.scene_bbox.max[1])];

function Stat({ k, v, accent = false }: { k: string; v: string; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-[3px]">
      <dt className="eyebrow">{k}</dt>
      <dd className={`text-[17px] font-medium ${accent ? "text-emerald" : "text-graphite"}`}>{v}</dd>
    </div>
  );
}

/** Інтерфейс сцени за макетом A: заголовна панель, пресети камер, шари, дані + сонце, лічильник продажів */
export default function Hud() {
  const { layers, toggleLayer, preset, setPreset, lang, setLang, hour, month, setSun } = useStore();
  const mounted = useMounted();
  const dataset = useUnitsStore((s) => s.dataset);
  const setDataset = useUnitsStore((s) => s.setDataset);
  const units = useUnitsStore((s) => s.units);
  if (!mounted) return null; // persist-стан — лише на клієнті (без hydration mismatch)

  const total = units.length;
  const sold = units.filter((u) => u.status === "sold").length;
  const s3 = units.filter((u) => u.stage === "S3").length;
  const sunText = `${fmtHour(hour)} · ${MONTH_FULL[lang][month - 1]}`;
  const fill = `${((hour - HOUR_MIN) / (HOUR_MAX - HOUR_MIN)) * 100}%`;
  const datasetLabel = (d: Dataset) => {
    const f = FILES[d];
    const name = d === "sketch" ? t(lang, "sketchData") : t(lang, "poaData");
    return d === "sketch"
      ? `${name} · ${f.totals.keys}`
      : `${name} · ${f.totals.keys} · ${fmtInt(f.anchor_sellable_m2 ?? f.totals.sellable_m2)} ${t(lang, "m2")}`;
  };
  const prevMonth = () => setSun(hour, month > MONTH_MIN ? month - 1 : MONTH_MAX);
  const nextMonth = () => setSun(hour, month < MONTH_MAX ? month + 1 : MONTH_MIN);

  return (
    <>
      {/* ліва колонка: заголовна панель + шари */}
      <div className="absolute left-8 top-8 flex flex-col items-start gap-4">
        <section className="panel w-[372px]">
          <div className="flex items-baseline justify-between px-[22px] pt-[18px]">
            <span className="font-display text-[13px] font-medium tracking-[0.06em]">{t(lang, "title")}</span>
            <span className="text-[12px] text-taupe">{t(lang, "tagline")}</span>
          </div>
          <div className="flex flex-col gap-1.5 px-[22px] pb-[18px] pt-3.5">
            <h1 className="font-display text-[28px] font-light leading-[1.06] tracking-[-0.01em] [text-wrap:balance]">
              {t(lang, "headline")}
            </h1>
            <p className="text-[13px] leading-normal text-taupe">
              {t(lang, "stage3")} · {s3} {t(lang, "unitsWord")} · {t(lang, "amenities")}
            </p>
          </div>
          <div className="hairline" />
          <dl className="grid grid-cols-2 gap-x-[18px] gap-y-3.5 px-[22px] pb-5 pt-4">
            <Stat k={t(lang, "slopeLabel")} v={`${fmtDec(lang, META.slope_pct)} %`} />
            <Stat k={t(lang, "elevLabel")} v={`${ELEV[0]} – ${ELEV[1]} ${t(lang, "m")}`} />
            <Stat k={t(lang, "sunLabel")} v={sunText} />
            <Stat k={t(lang, "georefLabel")} v={t(lang, "georefValue")} accent />
          </dl>
          <div className="hairline" />
          <div className="flex items-center justify-between px-[22px] py-3 text-[12px]">
            <Link href="/calibrate">{t(lang, "calibrate")}</Link>
            <button className="text-taupe transition hover:text-graphite" onClick={() => setLang(lang === "uk" ? "en" : "uk")}>
              {lang === "uk" ? "EN" : "UA"}
            </button>
          </div>
        </section>

        <section className="panel w-[236px]" aria-label={t(lang, "layersTitle")}>
          <p className="border-b border-sand px-[18px] pb-2.5 pt-3.5 text-[11px] text-taupe">{t(lang, "layersTitle")}</p>
          {LAYERS.map((k, i) => (
            <button
              key={k}
              role="switch"
              aria-checked={layers[k]}
              onClick={() => toggleLayer(k)}
              className={`flex h-10 w-full items-center gap-3 px-[18px] text-left ${i < LAYERS.length - 1 ? "border-b border-linen" : ""}`}
            >
              <LayerIcon k={k} on={layers[k]} />
              <span className={`flex-1 text-[13px] ${layers[k] ? "text-graphite" : "text-taupe"}`}>{t(lang, k)}</span>
              <span className="switch" data-on={layers[k]} />
            </button>
          ))}
        </section>
      </div>

      {/* пресети камер */}
      <nav className="panel absolute right-8 top-8 flex" aria-label={t(lang, "cameras")}>
        {PRESETS.map((p, i) => {
          const active = preset === p;
          return (
            <button
              key={p}
              aria-pressed={active}
              onClick={() => setPreset(p)}
              className={`px-4 py-[13px] text-[12.5px] transition ${
                active ? "bg-emerald font-semibold text-cream" : "font-medium text-taupe hover:text-graphite"
              } ${i < PRESETS.length - 1 ? `border-r ${active ? "border-emerald" : "border-sand"}` : ""}`}
            >
              {t(lang, p)}
            </button>
          );
        })}
      </nav>

      {/* дані + сонце, підказка */}
      <div className="absolute bottom-8 left-8 flex items-end gap-4">
        <section className="panel flex items-stretch">
          <div className="flex flex-col justify-center gap-0.5 border-r border-sand px-[18px] py-3">
            <span className="eyebrow">{t(lang, "dataset")}</span>
            <div className="flex gap-3.5 text-[13px]">
              {DATASETS.map((d) => (
                <button
                  key={d}
                  aria-pressed={dataset === d}
                  onClick={() => setDataset(d)}
                  className={dataset === d ? "border-b-2 border-emerald pb-px font-semibold text-emerald" : "text-taupe transition hover:text-graphite"}
                >
                  {datasetLabel(d)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex min-w-[260px] flex-col justify-center gap-1.5 px-[18px] py-3">
            <div className="flex justify-between text-[11px] text-taupe">
              <span>{t(lang, "hour")}</span>
              <span className="flex items-center gap-2 text-graphite">
                <button className="text-taupe transition hover:text-graphite" onClick={prevMonth} aria-label="−1">‹</button>
                {sunText}
                <button className="text-taupe transition hover:text-graphite" onClick={nextMonth} aria-label="+1">›</button>
              </span>
            </div>
            <input
              type="range"
              className="range"
              min={HOUR_MIN} max={HOUR_MAX} step={HOUR_STEP} value={hour}
              style={{ "--fill": fill } as CSSProperties}
              aria-label={t(lang, "hour")}
              onChange={(e) => setSun(parseFloat(e.target.value), month)}
            />
          </div>
        </section>
        <p className="mb-3 bg-paper/70 px-2 py-1 text-[11px] text-[#5e5a52]">{t(lang, "hint")}</p>
      </div>

      {/* лічильник продажів */}
      <section className="panel absolute bottom-8 right-8 flex items-baseline gap-2.5 px-5 py-3.5">
        <span className="eyebrow">{t(lang, "sold")}</span>
        <span className="font-display text-[28px] font-light leading-none">{sold}</span>
        <span className="text-[13px] text-taupe">{t(lang, "of")} {total}</span>
      </section>
    </>
  );
}
