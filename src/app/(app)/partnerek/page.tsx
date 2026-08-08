import Link from "next/link";
import { startOfYear } from "date-fns";
import { currentUserOrDemo } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/topbar";
import { FilterBar } from "@/components/filter-bar";
import { Badge, Card, EmptyState } from "@/components/ui";
import { partnerFields } from "@/lib/filters/definitions";
import { applyComputed, buildFilter } from "@/lib/filters/prisma";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { PARTNER_TYPE_LABELS, type Currency, type PartnerType } from "@/lib/constants";

export const dynamic = "force-dynamic";

const QUICK_FILTERS = [
  { label: "Aktív", group: { logic: "AND" as const, items: [{ field: "isActive", op: "isTrue" as const }] } },
  { label: "Van nyitott tartozás", group: { logic: "AND" as const, items: [{ field: "openBalance", op: "gt" as const, value: 0 }] } },
  { label: "Külföldi", group: { logic: "AND" as const, items: [{ field: "country", op: "notContains" as const, value: "HU" }] } },
];

export default async function PartnersPage({
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
  const built = buildFilter(group, partnerFields);

  const partners = await prisma.partner.findMany({
    where: { organizationId: orgId, deletedAt: null, ...built.where },
    include: {
      invoices: { where: { deletedAt: null } },
      subscriptions: { where: { deletedAt: null } },
      payments: { where: { deletedAt: null }, orderBy: { paymentDate: "desc" }, take: 1 },
    },
    orderBy: { name: "asc" },
  });

  const yearStart = startOfYear(new Date());
  const withComputed = partners.map((p) => {
    const open = p.invoices.filter((i) =>
      ["APPROVED", "AWAITING_APPROVAL", "PARTIALLY_PAID", "OVERDUE"].includes(i.status));
    const openBalance = open.reduce((s, i) => s + i.baseAmount, 0);
    const spentThisYear = p.invoices
      .filter((i) => i.issueDate >= yearStart && !["CANCELLED", "DRAFT"].includes(i.status))
      .reduce((s, i) => s + i.baseAmount, 0);
    const lastInvoice = [...p.invoices].sort((a, b) => +b.issueDate - +a.issueDate)[0];
    return {
      ...p,
      _computed: {
        openBalance,
        spentThisYear,
        lastTransactionAt: p.payments[0]?.paymentDate ?? lastInvoice?.issueDate ?? null,
        activeSubscriptionCount: p.subscriptions.filter((s) => ["ACTIVE", "TRIAL"].includes(s.status)).length,
      },
    };
  });
  const rows = applyComputed(withComputed, built);

  return (
    <>
      <Topbar title="Partnerek" action={<button className="btn-primary">+ Új partner</button>} />
      <main className="max-w-[1280px] mx-auto px-4 md:px-8 py-4">
        <FilterBar fields={partnerFields} quickFilters={QUICK_FILTERS} entityType="partners" />
        {rows.length === 0 ? (
          <EmptyState icon="◔" text="Nincs a szűrésnek megfelelő partner" actionLabel="Szűrők törlése" actionHref="/partnerek" />
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="table-base responsive-table">
              <thead>
                <tr>
                  <th>Név</th><th>Típus</th><th>Ország</th>
                  <th className="num">Nyitott tartozás</th>
                  <th className="num">Idei költés</th>
                  <th className="num">Aktív előfiz.</th>
                  <th>Utolsó tranzakció</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Név">
                      <Link href={`/partnerek/${p.id}`} className="flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: `var(--${p.color ?? "gray"})` }} />
                        <span className="font-medium truncate">{p.name}</span>
                        {!p.isActive && <Badge color="gray">inaktív</Badge>}
                      </Link>
                    </td>
                    <td data-label="Típus" className="text-[13px]">{PARTNER_TYPE_LABELS[p.type as PartnerType]}</td>
                    <td data-label="Ország" className="text-[13px]">{p.country ?? "–"}</td>
                    <td data-label="Nyitott" className="num"
                      style={p._computed.openBalance > 0 ? { color: "var(--orange)" } : undefined}>
                      {formatMoney(p._computed.openBalance, base)}
                    </td>
                    <td data-label="Idei költés" className="num">{formatMoney(p._computed.spentThisYear, base)}</td>
                    <td data-label="Előfiz." className="num">{p._computed.activeSubscriptionCount || "–"}</td>
                    <td data-label="Utolsó" className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                      {formatDate(p._computed.lastTransactionAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </main>
    </>
  );
}
