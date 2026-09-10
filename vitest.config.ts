/**
 * Конфіг vitest: node-середовище, тести у tests/**\/*.test.ts, alias «@/» = корінь проєкту
 * (як у tsconfig.json paths). Запуск: npx vitest run [tests/units.test.ts]
 */
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: { alias: { "@": root } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
