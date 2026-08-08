import { z } from "zod";
import { CURRENCIES, INVOICE_STATUSES, PAYMENT_METHODS, VAT_RATES, BILLING_CYCLES } from "./constants";

// Magyar sajátosságok (11. fejezet)

/** Magyar adószám: 12345678-1-42 (8+1+2 jegy). */
export const hungarianTaxNumber = z
  .string()
  .regex(/^\d{8}-\d-\d{2}$/, "Érvénytelen adószám — a helyes formátum: 12345678-1-42");

/** EU adószám formátum-validáció (VIES-ellenőrzés opcionális, később). */
export const euVatNumber = z
  .string()
  .regex(/^[A-Z]{2}[A-Z0-9]{2,12}$/, "Érvénytelen EU adószám — pl. HU12345678 vagy IE6388047V");

export const currencySchema = z.enum(CURRENCIES);

export const invoiceSchema = z.object({
  partnerId: z.string().uuid({ message: "Válassz partnert" }),
  direction: z.enum(["INCOMING", "OUTGOING"]),
  invoiceNumber: z.string().min(1, "A számlaszám kötelező"),
  issueDate: z.coerce.date({ message: "Add meg a kelt dátumát" }),
  fulfillmentDate: z.coerce.date().optional().nullable(),
  dueDate: z.coerce.date({ message: "Add meg a fizetési határidőt" }),
  currency: currencySchema,
  netAmount: z.number().int("Az összeget fillérben/centben, egészként tároljuk"),
  vatRate: z.enum(VAT_RATES),
  vatAmount: z.number().int(),
  grossAmount: z.number().int().positive("A bruttó összeg nem lehet nulla"),
  status: z.enum(INVOICE_STATUSES).default("DRAFT"),
  paymentMethod: z.enum(PAYMENT_METHODS).default("TRANSFER"),
  categoryId: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  tags: z.array(z.string()).default([]),
});

export const subscriptionSchema = z.object({
  partnerId: z.string().uuid({ message: "Válassz partnert" }),
  name: z.string().min(1, "A név kötelező"),
  currency: currencySchema,
  amount: z.number().int().positive("Az összeg kötelező"),
  vatRate: z.enum(VAT_RATES).default("27"),
  billingCycle: z.enum(BILLING_CYCLES),
  customIntervalDays: z.number().int().positive().optional().nullable(),
  startDate: z.coerce.date(),
  nextBillingDate: z.coerce.date(),
  endDate: z.coerce.date().optional().nullable(),
  cancellationDeadline: z.coerce.date().optional().nullable(),
  noticePeriodDays: z.number().int().optional().nullable(),
  autoRenew: z.boolean().default(true),
  paymentMethod: z.enum(PAYMENT_METHODS).default("CARD"),
  paymentSourceLast4: z.string().max(4).optional().nullable(),
  categoryId: z.string().optional().nullable(),
  seats: z.number().int().positive().optional().nullable(),
  reminderDaysBefore: z.array(z.number().int().positive()).default([14, 3, 1]),
  url: z.string().url("Érvénytelen URL").optional().nullable().or(z.literal("")),
  notes: z.string().optional().nullable(),
  tags: z.array(z.string()).default([]),
});

export const purchaseSchema = z.object({
  name: z.string().min(1, "A megnevezés kötelező"),
  partnerId: z.string().uuid().optional().nullable(),
  purchaseDate: z.coerce.date({ message: "Add meg a vásárlás dátumát" }),
  currency: currencySchema,
  netAmount: z.number().int("Az összeget fillérben/centben, egészként tároljuk"),
  vatAmount: z.number().int(),
  grossAmount: z.number().int().positive("A bruttó összeg nem lehet nulla"),
  categoryId: z.string().optional().nullable(),
  paymentMethod: z.enum(PAYMENT_METHODS).default("CARD"),
  warrantyUntil: z.coerce.date().optional().nullable(),
  isAsset: z.boolean().default(false),
  assetLifetimeMonths: z.number().int().positive().optional().nullable(),
  tags: z.array(z.string()).default([]),
  notes: z.string().optional().nullable(),
});

export const partnerSchema = z.object({
  name: z.string().min(1, "A név kötelező"),
  displayName: z.string().optional().nullable(),
  type: z.enum(["SUPPLIER", "CUSTOMER", "BOTH"]).default("SUPPLIER"),
  taxNumber: hungarianTaxNumber.optional().nullable().or(z.literal("")),
  euVatNumber: euVatNumber.optional().nullable().or(z.literal("")),
  country: z.string().length(2, "ISO-2 országkód, pl. HU").optional().nullable().or(z.literal("")),
  email: z.string().email("Érvénytelen e-mail cím").optional().nullable().or(z.literal("")),
  defaultCurrency: currencySchema.optional().nullable(),
  defaultPaymentTermDays: z.number().int().optional().nullable(),
  iban: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
  tags: z.array(z.string()).default([]),
  notes: z.string().optional().nullable(),
});
