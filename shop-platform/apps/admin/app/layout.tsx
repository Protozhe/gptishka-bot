import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "GPTishka Admin",
  description: "Production admin panel for GPTishka store"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
