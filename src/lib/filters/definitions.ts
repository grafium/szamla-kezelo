import { addDays, endOfDay, startOfDay, subDays } from "date-fns";
import type { FieldDef } from "./types";
import {
  BILLING_CYCLE_LABELS, BILLING_CYCLE_MONTHS, CURRENCIES,
  INVOICE_STATUS_LABELS, MATCH_STATUS_LABELS, PARTNER_TYPE_LABELS,
  PAYMENT_METHOD_LABELS, SUBSCRIPTION_STATUS_LABELS, VAT_RATE_LABELS,
} from "@/lib/constants";
import { daysUntil } from "@/lib/format";

// Szűrhető mezők entitásonként (7.3 fejezet). A computed mezők a lekérdezés után
// JS-ben szűrődnek; a többiek Prisma where-ben. Ahol a számított mezőnek van
// adatbázis-szintű megfelelője, ott `toWhere` is szerepel — így a lista lapozása
// és összegzése a DB-ben maradhat (nem kell minden sort betölteni).

const currencyOptions = CURRENCIES.map((c) => ({ value: c, label: c }));
const record = (obj: Record<string, string>) =>
  Object.entries(obj).map(([value, label]) => ({ value, label }));

export const invoiceFields: FieldDef[] = [
  { key: "partner", label: "Partner", type: "select", path: "partnerId", idPath: "partnerId" },
  { key: "partnerCountry", label: "Partner országa", type: "text", path: "partner.country" },
  { key: "partnerType", label: "Partner típusa", type: "select", path: "partner.type", options: record(PARTNER_TYPE_LABELS) },
  { key: "direction", label: "Irány", type: "select", path: "direction", options: [
    { value: "INCOMING", label: "Bejövő" }, { value: "OUTGOING", label: "Kimenő" }] },
  { key: "invoiceNumber", label: "Számlaszám", type: "text", path: "invoiceNumber" },
  { key: "status", label: "Státusz", type: "select", path: "status", options: record(INVOICE_STATUS_LABELS) },
  { key: "currency", label: "Deviza", type: "select", path: "currency", options: currencyOptions },
  { key: "grossAmount", label: "Bruttó összeg", type: "money", path: "grossAmount" },
  { key: "netAmount", label: "Nettó összeg", type: "money", path: "netAmount" },
  { key: "vatAmount", label: "ÁFA összeg", type: "money", path: "vatAmount" },
  { key: "baseAmount", label: "Összeg alapdevizában", type: "money", path: "baseAmount" },
  { key: "vatRate", label: "ÁFA-kulcs", type: "select", path: "vatRate", options: record(VAT_RATE_LABELS) },
  { key: "issueDate", label: "Kelt", type: "date", path: "issueDate" },
  { key: "fulfillmentDate", label: "Teljesítés", type: "date", path: "fulfillmentDate" },
  { key: "dueDate", label: "Fizetési határidő", type: "date", path: "dueDate" },
  { key: "overdueDays", label: "Késedelem (nap)", type: "number",
    computed: (r) => (r.status === "PAID" || r.status === "CANCELLED" ? 0 : Math.max(0, -daysUntil(r.dueDate))),
    // A késedelem napokban = a határidő és a mai nap közti naptári napok száma
    // nyitott számláknál, kifizetett/sztornó számláknál 0. Ezt naptári nap
    // határokra fordítjuk, hogy a szűrés és a lapozás az adatbázisban maradjon.
    toWhere: (cond) => {
      const now = new Date();
      const dayStart = (n: number) => startOfDay(subDays(now, n));
      const dayEnd = (n: number) => endOfDay(subDays(now, n));
      const open = { status: { notIn: ["PAID", "CANCELLED"] } };
      const closed = { status: { in: ["PAID", "CANCELLED"] } };
      const never = { id: { in: [] as string[] } };
      // „legfeljebb N napos késés": a lezárt számlák (0 nap) is beleesnek,
      // a nyitottak közül azok, amelyek határideje N-1 napnál nem régebbi.
      const lessThan = (n: number) =>
        n <= 0 ? never : { OR: [closed, { AND: [open, { dueDate: { gte: dayStart(n - 1) } }] }] };

      const n = Number(cond.value);
      if (cond.op === "between" && Array.isArray(cond.value)) {
        const [a, b] = (cond.value as unknown[]).map(Number);
        if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
        return { AND: [{ AND: [open, { dueDate: { lte: dayEnd(a) } }] }, lessThan(b + 1)] };
      }
      if (!Number.isFinite(n)) return null;
      if (cond.op === "gte") return { AND: [open, { dueDate: { lte: dayEnd(n) } }] };
      if (cond.op === "gt") return { AND: [open, { dueDate: { lte: dayEnd(n + 1) } }] };
      if (cond.op === "lt") return lessThan(n);
      if (cond.op === "lte") return lessThan(n + 1);
      if (cond.op === "eq")
        return n === 0
          ? lessThan(1)
          : { AND: [open, { dueDate: { gte: dayStart(n), lte: dayEnd(n) } }] };
      return null;
    } },
  { key: "category", label: "Kategória", type: "select", path: "categoryId", idPath: "categoryId" },
  { key: "tags", label: "Címkék", type: "tags", path: "tags" },
  { key: "paymentMethod", label: "Fizetési mód", type: "select", path: "paymentMethod", options: record(PAYMENT_METHOD_LABELS) },
  { key: "hasAttachment", label: "Van csatolmány", type: "boolean",
    computed: (r) => (r.attachments?.length ?? 0) > 0,
    toWhere: (cond) =>
      cond.op === "isTrue" ? { attachments: { some: {} } }
      : cond.op === "isFalse" ? { attachments: { none: {} } } : null },
  { key: "isMatched", label: "Párosítva banki tétellel", type: "boolean",
    computed: (r) => (r.bankTransactions?.length ?? 0) > 0,
    toWhere: (cond) =>
      cond.op === "isTrue" ? { bankTransactions: { some: {} } }
      : cond.op === "isFalse" ? { bankTransactions: { none: {} } } : null },
  { key: "sourceType", label: "Forrás", type: "select", path: "sourceType", options: [
    { value: "MANUAL", label: "Kézi" }, { value: "UPLOAD", label: "Feltöltés" },
    { value: "EMAIL", label: "E-mail" }, { value: "API", label: "API" }] },
  { key: "ocrConfidence", label: "OCR megbízhatóság", type: "number", path: "ocrConfidence" },
  { key: "hasSubscription", label: "Előfizetéshez tartozik", type: "boolean",
    computed: (r) => Boolean(r.subscriptionId),
    toWhere: (cond) =>
      cond.op === "isTrue" ? { subscriptionId: { not: null } }
      : cond.op === "isFalse" ? { subscriptionId: null } : null },
  { key: "notes", label: "Megjegyzés", type: "text", path: "notes" },
];

export const subscriptionFields: FieldDef[] = [
  { key: "partner", label: "Partner", type: "select", path: "partnerId", idPath: "partnerId" },
  { key: "name", label: "Név", type: "text", path: "name" },
  { key: "status", label: "Státusz", type: "select", path: "status", options: record(SUBSCRIPTION_STATUS_LABELS) },
  { key: "currency", label: "Deviza", type: "select", path: "currency", options: currencyOptions },
  { key: "amount", label: "Összeg / ciklus", type: "money", path: "amount" },
  { key: "monthlyEquivalent", label: "Havi ekvivalens", type: "money",
    computed: (r) => {
      const months = r.billingCycle === "CUSTOM"
        ? Math.max(1, Math.round((r.customIntervalDays ?? 30) / 30))
        : BILLING_CYCLE_MONTHS[r.billingCycle as keyof typeof BILLING_CYCLE_MONTHS] ?? 1;
      return Math.round(r.amount / months);
    } },
  { key: "annualCost", label: "Éves költség", type: "money",
    computed: (r) => {
      const months = r.billingCycle === "CUSTOM"
        ? Math.max(1, Math.round((r.customIntervalDays ?? 30) / 30))
        : BILLING_CYCLE_MONTHS[r.billingCycle as keyof typeof BILLING_CYCLE_MONTHS] ?? 1;
      return Math.round((r.amount / months) * 12);
    } },
  { key: "billingCycle", label: "Számlázási ciklus", type: "select", path: "billingCycle", options: record(BILLING_CYCLE_LABELS) },
  { key: "nextBillingDate", label: "Következő terhelés", type: "date", path: "nextBillingDate" },
  { key: "daysUntilRenewal", label: "Hátralévő napok a megújulásig", type: "number",
    computed: (r) => daysUntil(r.nextBillingDate),
    // A megújulásig hátralévő napok = nextBillingDate a mai naphoz képest,
    // ezért közvetlenül dátum-összehasonlításra fordítható.
    toWhere: (cond) => {
      const at = (n: number) => endOfDay(addDays(new Date(), n));
      const n = Number(cond.value);
      if (cond.op === "between" && Array.isArray(cond.value)) {
        const [a, b] = (cond.value as unknown[]).map(Number);
        if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
        return { nextBillingDate: { gte: startOfDay(addDays(new Date(), a)), lte: at(b) } };
      }
      if (!Number.isFinite(n)) return null;
      if (cond.op === "lte") return { nextBillingDate: { lte: at(n) } };
      if (cond.op === "lt") return { nextBillingDate: { lt: startOfDay(addDays(new Date(), n)) } };
      if (cond.op === "gte") return { nextBillingDate: { gte: startOfDay(addDays(new Date(), n)) } };
      if (cond.op === "gt") return { nextBillingDate: { gt: at(n) } };
      if (cond.op === "eq") return { nextBillingDate: { gte: startOfDay(addDays(new Date(), n)), lte: at(n) } };
      return null;
    } },
  { key: "cancellationDeadline", label: "Lemondási határidő", type: "date", path: "cancellationDeadline" },
  { key: "noticePeriodDays", label: "Felmondási idő (nap)", type: "number", path: "noticePeriodDays" },
  { key: "autoRenew", label: "Automatikus megújulás", type: "boolean", path: "autoRenew" },
  { key: "trialEndsAt", label: "Próbaidőszak vége", type: "date", path: "trialEndsAt" },
  { key: "category", label: "Kategória", type: "select", path: "categoryId", idPath: "categoryId" },
  { key: "paymentMethod", label: "Fizetési mód", type: "select", path: "paymentMethod", options: record(PAYMENT_METHOD_LABELS) },
  { key: "paymentSourceLast4", label: "Kártya utolsó 4 jegye", type: "text", path: "paymentSourceLast4" },
  { key: "seats", label: "Licencszám", type: "number", path: "seats" },
  { key: "pricePerSeat", label: "Ár / licenc", type: "money", path: "pricePerSeat" },
  { key: "startDate", label: "Indulás dátuma", type: "date", path: "startDate" },
  { key: "endDate", label: "Lejárat dátuma", type: "date", path: "endDate" },
  { key: "totalPaidToDate", label: "Eddig kifizetett", type: "money",
    computed: (r) => (r.occurrences ?? [])
      .filter((o: any) => o.status === "PAID")
      .reduce((s: number, o: any) => s + (o.actualAmount ?? o.expectedAmount), 0) },
  { key: "priceIncreased", label: "Árváltozás történt", type: "boolean",
    computed: (r) => {
      const paid = (r.occurrences ?? [])
        .filter((o: any) => o.actualAmount != null)
        .sort((a: any, b: any) => +new Date(b.dueDate) - +new Date(a.dueDate));
      return paid.length >= 2 && paid[0].actualAmount !== paid[1].actualAmount;
    } },
  { key: "tags", label: "Címkék", type: "tags", path: "tags" },
];

export const bankTransactionFields: FieldDef[] = [
  { key: "bankAccount", label: "Bankszámla", type: "select", path: "bankAccountId", idPath: "bankAccountId" },
  { key: "currency", label: "Deviza", type: "select", path: "currency", options: currencyOptions },
  { key: "bookingDate", label: "Könyvelési dátum", type: "date", path: "bookingDate" },
  { key: "valueDate", label: "Értéknap", type: "date", path: "valueDate" },
  { key: "amount", label: "Összeg (előjeles)", type: "money", path: "amount" },
  { key: "direction", label: "Irány", type: "select",
    computed: (r) => (r.amount < 0 ? "DEBIT" : "CREDIT"),
    options: [{ value: "DEBIT", label: "Terhelés" }, { value: "CREDIT", label: "Jóváírás" }] },
  { key: "counterpartyName", label: "Ellenpartner neve", type: "text", path: "counterpartyName" },
  { key: "counterpartyAccount", label: "Ellenpartner számlaszáma", type: "text", path: "counterpartyAccount" },
  { key: "reference", label: "Közlemény", type: "text", path: "reference" },
  { key: "matchStatus", label: "Párosítás státusza", type: "select", path: "matchStatus", options: record(MATCH_STATUS_LABELS) },
  { key: "matchConfidence", label: "Párosítás megbízhatósága", type: "number", path: "matchConfidence" },
  { key: "statement", label: "Kivonat", type: "select", path: "bankStatementId", idPath: "bankStatementId" },
  { key: "category", label: "Kategória", type: "select", path: "categoryId", idPath: "categoryId" },
  { key: "partner", label: "Partner", type: "select", path: "partnerId", idPath: "partnerId" },
];

export const partnerFields: FieldDef[] = [
  { key: "name", label: "Név", type: "text", path: "name" },
  { key: "type", label: "Típus", type: "select", path: "type", options: record(PARTNER_TYPE_LABELS) },
  { key: "country", label: "Ország", type: "text", path: "country" },
  { key: "taxNumber", label: "Adószám", type: "text", path: "taxNumber" },
  { key: "defaultCurrency", label: "Deviza", type: "select", path: "defaultCurrency", options: currencyOptions },
  { key: "tags", label: "Címkék", type: "tags", path: "tags" },
  { key: "isActive", label: "Aktív", type: "boolean", path: "isActive" },
  { key: "openBalance", label: "Nyitott tartozás (alapdeviza)", type: "money",
    computed: (r) => r._computed?.openBalance ?? 0 },
  { key: "spentThisYear", label: "Idei összes költés (alapdeviza)", type: "money",
    computed: (r) => r._computed?.spentThisYear ?? 0 },
  { key: "lastTransactionAt", label: "Utolsó tranzakció", type: "date",
    computed: (r) => r._computed?.lastTransactionAt },
  { key: "activeSubscriptionCount", label: "Aktív előfizetések száma", type: "number",
    computed: (r) => r._computed?.activeSubscriptionCount ?? 0 },
];

export const purchaseFields: FieldDef[] = [
  { key: "partner", label: "Partner", type: "select", path: "partnerId", idPath: "partnerId" },
  { key: "name", label: "Megnevezés", type: "text", path: "name" },
  { key: "purchaseDate", label: "Vásárlás dátuma", type: "date", path: "purchaseDate" },
  { key: "currency", label: "Deviza", type: "select", path: "currency", options: currencyOptions },
  { key: "grossAmount", label: "Bruttó összeg", type: "money", path: "grossAmount" },
  { key: "category", label: "Kategória", type: "select", path: "categoryId", idPath: "categoryId" },
  { key: "paymentMethod", label: "Fizetési mód", type: "select", path: "paymentMethod", options: record(PAYMENT_METHOD_LABELS) },
  { key: "warrantyUntil", label: "Garancia lejárata", type: "date", path: "warrantyUntil" },
  { key: "isAsset", label: "Tárgyi eszköz", type: "boolean", path: "isAsset" },
  { key: "tags", label: "Címkék", type: "tags", path: "tags" },
];

export const paymentFields: FieldDef[] = [
  { key: "partner", label: "Partner", type: "select", path: "partnerId", idPath: "partnerId" },
  { key: "paymentDate", label: "Dátum", type: "date", path: "paymentDate" },
  { key: "amount", label: "Összeg", type: "money", path: "amount" },
  { key: "currency", label: "Deviza", type: "select", path: "currency", options: currencyOptions },
  { key: "method", label: "Mód", type: "select", path: "method", options: record(PAYMENT_METHOD_LABELS) },
  { key: "bankAccount", label: "Bankszámla", type: "select", path: "bankAccountId", idPath: "bankAccountId" },
  { key: "isPartial", label: "Részfizetés", type: "boolean", path: "isPartial" },
  { key: "reference", label: "Hivatkozás", type: "text", path: "reference" },
];

export const FIELD_DEFS: Record<string, FieldDef[]> = {
  invoices: invoiceFields,
  subscriptions: subscriptionFields,
  "bank-transactions": bankTransactionFields,
  partners: partnerFields,
  purchases: purchaseFields,
  payments: paymentFields,
};
