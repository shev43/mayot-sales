import type { Metadata } from "next";
import { Unbounded, Golos_Text } from "next/font/google";
import "./globals.css";

// Система A: Unbounded — заголовки й великі числа, Golos Text — увесь інший текст.
// Обидва мають кириличний subset.
const display = Unbounded({
  subsets: ["latin", "cyrillic"],
  weight: ["300", "400", "500"],
  variable: "--font-display",
  display: "swap",
});
const sans = Golos_Text({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600"],
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
