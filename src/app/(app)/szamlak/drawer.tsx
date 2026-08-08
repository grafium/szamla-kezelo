"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Badge, Money } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import {
  INVOICE_STATUS_COLORS, INVOICE_STATUS_LABELS, PAYMENT_METHOD_LABELS,
  VAT_RATE_LABELS, type Currency, type InvoiceStatus, type PaymentMethod, type VatRate,
} from "@/lib/constants";

// Jobbról becsúszó 480px-es részletpanel (3.5) — Esc zárja.

export function InvoiceDrawer({ invoice, baseCurrency, closeHref }: {
  invoice: any; baseCurrency: Currency; closeHref: string;
}) {
  const router = useRouter();
  const close = () => router.push(closeHref);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setStatus = async (status: string) => {
    await fetch(`/api/invoices/${invoice.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    router.refresh();
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end drawer-overlay" onClick={close}>
      <aside
        className="drawer-panel h-full overflow-y-auto p-6 flex flex-col gap-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog" aria-label="Számla részletei"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="label-upper">{invoice.direction === "INCOMING" ? "Bejövő számla" : "Kimenő számla"}</div>
            <h2 className="truncate">{invoice.invoiceNumber}</h2>
            <Link href={`/partnerek/${invoice.partnerId}`} className="text-[14px] hover:underline"
              style={{ color: "var(--text-secondary)" }}>
              {invoice.partner?.name}
            </Link>
          </div>
          <button className="btn-text px-2" onClick={close} aria-label="Bezárás (Esc)">×</button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Badge color={INVOICE_STATUS_COLORS[invoice.status as InvoiceStatus]}>
            {INVOICE_STATUS_LABELS[invoice.status as InvoiceStatus]}
          </Badge>
          {invoice.subscription && <Badge color="purple">↻ {invoice.subscription.name}</Badge>}
          {(JSON.parse(invoice.tags || "[]") as string[]).map((t) => (
            <Badge key={t} color="gray">{t}</Badge>
          ))}
        </div>

        <div className="card p-4 flex flex-col gap-2">
          <Row label="Nettó" value={formatMoney(invoice.netAmount, invoice.currency)} />
          <Row label={`ÁFA (${VAT_RATE_LABELS[invoice.vatRate as VatRate] ?? invoice.vatRate})`}
            value={formatMoney(invoice.vatAmount, invoice.currency)} />
          <div className="border-t pt-2" style={{ borderColor: "var(--divider)" }}>
            <div className="flex items-baseline justify-between">
              <span className="font-medium">Bruttó</span>
              <Money amount={invoice.grossAmount} currency={invoice.currency}
                baseAmount={invoice.baseAmount} baseCurrency={baseCurrency} />
            </div>
            {invoice.currency !== baseCurrency && (
              <p className="text-[12px] text-right mt-1" style={{ color: "var(--text-tertiary)" }}>
                Árfolyam: {invoice.exchangeRate} ({formatDate(invoice.exchangeRateDate)})
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[14px]">
          <Field label="Kelt" value={formatDate(invoice.issueDate)} />
          <Field label="Teljesítés" value={formatDate(invoice.fulfillmentDate)} />
          <Field label="Fizetési határidő" value={formatDate(invoice.dueDate)} />
          <Field label="Fizetési mód" value={PAYMENT_METHOD_LABELS[invoice.paymentMethod as PaymentMethod]} />
          <Field label="Kategória" value={invoice.category?.name ?? "–"} />
          <Field label="Forrás" value={{ MANUAL: "Kézi", UPLOAD: "Feltöltés", EMAIL: "E-mail", API: "API" }[invoice.sourceType as string] ?? invoice.sourceType} />
        </div>

        {invoice.lineItems?.length > 0 && (
          <section>
            <h3 className="mb-2">Tételek</h3>
            <div className="flex flex-col gap-1">
              {invoice.lineItems.map((li: any) => (
                <div key={li.id} className="flex justify-between gap-3 text-[13px]">
                  <span className="truncate">{li.description}</span>
                  <span className="num shrink-0">{formatMoney(li.grossAmount, invoice.currency)}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {invoice.payments?.length > 0 && (
          <section>
            <h3 className="mb-2">Kifizetések</h3>
            <div className="flex flex-col gap-1">
              {invoice.payments.map((p: any) => (
                <div key={p.id} className="flex justify-between gap-3 text-[13px]">
                  <span>{formatDate(p.paymentDate)}{p.isPartial ? " · részfizetés" : ""}</span>
                  <span className="num">{formatMoney(p.amount, p.currency)}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {invoice.bankTransactions?.length > 0 && (
          <section>
            <h3 className="mb-2">Párosított banki tételek</h3>
            <div className="flex flex-col gap-1">
              {invoice.bankTransactions.map((tx: any) => (
                <div key={tx.id} className="flex justify-between gap-3 text-[13px]">
                  <span className="truncate">{formatDate(tx.bookingDate)} · {tx.counterpartyName ?? "?"}</span>
                  <span className="num">{formatMoney(tx.amount, tx.currency)}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {invoice.notes && (
          <section>
            <h3 className="mb-2">Megjegyzés</h3>
            <p className="text-[14px]" style={{ color: "var(--text-secondary)" }}>{invoice.notes}</p>
          </section>
        )}

        <div className="mt-auto flex gap-2 flex-wrap pt-4">
          {invoice.status !== "PAID" && (
            <button className="btn-primary" onClick={() => setStatus("PAID")}>Kifizetettnek jelölés</button>
          )}
          {invoice.status === "AWAITING_APPROVAL" && (
            <button className="btn-secondary" onClick={() => setStatus("APPROVED")}>Jóváhagyás</button>
          )}
          {invoice.status !== "CANCELLED" && (
            <button className="btn-secondary" onClick={() => setStatus("CANCELLED")}>Sztornó</button>
          )}
        </div>
      </aside>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between text-[14px]">
      <span style={{ color: "var(--text-secondary)" }}>{label}</span>
      <span className="num">{value}</span>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="label-upper">{label}</div>
      <div>{value}</div>
    </div>
  );
}
