import {
  addDays, endOfDay, endOfMonth, endOfWeek, endOfYear,
  startOfDay, startOfMonth, startOfWeek, startOfYear, subDays, subMonths, subYears,
} from "date-fns";
import type { Condition, FieldDef, FilterGroup } from "./types";
import { isGroup } from "./types";
import { parseJsonArray } from "@/lib/format";
import { insensitive } from "@/lib/db-mode";

// A szűrőcsoportból Prisma `where` feltételt épít. A számított mezőkre (pl. havi
// ekvivalens, hátralévő napok) a lekérdezés után JS-szűrő fut (applyComputed).

type Where = Record<string, unknown>;

function setPath(path: string, value: unknown): Where {
  // "partner.name" → { partner: { name: value } } ; scalar mezőnél { name: value }
  const parts = path.split(".");
  let out: Where = { [parts[parts.length - 1]]: value } as Where;
  for (let i = parts.length - 2; i >= 0; i--) {
    out = { [parts[i]]: { is: out } };
  }
  return out;
}

function dateRange(op: string, value: unknown, fiscalYearStart = 1): [Date, Date] | null {
  const now = new Date();
  switch (op) {
    case "today": return [startOfDay(now), endOfDay(now)];
    case "tomorrow": { const t = addDays(now, 1); return [startOfDay(t), endOfDay(t)]; }
    case "thisWeek": return [startOfWeek(now, { weekStartsOn: 1 }), endOfWeek(now, { weekStartsOn: 1 })];
    case "nextWeek": { const n = addDays(now, 7); return [startOfWeek(n, { weekStartsOn: 1 }), endOfWeek(n, { weekStartsOn: 1 })]; }
    case "thisMonth": return [startOfMonth(now), endOfMonth(now)];
    case "lastMonth": { const m = subMonths(now, 1); return [startOfMonth(m), endOfMonth(m)]; }
    case "thisYear": return [startOfYear(now), endOfYear(now)];
    case "lastYear": { const y = subYears(now, 1); return [startOfYear(y), endOfYear(y)]; }
    case "nextNDays": return [startOfDay(now), endOfDay(addDays(now, Number(value) || 30))];
    case "lastNDays": return [startOfDay(subDays(now, Number(value) || 30)), endOfDay(now)];
    case "fiscalYear": {
      const fyStart = new Date(now.getFullYear(), fiscalYearStart - 1, 1);
      const start = fyStart <= now ? fyStart : new Date(now.getFullYear() - 1, fiscalYearStart - 1, 1);
      return [start, endOfDay(addDays(new Date(start.getFullYear() + 1, start.getMonth(), 1), -1))];
    }
    default: return null;
  }
}

function conditionToWhere(cond: Condition, def: FieldDef): Where | null {
  if (!def.path) return null; // computed → JS-ben szűrjük
  const p = def.path;
  const v = cond.value;
  switch (def.type) {
    case "text": {
      // Postgresen a szöveges összehasonlítás alapból kis-nagybetű-érzékeny,
      // ezért a felhasználó által beírt szűrőkhöz insensitive módot kérünk.
      const ci = insensitive();
      switch (cond.op) {
        case "contains": return setPath(p, { contains: String(v ?? ""), ...ci });
        case "notContains": return { NOT: setPath(p, { contains: String(v ?? ""), ...ci }) };
        case "equals": return setPath(p, { equals: String(v ?? ""), ...ci });
        case "startsWith": return setPath(p, { startsWith: String(v ?? ""), ...ci });
        case "endsWith": return setPath(p, { endsWith: String(v ?? ""), ...ci });
        case "empty": return { OR: [setPath(p, null), setPath(p, "")] };
        case "notEmpty": return { AND: [{ NOT: setPath(p, null) }, { NOT: setPath(p, "") }] };
      }
      break;
    }
    case "number":
    case "money": {
      // money: a felhasználó major egységben ad meg értéket → minor unitra váltjuk
      const scale = def.type === "money" ? 100 : 1;
      const num = (x: unknown) => Math.round(Number(x) * scale);
      switch (cond.op) {
        case "eq": return setPath(p, num(v));
        case "neq": return { NOT: setPath(p, num(v)) };
        case "gt": return setPath(p, { gt: num(v) });
        case "lt": return setPath(p, { lt: num(v) });
        case "gte": return setPath(p, { gte: num(v) });
        case "lte": return setPath(p, { lte: num(v) });
        case "between": {
          const [a, b] = Array.isArray(v) ? v : [0, 0];
          return setPath(p, { gte: num(a), lte: num(b) });
        }
        case "empty": return setPath(p, null);
      }
      break;
    }
    case "date":
      switch (cond.op) {
        case "on": {
          const d = new Date(String(v));
          return setPath(p, { gte: startOfDay(d), lte: endOfDay(d) });
        }
        case "before": return setPath(p, { lt: startOfDay(new Date(String(v))) });
        case "after": return setPath(p, { gt: endOfDay(new Date(String(v))) });
        case "between": {
          const [a, b] = Array.isArray(v) ? v : [v, v];
          return setPath(p, { gte: startOfDay(new Date(String(a))), lte: endOfDay(new Date(String(b))) });
        }
        default: {
          const range = dateRange(cond.op, v);
          if (range) return setPath(p, { gte: range[0], lte: range[1] });
        }
      }
      break;
    case "select": {
      const values = Array.isArray(v) ? v.map(String) : [String(v)];
      const target = def.idPath ?? p;
      if (cond.op === "anyOf") return setPath(target, { in: values });
      if (cond.op === "noneOf") return { NOT: setPath(target, { in: values }) };
      break;
    }
    case "tags": {
      // SQLite alatt a tags JSON-string — substring kereséssel szűrünk ("\"cimke\"")
      const values = Array.isArray(v) ? v.map(String) : [String(v)];
      const conds = values.map((tag) => setPath(p, { contains: `"${tag}"` }));
      if (cond.op === "hasAll") return { AND: conds };
      if (cond.op === "hasAny") return { OR: conds };
      if (cond.op === "hasNone") return { NOT: { OR: conds } };
      break;
    }
    case "boolean":
      return setPath(p, cond.op === "isTrue");
  }
  return null;
}

export interface BuiltFilter {
  where: Where;
  /** JS-oldali (számított mezős) feltételek, csoportlogikával együtt. */
  computedPredicate: ((row: any) => boolean) | null;
}

function evalCondition(cond: Condition, def: FieldDef, row: any): boolean {
  const raw = def.computed ? def.computed(row) : undefined;
  const v = cond.value;
  switch (def.type) {
    case "number":
    case "money": {
      const scale = def.type === "money" ? 100 : 1;
      const value = Number(raw);
      const num = (x: unknown) => Number(x) * scale;
      switch (cond.op) {
        case "eq": return value === num(v);
        case "neq": return value !== num(v);
        case "gt": return value > num(v);
        case "lt": return value < num(v);
        case "gte": return value >= num(v);
        case "lte": return value <= num(v);
        case "between": {
          const [a, b] = Array.isArray(v) ? v : [0, 0];
          return value >= num(a) && value <= num(b);
        }
        case "empty": return raw == null;
      }
      return true;
    }
    case "boolean":
      return cond.op === "isTrue" ? Boolean(raw) : !raw;
    case "text": {
      const s = String(raw ?? "").toLowerCase();
      const needle = String(v ?? "").toLowerCase();
      switch (cond.op) {
        case "contains": return s.includes(needle);
        case "notContains": return !s.includes(needle);
        case "equals": return s === needle;
        case "startsWith": return s.startsWith(needle);
        case "endsWith": return s.endsWith(needle);
        case "empty": return s === "";
        case "notEmpty": return s !== "";
      }
      return true;
    }
    default:
      return true;
  }
}

/**
 * Szűrőcsoport → { where, computedPredicate }.
 * A DB-ben szűrhető feltételek Prisma where-be kerülnek; a számítottak JS-predikátumba.
 * (Vegyes VAGY-csoportnál, ha van benne számított mező, a teljes csoport JS-ben fut,
 * hogy a logika helyes maradjon.)
 */
export function buildFilter(group: FilterGroup | null, defs: FieldDef[]): BuiltFilter {
  if (!group || group.items.length === 0) return { where: {}, computedPredicate: null };
  const defMap = new Map(defs.map((d) => [d.key, d]));

  function groupHasComputed(g: FilterGroup): boolean {
    return g.items.some((item) =>
      isGroup(item) ? groupHasComputed(item) : !defMap.get(item.field)?.path
    );
  }

  function buildWhere(g: FilterGroup): Where {
    const parts: Where[] = [];
    for (const item of g.items) {
      if (isGroup(item)) {
        if (groupHasComputed(item) && item.logic === "OR") continue; // teljes alcsoport JS-ben
        parts.push(buildWhere(item));
      } else {
        const def = defMap.get(item.field);
        if (!def) continue;
        const w = conditionToWhere(item, def);
        if (w) parts.push(w);
      }
    }
    if (parts.length === 0) return {};
    return g.logic === "AND" ? { AND: parts } : { OR: parts };
  }

  function buildPredicate(g: FilterGroup): ((row: any) => boolean) | null {
    const preds: ((row: any) => boolean)[] = [];
    const orWithComputed = g.logic === "OR" && groupHasComputed(g);
    for (const item of g.items) {
      if (isGroup(item)) {
        const sub = buildPredicate(item);
        if (sub) preds.push(sub);
      } else {
        const def = defMap.get(item.field);
        if (!def) continue;
        if (!def.path || orWithComputed) {
          if (def.computed || def.path) {
            // OR-csoportban a DB-s feltételt is JS-ben értékeljük az útvonal alapján
            const evalRow = (row: any) => {
              if (def.computed) return evalCondition(item, def, row);
              const val = def.path!.split(".").reduce((acc: any, k) => acc?.[k], row);
              return evalCondition(item, { ...def, computed: () => val }, row);
            };
            preds.push(evalRow);
          }
        }
      }
    }
    if (preds.length === 0) return null;
    return g.logic === "AND"
      ? (row) => preds.every((p) => p(row))
      : (row) => preds.some((p) => p(row));
  }

  return { where: buildWhere(group), computedPredicate: buildPredicate(group) };
}

/** Lekérdezés utáni szűrés a számított mezőkre. */
export function applyComputed<T>(rows: T[], built: BuiltFilter): T[] {
  if (!built.computedPredicate) return rows;
  return rows.filter((r) => built.computedPredicate!(r));
}
