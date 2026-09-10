"use client";
import { Canvas } from "@react-three/fiber";
import { CameraControls } from "@react-three/drei";
import { Suspense, useEffect, useRef } from "react";
import type CameraControlsImpl from "camera-controls";
import { useStore, type Preset } from "@/lib/store";
import { SCENE_CENTER_XZ, SKETCH_BOX_XZ, envelopePoint, heightAt, ENVELOPE } from "@/lib/geo";
import Terrain from "./Terrain";
import Contours from "./Contours";
import Envelope from "./Envelope";
import Sketch from "./Sketch";
import Roads from "./Roads";
import Sun from "./Sun";

function CameraRig() {
  const ref = useRef<CameraControlsImpl>(null);
  const preset = useStore((s) => s.preset);
  const nonce = useStore((s) => s.presetNonce);
  const env = useStore((s) => s.envelope);
  const box = useStore((s) => s.sketchBox);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const look = (tx: number, tz: number, dist: number, azDeg: number, elDeg: number, smooth = true) => {
      const ty = (heightAt(tx, tz) ?? 0) + 5;
      const az = (azDeg * Math.PI) / 180, el = (elDeg * Math.PI) / 180;
      const px = tx + dist * Math.cos(el) * Math.sin(az);
      const pz = tz + dist * Math.cos(el) * Math.cos(az);
      const py = ty + dist * Math.sin(el);
      c.setLookAt(px, py, pz, tx, ty, tz, smooth);
    };
    const bx = box ?? SKETCH_BOX_XZ;
    const sk = [(bx.min[0] + bx.max[0]) / 2, (bx.min[1] + bx.max[1]) / 2];
    const p: Preset = preset;
    if (p === "Overview") look(SCENE_CENTER_XZ[0], SCENE_CENTER_XZ[1], 900, 150, 42);
    else if (p === "Top") look(sk[0], sk[1], 520, 180, 88);
    else if (p === "S3") look(sk[0], sk[1], 380, 160, 30);
    else if (env && p === "S2") { const q = envelopePoint(env, 260, ENVELOPE.width / 2); look(q[0], q[1], 260, 160, 28); }
    else if (env && p === "S1A") { const q = envelopePoint(env, 360, ENVELOPE.width / 2); look(q[0], q[1], 220, 170, 26); }
    else if (env && p === "Entrance") { const q = envelopePoint(env, 200, 8); look(q[0], q[1], 140, 240, 18); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, nonce, env?.cx, env?.cz, env?.rotDeg, box]);

  return (
    <CameraControls
      ref={ref}
      makeDefault
      minDistance={20}
      maxDistance={2500}
      maxPolarAngle={Math.PI / 2 - 0.03}
      dollyToCursor
      smoothTime={0.6}
    />
  );
}

export default function Scene() {
  const layers = useStore((s) => s.layers);
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ fov: 42, near: 1, far: 6000, position: [900, 500, 700] }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      <color attach="background" args={["#e9ecf0"]} />
      <fog attach="fog" args={["#e9ecf0", 1400, 3200]} />
      <Sun />
      <Suspense fallback={null}>
        {layers.terrain && <Terrain />}
        {layers.contours && <Contours />}
        {layers.envelope && <Envelope />}
        {layers.sketch && <Sketch />}
        {layers.roads && <Roads />}
      </Suspense>
      <CameraRig />
    </Canvas>
  );
}
