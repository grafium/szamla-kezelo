import Link from "next/link";
import type { Currency } from "@/lib/constants";
import { formatMoney, formatMoneyApprox } from "@/lib/money";

// Kis, közös UI-elemek — Notion-stílusú badge, kártya, üres állapot, összeg-cella.

export function Badge({ color = "gray", children }: { color?: string; children: React.ReactNode }) {
  return (
    <span className="badge" style={{ background: `var(--${color}-bg)`, color: `var(--${color})` }}>
      {children}
    </span>
  );
}

export function Card({ title, children, className = "" }: {
  title?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={`card p-4 ${className}`}>
      {title && <h3 className="mb-3">{title}</h3>}
      {children}
    </section>
  );
}

export function KpiCard({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div className="card p-4 flex flex-col gap-1 min-w-0">
      <span className="label-upper">{label}</span>
      <span
        className="text-[22px] font-semibold tracking-tight num text-left"
        style={color ? { color: `var(--${color})` } : undefined}
      >
        {value}
      </span>
      {sub && <span className="text-[12px] truncate" style={{ color: "var(--text-tertiary)" }}>{sub}</span>}
    </div>
  );
}

export function EmptyState({ icon = "○", text, actionLabel, actionHref }: {
  icon?: string; text: string; actionLabel?: string; actionHref?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <span aria-hidden className="text-3xl" style={{ color: "var(--text-tertiary)" }}>{icon}</span>
      <p className="text-[14px]" style={{ color: "var(--text-secondary)" }}>{text}</p>
      {actionLabel && actionHref && (
        <Link href={actionHref} className="btn-primary">{actionLabel}</Link>
      )}
    </div>
  );
}

/** Összeg az eredeti devizában + halvány átszámított érték: "€ 49,00 · ~19 380 Ft" */
export function Money({ amount, currency, baseAmount, baseCurrency }: {
  amount: number; currency: Currency; baseAmount?: number | null; baseCurrency?: Currency;
}) {
  const showBase = baseAmount != null && baseCurrency && currency !== baseCurrency;
  return (
    <span className="num inline-flex items-baseline gap-1.5 justify-end">
      <span>{formatMoney(amount, currency)}</span>
      {showBase && (
        <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
          · {formatMoneyApprox(baseAmount!, baseCurrency!)}
        </span>
      )}
    </span>
  );
}

/** Devizánkénti részösszegek sora vegyes listákhoz. */
export function CurrencyTotals({ totals, baseTotal, baseCurrency }: {
  totals: Record<string, number>; baseTotal?: number; baseCurrency?: Currency;
}) {
  const entries = Object.entries(totals).filter(([, v]) => v !== 0);
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[13px]">
      {entries.map(([cur, amount]) => (
        <span key={cur} className="num">
          <span style={{ color: "var(--text-tertiary)" }}>{cur}: </span>
          {formatMoney(amount, cur as Currency)}
        </span>
      ))}
      {baseTotal != null && baseCurrency && entries.length > 1 && (
        <span className="num font-medium">
          Összesen (átszámítva): {formatMoney(baseTotal, baseCurrency)}
        </span>
      )}
    </div>
  );
}
