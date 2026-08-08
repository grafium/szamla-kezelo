import Link from "next/link";
import { startOfYear } from "date-fns";
import { currentUserOrDemo } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/topbar";
import { Badge, Card, EmptyState, KpiCard, Money } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import {
  BILLING_CYCLE_LABELS, INVOICE_STATUS_COLORS, INVOICE_STATUS_LABELS,
  SUBSCRIPTION_STATUS_COLORS, SUBSCRIPTION_STATUS_LABELS,
  type BillingCycle, type Currency, type InvoiceStatus, type SubscriptionStatus,
} from "@/lib/constants";
import { parseJsonArray } from "@/lib/format";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "attekintes", label: "Áttekintés" },
  { key: "szamlak", label: "Számlák" },
  { key: "elofizetesek", label: "Előfizetések" },
  { key: "kifizetesek", label: "Kifizetések" },
  { key: "vasarlasok", label: "Vásárlások" },
  { key: "aliasok", label: "Aliasok" },
] as const;

export default async function PartnerDetailPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ful?: string }>;
}) {
  const { id } = await params;
  const { ful } = await searchParams;
  const tab = TABS.some((t) => t.key === ful) ? ful! : "attekintes";

  const user = await currentUserOrDemo();
  if (!user) return <EmptyState text="Futtasd a seed szkriptet: npm run db:seed" />;
  const base = user.organization.baseCurrency as Currency;

  const partner = await prisma.partner.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      aliases: true,
      invoices: { where: { deletedAt: null }, orderBy: { issueDate: "desc" } },
      subscriptions: { where: { deletedAt: null }, include: { occurrences: { orderBy: { dueDate: "desc" }, take: 4 } } },
      payments: { where: { deletedAt: null }, orderBy: { paymentDate: "desc" } },
      purchases: { where: { deletedAt: null }, orderBy: { purchaseDate: "desc" } },
    },
  });
  if (!partner) return <EmptyState text="A partner nem található" actionLabel="Vissza" actionHref="/partnerek" />;

  const yearStart = startOfYear(new Date());
  const totalSpent = partner.invoices
    .filter((i) => !["CANCELLED", "DRAFT"].includes(i.status))
    .reduce((s, i) => s + i.baseAmount, 0);
  const spentThisYear = partner.invoices
    .filter((i) => i.issueDate >= yearStart && !["CANCELLED", "DRAFT"].includes(i.status))
    .reduce((s, i) => s + i.baseAmount, 0);
  const openBalance = partner.invoices
    .filter((i) => ["APPROVED", "AWAITING_APPROVAL", "PARTIALLY_PAID", "OVERDUE"].includes(i.status))
    .reduce((s, i) => s + i.baseAmount, 0);
  const paidInvoices = partner.invoices.filter((i) => i.status === "PAID");
  const avgDelay = paidInvoices.length
    ? Math.round(
        partner.payments
          .filter((p) => p.invoiceId)
          .reduce((s, p) => {
            const inv = partner.invoices.find((i) => i.id === p.invoiceId);
            return inv ? s + Math.max(0, Math.round((+p.paymentDate - +inv.dueDate) / 86400000)) : s;
          }, 0) / Math.max(1, partner.payments.filter((p) => p.invoiceId).length)
      )
    : 0;

  return (
    <>
      <Topbar title={partner.name} breadcrumb={["Partnerek"]} />
      <main className="max-w-[1280px] mx-auto px-4 md:px-8 py-6 flex flex-col gap-5">
        <div className="card p-5" style={{ borderTop: `3px solid var(--${partner.color ?? "gray"})` }}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-[26px]">{partner.displayName ?? partner.name}</h1>
              <div className="flex flex-wrap gap-2 mt-2 text-[13px]" style={{ color: "var(--text-secondary)" }}>
                {partner.taxNumber && <span>Adószám: {partner.taxNumber}</span>}
                {partner.euVatNumber && <span>EU adószám: {partner.euVatNumber}</span>}
                {partner.country && <span>Ország: {partner.country}</span>}
                {partner.email && <span>{partner.email}</span>}
                {partner.website && <a href={partner.website} className="hover:underline" style={{ color: "var(--accent)" }}>{partner.website}</a>}
              </div>
              <div className="flex gap-1.5 mt-2">
                {parseJsonArray(partner.tags).map((t) => <Badge key={t} color="gray">{t}</Badge>)}
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-1 border-b overflow-x-auto" style={{ borderColor: "var(--border)" }}>
          {TABS.map((t) => (
            <Link key={t.key} href={`/partnerek/${id}?ful=${t.key}`}
              className="px-3 py-2 text-[14px] whitespace-nowrap border-b-2 -mb-px"
              style={tab === t.key
                ? { borderColor: "var(--text)", fontWeight: 500 }
                : { borderColor: "transparent", color: "var(--text-secondary)" }}>
              {t.label}
            </Link>
          ))}
        </div>

        {tab === "attekintes" && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCard label="Összes költés" value={formatMoney(totalSpent, base)} />
              <KpiCard label="Idei költés" value={formatMoney(spentThisYear, base)} />
              <KpiCard label="Nyitott tartozás" value={formatMoney(openBalance, base)}
                color={openBalance > 0 ? "orange" : undefined} />
              <KpiCard label="Átl. fizetési késedelem" value={`${avgDelay} nap`} />
            </div>
            {partner.notes && (
              <Card title="Megjegyzések">
                <p className="text-[14px]" style={{ color: "var(--text-secondary)" }}>{partner.notes}</p>
              </Card>
            )}
          </>
        )}

        {tab === "szamlak" && (
          <Card className="overflow-x-auto p-0">
            <table className="table-base">
              <thead>
                <tr><th>Számlaszám</th><th>Kelt</th><th>Határidő</th><th>Státusz</th><th className="num">Bruttó</th></tr>
              </thead>
              <tbody>
                {partner.invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td>
                      <Link href={`/szamlak?panel=${inv.id}`} className="hover:underline font-medium">{inv.invoiceNumber}</Link>
                    </td>
                    <td className="text-[13px]">{formatDate(inv.issueDate)}</td>
                    <td className="text-[13px]">{formatDate(inv.dueDate)}</td>
                    <td>
                      <Badge color={INVOICE_STATUS_COLORS[inv.status as InvoiceStatus]}>
                        {INVOICE_STATUS_LABELS[inv.status as InvoiceStatus]}
                      </Badge>
                    </td>
                    <td className="num">
                      <Money amount={inv.grossAmount} currency={inv.currency as Currency}
                        baseAmount={inv.baseAmount} baseCurrency={base} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {tab === "elofizetesek" && (
          <Card className="overflow-x-auto p-0">
            <table className="table-base">
              <thead>
                <tr><th>Név</th><th>Státusz</th><th>Ciklus</th><th>Köv. terhelés</th><th className="num">Összeg</th></tr>
              </thead>
              <tbody>
                {partner.subscriptions.map((sub) => (
                  <tr key={sub.id}>
                    <td className="font-medium">{sub.name}</td>
                    <td>
                      <Badge color={SUBSCRIPTION_STATUS_COLORS[sub.status as SubscriptionStatus]}>
                        {SUBSCRIPTION_STATUS_LABELS[sub.status as SubscriptionStatus]}
                      </Badge>
                    </td>
                    <td className="text-[13px]">{BILLING_CYCLE_LABELS[sub.billingCycle as BillingCycle]}</td>
                    <td className="text-[13px]">{formatDate(sub.nextBillingDate)}</td>
                    <td className="num">{formatMoney(sub.amount, sub.currency as Currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {tab === "kifizetesek" && (
          <Card className="overflow-x-auto p-0">
            <table className="table-base">
              <thead><tr><th>Dátum</th><th>Hivatkozás</th><th className="num">Összeg</th></tr></thead>
              <tbody>
                {partner.payments.map((p) => (
                  <tr key={p.id}>
                    <td className="text-[13px]">{formatDate(p.paymentDate)}</td>
                    <td className="text-[13px]" style={{ color: "var(--text-secondary)" }}>{p.reference ?? "–"}</td>
                    <td className="num">{formatMoney(p.amount, p.currency as Currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {tab === "vasarlasok" && (
          <Card className="overflow-x-auto p-0">
            <table className="table-base">
              <thead><tr><th>Megnevezés</th><th>Dátum</th><th className="num">Bruttó</th></tr></thead>
              <tbody>
                {partner.purchases.map((p) => (
                  <tr key={p.id}>
                    <td className="font-medium">{p.name}</td>
                    <td className="text-[13px]">{formatDate(p.purchaseDate)}</td>
                    <td className="num">{formatMoney(p.grossAmount, p.currency as Currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {tab === "aliasok" && (
          <Card title="Banki aliasok">
            <p className="text-[13px] mb-3" style={{ color: "var(--text-secondary)" }}>
              A banki kivonatokban így jelenhet meg ez a partner — az automatikus párosítás ezekre is illeszt.
            </p>
            <div className="flex flex-wrap gap-2">
              {partner.aliases.length === 0
                ? <span className="text-[13px]" style={{ color: "var(--text-tertiary)" }}>Nincs alias rögzítve.</span>
                : partner.aliases.map((a) => <Badge key={a.id} color="blue">{a.alias}</Badge>)}
            </div>
          </Card>
        )}
      </main>
    </>
  );
}
