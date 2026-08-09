import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentUserOrDemo } from "@/auth";
import { prisma } from "@/lib/prisma";
import { clientIp } from "@/lib/audit";
import { dedupKey } from "@/services/bank-import/csv";
import { scoreMatch, AUTO_MATCH_THRESHOLD, type InvoiceLike } from "@/lib/matching";

// Bankkivonat-import: normalizált sorok fogadása, duplikátum-szűrés,
// kivonat + tételek létrehozása, szabályok alkalmazása, automatikus párosítás.

const rowSchema = z.object({
  bookingDate: z.string().min(1),
  valueDate: z.string().optional(),
  amount: z.number().int(),
  currency: z.string().optional(),
  counterpartyName: z.string().optional(),
  counterpartyAccount: z.string().optional(),
  reference: z.string().optional(),
});

const schema = z.object({
  bankAccountId: z.string().min(1),
  statementNumber: z.string().optional(),
  currencyFallback: z.string().optional(),
  rows: z.array(rowSchema).min(1).max(2000),
});

export async function POST(req: NextRequest) {
  const user = await currentUserOrDemo();
  if (!user) return NextResponse.json({ error: "Bejelentkezés szükséges" }, { status: 401 });
  if (user.role === "VIEWER") return NextResponse.json({ error: "Nincs jogosultságod az importáláshoz" }, { status: 403 });

  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Érvénytelen adat", details: body.error.flatten() }, { status: 400 });
  }
  const { bankAccountId, statementNumber, currencyFallback, rows } = body.data;

  const account = await prisma.bankAccount.findFirst({
    where: { id: bankAccountId, organizationId: user.organizationId, deletedAt: null },
  });
  if (!account) return NextResponse.json({ error: "A bankszámla nem található" }, { status: 404 });

  // Sorok előkészítése (dátumok + deviza)
  const prepared = rows.map((r) => {
    const bookingDate = new Date(r.bookingDate);
    if (Number.isNaN(bookingDate.getTime())) return null;
    return {
      bookingDate,
      valueDate: r.valueDate ? new Date(r.valueDate) : null,
      amount: r.amount,
      currency: r.currency ?? currencyFallback ?? account.currency,
      counterpartyName: r.counterpartyName ?? null,
      counterpartyAccount: r.counterpartyAccount ?? null,
      reference: r.reference ?? null,
    };
  }).filter((r): r is NonNullable<typeof r> => r !== null);
  if (prepared.length === 0) {
    return NextResponse.json({ error: "Nincs importálható sor" }, { status: 400 });
  }

  const minDate = new Date(Math.min(...prepared.map((r) => r.bookingDate.getTime())));
  const maxDate = new Date(Math.max(...prepared.map((r) => r.bookingDate.getTime())));

  // Duplikátum-szűrés: a számla meglévő tételei az érintett időszakban
  const existing = await prisma.bankTransaction.findMany({
    where: {
      bankAccountId: account.id,
      bookingDate: {
        gte: new Date(minDate.getTime() - 86_400_000),
        lte: new Date(maxDate.getTime() + 86_400_000),
      },
    },
    select: { bookingDate: true, amount: true, reference: true, endToEndId: true },
  });
  const seen = new Set(existing.map((t) => dedupKey(t)));

  const toImport: typeof prepared = [];
  let skippedDuplicates = 0;
  for (const r of prepared) {
    const key = dedupKey(r);
    if (seen.has(key)) { skippedDuplicates++; continue; }
    seen.add(key);
    toImport.push(r);
  }

  if (toImport.length === 0) {
    return NextResponse.json({ statementId: null, imported: 0, skippedDuplicates, autoMatched: 0 });
  }

  const sum = toImport.reduce((s, r) => s + r.amount, 0);
  const statement = await prisma.bankStatement.create({
    data: {
      organizationId: user.organizationId,
      bankAccountId: account.id,
      statementNumber: statementNumber || null,
      periodStart: minDate,
      periodEnd: maxDate,
      openingBalance: 0,
      closingBalance: sum,
      currency: account.currency,
      importedBy: user.id,
      transactionCount: toImport.length,
      status: "NEEDS_REVIEW",
    },
  });

  await prisma.bankTransaction.createMany({
    data: toImport.map((r) => ({
      bankStatementId: statement.id,
      bankAccountId: account.id,
      bookingDate: r.bookingDate,
      valueDate: r.valueDate,
      amount: r.amount,
      currency: r.currency,
      counterpartyName: r.counterpartyName,
      counterpartyAccount: r.counterpartyAccount,
      reference: r.reference,
      matchStatus: "UNMATCHED",
    })),
  });
  const created = await prisma.bankTransaction.findMany({
    where: { bankStatementId: statement.id },
  });

  // Párosítási szabályok alkalmazása (közlemény tartalmazza → partner/kategória)
  const ruleRows = await prisma.matchingRule.findMany({
    where: { organizationId: user.organizationId, isActive: true },
  });
  const ruleUpdates: { id: string; partnerId?: string; categoryId?: string }[] = [];
  for (const tx of created) {
    if (!tx.reference) continue;
    const ref = tx.reference.toLowerCase();
    const rule = ruleRows.find((r) => r.referenceContains && ref.includes(r.referenceContains.toLowerCase()));
    if (rule && (rule.partnerId || rule.categoryId)) {
      ruleUpdates.push({
        id: tx.id,
        partnerId: rule.partnerId ?? undefined,
        categoryId: rule.categoryId ?? undefined,
      });
    }
  }
  if (ruleUpdates.length > 0) {
    await prisma.$transaction(
      ruleUpdates.map((u) =>
        prisma.bankTransaction.update({
          where: { id: u.id },
          data: { partnerId: u.partnerId, categoryId: u.categoryId },
        })
      )
    );
  }

  // Automatikus párosítás nyitott számlákkal (egy számla max. egyszer)
  const openInvoices = await prisma.invoice.findMany({
    where: {
      organizationId: user.organizationId,
      deletedAt: null,
      status: { in: ["APPROVED", "AWAITING_APPROVAL", "PARTIALLY_PAID", "OVERDUE"] },
    },
    include: { partner: { include: { aliases: true } } },
  });
  const usedInvoiceIds = new Set<string>();
  const autoUpdates: { txId: string; invoiceId: string; partnerId: string | null; score: number }[] = [];
  for (const tx of created) {
    let best: { invoice: InvoiceLike & { partnerId: string | null }; score: number } | null = null;
    for (const inv of openInvoices) {
      if (usedInvoiceIds.has(inv.id)) continue;
      const score = scoreMatch(tx, inv);
      if (score >= AUTO_MATCH_THRESHOLD && (!best || score > best.score)) {
        best = { invoice: inv, score };
      }
    }
    if (best) {
      usedInvoiceIds.add(best.invoice.id);
      autoUpdates.push({
        txId: tx.id,
        invoiceId: best.invoice.id,
        partnerId: best.invoice.partnerId,
        score: Math.round(best.score * 100) / 100,
      });
    }
  }
  if (autoUpdates.length > 0) {
    await prisma.$transaction(
      autoUpdates.map((u) =>
        prisma.bankTransaction.update({
          where: { id: u.txId },
          data: {
            matchStatus: "AUTO_MATCHED",
            matchConfidence: u.score,
            matchedInvoiceId: u.invoiceId,
            partnerId: u.partnerId ?? undefined,
          },
        })
      )
    );
  }

  await prisma.bankStatement.update({
    where: { id: statement.id },
    data: { matchedCount: autoUpdates.length },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId,
      userId: user.id,
      ipAddress: clientIp(req),
      action: "IMPORT",
      entityType: "BankStatement",
      entityId: statement.id,
      changes: JSON.stringify({
        bankAccountId: account.id,
        imported: toImport.length,
        skippedDuplicates,
        autoMatched: autoUpdates.length,
      }),
    },
  });

  return NextResponse.json({
    statementId: statement.id,
    imported: toImport.length,
    skippedDuplicates,
    autoMatched: autoUpdates.length,
  });
}
