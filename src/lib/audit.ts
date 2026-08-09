import type { NextRequest } from "next/server";

// Az auditnapló IP-mezőjének kitöltése.
//
// A Vercel (és minden fordított proxy) mögött a socket távoli címe a proxyé, a
// valódi kliens az `x-forwarded-for` első eleme. A fejléc a proxyn kívülről
// hamisítható, ezért ez az érték nyomkövetésre jó, hitelesítésre nem — döntést
// soha ne alapozzunk rá.

const MAX_LEN = 45; // egy IPv6 cím szöveges hossza

function normalize(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_LEN);
}

/** A kérés forrás-IP-je, vagy null, ha egyetlen fejléc sem adja meg. */
export function clientIp(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    // "kliens, proxy1, proxy2" — a lánc első eleme a kliens.
    const first = forwarded.split(",")[0];
    if (first) {
      const ip = normalize(first);
      if (ip) return ip;
    }
  }
  for (const header of ["x-real-ip", "cf-connecting-ip"]) {
    const value = req.headers.get(header);
    if (value) {
      const ip = normalize(value);
      if (ip) return ip;
    }
  }
  return null;
}
