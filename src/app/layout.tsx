import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Számlakezelő",
  description: "Számla- és előfizetés-kezelő — beérkező számlák, banki kivonatok és előfizetések egy helyen",
};

const themeInit = `
try {
  const stored = localStorage.getItem("theme");
  const dark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (dark) document.documentElement.classList.add("dark");
} catch {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="hu" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
