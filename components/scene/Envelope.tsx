"use client";
import { useMemo } from "react";
import * as THREE from "three";
import { Text } from "@react-three/drei";
import { useStore } from "@/lib/store";
import { ENVELOPE, envelopePoint, drapedPolyline, heightAt, type Envelope as Env } from "@/lib/geo";

/** Конверт ТЗ: ділянка 120×400, смуги LEFT 16 / CENTER 80 / RIGHT 24, chainage кожні 50 м. ASSUMED-посадка. */
export default function Envelope() {
  const env = useStore((s) => s.envelope);
  const lines = useMemo(() => {
    if (!env) return null;
    const e: Env = env;
    const W = ENVELOPE.width, L = ENVELOPE.length;
    const rect = [
      envelopePoint(e, 0, 0), envelopePoint(e, L, 0), envelopePoint(e, L, W), envelopePoint(e, 0, W), envelopePoint(e, 0, 0),
    ];
    const bandL = [envelopePoint(e, 0, ENVELOPE.left), envelopePoint(e, L, ENVELOPE.left)];
    const bandR = [envelopePoint(e, 0, W - ENVELOPE.right), envelopePoint(e, L, W - ENVELOPE.right)];
    const ticks: number[] = [];
    for (let ch = 0; ch <= L; ch += 50) {
      const a = envelopePoint(e, ch, 0), b = envelopePoint(e, ch, W);
      ticks.push(...drapedPolyline([a, b], 10, 0.5));
    }
    const outline = new THREE.BufferGeometry();
    outline.setAttribute("position", new THREE.Float32BufferAttribute(drapedPolyline(rect, 5, 0.8), 3));
    const bands = new THREE.BufferGeometry();
    bands.setAttribute("position", new THREE.Float32BufferAttribute([...drapedPolyline(bandL, 5, 0.7), ...drapedPolyline(bandR, 5, 0.7)], 3));
    const tickGeo = new THREE.BufferGeometry();
    tickGeo.setAttribute("position", new THREE.Float32BufferAttribute(ticks, 3));
    const labels = [0, 100, 200, 300, 400].map((ch) => {
      const p = envelopePoint(e, ch, -8);
      return { ch, x: p[0], z: p[1], y: (heightAt(p[0], p[1]) ?? 0) + 2 };
    });
    const zoneLabels = [
      { txt: "LEFT · service", ac: ENVELOPE.left / 2 },
      { txt: "CENTER · забудова 80 м", ac: ENVELOPE.left + ENVELOPE.center / 2 },
      { txt: "RIGHT · guest belt", ac: W - ENVELOPE.right / 2 },
    ].map((z) => { const p = envelopePoint(e, L + 12, z.ac); return { ...z, x: p[0], z: p[1], y: (heightAt(p[0], p[1]) ?? 0) + 2 }; });
    return { outline, bands, tickGeo, labels, zoneLabels };
  }, [env]);

  if (!lines) return null;
  return (
    <group>
      <lineSegments geometry={lines.outline}><lineBasicMaterial color="#C9A96E" linewidth={2} /></lineSegments>
      <lineSegments geometry={lines.bands}><lineBasicMaterial color="#C9A96E" transparent opacity={0.6} /></lineSegments>
      <lineSegments geometry={lines.tickGeo}><lineBasicMaterial color="#C9A96E" transparent opacity={0.35} /></lineSegments>
      {lines.labels.map((l) => (
        <Text key={l.ch} position={[l.x, l.y, l.z]} fontSize={6} color="#8a7444" anchorX="center" anchorY="bottom"
              rotation={[-Math.PI / 2, 0, 0]}>{`ch.${l.ch}`}</Text>
      ))}
      {lines.zoneLabels.map((z) => (
        <Text key={z.txt} position={[z.x, z.y, z.z]} fontSize={5} color="#8a7444" anchorX="center" anchorY="middle"
              rotation={[-Math.PI / 2, 0, 0]}>{z.txt}</Text>
      ))}
    </group>
  );
}
