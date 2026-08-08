import { addDays, differenceInCalendarDays, startOfDay } from "date-fns";
import { prisma } from "./prisma";
import { parseJsonNumbers } from "./format";
import { formatMoney } from "./money";
import type { Currency } from "./constants";

// Emlékeztető-motor (9. fejezet). A cron endpoint (/api/cron/reminders) naponta hívja:
//  - előfizetés-megújulás: reminderDaysBefore szerint (alap [14,3,1]; évesnél [30,14,3])
//  - lemondási határidő: 7 nappal előtte + a napján
//  - próbaidőszak vége: 3 nappal előtte
//  - számla határidő: 5 nappal előtte, a napján, 1/7/14 nappal utána
//  - garancia lejárat: 30 nappal előtte
// Már PAID előfordulásra nem megy emlékeztető.

export async function runReminderEngine(organizationId: string): Promise<number> {
  const today = startOfDay(new Date());
  let created = 0;

  async function ensure(data: {
    type: string; entityType: string; entityId: string;
    triggerDate: Date; message: string;
  }) {
    const exists = await prisma.reminder.findFirst({
      where: {
        organizationId,
        type: data.type,
        entityId: data.entityId,
        triggerDate: data.triggerDate,
      },
    });
    if (exists) return;
    await prisma.reminder.create({
      data: { organizationId, channel: "BOTH", status: "SCHEDULED", ...data },
    });
    created++;
  }

  // Előfizetés-megújulások
  const occurrences = await prisma.subscriptionOccurrence.findMany({
    where: {
      status: "UPCOMING",
      dueDate: { gte: today, lte: addDays(today, 35) },
      subscription: { organizationId, status: { in: ["ACTIVE", "TRIAL"] }, deletedAt: null },
    },
    include: { subscription: { include: { partner: true } } },
  });
  for (const occ of occurrences) {
    const sub = occ.subscription;
    const defaults = sub.billingCycle === "ANNUAL" ? [30, 14, 3] : [14, 3, 1];
    const days = parseJsonNumbers(sub.reminderDaysBefore).length
      ? parseJsonNumbers(sub.reminderDaysBefore)
      : defaults;
    const until = differenceInCalendarDays(occ.dueDate, today);
    for (const d of days) {
      if (until === d) {
        await ensure({
          type: "SUBSCRIPTION_RENEWAL",
          entityType: "SubscriptionOccurrence",
          entityId: occ.id,
          triggerDate: today,
          message: `${sub.name} (${sub.partner.name}) ${d} nap múlva megújul — ${formatMoney(occ.expectedAmount, occ.currency as Currency)}`,
        });
      }
    }
  }

  // Lemondási határidők és próbaidőszakok
  const subs = await prisma.subscription.findMany({
    where: { organizationId, deletedAt: null, status: { in: ["ACTIVE", "TRIAL"] } },
    include: { partner: true },
  });
  for (const sub of subs) {
    if (sub.cancellationDeadline) {
      const until = differenceInCalendarDays(sub.cancellationDeadline, today);
      if (until === 7 || until === 0) {
        await ensure({
          type: "CANCELLATION_DEADLINE",
          entityType: "Subscription",
          entityId: sub.id,
          triggerDate: today,
          message: until === 0
            ? `Ma jár le a(z) ${sub.name} lemondási határideje!`
            : `7 nap múlva lejár a(z) ${sub.name} lemondási határideje`,
        });
      }
    }
    if (sub.trialEndsAt) {
      const until = differenceInCalendarDays(sub.trialEndsAt, today);
      if (until === 3) {
        await ensure({
          type: "TRIAL_ENDING",
          entityType: "Subscription",
          entityId: sub.id,
          triggerDate: today,
          message: `3 nap múlva véget ér a(z) ${sub.name} próbaidőszaka — utána ${formatMoney(sub.amount, sub.currency as Currency)}/ciklus`,
        });
      }
    }
  }

  // Számla-határidők
  const invoices = await prisma.invoice.findMany({
    where: {
      organizationId, deletedAt: null, direction: "INCOMING",
      status: { in: ["APPROVED", "PARTIALLY_PAID", "OVERDUE", "AWAITING_APPROVAL"] },
    },
    include: { partner: true },
  });
  for (const inv of invoices) {
    const until = differenceInCalendarDays(inv.dueDate, today);
    const partnerName = inv.partner?.name ?? "ismeretlen partner";
    if (until === 5 || until === 0) {
      await ensure({
        type: "INVOICE_DUE",
        entityType: "Invoice",
        entityId: inv.id,
        triggerDate: today,
        message: until === 0
          ? `Ma esedékes: ${inv.invoiceNumber} (${partnerName}) — ${formatMoney(inv.grossAmount, inv.currency as Currency)}`
          : `5 nap múlva esedékes: ${inv.invoiceNumber} (${partnerName})`,
      });
    }
    if (until === -1 || until === -7 || until === -14) {
      await ensure({
        type: "INVOICE_OVERDUE",
        entityType: "Invoice",
        entityId: inv.id,
        triggerDate: today,
        message: `${-until} napja lejárt: ${inv.invoiceNumber} (${partnerName}) — ${formatMoney(inv.grossAmount, inv.currency as Currency)}`,
      });
    }
  }

  // Garancia lejáratok
  const purchases = await prisma.purchase.findMany({
    where: { organizationId, deletedAt: null, warrantyUntil: { not: null } },
  });
  for (const p of purchases) {
    const until = differenceInCalendarDays(p.warrantyUntil!, today);
    if (until === 30) {
      await ensure({
        type: "WARRANTY_EXPIRING",
        entityType: "Purchase",
        entityId: p.id,
        triggerDate: today,
        message: `30 nap múlva lejár a garancia: ${p.name}`,
      });
    }
  }

  // Lejárt számlák státuszának frissítése
  await prisma.invoice.updateMany({
    where: {
      organizationId, deletedAt: null,
      status: { in: ["APPROVED", "AWAITING_APPROVAL"] },
      dueDate: { lt: today },
    },
    data: { status: "OVERDUE" },
  });

  return created;
}
