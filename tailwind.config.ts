import type { Config } from "tailwindcss";

// Палітра §5 (cream / sand / stone / graphite + emerald / gold) + тони системи A:
// paper — тло панелей, linen — волосяні розділювачі, taupe — приглушений текст, moss — вимкнені іконки
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#F5F1EA",
        paper: "#FBF9F4",
        sand: "#E6DCC8",
        linen: "#EFE9DE",
        stone: "#B8AE9C",
        taupe: "#7A7466",
        moss: "#9A9384",
        graphite: "#2B2B2B",
        emerald: "#1F5C4A",
        "emerald-dark": "#164237",
        gold: "#C9A96E",
      },
      fontFamily: {
        display: ["var(--font-display)", "Arial Black", "sans-serif"],
        sans: ["var(--font-sans)", "Segoe UI", "Tahoma", "sans-serif"],
      },
      boxShadow: {
        panel: "0 18px 40px rgba(43,43,43,.10)",
        card: "0 18px 40px rgba(43,43,43,.10)",
      },
    },
  },
  plugins: [],
};
export default config;
