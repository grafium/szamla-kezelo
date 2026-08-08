// Enum-jellegű értékek és magyar címkéik. SQLite alatt String-ként tárolódnak,
// a validáció Zod-dal történik ezek alapján.

export const CURRENCIES = ["HUF", "EUR", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const INVOICE_STATUSES = [
  "DRAFT",
  "AWAITING_APPROVAL",
  "APPROVED",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE",
  "CANCELLED",
  "DISPUTED",
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  DRAFT: "Piszkozat",
  AWAITING_APPROVAL: "Jóváhagyásra vár",
  APPROVED: "Jóváhagyva",
  PARTIALLY_PAID: "Részben fizetve",
  PAID: "Kifizetve",
  OVERDUE: "Lejárt",
  CANCELLED: "Sztornózva",
  DISPUTED: "Vitatott",
};

export const INVOICE_STATUS_COLORS: Record<InvoiceStatus, string> = {
  DRAFT: "gray",
  AWAITING_APPROVAL: "yellow",
  APPROVED: "blue",
  PARTIALLY_PAID: "orange",
  PAID: "green",
  OVERDUE: "red",
  CANCELLED: "gray",
  DISPUTED: "pink",
};

export const SUBSCRIPTION_STATUSES = ["ACTIVE", "PAUSED", "CANCELLED", "EXPIRED", "TRIAL"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  ACTIVE: "Aktív",
  PAUSED: "Szüneteltetve",
  CANCELLED: "Lemondva",
  EXPIRED: "Lejárt",
  TRIAL: "Próbaidőszak",
};

export const SUBSCRIPTION_STATUS_COLORS: Record<SubscriptionStatus, string> = {
  ACTIVE: "green",
  PAUSED: "yellow",
  CANCELLED: "gray",
  EXPIRED: "red",
  TRIAL: "purple",
};

export const BILLING_CYCLES = ["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL", "CUSTOM"] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

export const BILLING_CYCLE_LABELS: Record<BillingCycle, string> = {
  MONTHLY: "Havi",
  QUARTERLY: "Negyedéves",
  SEMI_ANNUAL: "Féléves",
  ANNUAL: "Éves",
  CUSTOM: "Egyedi",
};

export const BILLING_CYCLE_MONTHS: Record<Exclude<BillingCycle, "CUSTOM">, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMI_ANNUAL: 6,
  ANNUAL: 12,
};

export const OCCURRENCE_STATUSES = ["UPCOMING", "BILLED", "PAID", "SKIPPED", "FAILED"] as const;
export type OccurrenceStatus = (typeof OCCURRENCE_STATUSES)[number];

export const OCCURRENCE_STATUS_LABELS: Record<OccurrenceStatus, string> = {
  UPCOMING: "Várható",
  BILLED: "Számlázva",
  PAID: "Kifizetve",
  SKIPPED: "Kihagyva",
  FAILED: "Sikertelen",
};

export const PAYMENT_METHODS = ["TRANSFER", "CARD", "CASH", "DIRECT_DEBIT", "OTHER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  TRANSFER: "Átutalás",
  CARD: "Bankkártya",
  CASH: "Készpénz",
  DIRECT_DEBIT: "Csoportos beszedés",
  OTHER: "Egyéb",
};

export const MATCH_STATUSES = ["UNMATCHED", "AUTO_MATCHED", "MANUALLY_MATCHED", "IGNORED", "SPLIT"] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  UNMATCHED: "Párosítatlan",
  AUTO_MATCHED: "Automatikusan párosítva",
  MANUALLY_MATCHED: "Kézzel párosítva",
  IGNORED: "Figyelmen kívül hagyva",
  SPLIT: "Felosztva",
};

export const MATCH_STATUS_COLORS: Record<MatchStatus, string> = {
  UNMATCHED: "red",
  AUTO_MATCHED: "green",
  MANUALLY_MATCHED: "blue",
  IGNORED: "gray",
  SPLIT: "purple",
};

export const VAT_RATES = ["27", "18", "5", "0", "AAM", "TAM", "FAD", "EU", "EUE", "HO"] as const;
export type VatRate = (typeof VAT_RATES)[number];

export const VAT_RATE_LABELS: Record<VatRate, string> = {
  "27": "27%",
  "18": "18%",
  "5": "5%",
  "0": "0%",
  AAM: "AAM (alanyi adómentes)",
  TAM: "TAM (tárgyi adómentes)",
  FAD: "FAD (fordított adózás)",
  EU: "EU (Közösségen belüli)",
  EUE: "EUE",
  HO: "HO (harmadik ország)",
};

export const PARTNER_TYPES = ["SUPPLIER", "CUSTOMER", "BOTH"] as const;
export type PartnerType = (typeof PARTNER_TYPES)[number];

export const PARTNER_TYPE_LABELS: Record<PartnerType, string> = {
  SUPPLIER: "Szállító",
  CUSTOMER: "Vevő",
  BOTH: "Szállító és vevő",
};

export const REMINDER_TYPE_LABELS: Record<string, string> = {
  SUBSCRIPTION_RENEWAL: "Előfizetés megújul",
  INVOICE_DUE: "Számla esedékes",
  INVOICE_OVERDUE: "Számla lejárt",
  CANCELLATION_DEADLINE: "Lemondási határidő",
  TRIAL_ENDING: "Próbaidőszak vége",
  BUDGET_EXCEEDED: "Keret túllépve",
  PRICE_INCREASE: "Áremelkedés",
  WARRANTY_EXPIRING: "Garancia lejár",
};

// Notion pasztell paletta kulcsok — a CSS-ben --{szín} és --{szín}-bg változók
export const PALETTE = ["red", "orange", "yellow", "green", "blue", "purple", "pink", "gray"] as const;
export type PaletteColor = (typeof PALETTE)[number];
