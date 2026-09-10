"use client";
import { useMemo } from "react";
import * as THREE from "three";
import { GRID } from "@/lib/geo";

/** Горизонталі кожні `interval` м (marching squares по heightgrid), підняті на lift */
export default function Contours({ interval = 5, lift = 0.4 }: { interval?: number; lift?: number }) {
  const geometry = useMemo(() => {
    const { originX, originZ, step, cols, rows, data } = GRID;
    const at = (i: number, j: number) => data[j * cols + i];
    let zmin = Infinity, zmax = -Infinity;
    for (const v of data) if (v !== null) { if (v < zmin) zmin = v; if (v > zmax) zmax = v; }
    const out: number[] = [];
    const lerp = (x0: number, z0: number, v0: number, x1: number, z1: number, v1: number, lv: number) => {
      const t = (lv - v0) / (v1 - v0 || 1e-9);
      return [x0 + (x1 - x0) * t, lv + lift, z0 + (z1 - z0) * t];
    };
    for (let lv = Math.ceil(zmin / interval) * interval; lv <= zmax; lv += interval) {
      for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) {
        const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
        if (a === null || b === null || c === null || d === null) continue;
        const x0 = originX + i * step, x1 = x0 + step, z0 = originZ + j * step, z1 = z0 + step;
        const idx = (a >= lv ? 8 : 0) | (b >= lv ? 4 : 0) | (c >= lv ? 2 : 0) | (d >= lv ? 1 : 0);
        if (idx === 0 || idx === 15) continue;
        const top = () => lerp(x0, z0, a, x1, z0, b, lv);
        const right = () => lerp(x1, z0, b, x1, z1, c, lv);
        const bottom = () => lerp(x0, z1, d, x1, z1, c, lv);
        const left = () => lerp(x0, z0, a, x0, z1, d, lv);
        const segs: number[][][] = [];
        switch (idx) {
          case 1: case 14: segs.push([left(), bottom()]); break;
          case 2: case 13: segs.push([bottom(), right()]); break;
          case 3: case 12: segs.push([left(), right()]); break;
          case 4: case 11: segs.push([top(), right()]); break;
          case 5: segs.push([top(), left()], [bottom(), right()]); break;
          case 6: case 9: segs.push([top(), bottom()]); break;
          case 7: case 8: segs.push([top(), left()]); break;
          case 10: segs.push([top(), right()], [left(), bottom()]); break;
        }
        for (const [p, q] of segs) out.push(...p, ...q);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(out, 3));
    return g;
  }, [interval, lift]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#5d5647" transparent opacity={0.45} />
    </lineSegments>
  );
}
