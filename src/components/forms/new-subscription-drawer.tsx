"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import {
  BILLING_CYCLES, BILLING_CYCLE_LABELS, CURRENCIES,
  PAYMENT_METHODS, PAYMENT_METHOD_LABELS, VAT_RATES, VAT_RATE_LABELS,
} from "@/lib/constants";
import {
  Field, FormActions, FormDrawer, ServerError,
  isValidAmount, parseList, parseMajor, todayISO, type Option,
} from "./shared";

type Values = {
  partnerId: string; name: string; currency: string; amount: string;
  vatRate: string; billingCycle: string; customIntervalDays: string;
  startDate: string; nextBillingDate: string; endDate: string;
  cancellationDeadline: string; noticePeriodDays: string; autoRenew: boolean;
  paymentMethod: string; paymentSourceLast4: string; categoryId: string;
  seats: string; reminderDaysBefore: string; url: string; notes: string; tags: string;
};

export function NewSubscriptionDrawer({ partnerOptions, categoryOptions, closeHref }: {
  partnerOptions: Option[]; categoryOptions: Option[]; closeHref: string;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<Values>({
    defaultValues: {
      partnerId: "", name: "", currency: "HUF", amount: "", vatRate: "27",
      billingCycle: "MONTHLY", customIntervalDays: "", startDate: todayISO(),
      nextBillingDate: todayISO(), endDate: "", cancellationDeadline: "",
      noticePeriodDays: "", autoRenew: true, paymentMethod: "CARD",
      paymentSourceLast4: "", categoryId: "", seats: "",
      reminderDaysBefore: "14,3,1", url: "", notes: "", tags: "",
    },
  });

  const isCustomCycle = watch("billingCycle") === "CUSTOM";

  const onSubmit = async (v: Values) => {
    setServerError(null);
    const reminders = v.reminderDaysBefore
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
    const payload = {
      partnerId: v.partnerId,
      name: v.name.trim(),
      currency: v.currency,
      amount: parseMajor(v.amount),
      vatRate: v.vatRate,
      billingCycle: v.billingCycle,
      customIntervalDays: isCustomCycle && v.customIntervalDays ? Number(v.customIntervalDays) : null,
      startDate: v.startDate,
      nextBillingDate: v.nextBillingDate,
      endDate: v.endDate || null,
      cancellationDeadline: v.cancellationDeadline || null,
      noticePeriodDays: v.noticePeriodDays ? Number(v.noticePeriodDays) : null,
      autoRenew: v.autoRenew,
      paymentMethod: v.paymentMethod,
      paymentSourceLast4: v.paymentSourceLast4.trim() || null,
      categoryId: v.categoryId || null,
      seats: v.seats ? Number(v.seats) : null,
      reminderDaysBefore: reminders.length > 0 ? reminders : undefined,
      url: v.url.trim() || null,
      notes: v.notes.trim() || null,
      tags: parseList(v.tags),
    };
    const res = await fetch("/api/subscriptions", {
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
    <FormDrawer title="Új előfizetés" closeHref={closeHref}>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <ServerError message={serverError} />

        <Field label="Név *" error={errors.name?.message}>
          <input className="input" autoFocus placeholder="Pl. Figma Professional"
            {...register("name", { required: "A név kötelező" })} />
        </Field>
        <Field label="Partner *" error={errors.partnerId?.message}>
          <select className="input" {...register("partnerId", { required: "Válassz partnert" })}>
            <option value="">Válassz…</option>
            {partnerOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Deviza">
            <select className="input" {...register("currency")}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Bruttó / ciklus *" error={errors.amount?.message}>
            <input className="input num" inputMode="decimal" placeholder="0,00"
              {...register("amount", {
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

        <div className="grid grid-cols-2 gap-3">
          <Field label="Számlázási ciklus">
            <select className="input" {...register("billingCycle")}>
              {BILLING_CYCLES.map((c) => <option key={c} value={c}>{BILLING_CYCLE_LABELS[c]}</option>)}
            </select>
          </Field>
          {isCustomCycle && (
            <Field label="Egyedi ciklus (nap) *" error={errors.customIntervalDays?.message}>
              <input className="input" inputMode="numeric" placeholder="30"
                {...register("customIntervalDays", {
                  required: "Add meg a napok számát",
                  pattern: { value: /^\d+$/, message: "Egész számot adj meg" },
                })} />
            </Field>
          )}
          <Field label="Kezdés *" error={errors.startDate?.message}>
            <input className="input" type="date" {...register("startDate", { required: "Add meg a kezdés dátumát" })} />
          </Field>
          <Field label="Következő terhelés *" error={errors.nextBillingDate?.message}>
            <input className="input" type="date" {...register("nextBillingDate", { required: "Add meg a következő terhelést" })} />
          </Field>
          <Field label="Lejárat">
            <input className="input" type="date" {...register("endDate")} />
          </Field>
          <Field label="Lemondási határidő">
            <input className="input" type="date" {...register("cancellationDeadline")} />
          </Field>
          <Field label="Felmondási idő (nap)" error={errors.noticePeriodDays?.message}>
            <input className="input" inputMode="numeric" placeholder="30"
              {...register("noticePeriodDays", { pattern: { value: /^\d*$/, message: "Egész számot adj meg" } })} />
          </Field>
          <Field label="Licencek száma" error={errors.seats?.message}>
            <input className="input" inputMode="numeric" placeholder="1"
              {...register("seats", { pattern: { value: /^\d*$/, message: "Egész számot adj meg" } })} />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-[14px]">
          <input type="checkbox" {...register("autoRenew")} />
          Automatikus megújulás
        </label>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Fizetési mód">
            <select className="input" {...register("paymentMethod")}>
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>)}
            </select>
          </Field>
          <Field label="Kártya utolsó 4 számjegye">
            <input className="input" maxLength={4} placeholder="4242" {...register("paymentSourceLast4")} />
          </Field>
          <Field label="Kategória">
            <select className="input" {...register("categoryId")}>
              <option value="">–</option>
              {categoryOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Emlékeztetők (nappal előtte)">
            <input className="input" placeholder="14,3,1" {...register("reminderDaysBefore")} />
          </Field>
        </div>

        <Field label="URL">
          <input className="input" placeholder="https://…" {...register("url")} />
        </Field>
        <Field label="Címkék (vesszővel elválasztva)">
          <input className="input" placeholder="szoftver, design" {...register("tags")} />
        </Field>
        <Field label="Megjegyzés">
          <textarea className="input py-1.5 min-h-[64px]" {...register("notes")} />
        </Field>

        <FormActions closeHref={closeHref} submitting={isSubmitting} />
      </form>
    </FormDrawer>
  );
}
