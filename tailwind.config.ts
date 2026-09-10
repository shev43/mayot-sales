import type { Config } from "tailwindcss";

// Палітра з промту §5: cream / sand / stone / graphite + emerald / gold
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#F5F1EA",
        sand: "#E6DCC8",
        stone: "#B8AE9C",
        graphite: "#2B2B2B",
        emerald: "#1F5C4A",
        gold: "#C9A96E",
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(43,43,43,.06), 0 12px 32px rgba(43,43,43,.10)",
      },
    },
  },
  plugins: [],
};
export default config;
