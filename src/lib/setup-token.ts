import { timingSafeEqual } from "crypto";

// Az első-indítási varázsló opcionális telepítési kulcsa.
//
// Ha a SETUP_TOKEN környezeti változó be van állítva, a /setup csak a kulcs
// birtokában használható — így friss telepítésnél a varázsló nem áll nyitva
// bárkinek addig, amíg valaki ki nem tölti.

/** A beállított telepítési kulcs, vagy null, ha nincs SETUP_TOKEN. */
export function configuredSetupToken(): string | null {
  const value = (process.env.SETUP_TOKEN ?? "").trim();
  return value.length > 0 ? value : null;
}

/** Kell-e kulcs a telepítéshez. */
export function setupTokenRequired(): boolean {
  return configuredSetupToken() !== null;
}

/** Időzítés-független összehasonlítás a beállított kulccsal. */
export function setupTokenMatches(given: string): boolean {
  const expected = configuredSetupToken();
  if (!expected) return true;
  const a = Buffer.from(given.trim());
  const b = Buffer.from(expected);
  // A timingSafeEqual egyenlő hosszt vár; a hosszkülönbség maga nem titok.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
