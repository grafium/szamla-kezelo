import Link from "next/link";
import { addDays, addMonths, eachDayOfInterval, endOfMonth, format, getDay, startOfDay, startOfMonth } from "date-fns";
import { hu } from "date-fns/locale";
import { currentUserOrDemo } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/topbar";
import { FilterBar } from "@/components/filter-bar";
import { Badge, Card, EmptyState, Money } from "@/components/ui";
import { subscriptionFields } from "@/lib/filters/definitions";
import { toClientFields } from "@/lib/filters/types";
import { applyComputed, buildFilter } from "@/lib/filters/prisma";
import { formatDate, daysUntil } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { getRate } from "@/lib/rates";
import { convertMinor } from "@/lib/money";
import {
  BILLING_CYCLE_LABELS, BILLING_CYCLE_MONTHS, SUBSCRIPTION_STATUS_COLORS,
  SUBSCRIPTION_STATUS_LABELS, type BillingCycle, type Currency, type SubscriptionStatus,
} from "@/lib/constants";

export const dynamic = "force-dynamic";

const QUICK_FILTERS = [
  { label: "30 napon belül megújul", group: { logic: "AND" as const, items: [{ field: "daysUntilRenewal", op: "lte" as const, value: 30 }, { field: "status", op: "anyOf" as const, value: ["ACTIVE", "TRIAL"] }] } },
  { label: "Éves ciklus", group: { logic: "AND" as const, items: [{ field: "billingCycle", op: "anyOf" as const, value: ["ANNUAL"] }] } },
  { label: "Csak EUR", group: { logic: "AND" as const, items: [{ field: "currency", op: "anyOf" as const, value: ["EUR"] }] } },
  { label: "Próbaidőszak", group: { logic: "AND" as const, items: [{ field: "status", op: "anyOf" as const, value: ["TRIAL"] }] } },
  { label: "Áremelkedés", group: { logic: "AND" as const, items: [{ field: "priceIncreased", op: "isTrue" as const }] } },
];

function monthlyEq(sub: { amount: number; billingCycle: string; customIntervalDays: number | null }): number {
  const months = sub.billingCycle === "CUSTOM"
    ? Math.max(1, Math.round((sub.customIntervalDays ?? 30) / 30))
    : BILLING_CYCLE_MONTHS[sub.billingCycle as keyof typeof BILLING_CYCLE_MONTHS] ?? 1;
  return Math.round(sub.amount / months);
}

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const user = await currentUserOrDemo();
  if (!user) return <EmptyState text="Futtasd a seed szkriptet: npm run db:seed" />;
  const orgId = user.organizationId;
  const base = user.organization.baseCurrency as Currency;
  const view = params.nezet === "naptar" ? "naptar" : "tabla";
  const monthlyView = params.havi === "1";

  let group = null;
  if (params.f) { try { group = JSON.parse(params.f); } catch {} }
  const built = buildFilter(group, subscriptionFields);

  const partnerOptions = await prisma.partner.findMany({
    where: { organizationId: orgId, deletedAt: null },
    select: { id: true, name: true }, orderBy: { name: "asc" },
  });
  const fields = subscriptionFields.map((f) =>
    f.key === "partner" ? { ...f, options: partnerOptions.map((p) => ({ value: p.id, label: p.name })) } : f
  );

  const all = await prisma.subscription.findMany({
    where: { organizationId: orgId, deletedAt: null, ...built.where },
    include: {
      partner: true, category: true,
      occurrences: { orderBy: { dueDate: "desc" } },
    },
    orderBy: { nextBillingDate: "asc" },
  });
  const subs = applyComputed(all, built);

  const rateEUR = await getRate("EUR", base, new Date());
  const rateUSD = await getRate("USD", base, new Date());
  const toBaseNow = (amount: number, currency: string) =>
    currency === base ? amount :
    currency === "EUR" ? convertMinor(amount, rateEUR, base) :
    currency === "USD" ? convertMinor(amount, rateUSD, base) : amount;

  const savedViews = await prisma.savedFilter.findMany({
    where: { organizationId: orgId, entityType: "subscriptions" },
    orderBy: { sortOrder: "asc" },
  });

  // Következő 90 nap előfordulásai (időrendben, futó összeggel)
  const today = startOfDay(new Date());
  const next90 = await prisma.subscriptionOccurrence.findMany({
    where: {
      status: "UPCOMING",
      dueDate: { gte: today, lte: addDays(today, 90) },
      subscription: { organizationId: orgId, deletedAt: null },
    },
    include: { subscription: { include: { partner: true } } },
    orderBy: { dueDate: "asc" },
  });

  const qs = (overrides: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params, ...overrides })) if (v != null) p.set(k, v);
    return `?${p.toString()}`;
  };

  // Naptárnézet adatai
  const calMonth = params.honap ? new Date(params.honap + "-01") : startOfMonth(today);
  const calOcc = view === "naptar"
    ? await prisma.subscriptionOccurrence.findMany({
        where: {
          dueDate: { gte: startOfMonth(calMonth), lte: endOfMonth(calMonth) },
          subscription: { organizationId: orgId, deletedAt: null },
        },
        include: { subscription: { include: { partner: true } } },
      })
    : [];

  let running = 0;

  return (
    <>
      <Topbar
        title="Előfizetések"
        action={
          <div className="flex items-center gap-2">
            <Link href={qs({ havi: monthlyView ? undefined : "1" })} className="btn-secondary">
              {monthlyView ? "Ciklus szerinti összegek" : "Havi ekvivalens nézet"}
            </Link>
            <Link href={qs({ nezet: view === "naptar" ? undefined : "naptar" })} className="btn-secondary">
              {view === "naptar" ? "Táblázat" : "Naptár"}
            </Link>
            <Link href={qs({ uj: "1" })} className="btn-primary">+ Új előfizetés</Link>
          </div>
        }
      />
      <main className="max-w-[1280px] mx-auto px-4 md:px-8 py-4 flex flex-col gap-6">
        <FilterBar
          fields={toClientFields(fields)}
          quickFilters={QUICK_FILTERS}
          savedViews={savedViews.map((v) => ({ id: v.id, name: v.name, filterJson: v.filterJson }))}
          entityType="subscriptions"
        />

        {view === "naptar" ? (
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3>{format(calMonth, "yyyy. MMMM", { locale: hu })}</h3>
              <div className="flex gap-1">
                <Link className="btn-text" href={qs({ honap: format(addMonths(calMonth, -1), "yyyy-MM") })}>← Előző</Link>
                <Link className="btn-text" href={qs({ honap: format(addMonths(calMonth, 1), "yyyy-MM") })}>Következő →</Link>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-px text-[11px]" style={{ color: "var(--text-tertiary)" }}>
              {["H", "K", "Sze", "Cs", "P", "Szo", "V"].map((d) => (
                <div key={d} className="px-1 py-1 text-center">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px rounded-lg overflow-hidden border" style={{ borderColor: "var(--divider)", background: "var(--divider)" }}>
              {(() => {
                const days = eachDayOfInterval({ start: startOfMonth(calMonth), end: endOfMonth(calMonth) });
                const lead = (getDay(days[0]) + 6) % 7;
                const cells: React.ReactNode[] = [];
                for (let i = 0; i < lead; i++) {
                  cells.push(<div key={`e${i}`} className="min-h-[84px]" style={{ background: "var(--bg-tertiary)" }} />);
                }
                for (const day of days) {
                  const dayOcc = calOcc.filter((o) => format(o.dueDate, "yyyy-MM-dd") === format(day, "yyyy-MM-dd"));
                  const isToday = format(day, "yyyy-MM-dd") === format(today, "yyyy-MM-dd");
                  cells.push(
                    <div key={day.toISOString()} className="min-h-[84px] p-1" style={{ background: "var(--bg)" }}>
                      <div className="text-[11px] px-1 mb-1 font-medium"
                        style={{ color: isToday ? "var(--accent)" : "var(--text-tertiary)" }}>
                        {format(day, "d")}
                      </div>
                      <div className="flex flex-col gap-0.5">
                        {dayOcc.map((o) => (
                          <div key={o.id} className="badge w-full truncate"
                            title={`${o.subscription.name} · ${formatMoney(o.expectedAmount, o.currency as Currency)}`}
                            style={{
                              background: `var(--${o.subscription.partner.color ?? "gray"}-bg)`,
                              color: `var(--${o.subscription.partner.color ?? "gray"})`,
                            }}>
                            {o.subscription.name}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }
                return cells;
              })()}
            </div>
          </Card>
        ) : subs.length === 0 ? (
          <EmptyState icon="↻" text="Nincs a szűrésnek megfelelő előfizetés" actionLabel="Szűrők törlése" actionHref="/elofizetesek" />
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="table-base responsive-table">
              <thead>
                <tr>
                  <th>Név</th>
                  <th>Partner</th>
                  <th>Státusz</th>
                  <th>Ciklus</th>
                  <th>Következő terhelés</th>
                  <th className="num">{monthlyView ? "Havi ekvivalens" : "Összeg / ciklus"}</th>
                  <th className="num">Éves költség</th>
                </tr>
              </thead>
              <tbody>
                {subs.map((sub) => {
                  const paid = sub.occurrences.filter((o) => o.actualAmount != null);
                  const increased = paid.length >= 2 && paid[0].actualAmount! > paid[1].actualAmount!;
                  const days = daysUntil(sub.nextBillingDate);
                  return (
                    <tr key={sub.id}>
                      <td data-label="Név">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: `var(--${sub.partner.color ?? "gray"})` }} />
                          <span className="font-medium truncate">{sub.name}</span>
                          {increased && <Badge color="red">ár ↑</Badge>}
                        </span>
                      </td>
                      <td data-label="Partner" className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                        <Link href={`/partnerek/${sub.partnerId}`} className="hover:underline">{sub.partner.name}</Link>
                      </td>
                      <td data-label="Státusz">
                        <Badge color={SUBSCRIPTION_STATUS_COLORS[sub.status as SubscriptionStatus]}>
                          {SUBSCRIPTION_STATUS_LABELS[sub.status as SubscriptionStatus]}
                        </Badge>
                      </td>
                      <td data-label="Ciklus" className="text-[13px]">{BILLING_CYCLE_LABELS[sub.billingCycle as BillingCycle]}</td>
                      <td data-label="Köv. terhelés" className="text-[13px]"
                        style={days <= 7 && (sub.status === "ACTIVE" || sub.status === "TRIAL") ? { color: "var(--orange)" } : undefined}>
                        {sub.status === "CANCELLED" ? "–" : `${formatDate(sub.nextBillingDate)} (${days} nap)`}
                      </td>
                      <td data-label={monthlyView ? "Havi" : "Összeg"} className="num">
                        <Money
                          amount={monthlyView ? monthlyEq(sub) : sub.amount}
                          currency={sub.currency as Currency}
                          baseAmount={toBaseNow(monthlyView ? monthlyEq(sub) : sub.amount, sub.currency)}
                          baseCurrency={base}
                        />
                      </td>
                      <td data-label="Éves" className="num text-[13px]" style={{ color: "var(--text-secondary)" }}>
                        {formatMoney(monthlyEq(sub) * 12, sub.currency as Currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}

        <Card title="Következő 90 nap — várható terhelések">
          {next90.length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--text-tertiary)" }}>Nincs várható terhelés.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base compact">
                <thead>
                  <tr>
                    <th>Dátum</th><th>Előfizetés</th><th>Partner</th>
                    <th className="num">Összeg</th><th className="num">Futó összeg (alapdeviza)</th>
                  </tr>
                </thead>
                <tbody>
                  {next90.map((o) => {
                    running += toBaseNow(o.expectedAmount, o.currency);
                    return (
                      <tr key={o.id}>
                        <td className="text-[13px]">{formatDate(o.dueDate)}</td>
                        <td className="font-medium text-[13px]">{o.subscription.name}</td>
                        <td className="text-[13px]" style={{ color: "var(--text-secondary)" }}>{o.subscription.partner.name}</td>
                        <td className="num text-[13px]">{formatMoney(o.expectedAmount, o.currency as Currency)}</td>
                        <td className="num text-[13px]" style={{ color: "var(--text-tertiary)" }}>{formatMoney(running, base)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </main>
    </>
  );
}
