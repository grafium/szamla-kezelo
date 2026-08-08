import { NextRequest, NextResponse } from "next/server";
import { currentUserOrDemo } from "@/auth";
import { prisma } from "@/lib/prisma";
import { toBase } from "@/lib/rates";
import { invoiceSchema } from "@/lib/validation";
import type { Currency } from "@/lib/constants";

export async function POST(req: NextRequest) {
  const user = await currentUserOrDemo();
  if (!user) return NextResponse.json({ error: "Bejelentkezés szükséges" }, { status: 401 });
  if (user.role === "VIEWER") return NextResponse.json({ error: "Nincs jogosultságod a létrehozáshoz" }, { status: 403 });

  const body = invoiceSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Érvénytelen adat", details: body.error.flatten() }, { status: 400 });
  }
  const data = body.data;

  const partner = await prisma.partner.findFirst({
    where: { id: data.partnerId, organizationId: user.organizationId, deletedAt: null },
  });
  if (!partner) return NextResponse.json({ error: "A partner nem található" }, { status: 400 });

  // Az árfolyam a kelt napján rögzül, visszamenőleg nem számoljuk újra.
  const baseCurrency = user.organization.baseCurrency as Currency;
  const { baseAmount, rate } = await toBase(data.grossAmount, data.currency, baseCurrency, data.issueDate);

  const created = await prisma.invoice.create({
    data: {
      organizationId: user.organizationId,
      partnerId: data.partnerId,
      direction: data.direction,
      invoiceNumber: data.invoiceNumber,
      issueDate: data.issueDate,
      fulfillmentDate: data.fulfillmentDate ?? null,
      dueDate: data.dueDate,
      currency: data.currency,
      netAmount: data.netAmount,
      vatRate: data.vatRate,
      vatAmount: data.vatAmount,
      grossAmount: data.grossAmount,
      exchangeRate: rate,
      baseAmount,
      exchangeRateDate: data.issueDate,
      status: data.status,
      paymentMethod: data.paymentMethod,
      categoryId: data.categoryId || null,
      description: data.description || null,
      tags: JSON.stringify(data.tags),
      sourceType: "MANUAL",
      notes: data.notes || null,
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId,
      userId: user.id,
      action: "CREATE",
      entityType: "Invoice",
      entityId: created.id,
      changes: JSON.stringify({ after: { invoiceNumber: created.invoiceNumber, grossAmount: created.grossAmount, currency: created.currency } }),
    },
  });

  return NextResponse.json(created, { status: 201 });
}
