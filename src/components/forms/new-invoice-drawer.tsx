"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import {
  CURRENCIES, INVOICE_STATUSES, INVOICE_STATUS_LABELS,
  PAYMENT_METHODS, PAYMENT_METHOD_LABELS, VAT_RATES, VAT_RATE_LABELS,
  type Currency,
} from "@/lib/constants";
import { formatMoney } from "@/lib/money";
import {
  Field, FormActions, FormDrawer, ServerError,
  isValidAmount, parseList, parseMajor, todayISO, type Option,
} from "./shared";

type Values = {
  partnerId: string; direction: string; invoiceNumber: string;
  issueDate: string; fulfillmentDate: string; dueDate: string;
  currency: string; netAmount: string; vatRate: string;
  paymentMethod: string; categoryId: string; description: string;
  tags: string; notes: string; status: string;
};

export function NewInvoiceDrawer({ partnerOptions, categoryOptions, closeHref }: {
  partnerOptions: Option[]; categoryOptions: Option[]; closeHref: string;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<Values>({
    defaultValues: {
      partnerId: "", direction: "INCOMING", invoiceNumber: "",
      issueDate: todayISO(), fulfillmentDate: "", dueDate: todayISO(),
      currency: "HUF", netAmount: "", vatRate: "27",
      paymentMethod: "TRANSFER", categoryId: "", description: "",
      tags: "", notes: "", status: "APPROVED",
    },
  });

  // Élő ÁFA/bruttó számítás: numerikus kulcsnál net*kulcs/100, egyébként 0.
  const currency = watch("currency") as Currency;
  const netRaw = watch("netAmount");
  const vatRate = watch("vatRate");
  const netMinor = isValidAmount(netRaw) ? parseMajor(netRaw) : 0;
  const rateNum = Number(vatRate);
  const vatMinor = Number.isFinite(rateNum) ? Math.round((netMinor * rateNum) / 100) : 0;
  const grossMinor = netMinor + vatMinor;

  const onSubmit = async (v: Values) => {
    setServerError(null);
    const net = parseMajor(v.netAmount);
    const rate = Number(v.vatRate);
    const vat = Number.isFinite(rate) ? Math.round((net * rate) / 100) : 0;
    const payload = {
      partnerId: v.partnerId,
      direction: v.direction,
      invoiceNumber: v.invoiceNumber.trim(),
      issueDate: v.issueDate,
      fulfillmentDate: v.fulfillmentDate || null,
      dueDate: v.dueDate,
      currency: v.currency,
      netAmount: net,
      vatRate: v.vatRate,
      vatAmount: vat,
      grossAmount: net + vat,
      status: v.status,
      paymentMethod: v.paymentMethod,
      categoryId: v.categoryId || null,
      description: v.description.trim() || null,
      tags: parseList(v.tags),
      notes: v.notes.trim() || null,
    };
    const res = await fetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setServerError(data?.error ?? "Hiba történt a mentés közben");
      return;
    }
    router.push(closeHref);
    router.refresh();
  };

  return (
    <FormDrawer title="Új számla" closeHref={closeHref}>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <ServerError message={serverError} />

        <div className="grid grid-cols-2 gap-3">
          <Field label="Partner *" error={errors.partnerId?.message}>
            <select className="input" autoFocus {...register("partnerId", { required: "Válassz partnert" })}>
              <option value="">Válassz…</option>
              {partnerOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Irány">
            <select className="input" {...register("direction")}>
              <option value="INCOMING">Bejövő</option>
              <option value="OUTGOING">Kimenő</option>
            </select>
          </Field>
        </div>

        <Field label="Számlaszám *" error={errors.invoiceNumber?.message}>
          <input className="input" placeholder="Pl. INV-2026-0042"
            {...register("invoiceNumber", { required: "A számlaszám kötelező" })} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Kelt *" error={errors.issueDate?.message}>
            <input className="input" type="date" {...register("issueDate", { required: "Add meg a kelt dátumát" })} />
          </Field>
          <Field label="Teljesítés">
            <input className="input" type="date" {...register("fulfillmentDate")} />
          </Field>
          <Field label="Fizetési határidő *" error={errors.dueDate?.message}>
            <input className="input" type="date" {...register("dueDate", { required: "Add meg a fizetési határidőt" })} />
          </Field>
          <Field label="Fizetési mód">
            <select className="input" {...register("paymentMethod")}>
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>)}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Deviza">
            <select className="input" {...register("currency")}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Nettó összeg *" error={errors.netAmount?.message}>
            <input className="input num" inputMode="decimal" placeholder="0,00"
              {...register("netAmount", {
                required: "Az összeg kötelező",
                validate: (v) => isValidAmount(v) || "Érvénytelen összeg",
              })} />
          </Field>
          <Field label="ÁFA-kulcs">
            <select className="input" {...register("vatRate")}>
              {VAT_RATES.map((r) => <option key={r} value={r}>{VAT_RATE_LABELS[r]}</option>)}
            </select>
          </Field>
        </div>

        <div className="card p-3 flex flex-col gap-1 text-[14px]">
          <div className="flex items-baseline justify-between">
            <span style={{ color: "var(--text-secondary)" }}>ÁFA</span>
            <span className="num">{formatMoney(vatMinor, currency)}</span>
          </div>
          <div className="flex items-baseline justify-between font-medium">
            <span>Bruttó</span>
            <span className="num">{formatMoney(grossMinor, currency)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Kategória">
            <select className="input" {...register("categoryId")}>
              <option value="">–</option>
              {categoryOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Státusz">
            <select className="input" {...register("status")}>
              {INVOICE_STATUSES.map((s) => <option key={s} value={s}>{INVOICE_STATUS_LABELS[s]}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Leírás">
          <input className="input" placeholder="Pl. Creative Cloud éves díj" {...register("description")} />
        </Field>
        <Field label="Címkék (vesszővel elválasztva)">
          <input className="input" placeholder="szoftver, licenc" {...register("tags")} />
        </Field>
        <Field label="Megjegyzés">
          <textarea className="input py-1.5 min-h-[64px]" {...register("notes")} />
        </Field>

        <FormActions closeHref={closeHref} submitting={isSubmitting} />
      </form>
    </FormDrawer>
  );
}
