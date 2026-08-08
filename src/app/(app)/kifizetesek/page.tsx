import Link from "next/link";
import { currentUserOrDemo } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/topbar";
import { FilterBar } from "@/components/filter-bar";
import { Badge, Card, CurrencyTotals, EmptyState, Money } from "@/components/ui";
import { paymentFields } from "@/lib/filters/definitions";
import { toClientFields } from "@/lib/filters/types";
import { applyComputed, buildFilter } from "@/lib/filters/prisma";
import { formatDate } from "@/lib/format";
import { sumByCurrency } from "@/lib/money";
import { PAYMENT_METHOD_LABELS, type Currency, type PaymentMethod } from "@/lib/constants";

export const dynamic = "force-dynamic";

const QUICK_FILTERS = [
  { label: "Ebben a hónapban", group: { logic: "AND" as const, items: [{ field: "paymentDate", op: "thisMonth" as const }] } },
  { label: "Részfizetések", group: { logic: "AND" as const, items: [{ field: "isPartial", op: "isTrue" as const }] } },
  { label: "Csak EUR", group: { logic: "AND" as const, items: [{ field: "currency", op: "anyOf" as const, value: ["EUR"] }] } },
];

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const user = await currentUserOrDemo();
  if (!user) return <EmptyState text="Futtasd a seed szkriptet: npm run db:seed" />;
  const orgId = user.organizationId;
  const base = user.organization.baseCurrency as Currency;

  let group = null;
  if (params.f) { try { group = JSON.parse(params.f); } catch {} }
  const built = buildFilter(group, paymentFields);

  const partnerOptions = await prisma.partner.findMany({
    where: { organizationId: orgId, deletedAt: null },
    select: { id: true, name: true }, orderBy: { name: "asc" },
  });
  const fields = paymentFields.map((f) =>
    f.key === "partner" ? { ...f, options: partnerOptions.map((p) => ({ value: p.id, label: p.name })) } : f
  );

  const all = await prisma.payment.findMany({
    where: { organizationId: orgId, deletedAt: null, ...built.where },
    include: { partner: true, invoice: true, bankTransaction: true },
    orderBy: { paymentDate: "desc" },
    take: 300,
  });
  const rows = applyComputed(all, built);
  const totals = sumByCurrency(rows.map((r) => ({ amount: r.amount, currency: r.currency })));
  const baseTotal = rows.reduce((s, r) => s + r.baseAmount, 0);

  return (
    <>
      <Topbar title="Kifizetések" />
      <main className="max-w-[1280px] mx-auto px-4 md:px-8 py-4">
        <FilterBar fields={toClientFields(fields)} quickFilters={QUICK_FILTERS} entityType="payments" />
        {rows.length === 0 ? (
          <EmptyState icon="⇄" text="Nincs a szűrésnek megfelelő kifizetés" actionLabel="Szűrők törlése" actionHref="/kifizetesek" />
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="table-base responsive-table">
              <thead>
                <tr>
                  <th>Dátum</th><th>Partner</th><th>Számla</th><th>Mód</th>
                  <th>Banki tétel</th><th className="num">Összeg</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Dátum" className="text-[13px]">{formatDate(p.paymentDate)}</td>
                    <td data-label="Partner" className="font-medium">{p.partner?.name ?? "–"}</td>
                    <td data-label="Számla" className="text-[13px]">
                      {p.invoice ? (
                        <Link href={`/szamlak?panel=${p.invoiceId}`} className="hover:underline"
                          style={{ color: "var(--accent)" }}>
                          {p.invoice.invoiceNumber}
                        </Link>
                      ) : "–"}
                      {p.isPartial && <Badge color="orange">részfizetés</Badge>}
                    </td>
                    <td data-label="Mód" className="text-[13px]">{PAYMENT_METHOD_LABELS[p.method as PaymentMethod]}</td>
                    <td data-label="Banki tétel" className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                      {p.bankTransaction ? `${p.bankTransaction.counterpartyName ?? "?"} · ${formatDate(p.bankTransaction.bookingDate)}` : "–"}
                    </td>
                    <td data-label="Összeg" className="num">
                      <Money amount={p.amount} currency={p.currency as Currency}
                        baseAmount={p.baseAmount} baseCurrency={base} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
        <div className="py-3">
          <CurrencyTotals totals={totals} baseTotal={baseTotal} baseCurrency={base} />
        </div>
      </main>
    </>
  );
}
