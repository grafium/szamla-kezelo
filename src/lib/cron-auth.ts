import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

// A cron-végpontok token-ellenőrzése. A `!==` összehasonlítás futásideje függ
// attól, hány karakter egyezik, ami elvben kiszivárogtatja a titkot; ezért
// konstans idejű összehasonlítást használunk.

function safeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  // A timingSafeEqual azonos hosszt vár — a hosszkülönbséget külön kezeljük,
  // de az összehasonlítást így is végigfuttatjuk.
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/** true, ha a kérés érvényes CRON_SECRET tokent hoz (query vagy Bearer fejléc). */
export function isAuthorizedCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const token =
    req.nextUrl.searchParams.get("token") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  return safeEquals(token, secret);
}
