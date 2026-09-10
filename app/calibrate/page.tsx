"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { localToCrs, SCENE_CENTER_XZ, GEOREF_FILE } from "@/lib/geo";

const Scene = dynamic(() => import("@/components/scene/Scene"), { ssr: false });

function Slider({ label, value, min, max, step, onChange, unit = "м" }:
  { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; unit?: string }) {
  return (
    <label className="block">
      <div className="flex justify-between text-[11px]"><span className="text-stone">{label}</span><span className="tabular-nums">{value.toFixed(step < 1 ? 2 : 0)} {unit}</span></div>
      <input type="range" className="w-full" min={min} max={max} step={step} value={value}
             onChange={(e) => onChange(parseFloat(e.target.value))} />
    </label>
  );
}

export default function CalibratePage() {
  const { georef, setGeoref, resetGeoref, envelope, setEnvelope, resetEnvelope } = useStore();
  const [msg, setMsg] = useState<string>("");
  const [cE, cN] = localToCrs(SCENE_CENTER_XZ[0], SCENE_CENTER_XZ[1], georef);

  async function save() {
    const r = await fetch("/api/georef", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ local_to_crs: georef, envelope }) });
    setMsg(r.ok ? "Збережено у data/georef.json" : "Не вдалося зберегти — " + (await r.text()));
  }

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <Scene />
      <section className="panel absolute right-4 top-4 w-[320px] space-y-4 p-4">
        <div>
          <p className="eyebrow">Калібрування</p>
          <h1 className="font-display text-[22px] font-medium leading-none">Терен ↔ ортофото</h1>
          <p className="mt-1 text-[11px] text-stone">{GEOREF_FILE.crs}</p>
        </div>
        <div className="space-y-2">
          <Slider label="Зсув E (dx)" value={georef.dx} min={georef.dx - 400} max={georef.dx + 400} step={1} onChange={(v) => setGeoref({ dx: v })} />
          <Slider label="Зсув N (dy)" value={georef.dy} min={georef.dy - 400} max={georef.dy + 400} step={1} onChange={(v) => setGeoref({ dy: v })} />
          <Slider label="Поворот" value={georef.rotDeg} min={-180} max={180} step={0.1} unit="°" onChange={(v) => setGeoref({ rotDeg: v })} />
          <p className="text-[10px] text-stone tabular-nums">центр терену → E {cE.toFixed(1)} · N {cN.toFixed(1)}</p>
          <button className="btn" onClick={resetGeoref}>Скинути</button>
        </div>
        {envelope && (
          <div className="space-y-2 border-t border-sand pt-3">
            <p className="eyebrow">Конверт ТЗ 120×400 · ASSUMED</p>
            <Slider label="Центр X" value={envelope.cx} min={0} max={330} step={1} onChange={(v) => setEnvelope({ cx: v })} />
            <Slider label="Центр Z" value={envelope.cz} min={-624} max={0} step={1} onChange={(v) => setEnvelope({ cz: v })} />
            <Slider label="Поворот" value={envelope.rotDeg} min={-90} max={90} step={0.5} unit="°" onChange={(v) => setEnvelope({ rotDeg: v })} />
            <button className="btn" onClick={resetEnvelope}>Скинути</button>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-sand pt-3">
          <Link href="/" className="btn">← Сцена</Link>
          <button className="btn" aria-pressed="true" onClick={save}>Зберегти georef.json</button>
        </div>
        {msg && <p className="text-[11px] text-emerald">{msg}</p>}
      </section>
    </main>
  );
}
