import { differenceInCalendarDays } from "date-fns";

// Banki tétel ↔ számla párosítás súlyozott pontszámmal (6.2 fejezet):
//   pontos összeg + deviza egyezés            → +0,4
//   dátum a határidőhöz képest −5…+30 nap     → +0,2
//   a közleményben szerepel a számlaszám      → +0,3
//   partner IBAN vagy név/alias egyezés       → +0,2
// ≥ 0,85 → automatikus párosítás; 0,5–0,85 → javaslat; < 0,5 → párosítatlan.

export const AUTO_MATCH_THRESHOLD = 0.85;
export const SUGGEST_THRESHOLD = 0.5;

export interface TxLike {
  amount: number; // előjeles, minor unit
  currency: string;
  bookingDate: Date;
  reference: string | null;
  counterpartyName: string | null;
  counterpartyIban: string | null;
}

export interface InvoiceLike {
  id: string;
  grossAmount: number;
  currency: string;
  dueDate: Date;
  invoiceNumber: string;
  direction: string;
  partner?: {
    id: string;
    name: string;
    iban: string | null;
    aliases?: { alias: string }[];
  } | null;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function scoreMatch(tx: TxLike, invoice: InvoiceLike): number {
  let score = 0;

  // bejövő számlát terhelés (negatív összeg) fizet; kimenőt jóváírás
  const txAbs = Math.abs(tx.amount);
  const directionOk =
    (invoice.direction === "INCOMING" && tx.amount < 0) ||
    (invoice.direction === "OUTGOING" && tx.amount > 0);
  if (!directionOk) return 0;

  if (txAbs === invoice.grossAmount && tx.currency === invoice.currency) score += 0.4;

  const diff = differenceInCalendarDays(tx.bookingDate, invoice.dueDate);
  if (diff >= -5 && diff <= 30) score += 0.2;

  if (tx.reference && normalize(tx.reference).includes(normalize(invoice.invoiceNumber))) {
    score += 0.3;
  }

  const partner = invoice.partner;
  if (partner) {
    const ibanMatch =
      partner.iban && tx.counterpartyIban &&
      normalize(partner.iban) === normalize(tx.counterpartyIban);
    const names = [partner.name, ...(partner.aliases?.map((a) => a.alias) ?? [])];
    const nameMatch =
      tx.counterpartyName &&
      names.some((n) => {
        const a = normalize(n);
        const b = normalize(tx.counterpartyName!);
        return a.length > 2 && (b.includes(a) || a.includes(b));
      });
    if (ibanMatch || nameMatch) score += 0.2;
  }

  return Math.min(1, score);
}

export interface MatchSuggestion {
  invoiceId: string;
  score: number;
}

/** Legjobb találatok egy banki tételhez a nyitott számlák közül. */
export function suggestMatches(tx: TxLike, invoices: InvoiceLike[], limit = 5): MatchSuggestion[] {
  return invoices
    .map((inv) => ({ invoiceId: inv.id, score: scoreMatch(tx, inv) }))
    .filter((m) => m.score >= SUGGEST_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
