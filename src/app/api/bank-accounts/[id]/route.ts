import { NextRequest, NextResponse } from "next/server";
import { currentUserOrDemo } from "@/auth";
import { prisma } from "@/lib/prisma";
import { clientIp } from "@/lib/audit";
import { bankAccountUpdateSchema } from "@/lib/validation";

// Bankszámla módosítása és (puha) törlése.
// A nyitó egyenleg módosításakor az aktuális egyenleget ugyanazzal a
// különbözettel toljuk el, hogy a már könyvelt tételek ne vesszenek el.

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUserOrDemo();
  if (!user) return NextResponse.json({ error: "Bejelentkezés szükséges" }, { status: 401 });
  if (user.role === "VIEWER") return NextResponse.json({ error: "Nincs jogosultságod a módosításhoz" }, { status: 403 });

  const account = await prisma.bankAccount.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
  });
  if (!account) return NextResponse.json({ error: "A bankszámla nem található" }, { status: 404 });

  const body = bankAccountUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Érvénytelen adat", details: body.error.flatten() }, { status: 400 });
  }
  const data = body.data;

  const update: Record<string, unknown> = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.bankName !== undefined) update.bankName = data.bankName || null;
  if (data.accountNumber !== undefined) update.accountNumber = data.accountNumber || null;
  if (data.iban !== undefined) update.iban = data.iban || null;
  if (data.swift !== undefined) update.swift = data.swift || null;
  if (data.currency !== undefined) update.currency = data.currency;
  if (data.color !== undefined) update.color = data.color || null;
  if (data.isActive !== undefined) update.isActive = data.isActive;
  if (data.openingBalance !== undefined && data.openingBalance !== account.openingBalance) {
    const delta = data.openingBalance - account.openingBalance;
    update.openingBalance = data.openingBalance;
    update.currentBalance = account.currentBalance + delta;
  }

  const updated = await prisma.bankAccount.update({ where: { id }, data: update });

  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId,
      userId: user.id,
      ipAddress: clientIp(req),
      action: "UPDATE",
      entityType: "BankAccount",
      entityId: id,
      changes: JSON.stringify({
        before: { name: account.name, openingBalance: account.openingBalance, currentBalance: account.currentBalance },
        after: { name: updated.name, openingBalance: updated.openingBalance, currentBalance: updated.currentBalance },
      }),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUserOrDemo();
  if (!user) return NextResponse.json({ error: "Bejelentkezés szükséges" }, { status: 401 });
  if (user.role === "VIEWER") return NextResponse.json({ error: "Nincs jogosultságod a törléshez" }, { status: 403 });

  const account = await prisma.bankAccount.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
  });
  if (!account) return NextResponse.json({ error: "A bankszámla nem található" }, { status: 404 });

  const statements = await prisma.bankStatement.count({ where: { bankAccountId: id } });
  if (statements > 0) {
    return NextResponse.json(
      {
        error:
          `A bankszámla nem törölhető, mert ${statements} importált kivonat tartozik hozzá. ` +
          `Deaktiváld helyette — így megmarad az előzmény, de új importnál már nem választható.`,
      },
      { status: 409 }
    );
  }

  await prisma.bankAccount.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });

  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId,
      userId: user.id,
      ipAddress: clientIp(req),
      action: "DELETE",
      entityType: "BankAccount",
      entityId: id,
      changes: JSON.stringify({ before: { name: account.name, currency: account.currency } }),
    },
  });

  return NextResponse.json({ ok: true });
}
