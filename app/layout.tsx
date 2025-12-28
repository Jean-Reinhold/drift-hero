import "./globals.css";
import type { Metadata } from "next";
import { Space_Grotesk, Syne } from "next/font/google";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
  weight: ["400", "500", "600", "700"]
});

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["600", "700", "800"]
});

export const metadata: Metadata = {
  title: "Drift Hero",
  description:
    "Drift Hero is a dark-themed, top-down drifting game with an endless procedural track."
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${spaceGrotesk.variable} ${syne.variable}`}>
        {children}
      </body>
    </html>
  );
}
