import Link from "next/link";
import { currentUserOrDemo } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/topbar";
import { Badge, Card, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import type { Currency } from "@/lib/constants";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  IMPORTING: { label: "Importálás", color: "yellow" },
  NEEDS_REVIEW: { label: "Ellenőrzésre vár", color: "orange" },
  RECONCILED: { label: "Egyeztetve", color: "green" },
};

export default async function BankStatementsPage() {
  const user = await currentUserOrDemo();
  if (!user) return <EmptyState text="Futtasd a seed szkriptet: npm run db:seed" />;

  const statements = await prisma.bankStatement.findMany({
    where: { organizationId: user.organizationId, deletedAt: null },
    include: { bankAccount: true },
    orderBy: { periodEnd: "desc" },
  });

  return (
    <>
      <Topbar title="Banki kivonatok"
        action={<button className="btn-primary">+ Kivonat importálása</button>} />
      <main className="max-w-[1280px] mx-auto px-4 md:px-8 py-6">
        {statements.length === 0 ? (
          <EmptyState icon="▥" text="Még nincs importált kivonat" />
        ) : (
          <div className="grid gap-3">
            {statements.map((st) => {
              const ratio = st.transactionCount ? st.matchedCount / st.transactionCount : 0;
              const status = STATUS_LABELS[st.status] ?? STATUS_LABELS.NEEDS_REVIEW;
              return (
                <Link key={st.id} href={`/banki-kivonatok/${st.id}`}
                  className="card p-4 flex flex-col md:flex-row md:items-center gap-3 hover:bg-[var(--bg-tertiary)]">
                  <div className="flex items-center gap-3 min-w-0 md:w-[280px]">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: `var(--${st.bankAccount.color ?? "gray"})` }} />
                    <div className="min-w-0">
                      <div className="font-medium truncate">{st.bankAccount.name}</div>
                      <div className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                        {formatDate(st.periodStart)} – {formatDate(st.periodEnd)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-[13px] flex-1">
                    <div>
                      <div className="label-upper">Nyitó</div>
                      <div className="num">{formatMoney(st.openingBalance, st.currency as Currency)}</div>
                    </div>
                    <div>
                      <div className="label-upper">Záró</div>
                      <div className="num">{formatMoney(st.closingBalance, st.currency as Currency)}</div>
                    </div>
                    <div>
                      <div className="label-upper">Tételek</div>
                      <div className="num">{st.transactionCount}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 md:w-[280px]">
                    <div className="flex-1">
                      <div className="flex justify-between text-[11px] mb-1" style={{ color: "var(--text-tertiary)" }}>
                        <span>Párosítva</span>
                        <span>{st.matchedCount}/{st.transactionCount}</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-hover)" }}>
                        <div className="h-full rounded-full"
                          style={{ width: `${ratio * 100}%`, background: ratio === 1 ? "var(--green)" : "var(--accent)" }} />
                      </div>
                    </div>
                    <Badge color={status.color}>{status.label}</Badge>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
