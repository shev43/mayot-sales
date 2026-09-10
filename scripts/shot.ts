/**
 * Playwright-скріншот сцени: npx tsx scripts/shot.ts <name> [path] [preset]
 * Приклад: npx tsx scripts/shot.ts 02-terrain / Overview
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "fs";

// route може містити query: "/?preset=S3&layers=ortho,sketch&hud=0"
const [name = "shot", route = "/", preset = ""] = process.argv.slice(2);
const base = process.env.BASE_URL ?? "http://localhost:3000";
const url = `${base}${route}${preset ? (route.includes("?") ? "&" : "?") + "preset=" + preset : ""}`;

(async () => {
  mkdirSync("screenshots", { recursive: true });
  const browser = await chromium.launch({ args: ["--use-gl=angle", "--enable-webgl", "--ignore-gpu-blocklist"] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(3500); // догрузка GLB/текстур + переліт камери
  await page.screenshot({ path: `screenshots/${name}.png` });
  console.log(`saved screenshots/${name}.png`);
  if (errors.length) { console.log("console errors:"); errors.forEach((e) => console.log("  -", e.slice(0, 300))); }
  await browser.close();
})();
