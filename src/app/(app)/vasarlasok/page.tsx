import { currentUserOrDemo } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/topbar";
import { FilterBar } from "@/components/filter-bar";
import { Badge, Card, CurrencyTotals, EmptyState, Money } from "@/components/ui";
import { purchaseFields } from "@/lib/filters/definitions";
import { applyComputed, buildFilter } from "@/lib/filters/prisma";
import { formatDate, daysUntil } from "@/lib/format";
import { sumByCurrency } from "@/lib/money";
import { PAYMENT_METHOD_LABELS, type Currency, type PaymentMethod } from "@/lib/constants";

export const dynamic = "force-dynamic";

const QUICK_FILTERS = [
  { label: "Ebben a hónapban", group: { logic: "AND" as const, items: [{ field: "purchaseDate", op: "thisMonth" as const }] } },
  { label: "Tárgyi eszközök", group: { logic: "AND" as const, items: [{ field: "isAsset", op: "isTrue" as const }] } },
  { label: "Garancia 60 napon belül lejár", group: { logic: "AND" as const, items: [{ field: "warrantyUntil", op: "nextNDays" as const, value: 60 }] } },
];

export default async function PurchasesPage({
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
  const built = buildFilter(group, purchaseFields);

  const partnerOptions = await prisma.partner.findMany({
    where: { organizationId: orgId, deletedAt: null },
    select: { id: true, name: true }, orderBy: { name: "asc" },
  });
  const fields = purchaseFields.map((f) =>
    f.key === "partner" ? { ...f, options: partnerOptions.map((p) => ({ value: p.id, label: p.name })) } : f
  );

  const all = await prisma.purchase.findMany({
    where: { organizationId: orgId, deletedAt: null, ...built.where },
    include: { partner: true, category: true },
    orderBy: { purchaseDate: "desc" },
  });
  const rows = applyComputed(all, built);
  const totals = sumByCurrency(rows.map((r) => ({ amount: r.grossAmount, currency: r.currency })));
  const baseTotal = rows.reduce((s, r) => s + r.baseAmount, 0);

  return (
    <>
      <Topbar title="Egyszeri vásárlások" />
      <main className="max-w-[1280px] mx-auto px-4 md:px-8 py-4">
        <FilterBar fields={fields} quickFilters={QUICK_FILTERS} entityType="purchases" />
        {rows.length === 0 ? (
          <EmptyState icon="▣" text="Nincs a szűrésnek megfelelő vásárlás" actionLabel="Szűrők törlése" actionHref="/vasarlasok" />
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="table-base responsive-table">
              <thead>
                <tr>
                  <th>Megnevezés</th><th>Partner</th><th>Dátum</th><th>Fizetés</th>
                  <th>Garancia</th><th className="num">Bruttó</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const warrantyDays = p.warrantyUntil ? daysUntil(p.warrantyUntil) : null;
                  return (
                    <tr key={p.id}>
                      <td data-label="Megnevezés">
                        <span className="flex items-center gap-2">
                          <span className="font-medium">{p.name}</span>
                          {p.isAsset && <Badge color="blue">eszköz</Badge>}
                        </span>
                      </td>
                      <td data-label="Partner" className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                        {p.partner?.name ?? "–"}
                      </td>
                      <td data-label="Dátum" className="text-[13px]">{formatDate(p.purchaseDate)}</td>
                      <td data-label="Fizetés" className="text-[13px]">
                        {PAYMENT_METHOD_LABELS[p.paymentMethod as PaymentMethod]}
                      </td>
                      <td data-label="Garancia" className="text-[13px]">
                        {p.warrantyUntil ? (
                          <span style={warrantyDays != null && warrantyDays <= 30 && warrantyDays >= 0 ? { color: "var(--orange)" } : undefined}>
                            {formatDate(p.warrantyUntil)}
                            {warrantyDays != null && warrantyDays >= 0 && warrantyDays <= 60 ? ` (${warrantyDays} nap)` : ""}
                          </span>
                        ) : "–"}
                      </td>
                      <td data-label="Bruttó" className="num">
                        <Money amount={p.grossAmount} currency={p.currency as Currency}
                          baseAmount={p.baseAmount} baseCurrency={base} />
                      </td>
                    </tr>
                  );
                })}
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
