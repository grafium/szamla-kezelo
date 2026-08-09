import type { NextConfig } from "next";

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
};

export default nextConfig;
