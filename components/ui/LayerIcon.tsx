import type { LayerKey } from "@/lib/store";

/** Лінійні іконки шарів (18×18) із макета A; смарагд — увімкнено, moss — вимкнено */
const PATHS: Partial<Record<LayerKey, React.ReactNode>> = {
  ortho: <path d="M2 9 L9 4.5 L16 9 L9 13.5 Z" />,
  contours: (
    <>
      <path d="M2 12 C5.5 8, 8 8, 10 11 S14.5 11, 16 7" />
      <path d="M2 15.5 C5.5 12, 8.5 12, 11 14 S14.5 14, 16 11" />
    </>
  ),
  envelope: (
    <>
      <rect x="2.5" y="2.5" width="13" height="13" />
      <path d="M5.5 2.5 V15.5 M12.5 2.5 V15.5" />
    </>
  ),
  sketch: (
    <>
      <path d="M2 15 V7 L9 3 L16 7 V15 Z" />
      <path d="M6.5 15 V10 H11.5 V15" />
    </>
  ),
  roads: <path d="M2 14 C7 14, 7 4, 12 4 S16 9, 16 9" />,
  parking: (
    <>
      <rect x="2.5" y="6.5" width="13" height="9" />
      <path d="M5.5 6.5 V3 H12.5 V6.5" />
    </>
  ),
  trees: <path d="M9 2 L13 8 H11 L15 14 H3 L7 8 H5 Z M9 14 V16.5" />,
  water: <path d="M2 7 C4 5, 6 5, 8 7 S12 9, 14 7 S16 5, 16 5 M2 12 C4 10, 6 10, 8 12 S12 14, 14 12 S16 10, 16 10" />,
};

export default function LayerIcon({ k, on }: { k: LayerKey; on: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke={on ? "#1f5c4a" : "#9a9384"} strokeWidth="1.4" aria-hidden>
      {PATHS[k] ?? <circle cx="9" cy="9" r="6" />}
    </svg>
  );
}
