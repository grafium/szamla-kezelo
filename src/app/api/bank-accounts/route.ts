import { NextRequest, NextResponse } from "next/server";
import { currentUserOrDemo } from "@/auth";
import { prisma } from "@/lib/prisma";
import { clientIp } from "@/lib/audit";
import { bankAccountSchema } from "@/lib/validation";

// Bankszámla létrehozása. A nyitó egyenleg egyben a kezdő aktuális egyenleg is;
// a könyvelt banki tételek ezt módosítják tovább.

export async function POST(req: NextRequest) {
  const user = await currentUserOrDemo();
  if (!user) return NextResponse.json({ error: "Bejelentkezés szükséges" }, { status: 401 });
  if (user.role === "VIEWER") return NextResponse.json({ error: "Nincs jogosultságod a létrehozáshoz" }, { status: 403 });

  const body = bankAccountSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Érvénytelen adat", details: body.error.flatten() }, { status: 400 });
  }
  const data = body.data;

  const created = await prisma.bankAccount.create({
    data: {
      organizationId: user.organizationId,
      name: data.name,
      bankName: data.bankName || null,
      accountNumber: data.accountNumber || null,
      iban: data.iban || null,
      swift: data.swift || null,
      currency: data.currency,
      openingBalance: data.openingBalance,
      currentBalance: data.openingBalance,
      color: data.color || null,
      isActive: data.isActive,
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId,
      userId: user.id,
      ipAddress: clientIp(req),
      action: "CREATE",
      entityType: "BankAccount",
      entityId: created.id,
      changes: JSON.stringify({
        after: { name: created.name, currency: created.currency, openingBalance: created.openingBalance },
      }),
    },
  });

  return NextResponse.json(created, { status: 201 });
}
