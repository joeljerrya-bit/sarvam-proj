import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Blindfold — Chess by ear",
  description: "Play chess without looking at the board, with Sarvam voice AI.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
