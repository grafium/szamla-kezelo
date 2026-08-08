import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentUserOrDemo } from "@/auth";
import { prisma } from "@/lib/prisma";

// Kézi párosítás megerősítése: banki tétel ↔ számla (vagy figyelmen kívül hagyás).

const schema = z.object({
  transactionId: z.string(),
  invoiceId: z.string().optional(),
  action: z.enum(["match", "ignore", "unmatch"]),
});

export async function POST(req: NextRequest) {
  const user = await currentUserOrDemo();
  if (!user) return NextResponse.json({ error: "Bejelentkezés szükséges" }, { status: 401 });
  if (user.role === "VIEWER") return NextResponse.json({ error: "Nincs jogosultságod" }, { status: 403 });

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Érvénytelen adat" }, { status: 400 });
  const { transactionId, invoiceId, action } = body.data;

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
  } else {
    if (!invoiceId) return NextResponse.json({ error: "Hiányzó számla-azonosító" }, { status: 400 });
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, organizationId: user.organizationId, deletedAt: null },
    });
    if (!invoice) return NextResponse.json({ error: "A számla nem található" }, { status: 404 });

    await prisma.$transaction([
      prisma.bankTransaction.update({
        where: { id: transactionId },
        data: {
          matchStatus: "MANUALLY_MATCHED",
          matchedInvoiceId: invoiceId,
          partnerId: invoice.partnerId,
          matchConfidence: 1,
        },
      }),
      prisma.invoice.update({
        where: { id: invoiceId },
        data: { status: Math.abs(tx.amount) >= invoice.grossAmount ? "PAID" : "PARTIALLY_PAID" },
      }),
      prisma.payment.create({
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
      }),
    ]);

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
      action: `MATCH_${action.toUpperCase()}`,
      entityType: "BankTransaction",
      entityId: transactionId,
      changes: JSON.stringify({ invoiceId }),
    },
  });

  return NextResponse.json({ ok: true });
}
