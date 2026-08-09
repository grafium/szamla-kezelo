import { NextRequest, NextResponse } from "next/server";
import { currentUserOrDemo } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/money";
import { insensitive } from "@/lib/db-mode";
import type { Currency } from "@/lib/constants";

// Globális kereső (⌘K): partner, számlaszám, közlemény, csatolmány OCR-szövege.

export async function GET(req: NextRequest) {
  const user = await currentUserOrDemo();
  if (!user) return NextResponse.json([]);
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json([]);
  const orgId = user.organizationId;

  // Postgresen a `contains` kis-nagybetű-érzékeny — a kereséshez insensitive mód kell.
  const ci = insensitive();

  const [partners, invoices, transactions, attachments] = await Promise.all([
    prisma.partner.findMany({
      where: { organizationId: orgId, deletedAt: null, name: { contains: q, ...ci } },
      take: 4,
    }),
    prisma.invoice.findMany({
      where: {
        organizationId: orgId, deletedAt: null,
        OR: [{ invoiceNumber: { contains: q, ...ci } }, { description: { contains: q, ...ci } }],
      },
      include: { partner: true },
      take: 5,
    }),
    prisma.bankTransaction.findMany({
      where: {
        bankAccount: { organizationId: orgId },
        OR: [{ reference: { contains: q, ...ci } }, { counterpartyName: { contains: q, ...ci } }],
      },
      take: 4,
    }),
    prisma.attachment.findMany({
      where: { organizationId: orgId, deletedAt: null, ocrText: { contains: q, ...ci } },
      take: 3,
    }),
  ]);

  const results = [
    ...partners.map((p) => ({ label: p.name, sub: "Partner", href: `/partnerek/${p.id}` })),
    ...invoices.map((i) => ({
      label: `${i.invoiceNumber} · ${i.partner?.name ?? ""} · ${formatMoney(i.grossAmount, i.currency as Currency)}`,
      sub: "Számla",
      href: `/szamlak?panel=${i.id}`,
    })),
    ...transactions.map((t) => ({
      label: `${t.counterpartyName ?? "?"} · ${formatMoney(t.amount, t.currency as Currency)}`,
      sub: "Banki tétel",
      href: `/banki-kivonatok/${t.bankStatementId}`,
    })),
    ...attachments.map((a) => ({ label: a.fileName, sub: "Dokumentum (OCR)", href: "/beerkezo" })),
  ];

  return NextResponse.json(results.slice(0, 10));
}
