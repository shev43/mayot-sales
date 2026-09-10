"use client";
import { useMemo } from "react";
import * as THREE from "three";
import roads from "@/data/roads.json";
import { heightAt } from "@/lib/geo";

/** Існуючі дороги — 21 «стіна» з DXF архітекторів (траси доріг), драповані по терену.
 *  Контрольний шар: якщо збігається з дорогами на ортофото — геоприв'язка правильна. */
export default function Roads() {
  const geometry = useMemo(() => {
    const out: number[] = [];
    for (const r of (roads as { roads: { id: string; pts: number[][] }[] }).roads) {
      // вершини стін ідуть не по порядку — сортуємо вздовж головної осі траси
      const pts = r.pts.map(([x, z]) => [x, z]);
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
      const cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      let sxx = 0, sxz = 0, szz = 0;
      for (const [x, z] of pts) { sxx += (x - cx) ** 2; sxz += (x - cx) * (z - cz); szz += (z - cz) ** 2; }
      const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz);
      const ux = Math.cos(ang), uz = Math.sin(ang);
      const sorted = [...pts].sort((a, b) => (a[0] * ux + a[1] * uz) - (b[0] * ux + b[1] * uz));
      // прибираємо дублікати (обидві грані стіни дають ті самі XZ)
      const uniq: number[][] = [];
      for (const p of sorted) {
        const last = uniq[uniq.length - 1];
        if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.6) uniq.push(p);
      }
      for (let i = 0; i < uniq.length - 1; i++) {
        const [ax, az] = uniq[i], [bx, bz] = uniq[i + 1];
        if (Math.hypot(bx - ax, bz - az) > 60) continue;   // розрив — не з'єднуємо
        out.push(ax, (heightAt(ax, az) ?? 0) + 0.9, az, bx, (heightAt(bx, bz) ?? 0) + 0.9, bz);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(out, 3));
    return g;
  }, []);
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#ff3b3b" />
    </lineSegments>
  );
}
