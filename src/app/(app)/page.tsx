import Link from "next/link";
import { addDays, format, startOfDay, startOfMonth, subMonths } from "date-fns";
import { hu } from "date-fns/locale";
import { currentUserOrDemo } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CurrencyTotals, EmptyState, KpiCard } from "@/components/ui";
import { Topbar } from "@/components/topbar";
import { CategoryDonut, MonthlyBarChart } from "@/components/charts";
import { formatMoney, sumByCurrency } from "@/lib/money";
import { formatDate, relativeDays } from "@/lib/format";
import { getRate } from "@/lib/rates";
import { convertMinor } from "@/lib/money";
import { BILLING_CYCLE_MONTHS, type Currency } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await currentUserOrDemo();
  if (!user) {
    return <EmptyState text="Nincs adat — futtasd a seed szkriptet: npm run db:seed" />;
  }
  const orgId = user.organizationId;
  const base = user.organization.baseCurrency as Currency;
  const today = startOfDay(new Date());
  const in30 = addDays(today, 30);

  const [openInvoices, unmatchedCount, inboxCount, upcomingOccurrences, activeSubs, dueInvoices] =
    await Promise.all([
      prisma.invoice.findMany({
        where: {
          organizationId: orgId, deletedAt: null, direction: "INCOMING",
          status: { in: ["APPROVED", "AWAITING_APPROVAL", "PARTIALLY_PAID", "OVERDUE"] },
        },
      }),
      prisma.bankTransaction.count({
        where: { matchStatus: "UNMATCHED", bankAccount: { organizationId: orgId } },
      }),
      prisma.attachment.count({
        where: { organizationId: orgId, inboxStatus: "NEEDS_REVIEW", deletedAt: null },
      }),
      prisma.subscriptionOccurrence.findMany({
        where: {
          status: "UPCOMING", dueDate: { gte: today, lte: in30 },
          subscription: { organizationId: orgId, deletedAt: null },
        },
        include: { subscription: { include: { partner: true } } },
        orderBy: { dueDate: "asc" },
      }),
      prisma.subscription.findMany({
        where: { organizationId: orgId, deletedAt: null, status: { in: ["ACTIVE", "TRIAL"] } },
        include: { category: true, partner: true, occurrences: { orderBy: { dueDate: "desc" }, take: 4 } },
      }),
      prisma.invoice.findMany({
        where: {
          organizationId: orgId, deletedAt: null, direction: "INCOMING",
          status: { in: ["APPROVED", "AWAITING_APPROVAL", "PARTIALLY_PAID", "OVERDUE"] },
          dueDate: { gte: today, lte: in30 },
        },
        include: { partner: true },
        orderBy: { dueDate: "asc" },
      }),
    ]);

  // KPI-k alapdevizában
  const rateEUR = await getRate("EUR", base, today);
  const rateUSD = await getRate("USD", base, today);
  const toBaseNow = (amount: number, currency: string) =>
    currency === base ? amount :
    currency === "EUR" ? convertMinor(amount, rateEUR, base) :
    currency === "USD" ? convertMinor(amount, rateUSD, base) : amount;

  const openTotal = openInvoices.reduce((s, i) => s + toBaseNow(i.grossAmount, i.currency), 0);
  const openByCurrency = sumByCurrency(openInvoices.map((i) => ({ amount: i.grossAmount, currency: i.currency })));
  const overdue = openInvoices.filter((i) => i.status === "OVERDUE");
  const overdueTotal = overdue.reduce((s, i) => s + toBaseNow(i.grossAmount, i.currency), 0);

  const next30Occ = upcomingOccurrences.reduce((s, o) => s + toBaseNow(o.expectedAmount, o.currency), 0);
  const next30Inv = dueInvoices.reduce((s, i) => s + toBaseNow(i.grossAmount, i.currency), 0);

  const monthlyEquivalent = (sub: (typeof activeSubs)[number]) => {
    const months = sub.billingCycle === "CUSTOM"
      ? Math.max(1, Math.round((sub.customIntervalDays ?? 30) / 30))
      : BILLING_CYCLE_MONTHS[sub.billingCycle as keyof typeof BILLING_CYCLE_MONTHS] ?? 1;
    return Math.round(sub.amount / months);
  };
  const monthlySubCost = activeSubs.reduce((s, sub) => s + toBaseNow(monthlyEquivalent(sub), sub.currency), 0);
  const annualCommitment = monthlySubCost * 12;

  // Deviza-kitettség: nyitott számlák + következő 12 hó előfizetés devizánként
  const exposure = sumByCurrency([
    ...openInvoices.map((i) => ({ amount: i.grossAmount, currency: i.currency })),
    ...activeSubs.map((s) => ({ amount: monthlyEquivalent(s) * 12, currency: s.currency })),
  ]);

  // Havi kiadás diagram (12 hónap, kategóriánként) a kifizetett/jóváhagyott számlákból
  const from = startOfMonth(subMonths(today, 11));
  const spendInvoices = await prisma.invoice.findMany({
    where: { organizationId: orgId, deletedAt: null, direction: "INCOMING", issueDate: { gte: from }, status: { notIn: ["CANCELLED", "DRAFT"] } },
    include: { category: true },
  });
  const monthKeys: string[] = [];
  for (let i = 11; i >= 0; i--) monthKeys.push(format(subMonths(today, i), "yyyy. MMM", { locale: hu }));
  const catNames = new Map<string, string>();
  const chartMap = new Map<string, Record<string, number>>();
  for (const inv of spendInvoices) {
    const key = format(inv.issueDate, "yyyy. MMM", { locale: hu });
    const cat = inv.category?.name ?? "Egyéb";
    catNames.set(cat, inv.category?.color ?? "gray");
    const row = chartMap.get(key) ?? {};
    row[cat] = (row[cat] ?? 0) + toBaseNow(inv.grossAmount, inv.currency);
    chartMap.set(key, row);
  }
  const chartData = monthKeys.map((m) => ({ month: m.replace(/^\d{4}\. /, ""), ...(chartMap.get(m) ?? {}) }));
  const chartCategories = [...catNames.entries()].map(([name, color]) => ({ name, color }));

  // Előfizetések aránya kategóriánként + top 5
  const donutMap = new Map<string, { value: number; color: string }>();
  for (const sub of activeSubs) {
    const cat = sub.category?.name ?? "Egyéb";
    const cur = donutMap.get(cat) ?? { value: 0, color: sub.category?.color ?? "gray" };
    cur.value += toBaseNow(monthlyEquivalent(sub), sub.currency);
    donutMap.set(cat, cur);
  }
  const donutData = [...donutMap.entries()].map(([name, v]) => ({ name, ...v }));
  const top5 = [...activeSubs]
    .sort((a, b) => toBaseNow(monthlyEquivalent(b), b.currency) - toBaseNow(monthlyEquivalent(a), a.currency))
    .slice(0, 5);

  // Áremelkedett előfizetések (teendők doboz)
  const priceIncreased = activeSubs.filter((sub) => {
    const paid = sub.occurrences.filter((o) => o.actualAmount != null);
    return paid.length >= 2 && paid[0].actualAmount! > paid[1].actualAmount!;
  });

  // Idővonal: számla-határidők + megújulások + lemondási határidők, napokra bontva
  type TimelineEvent = { date: Date; label: string; amount?: number; currency?: Currency; color: string; href: string };
  const events: TimelineEvent[] = [
    ...upcomingOccurrences.map((o) => ({
      date: o.dueDate,
      label: `${o.subscription.name} megújul`,
      amount: o.expectedAmount, currency: o.currency as Currency,
      color: "blue", href: "/elofizetesek",
    })),
    ...dueInvoices.map((i) => ({
      date: i.dueDate,
      label: `${i.partner?.name ?? "?"} · ${i.invoiceNumber}`,
      amount: i.grossAmount, currency: i.currency as Currency,
      color: i.status === "OVERDUE" ? "red" : "orange", href: "/szamlak",
    })),
    ...activeSubs
      .filter((s) => s.cancellationDeadline && s.cancellationDeadline >= today && s.cancellationDeadline <= in30)
      .map((s) => ({
        date: s.cancellationDeadline!,
        label: `${s.name} lemondási határidő`,
        color: "purple", href: "/elofizetesek",
      })),
  ].sort((a, b) => +a.date - +b.date);

  const eventsByDay = new Map<string, TimelineEvent[]>();
  for (const e of events) {
    const key = formatDate(e.date);
    eventsByDay.set(key, [...(eventsByDay.get(key) ?? []), e]);
  }

  return (
    <>
      <Topbar title="Áttekintés" action={<Link href="/szamlak?uj=1" className="btn-primary">+ Új számla</Link>} />
      <main className="max-w-[1280px] mx-auto px-4 md:px-8 py-6 flex flex-col gap-6">
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <KpiCard label="Nyitott tartozás" value={formatMoney(openTotal, base)}
            sub={Object.entries(openByCurrency).map(([c, v]) => `${c}: ${formatMoney(v, c as Currency)}`).join(" · ")} />
          <KpiCard label="Lejárt tartozás" value={formatMoney(overdueTotal, base)}
            sub={`${overdue.length} számla`} color={overdue.length ? "red" : undefined} />
          <KpiCard label="Köv. 30 nap kiadása" value={formatMoney(next30Occ + next30Inv, base)}
            sub={`${upcomingOccurrences.length} megújulás · ${dueInvoices.length} számla`} />
          <KpiCard label="Előfizetések / hó" value={formatMoney(monthlySubCost, base)}
            sub={`${activeSubs.length} aktív előfizetés`} />
          <KpiCard label="Éves kötelezettség" value={formatMoney(annualCommitment, base)} sub="előfizetésekből" />
          <KpiCard label="Párosítatlan tétel" value={String(unmatchedCount)}
            sub="banki tétel vár párosításra" color={unmatchedCount ? "orange" : undefined} />
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <Card title="Hamarosan esedékes — következő 30 nap">
            {eventsByDay.size === 0 ? (
              <EmptyState icon="◷" text="Nincs esedékes tétel a következő 30 napban" />
            ) : (
              <div className="flex flex-col gap-3 max-h-[420px] overflow-y-auto pr-1">
                {[...eventsByDay.entries()].map(([day, dayEvents]) => (
                  <div key={day}>
                    <div className="label-upper mb-1">
                      {day} · {relativeDays(dayEvents[0].date)}
                    </div>
                    <div className="flex flex-col">
                      {dayEvents.map((e, i) => (
                        <Link key={i} href={e.href}
                          className="flex items-center justify-between gap-3 h-9 px-2 rounded-md hover:bg-[var(--bg-hover)]">
                          <span className="flex items-center gap-2 min-w-0">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: `var(--${e.color})` }} />
                            <span className="text-[14px] truncate">{e.label}</span>
                          </span>
                          {e.amount != null && (
                            <span className="num text-[13px] shrink-0">{formatMoney(e.amount, e.currency!)}</span>
                          )}
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div className="flex flex-col gap-6">
            <Card title="Teendők">
              <div className="flex flex-col gap-1">
                <TodoRow href="/beerkezo" color="blue"
                  text={`${inboxCount} dokumentum vár feldolgozásra`} show={inboxCount > 0} />
                <TodoRow href="/banki-kivonatok" color="orange"
                  text={`${unmatchedCount} banki tétel párosítatlan`} show={unmatchedCount > 0} />
                <TodoRow href="/elofizetesek" color="red"
                  text={`${priceIncreased.length} előfizetés ára emelkedett`} show={priceIncreased.length > 0} />
                <TodoRow href="/szamlak" color="red"
                  text={`${overdue.length} számla lejárt`} show={overdue.length > 0} />
                {inboxCount === 0 && unmatchedCount === 0 && priceIncreased.length === 0 && overdue.length === 0 && (
                  <p className="text-[13px]" style={{ color: "var(--text-tertiary)" }}>Minden rendben — nincs teendő.</p>
                )}
              </div>
            </Card>

            <Card title="Deviza-kitettség">
              <div className="flex flex-col gap-2">
                {Object.entries(exposure).map(([cur, amount]) => (
                  <div key={cur} className="flex items-center justify-between">
                    <span className="badge" style={{ background: "var(--gray-bg)", color: "var(--gray)" }}>{cur}</span>
                    <span className="num text-[14px]">
                      {formatMoney(amount, cur as Currency)}
                      {cur !== base && (
                        <span className="text-[12px] ml-2" style={{ color: "var(--text-tertiary)" }}>
                          ~{formatMoney(toBaseNow(amount, cur), base)}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>

        <Card title="Havi kiadás — utolsó 12 hónap, kategóriánként">
          <MonthlyBarChart data={chartData} baseCurrency={base} categories={chartCategories} />
        </Card>

        <div className="grid lg:grid-cols-2 gap-6">
          <Card title="Előfizetések aránya kategóriánként (havi, alapdevizában)">
            <CategoryDonut data={donutData} baseCurrency={base} />
          </Card>
          <Card title="Top 5 legdrágább előfizetés (havi ekvivalens)">
            <div className="flex flex-col">
              {top5.map((sub) => (
                <Link key={sub.id} href={`/elofizetesek?f=${encodeURIComponent(JSON.stringify({ logic: "AND", items: [{ field: "name", op: "contains", value: sub.name }] }))}`}
                  className="flex items-center justify-between h-10 px-2 rounded-md hover:bg-[var(--bg-hover)]">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: `var(--${sub.partner.color ?? "gray"})` }} />
                    <span className="truncate text-[14px]">{sub.name}</span>
                    <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>{sub.partner.name}</span>
                  </span>
                  <span className="num text-[14px] shrink-0">
                    {formatMoney(toBaseNow(monthlyEquivalent(sub), sub.currency), base)}/hó
                  </span>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </main>
    </>
  );
}

function TodoRow({ href, text, color, show }: { href: string; text: string; color: string; show: boolean }) {
  if (!show) return null;
  return (
    <Link href={href} className="flex items-center gap-2 h-9 px-2 rounded-md hover:bg-[var(--bg-hover)] text-[14px]">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: `var(--${color})` }} />
      {text}
    </Link>
  );
}
