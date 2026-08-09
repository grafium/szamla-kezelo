import { NextRequest, NextResponse } from "next/server";
import { currentUserOrDemo } from "@/auth";
import { prisma } from "@/lib/prisma";
import { clientIp } from "@/lib/audit";
import { toBase } from "@/lib/rates";
import { purchaseSchema } from "@/lib/validation";
import type { Currency } from "@/lib/constants";

export async function POST(req: NextRequest) {
  const user = await currentUserOrDemo();
  if (!user) return NextResponse.json({ error: "Bejelentkezés szükséges" }, { status: 401 });
  if (user.role === "VIEWER") return NextResponse.json({ error: "Nincs jogosultságod a létrehozáshoz" }, { status: 403 });

  const body = purchaseSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Érvénytelen adat", details: body.error.flatten() }, { status: 400 });
  }
  const data = body.data;

  const baseCurrency = user.organization.baseCurrency as Currency;
  const { baseAmount, rate } = await toBase(data.grossAmount, data.currency, baseCurrency, data.purchaseDate);

  const created = await prisma.purchase.create({
    data: {
      organizationId: user.organizationId,
      partnerId: data.partnerId || null,
      name: data.name,
      purchaseDate: data.purchaseDate,
      currency: data.currency,
      netAmount: data.netAmount,
      vatAmount: data.vatAmount,
      grossAmount: data.grossAmount,
      exchangeRate: rate,
      baseAmount,
      categoryId: data.categoryId || null,
      paymentMethod: data.paymentMethod,
      warrantyUntil: data.warrantyUntil ?? null,
      isAsset: data.isAsset,
      assetLifetimeMonths: data.isAsset ? data.assetLifetimeMonths ?? null : null,
      tags: JSON.stringify(data.tags),
      notes: data.notes || null,
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId,
      userId: user.id,
      ipAddress: clientIp(req),
      action: "CREATE",
      entityType: "Purchase",
      entityId: created.id,
      changes: JSON.stringify({ after: { name: created.name, grossAmount: created.grossAmount, currency: created.currency } }),
    },
  });

  return NextResponse.json(created, { status: 201 });
}
