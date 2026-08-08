import { addMonths, format, startOfMonth, startOfYear, subMonths } from "date-fns";
import { hu } from "date-fns/locale";
import { currentUserOrDemo } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/topbar";
import { Card, EmptyState } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { BILLING_CYCLE_MONTHS, VAT_RATE_LABELS, type Currency, type VatRate } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const user = await currentUserOrDemo();
  if (!user) return <EmptyState text="Futtasd a seed szkriptet: npm run db:seed" />;
  const orgId = user.organizationId;
  const base = user.organization.baseCurrency as Currency;
  const yearStart = startOfYear(new Date());

  const invoices = await prisma.invoice.findMany({
    where: { organizationId: orgId, deletedAt: null, status: { notIn: ["CANCELLED", "DRAFT"] } },
    include: { category: true, partner: true, payments: true },
  });
  const thisYear = invoices.filter((i) => i.issueDate >= yearStart);

  // Kiadás kategóriánként (idén)
  const byCategory = new Map<string, number>();
  for (const inv of thisYear) {
    const key = inv.category?.name ?? "Egyéb";
    byCategory.set(key, (byCategory.get(key) ?? 0) + inv.baseAmount);
  }
  const categoryRows = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
  const categoryTotal = categoryRows.reduce((s, [, v]) => s + v, 0);

  // Kiadás partnerenként — top 20, Pareto
  const byPartner = new Map<string, number>();
  for (const inv of thisYear) {
    const key = inv.partner?.name ?? "Ismeretlen";
    byPartner.set(key, (byPartner.get(key) ?? 0) + inv.baseAmount);
  }
  const partnerRows = [...byPartner.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  const partnerTotal = [...byPartner.values()].reduce((s, v) => s + v, 0);
  let cumulative = 0;

  // ÁFA-összesítő ÁFA-kulcsonként (idén, bejövő)
  const byVat = new Map<string, { net: number; vat: number }>();
  for (const inv of thisYear.filter((i) => i.direction === "INCOMING")) {
    const cur = byVat.get(inv.vatRate) ?? { net: 0, vat: 0 };
    const rate = inv.exchangeRate || 1;
    cur.net += Math.round(inv.netAmount * rate);
    cur.vat += Math.round(inv.vatAmount * rate);
    byVat.set(inv.vatRate, cur);
  }

  // Cash-flow előrejelzés: következő 6 hónap ismert kötelezettségei
  const now = new Date();
  const horizon = addMonths(now, 6);
  const [upcomingOcc, dueInvoices, rates] = await Promise.all([
    prisma.subscriptionOccurrence.findMany({
      where: { status: "UPCOMING", dueDate: { gte: now, lte: horizon }, subscription: { organizationId: orgId, deletedAt: null } },
    }),
    prisma.invoice.findMany({
      where: {
        organizationId: orgId, deletedAt: null,
        status: { in: ["APPROVED", "AWAITING_APPROVAL", "PARTIALLY_PAID", "OVERDUE"] },
        dueDate: { lte: horizon },
      },
    }),
    Promise.all([
      prisma.exchangeRate.findFirst({ where: { baseCurrency: "EUR", targetCurrency: "HUF" }, orderBy: { date: "desc" } }),
      prisma.exchangeRate.findFirst({ where: { baseCurrency: "USD", targetCurrency: "HUF" }, orderBy: { date: "desc" } }),
    ]),
  ]);
  const rateEUR = rates[0]?.rate ?? 395;
  const rateUSD = rates[1]?.rate ?? 365;
  const toBaseNow = (amount: number, currency: string) =>
    currency === base ? amount :
    currency === "EUR" ? Math.round(amount * rateEUR) :
    currency === "USD" ? Math.round(amount * rateUSD) : amount;

  const cashflow = new Map<string, number>();
  for (let i = 0; i < 6; i++) cashflow.set(format(addMonths(startOfMonth(now), i), "yyyy. MMM", { locale: hu }), 0);
  for (const o of upcomingOcc) {
    const key = format(o.dueDate, "yyyy. MMM", { locale: hu });
    if (cashflow.has(key)) cashflow.set(key, cashflow.get(key)! + toBaseNow(o.expectedAmount, o.currency));
  }
  for (const inv of dueInvoices) {
    const key = format(inv.dueDate < now ? now : inv.dueDate, "yyyy. MMM", { locale: hu });
    if (cashflow.has(key)) cashflow.set(key, cashflow.get(key)! + inv.baseAmount);
  }

  // Előfizetési költség hónapról hónapra (utolsó 12 hónap, kifizetett előfordulásokból)
  const paidOcc = await prisma.subscriptionOccurrence.findMany({
    where: {
      status: "PAID",
      dueDate: { gte: subMonths(now, 12) },
      subscription: { organizationId: orgId },
    },
  });
  const subByMonth = new Map<string, number>();
  for (let i = 11; i >= 0; i--) subByMonth.set(format(subMonths(now, i), "yyyy. MMM", { locale: hu }), 0);
  for (const o of paidOcc) {
    const key = format(o.dueDate, "yyyy. MMM", { locale: hu });
    if (subByMonth.has(key)) subByMonth.set(key, subByMonth.get(key)! + toBaseNow(o.actualAmount ?? o.expectedAmount, o.currency));
  }

  // Devizanyereség/-veszteség: rögzítéskori vs. kifizetéskori árfolyam
  let fxDiff = 0;
  for (const inv of invoices.filter((i) => i.currency !== base)) {
    for (const p of inv.payments) {
      const bookedBase = Math.round((p.amount / 100) * inv.exchangeRate * 100);
      fxDiff += p.baseAmount - bookedBase;
    }
  }

  return (
    <>
      <Topbar title="Riportok"
        action={<button className="btn-secondary">Exportálás (CSV)</button>} />
      <main className="max-w-[1280px] mx-auto px-4 md:px-8 py-6 grid lg:grid-cols-2 gap-6">
        <Card title="Kiadás kategóriánként (idén)">
          <div className="flex flex-col gap-2">
            {categoryRows.map(([name, value]) => (
              <div key={name}>
                <div className="flex justify-between text-[13px] mb-0.5">
                  <span>{name}</span>
                  <span className="num">{formatMoney(value, base)}</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-hover)" }}>
                  <div className="h-full rounded-full" style={{ width: `${(value / (categoryTotal || 1)) * 100}%`, background: "var(--accent)" }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Kiadás partnerenként — top 20 (Pareto)">
          <div className="overflow-x-auto">
            <table className="table-base compact">
              <thead><tr><th>Partner</th><th className="num">Összeg</th><th className="num">Részarány</th><th className="num">Kumulált</th></tr></thead>
              <tbody>
                {partnerRows.map(([name, value]) => {
                  cumulative += value;
                  return (
                    <tr key={name}>
                      <td className="text-[13px] font-medium">{name}</td>
                      <td className="num text-[13px]">{formatMoney(value, base)}</td>
                      <td className="num text-[13px]">{((value / (partnerTotal || 1)) * 100).toFixed(1)}%</td>
                      <td className="num text-[13px]" style={{ color: "var(--text-tertiary)" }}>
                        {((cumulative / (partnerTotal || 1)) * 100).toFixed(0)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Előfizetési költség hónapról hónapra">
          <table className="table-base compact">
            <thead><tr><th>Hónap</th><th className="num">Kifizetett előfizetések</th></tr></thead>
            <tbody>
              {[...subByMonth.entries()].map(([month, value]) => (
                <tr key={month}>
                  <td className="text-[13px]">{month}</td>
                  <td className="num text-[13px]">{formatMoney(value, base)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <div className="flex flex-col gap-6">
          <Card title="Cash-flow előrejelzés — következő 6 hónap">
            <table className="table-base compact">
              <thead><tr><th>Hónap</th><th className="num">Ismert kötelezettség</th></tr></thead>
              <tbody>
                {[...cashflow.entries()].map(([month, value]) => (
                  <tr key={month}>
                    <td className="text-[13px]">{month}</td>
                    <td className="num text-[13px]">{formatMoney(value, base)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card title="ÁFA-összesítő (idén, bejövő)">
            <table className="table-base compact">
              <thead><tr><th>ÁFA-kulcs</th><th className="num">Nettó (alapdeviza)</th><th className="num">ÁFA</th></tr></thead>
              <tbody>
                {[...byVat.entries()].map(([rate, v]) => (
                  <tr key={rate}>
                    <td className="text-[13px]">{VAT_RATE_LABELS[rate as VatRate] ?? rate}</td>
                    <td className="num text-[13px]">{formatMoney(v.net, base)}</td>
                    <td className="num text-[13px]">{formatMoney(v.vat, base)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card title="Devizanyereség / -veszteség">
            <p className="text-[26px] font-semibold num text-left"
              style={{ color: fxDiff >= 0 ? "var(--green)" : "var(--red)" }}>
              {formatMoney(fxDiff, base)}
            </p>
            <p className="text-[12px] mt-1" style={{ color: "var(--text-tertiary)" }}>
              A rögzítéskori és a kifizetéskori árfolyam különbségéből.
            </p>
          </Card>
        </div>
      </main>
    </>
  );
}
