import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Tartalom-biztonsági szabály (CSP).
//
// A Next.js App Router a szerveren renderelt oldalakba inline <script> blokkot
// tesz (az RSC-adatfolyam `self.__next_f.push(...)` hívásai), a felület pedig
// inline `style` attribútumokat használ — ezért a script/style forrás mellett
// az 'unsafe-inline' egyelőre kell. Szigorítható, ha a projekt nonce-alapú CSP-re
// tér át (middleware-ben generált nonce + a Next `nonce` propagálása).
// Fejlesztésben ezen túl az 'unsafe-eval' (React Refresh) és a ws: (HMR) is kell.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  `connect-src 'self'${isDev ? " ws:" : ""}`,
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // A frame-ancestors modern böngészőben ezt kiváltja, de a régiek még ezt olvassák.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // HSTS csak élesben: helyi fejlesztésnél a böngésző a localhost:3000-et is
  // tartósan HTTPS-re kényszerítené.
  ...(isDev
    ? []
    : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  // Demó-mód: bejelentkezés nélküli használat + demó viselkedés (fordítási időben beégetve)
  env: { DEMO_MODE: "1" },
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
  // Demó: a build során seedelt SQLite adatbázis bekerül a serverless bundle-be
  outputFileTracingIncludes: {
    "/**": ["./prisma/dev.db"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
