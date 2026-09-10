"use client";
import { useGLTF, useTexture } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { useStore } from "@/lib/store";
import { localToUv } from "@/lib/geo";

/** Найвищий рівень ортофото, який витримає ця GPU: 8k (7 485×14 623, ~7 см/px), інакше 4k.
 *  Нативні 14 970×29 246 не влазять у maxTextureSize (16 384) — для них потрібне тайлування. */
function pickHiRes(gl: THREE.WebGLRenderer): string | null {
  const max = gl.capabilities.maxTextureSize;
  const touch = typeof navigator !== "undefined" && navigator.maxTouchPoints > 1;
  if (max >= 16384 && !touch) return "/terrain/ortho-8k.webp";
  return null;
}

function prep(t: THREE.Texture, gl: THREE.WebGLRenderer) {
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = gl.capabilities.getMaxAnisotropy();
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
}

/** Терен з terrain.glb; UV ортофото рахуються з georef (dx, dy, rot) на CPU.
 *  Текстура вантажиться прогресивно: 4k одразу, потім 8k, якщо GPU дозволяє. */
export default function Terrain() {
  const { scene } = useGLTF("/models/terrain.glb");
  const gl = useThree((s) => s.gl);
  const showOrtho = useStore((s) => s.layers.ortho);
  const georef = useStore((s) => s.georef);
  const base = useTexture("/terrain/ortho-4k.webp");
  const [hi, setHi] = useState<THREE.Texture | null>(null);

  const mesh = useMemo(() => {
    let m: THREE.Mesh | null = null;
    scene.traverse((o) => { if (!m && (o as THREE.Mesh).isMesh) m = o as THREE.Mesh; });
    return m as THREE.Mesh | null;
  }, [scene]);

  const geometry = useMemo(() => (mesh ? mesh.geometry.clone() : null), [mesh]);

  useEffect(() => {
    if (!geometry) return;
    const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const [u, v] = localToUv(pos.getX(i), pos.getZ(i), georef);
      uv[i * 2] = u;
      uv[i * 2 + 1] = 1 - v; // three: v=0 знизу
    }
    geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geometry.computeVertexNormals();
  }, [geometry, georef]);

  useEffect(() => { prep(base, gl); }, [base, gl]);

  // 8k підвантажується у фоні; якщо файлу нема або GPU слабка — лишається 4k
  useEffect(() => {
    const url = pickHiRes(gl);
    if (!url) return;
    let alive = true;
    new THREE.TextureLoader().load(
      url,
      (t) => { if (!alive) { t.dispose(); return; } prep(t, gl); setHi(t); },
      undefined,
      () => { /* немає 8k — тихо лишаємось на 4k */ },
    );
    return () => { alive = false; };
  }, [gl]);

  useEffect(() => () => { hi?.dispose(); }, [hi]);

  if (!geometry) return null;
  const tex = hi ?? base;
  return (
    <mesh geometry={geometry} receiveShadow castShadow>
      <meshStandardMaterial
        map={showOrtho ? tex : null}
        color={showOrtho ? "#ffffff" : "#7d8a63"}
        roughness={1}
        metalness={0}
      />
    </mesh>
  );
}
useGLTF.preload("/models/terrain.glb");
