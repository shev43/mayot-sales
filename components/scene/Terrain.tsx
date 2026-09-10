"use client";
import { useGLTF, useTexture } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useStore } from "@/lib/store";
import { localToUv } from "@/lib/geo";

/** Терен з terrain.glb; UV ортофото рахуються з georef (dx, dy, rot) на CPU */
export default function Terrain() {
  const { scene } = useGLTF("/models/terrain.glb");
  const showOrtho = useStore((s) => s.layers.ortho);
  const georef = useStore((s) => s.georef);
  const tex = useTexture("/terrain/ortho-4k.webp");

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

  useEffect(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
  }, [tex]);

  if (!geometry) return null;
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
