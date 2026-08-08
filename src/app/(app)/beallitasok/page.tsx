import { currentUserOrDemo } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/topbar";
import { Badge, Card, EmptyState } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { BANK_TEMPLATES } from "@/services/bank-import/templates";
import type { Currency } from "@/lib/constants";

export const dynamic = "force-dynamic";

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Tulajdonos", ADMIN: "Adminisztrátor", ACCOUNTANT: "Könyvelő", VIEWER: "Megtekintő",
};

export default async function SettingsPage() {
  const user = await currentUserOrDemo();
  if (!user) return <EmptyState text="Futtasd a seed szkriptet: npm run db:seed" />;
  const org = user.organization;

  const [users, accounts, categories, rules] = await Promise.all([
    prisma.user.findMany({ where: { organizationId: org.id, deletedAt: null } }),
    prisma.bankAccount.findMany({ where: { organizationId: org.id, deletedAt: null } }),
    prisma.category.findMany({
      where: { organizationId: org.id, deletedAt: null, parentId: null },
      include: { children: true },
      orderBy: { name: "asc" },
    }),
    prisma.matchingRule.findMany({ where: { organizationId: org.id } }),
  ]);

  return (
    <>
      <Topbar title="Beállítások" />
      <main className="max-w-[1280px] mx-auto px-4 md:px-8 py-6 grid lg:grid-cols-2 gap-6">
        <Card title="Szervezet">
          <dl className="grid grid-cols-2 gap-y-2 text-[14px]">
            <dt style={{ color: "var(--text-secondary)" }}>Név</dt><dd>{org.name}</dd>
            <dt style={{ color: "var(--text-secondary)" }}>Adószám</dt><dd>{org.taxNumber ?? "–"}</dd>
            <dt style={{ color: "var(--text-secondary)" }}>Alapdeviza</dt><dd>{org.baseCurrency}</dd>
            <dt style={{ color: "var(--text-secondary)" }}>Időzóna</dt><dd>{org.timezone}</dd>
            <dt style={{ color: "var(--text-secondary)" }}>E-mail beküldés</dt>
            <dd><code className="text-[13px]">szamla-{org.inboundEmailToken ?? "…"}@app.hu</code></dd>
          </dl>
        </Card>

        <Card title="Felhasználók és jogosultságok">
          <div className="flex flex-col gap-2">
            {users.map((u) => (
              <div key={u.id} className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-[14px]">{u.name}</div>
                  <div className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>{u.email}</div>
                </div>
                <Badge color="blue">{ROLE_LABELS[u.role] ?? u.role}</Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Bankszámlák">
          <div className="flex flex-col gap-2">
            {accounts.map((a) => (
              <div key={a.id} className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: `var(--${a.color ?? "gray"})` }} />
                  <span className="font-medium text-[14px]">{a.name}</span>
                  <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>{a.bankName}</span>
                </span>
                <span className="num text-[14px]">{formatMoney(a.currentBalance, a.currency as Currency)}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Kategóriák">
          <div className="flex flex-col gap-1.5">
            {categories.map((c) => (
              <div key={c.id}>
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: `var(--${c.color ?? "gray"})` }} />
                  <span className="text-[14px] font-medium">{c.name}</span>
                  {c.monthlyBudget && (
                    <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                      keret: {formatMoney(c.monthlyBudget, "HUF")}/hó
                    </span>
                  )}
                </span>
                {c.children.length > 0 && (
                  <div className="ml-4 mt-1 flex flex-col gap-1">
                    {c.children.map((ch) => (
                      <span key={ch.id} className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                        └ {ch.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card title="Párosítási szabályok">
          <div className="flex flex-col gap-2">
            {rules.length === 0
              ? <p className="text-[13px]" style={{ color: "var(--text-tertiary)" }}>Nincs mentett szabály.</p>
              : rules.map((r) => (
                <div key={r.id} className="text-[13px]">
                  <span className="font-medium">{r.name}</span>
                  <span style={{ color: "var(--text-secondary)" }}> — ha a közlemény tartalmazza: </span>
                  <code>{r.referenceContains}</code>
                </div>
              ))}
          </div>
        </Card>

        <Card title="Import-sablonok (bank CSV)">
          <div className="flex flex-wrap gap-2">
            {BANK_TEMPLATES.map((t) => (
              <Badge key={t.id} color="gray">{t.bankName}</Badge>
            ))}
          </div>
          <p className="text-[12px] mt-3" style={{ color: "var(--text-tertiary)" }}>
            Importáláskor a sablon automatikusan hozzárendeli az oszlopokat; új sablon a varázslóban menthető.
          </p>
        </Card>
      </main>
    </>
  );
}
