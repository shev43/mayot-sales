// STATIC_EXPORT=1 — статичний експорт для GitHub Pages: сайт пишеться у .next-export/ (окремий distDir, щоб не заважати dev-серверу);
// NEXT_PUBLIC_BASE_PATH — підкаталог сайту (на Pages: /mayot-sales), локально порожній.
const isStatic = process.env.STATIC_EXPORT === "1";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(isStatic ? { output: "export", trailingSlash: true, distDir: ".next-export" } : {}),
  ...(basePath ? { basePath } : {}),
  images: { unoptimized: true },
};

export default nextConfig;
