import Link from "next/link";
import { currentUserOrDemo } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/topbar";
import { FilterBar } from "@/components/filter-bar";
import { Badge, Card, CurrencyTotals, EmptyState, Money } from "@/components/ui";
import { invoiceFields } from "@/lib/filters/definitions";
import { toClientFields } from "@/lib/filters/types";
import { applyComputed, buildFilter } from "@/lib/filters/prisma";
import { decodeFilter } from "@/lib/filters/url";
import { formatDate } from "@/lib/format";
import { formatMoney, sumByCurrency } from "@/lib/money";
import {
  INVOICE_STATUS_COLORS, INVOICE_STATUS_LABELS,
  type Currency, type InvoiceStatus,
} from "@/lib/constants";
import { InvoiceDrawer } from "./drawer";
import { BulkBar } from "./bulk-bar";
import { NewInvoiceDrawer } from "@/components/forms/new-invoice-drawer";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
/** Felső korlát arra a ritka esetre, amikor a szűrés JS-ben kell hogy fusson. */
const JS_FILTER_LIMIT = 2000;

const QUICK_FILTERS = [
  { label: "Lejárt", group: { logic: "AND" as const, items: [{ field: "status", op: "anyOf" as const, value: ["OVERDUE"] }] } },
  { label: "Ezen a héten esedékes", group: { logic: "AND" as const, items: [{ field: "dueDate", op: "thisWeek" as const }] } },
  { label: "Párosítatlan", group: { logic: "AND" as const, items: [{ field: "isMatched", op: "isFalse" as const }] } },
  { label: "Csak EUR", group: { logic: "AND" as const, items: [{ field: "currency", op: "anyOf" as const, value: ["EUR"] }] } },
  { label: "Ebben a hónapban", group: { logic: "AND" as const, items: [{ field: "issueDate", op: "thisMonth" as const }] } },
];

const SORTABLE: Record<string, string> = {
  partner: "partner", szam: "invoiceNumber", kelt: "issueDate",
  hatarido: "dueDate", osszeg: "grossAmount", statusz: "status",
};

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const user = await currentUserOrDemo();
  if (!user) return <EmptyState text="Futtasd a seed szkriptet: npm run db:seed" />;
  const orgId = user.organizationId;
  const base = user.organization.baseCurrency as Currency;

  const group = decodeFilter(params.f ? encodeURIComponent(params.f) : null) ??
    (params.f ? (() => { try { return JSON.parse(params.f!); } catch { return null; } })() : null);
  const built = buildFilter(group, invoiceFields);

  const page = Math.max(1, Number(params.oldal) || 1);
  const sortKey = params.rendezes && SORTABLE[params.rendezes] ? SORTABLE[params.rendezes] : "issueDate";
  const sortDir = params.irany === "asc" ? "asc" : "desc";
  const orderBy =
    sortKey === "partner" ? { partner: { name: sortDir } } : { [sortKey]: sortDir };

  const partnerOptions = await prisma.partner.findMany({
    where: { organizationId: orgId, deletedAt: null },
    select: { id: true, name: true }, orderBy: { name: "asc" },
  });
  const categoryOptions = await prisma.category.findMany({
    where: { organizationId: orgId, deletedAt: null },
    select: { id: true, name: true }, orderBy: { name: "asc" },
  });
  const fields = invoiceFields.map((f) =>
    f.key === "partner" ? { ...f, options: partnerOptions.map((p) => ({ value: p.id, label: p.name })) } :
    f.key === "category" ? { ...f, options: categoryOptions.map((c) => ({ value: c.id, label: c.name })) } : f
  );

  const where = { organizationId: orgId, deletedAt: null, ...built.where };

  // A listát alapesetben az adatbázis lapozza és összegzi — így 10 000 számlánál
  // is csak egy oldalnyi sor kerül a memóriába. Ha a szűrő olyan számított mezőt
  // tartalmaz, aminek nincs SQL-megfelelője (ritka), akkor kényszerűen minden
  // sort be kell tölteni; ilyenkor a sorok száma korlátozott, és ezt jelezzük.
  const needsJsFilter = built.computedPredicate !== null;

  // A táblázat megjelenítéséhez elég a partner és a kategória neve.
  const listInclude = { partner: true, category: true } as const;

  let rows: any[];
  let total: number;
  let totals: Record<string, number>;
  let baseTotal: number;
  let truncated = false;

  if (!needsJsFilter) {
    const [pageRows, count, byCurrency, baseSum] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: listInclude,
        orderBy: orderBy as any,
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.invoice.count({ where }),
      prisma.invoice.groupBy({ by: ["currency"], where, _sum: { grossAmount: true } }),
      prisma.invoice.aggregate({ where, _sum: { baseAmount: true } }),
    ]);
    rows = pageRows;
    total = count;
    totals = Object.fromEntries(byCurrency.map((g) => [g.currency, g._sum.grossAmount ?? 0]));
    baseTotal = baseSum._sum.baseAmount ?? 0;
  } else {
    const all = await prisma.invoice.findMany({
      where,
      include: {
        ...listInclude,
        attachments: { select: { id: true } },
        bankTransactions: { select: { id: true } },
      },
      orderBy: orderBy as any,
      take: JS_FILTER_LIMIT + 1,
    });
    truncated = all.length > JS_FILTER_LIMIT;
    const filtered = applyComputed(all.slice(0, JS_FILTER_LIMIT), built);
    total = filtered.length;
    rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    totals = sumByCurrency(filtered.map((i) => ({ amount: i.grossAmount, currency: i.currency })));
    baseTotal = filtered.reduce((s, i) => s + i.baseAmount, 0);
  }

  const savedViews = await prisma.savedFilter.findMany({
    where: { organizationId: orgId, entityType: "invoices" },
    orderBy: { sortOrder: "asc" },
  });

  const openInvoice = params.panel
    ? await prisma.invoice.findFirst({
        where: { id: params.panel, organizationId: orgId },
        include: {
          partner: true, category: true, lineItems: true, payments: true,
          bankTransactions: true, attachments: true, subscription: true,
        },
      })
    : null;

  const qs = (overrides: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params, ...overrides })) {
      if (v != null) p.set(k, v);
    }
    return `?${p.toString()}`;
  };

  const sortHeader = (key: string, label: string, numeric = false) => (
    <th className={numeric ? "num" : ""}>
      <Link href={qs({ rendezes: key, irany: params.rendezes === key && params.irany !== "asc" ? "asc" : "desc" })}>
        {label}{params.rendezes === key ? (params.irany === "asc" ? " ↑" : " ↓") : ""}
      </Link>
    </th>
  );

  return (
    <>
      <Topbar title="Számlák" action={<Link href={qs({ uj: "1" })} className="btn-primary">+ Új számla</Link>} />
      <main className="max-w-[1280px] mx-auto px-4 md:px-8 py-4">
        <FilterBar
          fields={toClientFields(fields)}
          quickFilters={QUICK_FILTERS}
          savedViews={savedViews.map((v) => ({ id: v.id, name: v.name, filterJson: v.filterJson }))}
          entityType="invoices"
        />

        {rows.length > 0 && (
          <BulkBar ids={rows.map((i) => i.id)} categoryOptions={categoryOptions} />
        )}

        {rows.length === 0 ? (
          <EmptyState icon="▤" text="Nincs a szűrésnek megfelelő számla" actionLabel="Szűrők törlése" actionHref="/szamlak" />
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="table-base responsive-table">
              <thead>
                <tr>
                  {sortHeader("partner", "Partner")}
                  {sortHeader("szam", "Számlaszám")}
                  {sortHeader("kelt", "Kelt")}
                  {sortHeader("hatarido", "Határidő")}
                  {sortHeader("statusz", "Státusz")}
                  <th>Kategória</th>
                  {sortHeader("osszeg", "Bruttó", true)}
                </tr>
              </thead>
              <tbody>
                {rows.map((inv) => (
                  <tr key={inv.id}>
                    <td data-label="Partner">
                      <Link href={qs({ panel: inv.id })} className="flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: `var(--${inv.partner?.color ?? "gray"})` }} />
                        <span className="truncate font-medium">{inv.partner?.name ?? "–"}</span>
                      </Link>
                    </td>
                    <td data-label="Számlaszám" className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                      {inv.invoiceNumber}
                    </td>
                    <td data-label="Kelt" className="text-[13px]">{formatDate(inv.issueDate)}</td>
                    <td data-label="Határidő" className="text-[13px]"
                      style={inv.status === "OVERDUE" ? { color: "var(--red)" } : undefined}>
                      {formatDate(inv.dueDate)}
                    </td>
                    <td data-label="Státusz">
                      <Badge color={INVOICE_STATUS_COLORS[inv.status as InvoiceStatus]}>
                        {INVOICE_STATUS_LABELS[inv.status as InvoiceStatus]}
                      </Badge>
                    </td>
                    <td data-label="Kategória" className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                      {inv.category?.name ?? "–"}
                    </td>
                    <td data-label="Bruttó" className="num">
                      <Money amount={inv.grossAmount} currency={inv.currency as Currency}
                        baseAmount={inv.baseAmount} baseCurrency={base} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 py-3">
          <CurrencyTotals totals={totals} baseTotal={baseTotal} baseCurrency={base} />
          <div className="flex items-center gap-2 text-[13px]" style={{ color: "var(--text-secondary)" }}>
            <span>
              {total} számla
              {truncated && (
                <span style={{ color: "var(--orange)" }}>
                  {" "}· az összesítés az első {JS_FILTER_LIMIT} sorra vonatkozik
                </span>
              )}
            </span>
            {page > 1 && <Link className="btn-text" href={qs({ oldal: String(page - 1) })}>← Előző</Link>}
            {page * PAGE_SIZE < total && <Link className="btn-text" href={qs({ oldal: String(page + 1) })}>Következő →</Link>}
          </div>
        </div>
      </main>

      {openInvoice && <InvoiceDrawer invoice={JSON.parse(JSON.stringify(openInvoice))} baseCurrency={base} closeHref={qs({ panel: undefined })} />}
      {params.uj === "1" && (
        <NewInvoiceDrawer partnerOptions={partnerOptions} categoryOptions={categoryOptions} closeHref={qs({ uj: undefined })} />
      )}
    </>
  );
}
