"use client";
import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useStore } from "@/lib/store";

/** Ескіз архітекторів (Stage 3) з sketch.glb. Скло — BLEND, паркінг — X-ray за шаром */
export default function Sketch() {
  const { scene } = useGLTF("/models/sketch.glb");
  const setSketchBox = useStore((s) => s.setSketchBox);
  const xray = useStore((s) => s.layers.parking);

  const obj = useMemo(() => {
    const o = scene.clone(true);
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
      const mat = m.material as THREE.MeshStandardMaterial;
      if (mat.transparent) { mat.depthWrite = false; mat.side = THREE.DoubleSide; }
      else mat.side = THREE.DoubleSide;
    });
    return o;
  }, [scene]);

  useEffect(() => {
    const b = new THREE.Box3().setFromObject(obj);
    setSketchBox({ min: [b.min.x, b.min.z], max: [b.max.x, b.max.z], yMin: b.min.y, yMax: b.max.y });
  }, [obj, setSketchBox]);

  useEffect(() => {
    obj.traverse((c) => {
      const m = c as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = m.material as THREE.MeshStandardMaterial;
      if (mat.name === "slab" || mat.name === "concrete") {
        mat.transparent = xray; mat.opacity = xray ? 0.35 : 1; mat.depthWrite = !xray; mat.needsUpdate = true;
      }
    });
  }, [obj, xray]);

  return <primitive object={obj} />;
}
useGLTF.preload("/models/sketch.glb");
