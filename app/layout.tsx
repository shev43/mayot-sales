import type { Metadata } from "next";
import { Cormorant_Garamond, DM_Sans } from "next/font/google";
import "./globals.css";

// Cormorant Garamond має кириличний subset; DM Sans — лише латиниця,
// для української відпрацьовує system-ui з fallback-стеку (див. README).
const display = Cormorant_Garamond({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600"],
  variable: "--font-display",
  display: "swap",
});
const sans = DM_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "MAYOT · 3D Sales Model",
  description: "Інтерактивна 3D-модель курорту MAYOT для Launch Day",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uk" className={`${display.variable} ${sans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
