import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "GPTishka Админка",
  description: "Админ-панель GPTishka Store"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
