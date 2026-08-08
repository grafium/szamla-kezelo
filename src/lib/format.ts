import { format, differenceInCalendarDays } from "date-fns";
import { hu } from "date-fns/locale";

// Dátumformátum: `2026. 08. 08.` — magyar könyvelési konvenció szerint.
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "–";
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, "yyyy. MM. dd.");
}

export function formatDateLong(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, "yyyy. MMMM d.", { locale: hu });
}

export function formatMonth(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, "yyyy. MMM", { locale: hu });
}

export function daysUntil(date: Date | string): number {
  const d = typeof date === "string" ? new Date(date) : date;
  return differenceInCalendarDays(d, new Date());
}

export function daysOverdue(date: Date | string): number {
  return -daysUntil(date);
}

/** "3 nap múlva" / "ma" / "2 napja" */
export function relativeDays(date: Date | string): string {
  const n = daysUntil(date);
  if (n === 0) return "ma";
  if (n === 1) return "holnap";
  if (n > 0) return `${n} nap múlva`;
  if (n === -1) return "tegnap";
  return `${-n} napja`;
}

export function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function parseJsonNumbers(value: string | null | undefined): number[] {
  return parseJsonArray(value).map(Number).filter((n) => !Number.isNaN(n));
}
