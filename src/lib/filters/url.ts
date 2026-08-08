import type { FilterGroup } from "./types";

// A szűrőállapot URL-paraméterben (?f=) utazik, JSON-ként kódolva.

export function encodeFilter(group: FilterGroup | null): string | null {
  if (!group || group.items.length === 0) return null;
  return encodeURIComponent(JSON.stringify(group));
}

export function decodeFilter(raw: string | string[] | undefined | null): FilterGroup | null {
  if (!raw) return null;
  const value = Array.isArray(raw) ? raw[0] : raw;
  try {
    const parsed = JSON.parse(decodeURIComponent(value));
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.items)) {
      return parsed as FilterGroup;
    }
  } catch {
    // hibás URL-paraméter → szűrő nélkül
  }
  return null;
}
