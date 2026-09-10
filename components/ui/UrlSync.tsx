"use client";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useStore, type LayerKey, type Preset } from "@/lib/store";

const PRESETS: Preset[] = ["Overview", "Top", "S1A", "S2", "S3", "Entrance"];
const LAYER_KEYS: LayerKey[] = ["terrain", "ortho", "contours", "envelope", "sketch", "roads", "s1a", "s2", "parking", "water", "trees"];

/** Кадр задається адресою: ?preset=S3&layers=ortho,sketch,envelope&hud=0&lang=en
 *  layers — повний список увімкнених шарів (решта вимикається); terrain завжди увімкнений. */
export default function UrlSync() {
  const sp = useSearchParams();
  useEffect(() => {
    const st = useStore.getState();
    const p = sp.get("preset");
    if (p && (PRESETS as string[]).includes(p)) st.setPreset(p as Preset);
    const l = sp.get("layers");
    if (l !== null) {
      const on = new Set(l.split(",").map((s) => s.trim()).filter(Boolean));
      const layers = { ...st.layers };
      for (const k of LAYER_KEYS) layers[k] = k === "terrain" ? true : on.has(k);
      useStore.setState({ layers });
    }
    const lang = sp.get("lang");
    if (lang === "uk" || lang === "en") st.setLang(lang);
    const hud = sp.get("hud");
    document.documentElement.dataset.hud = hud === "0" ? "off" : "on";
  }, [sp]);
  return null;
}
