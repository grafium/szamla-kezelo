import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { currentUserOrDemo } from "@/auth";
import { prisma } from "@/lib/prisma";
import { clientIp } from "@/lib/audit";

// Kézi párosítás megerősítése: banki tétel ↔ számla (vagy figyelmen kívül hagyás),
// illetve felosztás: egy banki tétel több számla között ("split").
// A számla státuszát mindig az ÖSSZES kifizetés összege alapján állítjuk
// (több részfizetés → PAID csak teljes fedezetnél).

const schema = z.object({
  transactionId: z.string(),
  invoiceId: z.string().optional(),
  action: z.enum(["match", "ignore", "unmatch", "split"]),
  parts: z
    .array(z.object({ invoiceId: z.string(), amount: z.number().int().positive() }))
    .optional(),
});

type Db = Prisma.TransactionClient;

/** A számla státuszának frissítése a kifizetések összege alapján. */
async function updateInvoiceStatusByPayments(db: Db, invoiceId: string, grossAmount: number) {
  const paid = await db.payment.aggregate({
    where: { invoiceId, deletedAt: null },
    _sum: { amount: true },
  });
  const total = paid._sum.amount ?? 0;
  await db.invoice.update({
    where: { id: invoiceId },
    data: { status: total >= grossAmount ? "PAID" : "PARTIALLY_PAID" },
  });
}

export async function POST(req: NextRequest) {
  const user = await currentUserOrDemo();
  if (!user) return NextResponse.json({ error: "Bejelentkezés szükséges" }, { status: 401 });
  if (user.role === "VIEWER") return NextResponse.json({ error: "Nincs jogosultságod" }, { status: 403 });

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Érvénytelen adat" }, { status: 400 });
  const { transactionId, invoiceId, action, parts } = body.data;

  const tx = await prisma.bankTransaction.findFirst({
    where: { id: transactionId, bankAccount: { organizationId: user.organizationId } },
  });
  if (!tx) return NextResponse.json({ error: "A banki tétel nem található" }, { status: 404 });

  if (action === "ignore") {
    await prisma.bankTransaction.update({
      where: { id: transactionId },
      data: { matchStatus: "IGNORED" },
    });
  } else if (action === "unmatch") {
    await prisma.bankTransaction.update({
      where: { id: transactionId },
      data: { matchStatus: "UNMATCHED", matchedInvoiceId: null, matchConfidence: null },
    });
  } else if (action === "split") {
    if (!parts || parts.length < 2) {
      return NextResponse.json({ error: "A felosztáshoz legalább két számla szükséges" }, { status: 400 });
    }
    const sum = parts.reduce((s, p) => s + p.amount, 0);
    if (sum > Math.abs(tx.amount)) {
      return NextResponse.json(
        { error: "A felosztott összegek meghaladják a banki tétel összegét" },
        { status: 400 }
      );
    }
    const ids = [...new Set(parts.map((p) => p.invoiceId))];
    const invoices = await prisma.invoice.findMany({
      where: { id: { in: ids }, organizationId: user.organizationId, deletedAt: null },
    });
    if (invoices.length !== ids.length) {
      return NextResponse.json({ error: "Valamelyik számla nem található" }, { status: 404 });
    }
    const invoiceById = new Map(invoices.map((i) => [i.id, i]));

    await prisma.$transaction(async (db) => {
      await db.bankTransaction.update({
        where: { id: transactionId },
        data: { matchStatus: "SPLIT", matchConfidence: 1, matchedInvoiceId: null },
      });
      for (const part of parts) {
        const invoice = invoiceById.get(part.invoiceId)!;
        await db.payment.create({
          data: {
            organizationId: user.organizationId,
            invoiceId: part.invoiceId,
            partnerId: invoice.partnerId,
            paymentDate: tx.bookingDate,
            amount: part.amount,
            currency: tx.currency,
            exchangeRate: invoice.exchangeRate,
            baseAmount: Math.round(part.amount * invoice.exchangeRate),
            method: "TRANSFER",
            bankTransactionId: transactionId,
            bankAccountId: tx.bankAccountId,
            isPartial: part.amount < invoice.grossAmount,
          },
        });
        await updateInvoiceStatusByPayments(db, part.invoiceId, invoice.grossAmount);
      }
      await db.bankStatement.update({
        where: { id: tx.bankStatementId },
        data: { matchedCount: { increment: 1 } },
      });
    });
  } else {
    if (!invoiceId) return NextResponse.json({ error: "Hiányzó számla-azonosító" }, { status: 400 });
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, organizationId: user.organizationId, deletedAt: null },
    });
    if (!invoice) return NextResponse.json({ error: "A számla nem található" }, { status: 404 });

    await prisma.$transaction(async (db) => {
      await db.bankTransaction.update({
        where: { id: transactionId },
        data: {
          matchStatus: "MANUALLY_MATCHED",
          matchedInvoiceId: invoiceId,
          partnerId: invoice.partnerId,
          matchConfidence: 1,
        },
      });
      await db.payment.create({
        data: {
          organizationId: user.organizationId,
          invoiceId,
          partnerId: invoice.partnerId,
          paymentDate: tx.bookingDate,
          amount: Math.abs(tx.amount),
          currency: tx.currency,
          exchangeRate: invoice.exchangeRate,
          baseAmount: Math.round(Math.abs(tx.amount) * invoice.exchangeRate),
          method: "TRANSFER",
          bankTransactionId: transactionId,
          bankAccountId: tx.bankAccountId,
          isPartial: Math.abs(tx.amount) < invoice.grossAmount,
        },
      });
      // Státusz az összes kifizetés összege alapján (N banki tétel → 1 számla is helyes)
      await updateInvoiceStatusByPayments(db, invoiceId, invoice.grossAmount);
    });

    // A kivonat párosítási számlálójának frissítése
    await prisma.bankStatement.update({
      where: { id: tx.bankStatementId },
      data: { matchedCount: { increment: 1 } },
    });
  }

  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId,
      userId: user.id,
      ipAddress: clientIp(req),
      action: `MATCH_${action.toUpperCase()}`,
      entityType: "BankTransaction",
      entityId: transactionId,
      changes: JSON.stringify({ invoiceId, parts }),
    },
  });

  return NextResponse.json({ ok: true });
}
