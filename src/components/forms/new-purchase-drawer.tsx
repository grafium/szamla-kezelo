"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import {
  CURRENCIES, PAYMENT_METHODS, PAYMENT_METHOD_LABELS,
  VAT_RATES, VAT_RATE_LABELS, type Currency,
} from "@/lib/constants";
import { formatMoney } from "@/lib/money";
import {
  Field, FormActions, FormDrawer, ServerError,
  isValidAmount, parseList, parseMajor, todayISO, type Option,
} from "./shared";

type Values = {
  partnerId: string; name: string; purchaseDate: string; currency: string;
  netAmount: string; vatRate: string; categoryId: string; paymentMethod: string;
  warrantyUntil: string; isAsset: boolean; assetLifetimeMonths: string;
  tags: string; notes: string;
};

export function NewPurchaseDrawer({ partnerOptions, categoryOptions, closeHref }: {
  partnerOptions: Option[]; categoryOptions: Option[]; closeHref: string;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<Values>({
    defaultValues: {
      partnerId: "", name: "", purchaseDate: todayISO(), currency: "HUF",
      netAmount: "", vatRate: "27", categoryId: "", paymentMethod: "CARD",
      warrantyUntil: "", isAsset: false, assetLifetimeMonths: "", tags: "", notes: "",
    },
  });

  // Élő ÁFA/bruttó számítás a nettóból és a kulcsból.
  const currency = watch("currency") as Currency;
  const netRaw = watch("netAmount");
  const rateNum = Number(watch("vatRate"));
  const netMinor = isValidAmount(netRaw) ? parseMajor(netRaw) : 0;
  const vatMinor = Number.isFinite(rateNum) ? Math.round((netMinor * rateNum) / 100) : 0;
  const grossMinor = netMinor + vatMinor;
  const isAsset = watch("isAsset");

  const onSubmit = async (v: Values) => {
    setServerError(null);
    const net = parseMajor(v.netAmount);
    const rate = Number(v.vatRate);
    const vat = Number.isFinite(rate) ? Math.round((net * rate) / 100) : 0;
    const payload = {
      partnerId: v.partnerId || null,
      name: v.name.trim(),
      purchaseDate: v.purchaseDate,
      currency: v.currency,
      netAmount: net,
      vatAmount: vat,
      grossAmount: net + vat,
      categoryId: v.categoryId || null,
      paymentMethod: v.paymentMethod,
      warrantyUntil: v.warrantyUntil || null,
      isAsset: v.isAsset,
      assetLifetimeMonths: v.isAsset && v.assetLifetimeMonths ? Number(v.assetLifetimeMonths) : null,
      tags: parseList(v.tags),
      notes: v.notes.trim() || null,
    };
    const res = await fetch("/api/purchases", {
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
    <FormDrawer title="Új vásárlás" closeHref={closeHref}>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <ServerError message={serverError} />

        <Field label="Megnevezés *" error={errors.name?.message}>
          <input className="input" autoFocus placeholder="Pl. MacBook Pro 14”"
            {...register("name", { required: "A megnevezés kötelező" })} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Partner">
            <select className="input" {...register("partnerId")}>
              <option value="">–</option>
              {partnerOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Vásárlás dátuma *" error={errors.purchaseDate?.message}>
            <input className="input" type="date"
              {...register("purchaseDate", { required: "Add meg a vásárlás dátumát" })} />
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
          <Field label="Fizetési mód">
            <select className="input" {...register("paymentMethod")}>
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>)}
            </select>
          </Field>
          <Field label="Garancia lejárata">
            <input className="input" type="date" {...register("warrantyUntil")} />
          </Field>
          {isAsset && (
            <Field label="Élettartam (hónap)" error={errors.assetLifetimeMonths?.message}>
              <input className="input" inputMode="numeric" placeholder="36"
                {...register("assetLifetimeMonths", { pattern: { value: /^\d*$/, message: "Egész számot adj meg" } })} />
            </Field>
          )}
        </div>

        <label className="flex items-center gap-2 text-[14px]">
          <input type="checkbox" {...register("isAsset")} />
          Tárgyi eszköz
        </label>

        <Field label="Címkék (vesszővel elválasztva)">
          <input className="input" placeholder="hardver, iroda" {...register("tags")} />
        </Field>
        <Field label="Megjegyzés">
          <textarea className="input py-1.5 min-h-[64px]" {...register("notes")} />
        </Field>

        <FormActions closeHref={closeHref} submitting={isSubmitting} />
      </form>
    </FormDrawer>
  );
}
