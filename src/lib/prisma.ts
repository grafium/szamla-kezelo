import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

// Vercel serverless demó: a build során seedelt SQLite adatbázist a csak-olvasható
// bundle-ből az írható /tmp-be másoljuk (példányonként egyszer). A módosítások a
// lambda-példány élettartamáig élnek — demó célra pont megfelelő, éleshez Postgres.
if (process.env.VERCEL && !process.env.DATABASE_URL?.startsWith("postgres")) {
  const bundled = path.join(process.cwd(), "prisma", "dev.db");
  const writable = "/tmp/dev.db";
  if (!fs.existsSync(writable) && fs.existsSync(bundled)) {
    fs.copyFileSync(bundled, writable);
  }
  process.env.DATABASE_URL = `file:${writable}`;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
