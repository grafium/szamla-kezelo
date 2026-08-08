import { NextRequest, NextResponse } from "next/server";
import { currentUserOrDemo } from "@/auth";
import { prisma } from "@/lib/prisma";
import { generateOccurrences } from "@/lib/occurrences";
import { subscriptionSchema } from "@/lib/validation";

export async function POST(req: NextRequest) {
  const user = await currentUserOrDemo();
  if (!user) return NextResponse.json({ error: "Bejelentkezés szükséges" }, { status: 401 });
  if (user.role === "VIEWER") return NextResponse.json({ error: "Nincs jogosultságod a létrehozáshoz" }, { status: 403 });

  const body = subscriptionSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Érvénytelen adat", details: body.error.flatten() }, { status: 400 });
  }
  const data = body.data;

  const partner = await prisma.partner.findFirst({
    where: { id: data.partnerId, organizationId: user.organizationId, deletedAt: null },
  });
  if (!partner) return NextResponse.json({ error: "A partner nem található" }, { status: 400 });

  const created = await prisma.subscription.create({
    data: {
      organizationId: user.organizationId,
      partnerId: data.partnerId,
      name: data.name,
      currency: data.currency,
      amount: data.amount,
      vatRate: data.vatRate,
      billingCycle: data.billingCycle,
      customIntervalDays: data.billingCycle === "CUSTOM" ? data.customIntervalDays ?? null : null,
      startDate: data.startDate,
      nextBillingDate: data.nextBillingDate,
      endDate: data.endDate ?? null,
      cancellationDeadline: data.cancellationDeadline ?? null,
      noticePeriodDays: data.noticePeriodDays ?? null,
      autoRenew: data.autoRenew,
      paymentMethod: data.paymentMethod,
      paymentSourceLast4: data.paymentSourceLast4 || null,
      categoryId: data.categoryId || null,
      seats: data.seats ?? null,
      reminderDaysBefore: JSON.stringify(data.reminderDaysBefore),
      url: data.url || null,
      tags: JSON.stringify(data.tags),
      notes: data.notes || null,
    },
  });

  // 12 hónapra előre legeneráljuk a várható előfordulásokat.
  await generateOccurrences(created);

  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId,
      userId: user.id,
      action: "CREATE",
      entityType: "Subscription",
      entityId: created.id,
      changes: JSON.stringify({ after: { name: created.name, amount: created.amount, currency: created.currency } }),
    },
  });

  return NextResponse.json(created, { status: 201 });
}
