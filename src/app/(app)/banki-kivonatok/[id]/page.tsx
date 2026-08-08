import { currentUserOrDemo } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/topbar";
import { Badge, Card, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { suggestMatches } from "@/lib/matching";
import {
  MATCH_STATUS_COLORS, MATCH_STATUS_LABELS, type Currency, type MatchStatus,
} from "@/lib/constants";
import { MatchActions } from "./match-actions";

export const dynamic = "force-dynamic";

export default async function StatementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await currentUserOrDemo();
  if (!user) return <EmptyState text="Futtasd a seed szkriptet: npm run db:seed" />;

  const statement = await prisma.bankStatement.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      bankAccount: true,
      transactions: {
        include: { partner: true, matchedInvoice: { include: { partner: true } } },
        orderBy: { bookingDate: "desc" },
      },
    },
  });
  if (!statement) return <EmptyState text="A kivonat nem található" actionLabel="Vissza" actionHref="/banki-kivonatok" />;

  // Nyitott számlák a javaslatokhoz
  const openInvoices = await prisma.invoice.findMany({
    where: {
      organizationId: user.organizationId, deletedAt: null,
      status: { in: ["APPROVED", "AWAITING_APPROVAL", "PARTIALLY_PAID", "OVERDUE"] },
    },
    include: { partner: { include: { aliases: true } } },
  });
  const invoiceById = new Map(openInvoices.map((i) => [i.id, i]));

  // Partnerlista a szabály-mentés mini-űrlaphoz
  const partners = await prisma.partner.findMany({
    where: { organizationId: user.organizationId, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const unmatched = statement.transactions.filter((t) => t.matchStatus === "UNMATCHED");
  const matched = statement.transactions.filter((t) => t.matchStatus !== "UNMATCHED");

  return (
    <>
      <Topbar
        title={`${statement.bankAccount.name} — kivonat`}
        breadcrumb={["Banki kivonatok"]}
      />
      <main className="max-w-[1280px] mx-auto px-4 md:px-8 py-6 flex flex-col gap-6">
        <div className="flex flex-wrap gap-6 text-[13px]">
          <span><span className="label-upper mr-2">Időszak</span>{formatDate(statement.periodStart)} – {formatDate(statement.periodEnd)}</span>
          <span><span className="label-upper mr-2">Nyitó</span><span className="num">{formatMoney(statement.openingBalance, statement.currency as Currency)}</span></span>
          <span><span className="label-upper mr-2">Záró</span><span className="num">{formatMoney(statement.closingBalance, statement.currency as Currency)}</span></span>
          <span><span className="label-upper mr-2">Párosítva</span>{matched.length}/{statement.transactions.length}</span>
        </div>

        {unmatched.length > 0 && (
          <Card title={`Párosítás — ${unmatched.length} párosítatlan tétel`}>
            <p className="text-[13px] mb-3" style={{ color: "var(--text-secondary)" }}>
              A javaslatokat a párosító motor pontozza (összeg, dátum, közlemény, partner). Egy kattintással megerősítheted, vagy kézzel választhatsz számlát.
            </p>
            <div className="flex flex-col gap-3">
              {unmatched.map((tx) => {
                const suggestions = suggestMatches(
                  { ...tx, bookingDate: tx.bookingDate },
                  openInvoices.map((i) => ({ ...i, partner: i.partner }))
                ).map((s) => {
                  const inv = invoiceById.get(s.invoiceId)!;
                  return {
                    invoiceId: s.invoiceId,
                    score: s.score,
                    label: `${inv.invoiceNumber} · ${inv.partner?.name ?? "?"} · ${formatMoney(inv.grossAmount, inv.currency as Currency)} · határidő: ${formatDate(inv.dueDate)}`,
                  };
                });
                return (
                  <div key={tx.id} className="card p-3 flex flex-col gap-2" style={{ background: "var(--bg-tertiary)" }}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="text-[13px]" style={{ color: "var(--text-tertiary)" }}>{formatDate(tx.bookingDate)}</span>
                        <span className="font-medium truncate">{tx.counterpartyName ?? "Ismeretlen"}</span>
                      </span>
                      <span className="num font-medium" style={{ color: tx.amount < 0 ? "var(--red)" : "var(--green)" }}>
                        {formatMoney(tx.amount, tx.currency as Currency)}
                      </span>
                    </div>
                    {tx.reference && (
                      <p className="text-[12px] truncate" style={{ color: "var(--text-tertiary)" }}>
                        Közlemény: {tx.reference}
                      </p>
                    )}
                    <MatchActions
                      transactionId={tx.id}
                      suggestions={suggestions}
                      allInvoices={openInvoices.map((i) => ({
                        id: i.id,
                        label: `${i.invoiceNumber} · ${i.partner?.name ?? "?"} · ${formatMoney(i.grossAmount, i.currency as Currency)}`,
                      }))}
                      txAmount={tx.amount}
                      txCurrency={tx.currency}
                      reference={tx.reference}
                      counterpartyName={tx.counterpartyName}
                      partners={partners}
                    />
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        <Card className="overflow-x-auto p-0">
          <table className="table-base responsive-table">
            <thead>
              <tr>
                <th>Dátum</th><th>Ellenpartner</th><th>Közlemény</th>
                <th>Párosítás</th><th className="num">Összeg</th>
              </tr>
            </thead>
            <tbody>
              {statement.transactions.map((tx) => (
                <tr key={tx.id}>
                  <td data-label="Dátum" className="text-[13px]">{formatDate(tx.bookingDate)}</td>
                  <td data-label="Ellenpartner" className="font-medium text-[14px]">
                    {tx.counterpartyName ?? "–"}
                    {tx.partner && (
                      <span className="text-[12px] ml-2" style={{ color: "var(--text-tertiary)" }}>
                        → {tx.partner.name}
                      </span>
                    )}
                  </td>
                  <td data-label="Közlemény" className="text-[13px] max-w-[260px] truncate" style={{ color: "var(--text-secondary)" }}>
                    {tx.reference ?? "–"}
                  </td>
                  <td data-label="Párosítás">
                    <span className="flex items-center gap-2">
                      <Badge color={MATCH_STATUS_COLORS[tx.matchStatus as MatchStatus]}>
                        {MATCH_STATUS_LABELS[tx.matchStatus as MatchStatus]}
                      </Badge>
                      {tx.matchConfidence != null && tx.matchStatus === "AUTO_MATCHED" && (
                        <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                          {Math.round(tx.matchConfidence * 100)}%
                        </span>
                      )}
                      {tx.matchedInvoice && (
                        <span className="text-[12px] truncate" style={{ color: "var(--text-tertiary)" }}>
                          {tx.matchedInvoice.invoiceNumber}
                        </span>
                      )}
                    </span>
                  </td>
                  <td data-label="Összeg" className="num"
                    style={{ color: tx.amount < 0 ? undefined : "var(--green)" }}>
                    {formatMoney(tx.amount, tx.currency as Currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </main>
    </>
  );
}
