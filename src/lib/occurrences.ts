import { addDays, addMonths, isBefore } from "date-fns";
import { prisma } from "./prisma";
import { BILLING_CYCLE_MONTHS, type BillingCycle } from "./constants";

// A rendszer szíve: minden aktív előfizetéshez 12 hónapra előre legeneráljuk a
// várható előfordulásokat (SubscriptionOccurrence), erre épül az előrejelzés és
// az emlékeztető-motor is.

export function nextDate(from: Date, cycle: BillingCycle, customIntervalDays?: number | null): Date {
  if (cycle === "CUSTOM") return addDays(from, customIntervalDays ?? 30);
  return addMonths(from, BILLING_CYCLE_MONTHS[cycle]);
}

interface SubscriptionLike {
  id: string;
  amount: number;
  currency: string;
  billingCycle: string;
  customIntervalDays: number | null;
  nextBillingDate: Date;
  endDate: Date | null;
  status: string;
}

/** 12 hónapra előre generálja a hiányzó előfordulásokat egy előfizetéshez. */
export async function generateOccurrences(sub: SubscriptionLike, horizonMonths = 12): Promise<number> {
  if (sub.status !== "ACTIVE" && sub.status !== "TRIAL") return 0;
  const horizon = addMonths(new Date(), horizonMonths);
  const existing = await prisma.subscriptionOccurrence.findMany({
    where: { subscriptionId: sub.id },
    select: { dueDate: true },
  });
  const existingDates = new Set(existing.map((o) => o.dueDate.toISOString().slice(0, 10)));

  let cursor = new Date(sub.nextBillingDate);
  let created = 0;
  while (isBefore(cursor, horizon)) {
    if (sub.endDate && !isBefore(cursor, sub.endDate)) break;
    const key = cursor.toISOString().slice(0, 10);
    if (!existingDates.has(key)) {
      await prisma.subscriptionOccurrence.create({
        data: {
          subscriptionId: sub.id,
          dueDate: cursor,
          expectedAmount: sub.amount,
          currency: sub.currency,
          status: "UPCOMING",
        },
      });
      created++;
    }
    cursor = nextDate(cursor, sub.billingCycle as BillingCycle, sub.customIntervalDays);
  }
  return created;
}

/** Minden aktív előfizetésre lefuttatja a generálást (cron / mentés után hívható). */
export async function generateAllOccurrences(organizationId: string): Promise<number> {
  const subs = await prisma.subscription.findMany({
    where: { organizationId, status: { in: ["ACTIVE", "TRIAL"] }, deletedAt: null },
  });
  let total = 0;
  for (const sub of subs) total += await generateOccurrences(sub);
  return total;
}
