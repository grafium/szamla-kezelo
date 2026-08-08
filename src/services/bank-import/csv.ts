import { BANK_TEMPLATES } from "./templates";

// Bank CSV feldolgozás: minimális, de robusztus parser (idézőjeles mezők, CRLF),
// sablon-felismerés a fejléc alapján, sor-normalizálás (magyar összeg- és
// dátumformátumok) és duplikátum-kulcs képzés.

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

/** Egyszerű CSV parser: idézőjeles mezők ("" escape), CRLF/LF sortörés, BOM eltávolítás. */
export function parseCsv(text: string, delimiter = ";"): ParsedCsv {
  const src = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => {
    pushField();
    // teljesen üres sorokat kihagyjuk
    if (row.length > 1 || row[0].trim() !== "") rows.push(row);
    row = [];
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      pushField();
    } else if (ch === "\n") {
      pushRow();
    } else if (ch === "\r") {
      if (src[i + 1] === "\n") i++;
      pushRow();
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) pushRow();

  const headers = (rows.shift() ?? []).map((h) => h.trim());
  return { headers, rows };
}

/** Elválasztó tippelése az első sor alapján (";", ",", tab). */
export function detectDelimiter(text: string): string {
  const firstLine = text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "";
  const candidates = [";", ",", "\t"];
  let best = ";";
  let bestCount = -1;
  for (const c of candidates) {
    const count = firstLine.split(c).length - 1;
    if (count > bestCount) { best = c; bestCount = count; }
  }
  return best;
}

/** Fejléc alapján megpróbáljuk felismerni a bank-sablont. */
export function guessTemplate(headers: string[]): string | null {
  const set = new Set(headers.map((h) => h.trim().toLowerCase()));
  let best: { id: string; score: number } | null = null;
  for (const t of BANK_TEMPLATES) {
    const cols = Object.values(t.columns).filter(Boolean) as string[];
    const required = [t.columns.bookingDate, t.columns.amount];
    if (!required.every((c) => set.has(c.toLowerCase()))) continue;
    const hit = cols.filter((c) => set.has(c.toLowerCase())).length;
    const score = hit / cols.length;
    if (!best || score > best.score) best = { id: t.id, score };
  }
  return best && best.score >= 0.6 ? best.id : null;
}

export interface ColumnMapping {
  bookingDate: number;
  valueDate?: number;
  amount: number;
  currency?: number;
  counterpartyName?: number;
  counterpartyAccount?: number;
  reference?: number;
}

export interface NormalizedRow {
  bookingDate: Date;
  valueDate?: Date;
  amount: number; // előjeles, minor unit
  currency?: string;
  counterpartyName?: string;
  counterpartyAccount?: string;
  reference?: string;
}

/**
 * Összeg értelmezése magyar és nemzetközi formátumokból:
 * "1 234 567,89" · "-12,50" · "1.234,56" · "1234.56" — devizajel/utótag eltávolítva.
 * Eredmény: előjeles minor unit (fillér/cent) egész.
 */
export function parseAmount(raw: string): number {
  let s = raw.trim().replace(/\u00A0/g, " ");
  if (!s) throw new Error("Hiányzó összeg");
  s = s.replace(/HUF|EUR|USD|Ft|€|\$/gi, "").trim();

  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  if (/^[-−–]/.test(s) || /[-−–]$/.test(s)) negative = true;
  s = s.replace(/[-−–+]/g, "").replace(/\s+/g, "");

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", "."); // "1.234,56"
    } else {
      s = s.replace(/,/g, ""); // "1,234.56"
    }
  } else if (hasComma) {
    const commas = s.match(/,/g)!.length;
    s = commas > 1 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (hasDot) {
    const dots = s.match(/\./g)!.length;
    if (dots > 1) s = s.replace(/\./g, ""); // "1.234.567"
  }

  const n = Number(s);
  if (s === "" || !Number.isFinite(n)) throw new Error(`Értelmezhetetlen összeg: "${raw}"`);
  return Math.round(n * 100) * (negative ? -1 : 1);
}

/**
 * Dátum értelmezése: "yyyy.MM.dd." · "yyyy.MM.dd" · "yyyy-MM-dd" ·
 * "dd/MM/yyyy" · "dd-MM-yyyy" (opcionális szóközökkel).
 */
export function parseDate(raw: string): Date {
  const s = raw.trim();
  let y = 0, mo = 0, day = 0;
  let m = s.match(/^(\d{4})[.\-\/]\s*(\d{1,2})[.\-\/]\s*(\d{1,2})\.?$/);
  if (m) {
    y = +m[1]; mo = +m[2]; day = +m[3];
  } else {
    m = s.match(/^(\d{1,2})[\/\-.]\s*(\d{1,2})[\/\-.]\s*(\d{4})\.?$/);
    if (m) { day = +m[1]; mo = +m[2]; y = +m[3]; }
  }
  if (!m || mo < 1 || mo > 12 || day < 1 || day > 31) {
    throw new Error(`Értelmezhetetlen dátum: "${raw}"`);
  }
  const d = new Date(Date.UTC(y, mo - 1, day));
  if (d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== day) {
    throw new Error(`Érvénytelen dátum: "${raw}"`);
  }
  return d;
}

/** Egy CSV-sor normalizálása a megadott oszlop-hozzárendelés szerint. Hibás mezőnél magyar üzenettel dob. */
export function normalizeRow(
  row: string[],
  mapping: ColumnMapping,
  options: { currencyFallback?: string } = {}
): NormalizedRow {
  const cell = (idx: number | undefined): string | undefined => {
    if (idx == null || idx < 0) return undefined;
    const v = row[idx]?.trim();
    return v ? v : undefined;
  };

  const bookingRaw = cell(mapping.bookingDate);
  if (!bookingRaw) throw new Error("Hiányzó könyvelési dátum");
  const amountRaw = cell(mapping.amount);
  if (!amountRaw) throw new Error("Hiányzó összeg");

  const valueRaw = cell(mapping.valueDate);
  const out: NormalizedRow = {
    bookingDate: parseDate(bookingRaw),
    valueDate: valueRaw ? parseDate(valueRaw) : undefined,
    amount: parseAmount(amountRaw),
    currency: cell(mapping.currency)?.toUpperCase() ?? options.currencyFallback,
    counterpartyName: cell(mapping.counterpartyName),
    counterpartyAccount: cell(mapping.counterpartyAccount),
    reference: cell(mapping.reference),
  };
  return out;
}

/** Duplikátum-kulcs: endToEndId, ennek híján dátum + összeg + közlemény. */
export function dedupKey(tx: {
  endToEndId?: string | null;
  bookingDate: Date | string;
  amount: number;
  reference?: string | null;
}): string {
  if (tx.endToEndId) return `e2e:${tx.endToEndId}`;
  const d =
    typeof tx.bookingDate === "string"
      ? tx.bookingDate.slice(0, 10)
      : tx.bookingDate.toISOString().slice(0, 10);
  return `${d}|${tx.amount}|${(tx.reference ?? "").trim().toLowerCase()}`;
}
