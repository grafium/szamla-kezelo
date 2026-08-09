// Egyszerű, memóriában tartott sebességkorlátozó a bejelentkezéshez.
//
// Korlát: serverless környezetben (Vercel) példányonként külön memória van,
// így ez nem globális korlát — a próbálkozások költségét viszont érdemben
// megemeli, és nem igényel adatbázis-migrációt. Szigorúbb, elosztott
// korlátozáshoz Redis/Upstash vagy egy LoginAttempt tábla kell.

interface Bucket {
  count: number;
  resetAt: number;
  blockedUntil: number;
}

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 15 * 60 * 1000; // 15 perc
const MAX_ATTEMPTS = 8;
const BLOCK_MS = 15 * 60 * 1000;
const MAX_KEYS = 5000; // memóriakorlát: a lejárt kulcsokat takarítjuk

function sweep(now: number) {
  if (buckets.size < MAX_KEYS) return;
  for (const [key, b] of buckets) {
    if (b.resetAt < now && b.blockedUntil < now) buckets.delete(key);
  }
}

/** true, ha a kulcs (pl. e-mail cím) jelenleg zárolva van. */
export function isRateLimited(key: string): boolean {
  const b = buckets.get(key);
  return !!b && b.blockedUntil > Date.now();
}

/** Sikertelen próbálkozás rögzítése; a limit elérésekor zárol. */
export function registerFailure(key: string): void {
  const now = Date.now();
  sweep(now);
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS, blockedUntil: 0 });
    return;
  }
  b.count++;
  if (b.count >= MAX_ATTEMPTS) {
    b.blockedUntil = now + BLOCK_MS;
    b.count = 0;
    b.resetAt = now + WINDOW_MS;
  }
}

/** Sikeres belépés — a számláló nullázódik. */
export function registerSuccess(key: string): void {
  buckets.delete(key);
}
