import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentUserOrDemo } from "@/auth";
import { prisma } from "@/lib/prisma";
import { partnerSchema } from "@/lib/validation";

const createSchema = partnerSchema.extend({
  aliases: z.array(z.string()).default([]),
});

export async function POST(req: NextRequest) {
  const user = await currentUserOrDemo();
  if (!user) return NextResponse.json({ error: "Bejelentkezés szükséges" }, { status: 401 });
  if (user.role === "VIEWER") return NextResponse.json({ error: "Nincs jogosultságod a létrehozáshoz" }, { status: 403 });

  const body = createSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Érvénytelen adat", details: body.error.flatten() }, { status: 400 });
  }
  const { aliases, tags, ...data } = body.data;

  const created = await prisma.partner.create({
    data: {
      organizationId: user.organizationId,
      name: data.name,
      displayName: data.displayName || null,
      type: data.type,
      taxNumber: data.taxNumber || null,
      euVatNumber: data.euVatNumber || null,
      country: data.country || null,
      email: data.email || null,
      defaultCurrency: data.defaultCurrency || null,
      defaultPaymentTermDays: data.defaultPaymentTermDays ?? null,
      iban: data.iban || null,
      color: data.color || null,
      tags: JSON.stringify(tags),
      notes: data.notes || null,
    },
  });

  const aliasNames = aliases.map((a) => a.trim()).filter(Boolean);
  if (aliasNames.length > 0) {
    await prisma.partnerAlias.createMany({
      data: aliasNames.map((alias) => ({ partnerId: created.id, alias })),
    });
  }

  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId,
      userId: user.id,
      action: "CREATE",
      entityType: "Partner",
      entityId: created.id,
      changes: JSON.stringify({ after: { name: created.name, aliases: aliasNames } }),
    },
  });

  return NextResponse.json(created, { status: 201 });
}
