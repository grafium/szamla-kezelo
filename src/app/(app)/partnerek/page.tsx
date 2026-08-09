import Link from "next/link";
import { startOfYear } from "date-fns";
import { currentUserOrDemo } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/topbar";
import { FilterBar } from "@/components/filter-bar";
import { Badge, Card, EmptyState } from "@/components/ui";
import { partnerFields } from "@/lib/filters/definitions";
import { toClientFields } from "@/lib/filters/types";
import { applyComputed, buildFilter } from "@/lib/filters/prisma";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { PARTNER_TYPE_LABELS, type Currency, type PartnerType } from "@/lib/constants";
import { NewPartnerDrawer } from "@/components/forms/new-partner-drawer";

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
    orderBy: { name: "asc" },
  });

  // A számított oszlopokat (nyitott tartozás, idei költés, utolsó tranzakció,
  // aktív előfizetések) partnerenkénti összesítéssel kérjük le. Korábban minden
  // partner ÖSSZES számlája betöltődött — így a lista mérete a számlaszámmal
  // együtt nőtt; most partnerenként egy-egy összegzett sor jön vissza.
  const yearStart = startOfYear(new Date());
  const invoiceScope = { organizationId: orgId, deletedAt: null };
  const [openAgg, yearAgg, lastInvoiceAgg, lastPaymentAgg, subAgg] = await Promise.all([
    prisma.invoice.groupBy({
      by: ["partnerId"],
      where: { ...invoiceScope, status: { in: ["APPROVED", "AWAITING_APPROVAL", "PARTIALLY_PAID", "OVERDUE"] } },
      _sum: { baseAmount: true },
    }),
    prisma.invoice.groupBy({
      by: ["partnerId"],
      where: { ...invoiceScope, issueDate: { gte: yearStart }, status: { notIn: ["CANCELLED", "DRAFT"] } },
      _sum: { baseAmount: true },
    }),
    prisma.invoice.groupBy({
      by: ["partnerId"],
      where: invoiceScope,
      _max: { issueDate: true },
    }),
    prisma.payment.groupBy({
      by: ["partnerId"],
      where: { organizationId: orgId, deletedAt: null },
      _max: { paymentDate: true },
    }),
    prisma.subscription.groupBy({
      by: ["partnerId"],
      where: { organizationId: orgId, deletedAt: null, status: { in: ["ACTIVE", "TRIAL"] } },
      _count: { _all: true },
    }),
  ]);

  const num = <T,>(rows: { partnerId: string | null }[], pick: (r: any) => T) =>
    new Map(rows.filter((r) => r.partnerId).map((r) => [r.partnerId as string, pick(r)]));
  const openMap = num(openAgg, (r) => r._sum.baseAmount ?? 0);
  const yearMap = num(yearAgg, (r) => r._sum.baseAmount ?? 0);
  const lastInvoiceMap = num(lastInvoiceAgg, (r) => r._max.issueDate as Date | null);
  const lastPaymentMap = num(lastPaymentAgg, (r) => r._max.paymentDate as Date | null);
  const subMap = num(subAgg, (r) => r._count._all as number);

  const withComputed = partners.map((p) => {
    const lastPayment = lastPaymentMap.get(p.id) ?? null;
    const lastInvoice = lastInvoiceMap.get(p.id) ?? null;
    // A két dátum közül a későbbi az utolsó tranzakció (korábban mindig a
    // kifizetés nyert, így egy frissebb számla dátuma elveszett).
    const lastTransactionAt =
      lastPayment && lastInvoice ? (lastPayment > lastInvoice ? lastPayment : lastInvoice)
      : lastPayment ?? lastInvoice;
    return {
      ...p,
      _computed: {
        openBalance: openMap.get(p.id) ?? 0,
        spentThisYear: yearMap.get(p.id) ?? 0,
        lastTransactionAt,
        activeSubscriptionCount: subMap.get(p.id) ?? 0,
      },
    };
  });
  const rows = applyComputed(withComputed, built);

  const qs = (overrides: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params, ...overrides })) if (v != null) p.set(k, v);
    return `?${p.toString()}`;
  };

  return (
    <>
      <Topbar title="Partnerek" action={<Link href={qs({ uj: "1" })} className="btn-primary">+ Új partner</Link>} />
      <main className="max-w-[1280px] mx-auto px-4 md:px-8 py-4">
        <FilterBar fields={toClientFields(partnerFields)} quickFilters={QUICK_FILTERS} entityType="partners" />
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

      {params.uj === "1" && <NewPartnerDrawer closeHref={qs({ uj: undefined })} />}
    </>
  );
}
