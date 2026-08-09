import { prisma } from "./prisma";
import type { Currency } from "./constants";
import { convertMinor } from "./money";

// Árfolyamkezelés: a tranzakció napi árfolyama rögzül a tételen, visszamenőleg
// nem számolunk újra. Hétvégére/ünnepnapra az utolsó elérhető munkanapi árfolyam.

/** Az adott napra (vagy az azt megelőző utolsó elérhető napra) érvényes árfolyam. */
export async function getRate(from: Currency, to: Currency, date: Date): Promise<number> {
  if (from === to) return 1;
  const direct = await prisma.exchangeRate.findFirst({
    where: { baseCurrency: from, targetCurrency: to, date: { lte: date } },
    orderBy: { date: "desc" },
  });
  if (direct) return direct.rate;
  const inverse = await prisma.exchangeRate.findFirst({
    where: { baseCurrency: to, targetCurrency: from, date: { lte: date } },
    orderBy: { date: "desc" },
  });
  if (inverse) return 1 / inverse.rate;
  // vésztartalék, ha még nincs betöltött árfolyam
  const fallback: Record<string, number> = {
    "EUR-HUF": 395, "USD-HUF": 365, "EUR-USD": 1.08, "USD-EUR": 0.93,
    "HUF-EUR": 1 / 395, "HUF-USD": 1 / 365,
  };
  const rate = fallback[`${from}-${to}`] ?? 1;
  // Legyen látható a logban, ha vésztartalék-árfolyammal számoltunk: ilyenkor
  // az árfolyam-szinkron (GET /api/cron/rates) nem futott le, vagy üres a tábla.
  console.warn(
    `[árfolyam] Nincs tárolt árfolyam a ${from}→${to} párra (${date.toISOString().slice(0, 10)}), ` +
      `vésztartalék értékkel számolunk: ${rate}. Futtasd az árfolyam-szinkront (/api/cron/rates).`
  );
  return rate;
}

/** Minor unit összeg átváltása alapdevizára a megadott napi árfolyammal. */
export async function toBase(
  amountMinor: number, currency: Currency, baseCurrency: Currency, date: Date
): Promise<{ baseAmount: number; rate: number }> {
  const rate = await getRate(currency, baseCurrency, date);
  return { baseAmount: convertMinor(amountMinor, rate, baseCurrency), rate };
}
