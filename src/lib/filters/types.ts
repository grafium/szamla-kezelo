// Általános, kombinálható szűrőmotor — minden lista ugyanezt használja.
// A szűrőállapot URL-ben kódolva (?f=<JSON>), így megosztható és a vissza gomb is működik.

export type FieldType =
  | "text"
  | "number" // egész szám (pl. napok, licencszám)
  | "money" // minor unitban tárolt összeg; a felhasználó major egységben ír be
  | "date"
  | "select" // egy vagy több érték választék közül
  | "tags"
  | "boolean";

export type TextOp = "contains" | "notContains" | "equals" | "startsWith" | "endsWith" | "empty" | "notEmpty";
export type NumberOp = "eq" | "neq" | "gt" | "lt" | "gte" | "lte" | "between" | "empty";
export type DateOp =
  | "on"
  | "before"
  | "after"
  | "between"
  | "today"
  | "tomorrow"
  | "thisWeek"
  | "nextWeek"
  | "thisMonth"
  | "lastMonth"
  | "thisYear"
  | "lastYear"
  | "nextNDays"
  | "lastNDays"
  | "fiscalYear";
export type SelectOp = "anyOf" | "noneOf";
export type TagsOp = "hasAll" | "hasAny" | "hasNone";
export type BooleanOp = "isTrue" | "isFalse";

export type Operator = TextOp | NumberOp | DateOp | SelectOp | TagsOp | BooleanOp;

export interface Condition {
  field: string;
  op: Operator;
  value?: unknown; // szám, szöveg, [min,max], string[], N (napok)
}

export interface FilterGroup {
  logic: "AND" | "OR";
  // max 2 szint: a csoport elemei feltételek vagy egy szint mélységű alcsoportok
  items: (Condition | FilterGroup)[];
}

export function isGroup(item: Condition | FilterGroup): item is FilterGroup {
  return (item as FilterGroup).logic !== undefined;
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  /** Prisma mezőútvonal, pl. "grossAmount" vagy "partner.name". Ha hiányzik, computed. */
  path?: string;
  /** Számított mező: a lekérdezés után, JS-ben szűrjük. */
  computed?: (row: any) => unknown;
  options?: SelectOption[];
  /** relációs select-nél (partner, kategória) a Prisma id-mező útvonala */
  idPath?: string;
}

/** A kliens-oldali szűrősávnak átadható, szerializálható mezőleírás
 * (a `computed` függvények nem mehetnek át szerver→kliens határon). */
export interface ClientFieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: SelectOption[];
}

export function toClientFields(defs: FieldDef[]): ClientFieldDef[] {
  return defs.map(({ key, label, type, options }) => ({ key, label, type, options }));
}

export const OPERATOR_LABELS: Record<string, string> = {
  contains: "tartalmazza",
  notContains: "nem tartalmazza",
  equals: "pontosan",
  startsWith: "kezdődik",
  endsWith: "végződik",
  empty: "üres",
  notEmpty: "nem üres",
  eq: "=",
  neq: "≠",
  gt: ">",
  lt: "<",
  gte: "≥",
  lte: "≤",
  between: "között",
  on: "pontosan",
  before: "előtte",
  after: "utána",
  today: "ma",
  tomorrow: "holnap",
  thisWeek: "ezen a héten",
  nextWeek: "jövő héten",
  thisMonth: "ebben a hónapban",
  lastMonth: "múlt hónapban",
  thisYear: "idén",
  lastYear: "tavaly",
  nextNDays: "következő N napban",
  lastNDays: "elmúlt N napban",
  fiscalYear: "pénzügyi év",
  anyOf: "bármelyik",
  noneOf: "egyik sem",
  hasAll: "tartalmazza mindet",
  hasAny: "tartalmazza bármelyiket",
  hasNone: "nem tartalmazza",
  isTrue: "igaz",
  isFalse: "hamis",
};

export const OPERATORS_BY_TYPE: Record<FieldType, Operator[]> = {
  text: ["contains", "notContains", "equals", "startsWith", "endsWith", "empty", "notEmpty"],
  number: ["eq", "neq", "gt", "lt", "gte", "lte", "between", "empty"],
  money: ["eq", "neq", "gt", "lt", "gte", "lte", "between", "empty"],
  date: [
    "on", "before", "after", "between",
    "today", "tomorrow", "thisWeek", "nextWeek", "thisMonth", "lastMonth",
    "thisYear", "lastYear", "nextNDays", "lastNDays", "fiscalYear",
  ],
  select: ["anyOf", "noneOf"],
  tags: ["hasAll", "hasAny", "hasNone"],
  boolean: ["isTrue", "isFalse"],
};
