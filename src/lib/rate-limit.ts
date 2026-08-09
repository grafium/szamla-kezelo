import { prisma } from "@/lib/prisma";

// Sebességkorlátozó a bejelentkezéshez, adatbázis-alapú számlálóval.
//
// Serverless környezetben (Vercel) minden példánynak külön memóriája van, ezért
// egy memóriabeli Map nem ad globális korlátot: elég sok párhuzamos példány
// mellett a próbálkozások száma többszörözhető. A számláló ezért a
// LoginAttempt táblában él, így a korlát a példányok között is érvényes.
//
// A számláló nem eshet a bejelentkezés útjába: ha az adatbázis-művelet hibára
// fut, a hívások „nyitva hagynak" (a belépés folytatódik), és a szerverlogba
// figyelmeztetés kerül. Egy adatbázis-hiba így nem zárja ki mindenkit.

const WINDOW_MS = 15 * 60 * 1000; // 15 perc
const MAX_ATTEMPTS = 8;
const BLOCK_MS = 15 * 60 * 1000;

function warn(operation: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  console.warn(`Sebességkorlát (${operation}) nem elérhető: ${message}`);
}

/** true, ha a kulcs (pl. e-mail cím) jelenleg zárolva van. */
export async function isRateLimited(key: string): Promise<boolean> {
  try {
    const row = await prisma.loginAttempt.findUnique({ where: { key } });
    return !!row?.blockedUntil && row.blockedUntil.getTime() > Date.now();
  } catch (err) {
    warn("ellenőrzés", err);
    return false;
  }
}

/** Sikertelen próbálkozás rögzítése; a limit elérésekor zárol. */
export async function registerFailure(key: string): Promise<void> {
  const now = new Date();
  try {
    // Az increment atomi, így párhuzamos kérések sem írják felül egymást.
    const row = await prisma.loginAttempt.upsert({
      where: { key },
      create: { key, count: 1, windowEndsAt: new Date(now.getTime() + WINDOW_MS) },
      update: { count: { increment: 1 } },
    });

    if (row.windowEndsAt.getTime() <= now.getTime()) {
      // A korábbi ablak lejárt — új ablak indul ezzel a próbálkozással.
      await prisma.loginAttempt.update({
        where: { key },
        data: {
          count: 1,
          windowEndsAt: new Date(now.getTime() + WINDOW_MS),
          blockedUntil: null,
        },
      });
      return;
    }

    if (row.count >= MAX_ATTEMPTS) {
      await prisma.loginAttempt.update({
        where: { key },
        data: {
          count: 0,
          windowEndsAt: new Date(now.getTime() + WINDOW_MS),
          blockedUntil: new Date(now.getTime() + BLOCK_MS),
        },
      });
    }
  } catch (err) {
    warn("rögzítés", err);
  }
}

/** Sikeres belépés — a számláló nullázódik. */
export async function registerSuccess(key: string): Promise<void> {
  try {
    await prisma.loginAttempt.delete({ where: { key } });
  } catch {
    // Nem volt sor (P2025) — nincs mit törölni.
  }
}

/**
 * A lejárt számlálók takarítása. A napi cron hívja, hogy a tábla ne nőjön
 * korlátlanul a sikertelen próbálkozások kulcsaival.
 */
export async function purgeExpiredAttempts(now = new Date()): Promise<number> {
  try {
    const { count } = await prisma.loginAttempt.deleteMany({
      where: {
        windowEndsAt: { lt: now },
        OR: [{ blockedUntil: null }, { blockedUntil: { lt: now } }],
      },
    });
    return count;
  } catch (err) {
    warn("takarítás", err);
    return 0;
  }
}
