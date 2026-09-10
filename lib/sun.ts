/**
 * Сонце над ділянкою MAYOT (Яремче): положення за годиною та місяцем + освітлення сцени.
 *
 * Сцена: метри, Y-up; x = схід, −z = північ, y = угору.
 * Час — місцевий цивільний (Київ): UTC+2 узимку, UTC+3 з квітня по жовтень
 * (15-те число кожного місяця завжди всередині/поза DST однозначно, тож без календаря переходів).
 * Розрахунок — пакет suncalc (Reda & Andreas, точність ≈0.1°).
 *
 * Чистий модуль без three/DOM — тестується під vitest/tsx.
 */
import * as SunCalc from "suncalc"; // v2: ESM без default-експорту

export const SITE = { lat: 48.45, lon: 24.55 } as const;   // ТЗ: 48.45°N 24.55°E
export const SUN_YEAR = 2026;                               // ASSUMED: рік для дати «15-те число»
export const HOUR_MIN = 5;
export const HOUR_MAX = 21;
export const HOUR_STEP = 0.25;
export const MONTH_MIN = 1;
export const MONTH_MAX = 12;

export type Vec3 = [number, number, number];

export interface SunState {
  hour: number;
  month: number;
  azimuthDeg: number;      // компасний азимут 0..360 (0 = Пн, 90 = Сх, 180 = Пд, 270 = Зх)
  altitudeDeg: number;     // висота над горизонтом, −90..90
  dirScene: Vec3;          // одиничний вектор ДО сонця у сцені (x схід, y угору, −z північ)
  daylight: number;        // 0 (ніч) … 1 (полудень)
  light: { color: string; intensity: number };                // directionalLight
  hemisphere: { sky: string; ground: string; intensity: number }; // hemisphereLight
  sky: string;             // колір фону/туману сцени
}

/** зсув місцевого часу від UTC у годинах для 15-го числа місяця (Київ) */
export function tzOffsetHours(month: number): number {
  return month >= 4 && month <= 10 ? 3 : 2;
}

/** Date (UTC) для 15-го числа `month` о `hour` місцевого часу */
export function siteDate(hour: number, month: number, year = SUN_YEAR): Date {
  const m = clamp(Math.round(month), MONTH_MIN, MONTH_MAX);
  const base = Date.UTC(year, m - 1, 15, 0, 0, 0);
  return new Date(base + (hour - tzOffsetHours(m)) * 3600_000);
}

/** азимут/висота сонця у градусах (компасний азимут) */
export function sunAngles(hour: number, month: number): { azimuthDeg: number; altitudeDeg: number } {
  const p = SunCalc.getPosition(siteDate(hour, month), SITE.lat, SITE.lon);
  // suncalc v2 (встановлено 2.0.2): градуси, азимут компасний від півночі за годинниковою
  // (у v1 були радіани від півдня — не плутати з @types/suncalc, які тут не використовуються).
  const azimuthDeg = ((p.azimuth % 360) + 360) % 360;
  const altitudeDeg = p.altitude;
  return { azimuthDeg, altitudeDeg };
}

/** одиничний вектор до сонця у сцені за компасним азимутом і висотою */
export function dirFromAngles(azimuthDeg: number, altitudeDeg: number): Vec3 {
  const az = (azimuthDeg * Math.PI) / 180;
  const alt = (altitudeDeg * Math.PI) / 180;
  const east = Math.sin(az) * Math.cos(alt);
  const north = Math.cos(az) * Math.cos(alt);
  const up = Math.sin(alt);
  return [east, up, -north];
}

/* ---------------- освітлення за висотою сонця ---------------- */

// ASSUMED: ключові кадри за висотою сонця (град). Денні значення підібрані так, щоб
// збігатися з поточним виглядом сцени (фон #e9ecf0, hemisphere #dfe7ee/#5b6a4a 0.55, sun 1.6–1.8).
type Key = { alt: number; light: string; li: number; sky: string; hsky: string; hground: string; hi: number };
const KEYS: Key[] = [
  { alt: -18, light: "#0f1a33", li: 0.0,  sky: "#0a0f1c", hsky: "#141c30", hground: "#090b09", hi: 0.16 },
  { alt: -12, light: "#0f1a33", li: 0.0,  sky: "#0c1220", hsky: "#16203a", hground: "#0a0d0a", hi: 0.18 },
  { alt: -6,  light: "#24304d", li: 0.0,  sky: "#1b2a46", hsky: "#2a3a5c", hground: "#141812", hi: 0.25 },
  { alt: -2,  light: "#8a6f80", li: 0.12, sky: "#55607d", hsky: "#6a6f8d", hground: "#2a2d26", hi: 0.35 },
  { alt: 0,   light: "#ff9a4a", li: 0.35, sky: "#c9a58c", hsky: "#c8a898", hground: "#3f4634", hi: 0.42 },
  { alt: 6,   light: "#ffb46b", li: 0.9,  sky: "#e2c9b2", hsky: "#dcc9b6", hground: "#4d5a42", hi: 0.5 },
  { alt: 15,  light: "#ffdcb0", li: 1.4,  sky: "#e8e6e6", hsky: "#dfe4ea", hground: "#5b6a4a", hi: 0.55 },
  { alt: 35,  light: "#fff3e2", li: 1.7,  sky: "#e9ecf0", hsky: "#dfe7ee", hground: "#5b6a4a", hi: 0.55 },
  { alt: 65,  light: "#ffffff", li: 1.8,  sky: "#e9ecf0", hsky: "#dfe7ee", hground: "#5b6a4a", hi: 0.55 },
];
export const MAX_SUN_INTENSITY = 1.8;

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}
/** лінійна інтерполяція кольорів у sRGB (достатньо для UI-ключів) */
export function lerpHex(a: string, b: string, t: number): string {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** освітлення за висотою сонця (град) — кусково-лінійно між KEYS */
export function lightingForAltitude(altitudeDeg: number): Pick<SunState, "daylight" | "light" | "hemisphere" | "sky"> {
  const a = clamp(altitudeDeg, KEYS[0].alt, KEYS[KEYS.length - 1].alt);
  let i = 0;
  while (i < KEYS.length - 2 && a > KEYS[i + 1].alt) i++;
  const k0 = KEYS[i], k1 = KEYS[i + 1];
  const t = k1.alt === k0.alt ? 0 : clamp((a - k0.alt) / (k1.alt - k0.alt), 0, 1);
  const li = mix(k0.li, k1.li, t);
  return {
    daylight: +(li / MAX_SUN_INTENSITY).toFixed(3),
    light: { color: lerpHex(k0.light, k1.light, t), intensity: +li.toFixed(3) },
    hemisphere: {
      sky: lerpHex(k0.hsky, k1.hsky, t),
      ground: lerpHex(k0.hground, k1.hground, t),
      intensity: +mix(k0.hi, k1.hi, t).toFixed(3),
    },
    sky: lerpHex(k0.sky, k1.sky, t),
  };
}

/** повний стан сонця для сцени */
export function sunState(hour: number, month: number): SunState {
  const h = clamp(hour, 0, 24);
  const m = clamp(Math.round(month), MONTH_MIN, MONTH_MAX);
  const { azimuthDeg, altitudeDeg } = sunAngles(h, m);
  return {
    hour: h,
    month: m,
    azimuthDeg: +azimuthDeg.toFixed(2),
    altitudeDeg: +altitudeDeg.toFixed(2),
    dirScene: dirFromAngles(azimuthDeg, altitudeDeg),
    ...lightingForAltitude(altitudeDeg),
  };
}

/** схід/захід/полудень 15-го числа місяця, місцеві десяткові години (напр. 5.75 = 05:45);
 *  NaN, якщо події немає (полярний день/ніч — на 48° не буває, але тип suncalc це допускає) */
export function sunTimes(month: number): { sunrise: number; sunset: number; noon: number } {
  const m = clamp(Math.round(month), MONTH_MIN, MONTH_MAX);
  const tz = tzOffsetHours(m);
  const t = SunCalc.getTimes(siteDate(12, m), SITE.lat, SITE.lon);
  const local = (d: Date | null | undefined) => {
    if (!d) return NaN;
    const v = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600 + tz;
    return ((v % 24) + 24) % 24;
  };
  return { sunrise: local(t.sunrise), sunset: local(t.sunset), noon: local(t.solarNoon) };
}

/** 10.25 → "10:15"; NaN → "—" */
export function fmtHour(h: number): string {
  if (!Number.isFinite(h)) return "—";
  const total = Math.round(h * 60);
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export const MONTHS = {
  uk: ["Січ", "Лют", "Бер", "Кві", "Тра", "Чер", "Лип", "Сер", "Вер", "Жов", "Лис", "Гру"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
} as const;

export const COMPASS = {
  uk: ["Пн", "ПнСх", "Сх", "ПдСх", "Пд", "ПдЗх", "Зх", "ПнЗх"],
  en: ["N", "NE", "E", "SE", "S", "SW", "W", "NW"],
} as const;

/** 8-румбова назва напрямку за компасним азимутом */
export function compassName(azimuthDeg: number, lang: "uk" | "en" = "uk"): string {
  const i = Math.round((((azimuthDeg % 360) + 360) % 360) / 45) % 8;
  return COMPASS[lang][i];
}
