import type { Currency } from "./constants";

// Minden összeg a deviza legkisebb egységében (fillér/cent) tárolt integer.
// HUF-nál megjelenítéskor egész forintra kerekítünk (ROUND_HALF_UP),
// EUR/USD-nél 2 tizedesre.

export function minorToMajor(amount: number, currency: Currency): number {
  return amount / 100;
}

export function majorToMinor(amount: number, currency: Currency): number {
  return Math.round(amount * 100);
}

/** ROUND_HALF_UP kerekítés adott tizedesjegyre. */
export function roundHalfUp(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.sign(value) * Math.round(Math.abs(value) * factor) / factor;
}

const CURRENCY_SYMBOLS: Record<Currency, string> = {
  HUF: "Ft",
  EUR: "€",
  USD: "$",
};

/** Magyar számformátum: ezres tagolás szóközzel, tizedesvessző. */
export function formatNumberHu(value: number, decimals: number): string {
  const fixed = Math.abs(value).toFixed(decimals);
  const [int, frac] = fixed.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const sign = value < 0 ? "−" : "";
  return sign + grouped + (frac ? "," + frac : "");
}

/** Összeg formázása: minor unitból, devizajellel. Pl. 4900 EUR → "€ 49,00", 1938000 HUF → "19 380 Ft". */
export function formatMoney(amountMinor: number, currency: Currency): string {
  const major = amountMinor / 100;
  if (currency === "HUF") {
    return `${formatNumberHu(roundHalfUp(major, 0), 0)} Ft`;
  }
  return `${CURRENCY_SYMBOLS[currency]} ${formatNumberHu(roundHalfUp(major, 2), 2)}`;
}

/** Átszámított érték halvány megjelenítéséhez: "~19 380 Ft". */
export function formatMoneyApprox(amountMinor: number, currency: Currency): string {
  return `~${formatMoney(amountMinor, currency)}`;
}

/**
 * Devizaátváltás rögzített árfolyammal.
 * A rate: 1 egység `from` = `rate` egység `to` (major egységben).
 */
export function convertMinor(amountMinor: number, rate: number, to: Currency): number {
  const converted = (amountMinor / 100) * rate;
  const decimals = to === "HUF" ? 0 : 2;
  return Math.round(roundHalfUp(converted, decimals) * 100);
}

/** Devizánkénti részösszegek — vegyes listában soha nem adunk össze különböző devizákat. */
export function sumByCurrency(items: { amount: number; currency: string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) {
    out[it.currency] = (out[it.currency] ?? 0) + it.amount;
  }
  return out;
}
