import dynamic from "next/dynamic";
import { Suspense } from "react";
import Hud from "@/components/ui/Hud";
import UrlSync from "@/components/ui/UrlSync";

// Canvas рендериться лише в браузері (WebGL)
const Scene = dynamic(() => import("@/components/scene/Scene"), { ssr: false });

export default function Page() {
  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <Suspense fallback={null}><UrlSync /></Suspense>
      <Scene />
      <div className="hud-root"><Hud /></div>
    </main>
  );
}
