import { NextRequest, NextResponse } from "next/server";
import { addDays } from "date-fns";
import { z } from "zod";
import { currentUserOrDemo } from "@/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({ action: z.enum(["dismiss", "snooze", "paid"]) });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUserOrDemo();
  if (!user) return NextResponse.json({ error: "Bejelentkezés szükséges" }, { status: 401 });

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Érvénytelen adat" }, { status: 400 });

  const reminder = await prisma.reminder.findFirst({
    where: { id, organizationId: user.organizationId },
  });
  if (!reminder) return NextResponse.json({ error: "Az emlékeztető nem található" }, { status: 404 });

  if (body.data.action === "dismiss") {
    await prisma.reminder.update({ where: { id }, data: { status: "DISMISSED" } });
  } else if (body.data.action === "snooze") {
    await prisma.reminder.update({
      where: { id },
      data: { status: "SNOOZED", snoozedUntil: addDays(new Date(), 3), triggerDate: addDays(reminder.triggerDate, 3) },
    });
  } else if (body.data.action === "paid") {
    // A kapcsolt entitás kifizetettnek jelölése
    if (reminder.entityType === "Invoice") {
      await prisma.invoice.updateMany({
        where: { id: reminder.entityId, organizationId: user.organizationId },
        data: { status: "PAID" },
      });
    } else if (reminder.entityType === "SubscriptionOccurrence") {
      await prisma.subscriptionOccurrence.update({
        where: { id: reminder.entityId },
        data: { status: "PAID" },
      });
    }
    await prisma.reminder.update({ where: { id }, data: { status: "DISMISSED" } });
  }

  return NextResponse.json({ ok: true });
}
