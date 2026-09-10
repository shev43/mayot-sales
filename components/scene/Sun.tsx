"use client";
/**
 * Сонце сцени: directionalLight із тінями + hemisphereLight, положення за hour/month зі стору
 * (lib/store.ts → hour, month; розрахунок у lib/sun.ts). Також SunControls — панель зі слайдерами.
 *
 * Підключення (Scene.tsx): замінити наявні <hemisphereLight> і <directionalLight> на <Sun />
 * (за бажанням <Sun sky /> — тоді фон і туман сцени теж міняються за часом доби; тоді прибрати
 * <color attach="background"> і <fog> зі Scene.tsx). SunControls — у Hud.tsx / page.tsx (DOM, не Canvas).
 */
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useStore } from "@/lib/store";
import { SCENE_CENTER_XZ, heightAt } from "@/lib/geo";
import {
  sunState, sunTimes, fmtHour, compassName, dirFromAngles,
  HOUR_MIN, HOUR_MAX, HOUR_STEP, MONTH_MIN, MONTH_MAX, MONTHS,
} from "@/lib/sun";

const SUN_DISTANCE = 900;        // м від центру сцени (ТЗ)
const SHADOW_HALF = 450;         // ортокамера тіней ±450 м (ТЗ)
const SHADOW_MAP = 2048;
const MIN_LIGHT_ALT_DEG = 4;     // ASSUMED: нижче — промінь для тіней «застигає» на 4°, інтенсивність і так → 0
const FOG_NEAR = 1400, FOG_FAR = 3200; // як у Scene.tsx

/** центр сцени на висоті терену — ціль directionalLight і центр shadow-камери */
function sceneTarget(): [number, number, number] {
  const [cx, cz] = SCENE_CENTER_XZ;
  return [cx, (heightAt(cx, cz) ?? 60) + 20, cz];
}

export default function Sun({ sky = false }: { sky?: boolean }) {
  const hour = useStore((s) => s.hour);
  const month = useStore((s) => s.month);
  const st = useMemo(() => sunState(hour, month), [hour, month]);

  const target = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(...sceneTarget());
    o.updateMatrixWorld();
    return o;
  }, []);
  const lightRef = useRef<THREE.DirectionalLight>(null);

  const position = useMemo<[number, number, number]>(() => {
    const dir = dirFromAngles(st.azimuthDeg, Math.max(st.altitudeDeg, MIN_LIGHT_ALT_DEG));
    const t = target.position;
    return [t.x + dir[0] * SUN_DISTANCE, t.y + dir[1] * SUN_DISTANCE, t.z + dir[2] * SUN_DISTANCE];
  }, [st.azimuthDeg, st.altitudeDeg, target]);

  // shadow-камера задається один раз; після зміни позиції оновлюємо матриці цілі/тіні
  useEffect(() => {
    const l = lightRef.current;
    if (!l) return;
    l.target = target;
    l.shadow.camera.left = -SHADOW_HALF;
    l.shadow.camera.right = SHADOW_HALF;
    l.shadow.camera.top = SHADOW_HALF;
    l.shadow.camera.bottom = -SHADOW_HALF;
    l.shadow.camera.near = 50;
    l.shadow.camera.far = SUN_DISTANCE + 1100;
    l.shadow.camera.updateProjectionMatrix();
    l.shadow.needsUpdate = true;
  }, [target, position]);

  return (
    <>
      <hemisphereLight
        color={st.hemisphere.sky}
        groundColor={st.hemisphere.ground}
        intensity={st.hemisphere.intensity}
      />
      <directionalLight
        ref={lightRef}
        position={position}
        color={st.light.color}
        intensity={st.light.intensity}
        castShadow
        shadow-mapSize={[SHADOW_MAP, SHADOW_MAP]}
        shadow-bias={-0.0006}
        shadow-normalBias={0.4}
      />
      <primitive object={target} />
      {sky && (
        <>
          <color attach="background" args={[st.sky]} />
          <fog attach="fog" args={[st.sky, FOG_NEAR, FOG_FAR]} />
        </>
      )}
    </>
  );
}

/* ---------------- UI ---------------- */

// локальний словник: lib/i18n.ts редагувати не можна
const UI = {
  uk: { sun: "Сонце", hour: "Година", month: "Місяць", azimuth: "Азимут", altitude: "Висота", sunrise: "Схід", sunset: "Захід", night: "нижче горизонту" },
  en: { sun: "Sun", hour: "Hour", month: "Month", azimuth: "Azimuth", altitude: "Altitude", sunrise: "Sunrise", sunset: "Sunset", night: "below horizon" },
} as const;

export function SunControls({ className = "" }: { className?: string }) {
  const hour = useStore((s) => s.hour);
  const month = useStore((s) => s.month);
  const setSun = useStore((s) => s.setSun);
  const lang = useStore((s) => s.lang);
  const L = UI[lang];
  const st = useMemo(() => sunState(hour, month), [hour, month]);
  const times = useMemo(() => sunTimes(month), [month]);
  const up = st.altitudeDeg > 0;

  return (
    <section className={`panel p-3 ${className}`} aria-label={L.sun}>
      <div className="flex items-baseline justify-between">
        <p className="eyebrow">{L.sun}</p>
        <p className="text-[11px] tabular-nums text-stone">
          15 {MONTHS[lang][month - 1]} · {fmtHour(hour)}
        </p>
      </div>

      <label className="mt-2 block">
        <span className="flex justify-between text-[11px]">
          <span className="text-graphite/80">{L.hour}</span>
          <span className="tabular-nums">{fmtHour(hour)}</span>
        </span>
        <input
          type="range" className="w-full" aria-label={L.hour}
          min={HOUR_MIN} max={HOUR_MAX} step={HOUR_STEP} value={hour}
          onChange={(e) => setSun(parseFloat(e.target.value), month)}
        />
      </label>

      <label className="mt-1 block">
        <span className="flex justify-between text-[11px]">
          <span className="text-graphite/80">{L.month}</span>
          <span className="tabular-nums">{MONTHS[lang][month - 1]}</span>
        </span>
        <input
          type="range" className="w-full" aria-label={L.month}
          min={MONTH_MIN} max={MONTH_MAX} step={1} value={month}
          onChange={(e) => setSun(hour, parseInt(e.target.value, 10))}
        />
      </label>

      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] tabular-nums">
        <div>
          <dt className="eyebrow">{L.azimuth}</dt>
          <dd>{st.azimuthDeg.toFixed(0)}° · {compassName(st.azimuthDeg, lang)}</dd>
        </div>
        <div>
          <dt className="eyebrow">{L.altitude}</dt>
          <dd className={up ? "" : "text-stone"}>
            {st.altitudeDeg.toFixed(1)}°{!up && <span className="ml-1 text-[10px]">({L.night})</span>}
          </dd>
        </div>
        <div>
          <dt className="eyebrow">{L.sunrise}</dt>
          <dd>{fmtHour(times.sunrise)}</dd>
        </div>
        <div>
          <dt className="eyebrow">{L.sunset}</dt>
          <dd>{fmtHour(times.sunset)}</dd>
        </div>
      </dl>
    </section>
  );
}
