"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import {
  CURRENCIES, PALETTE, PARTNER_TYPES, PARTNER_TYPE_LABELS, type PaletteColor,
} from "@/lib/constants";
import { Field, FormActions, FormDrawer, ServerError, parseList } from "./shared";

const COLOR_LABELS: Record<PaletteColor, string> = {
  red: "Piros", orange: "Narancs", yellow: "Sárga", green: "Zöld",
  blue: "Kék", purple: "Lila", pink: "Rózsaszín", gray: "Szürke",
};

type Values = {
  name: string; displayName: string; type: string; taxNumber: string;
  euVatNumber: string; country: string; email: string; defaultCurrency: string;
  defaultPaymentTermDays: string; iban: string; color: string;
  tags: string; notes: string; aliases: string;
};

export function NewPartnerDrawer({ closeHref }: { closeHref: string }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({
    defaultValues: {
      name: "", displayName: "", type: "SUPPLIER", taxNumber: "", euVatNumber: "",
      country: "HU", email: "", defaultCurrency: "", defaultPaymentTermDays: "",
      iban: "", color: "gray", tags: "", notes: "", aliases: "",
    },
  });

  const onSubmit = async (v: Values) => {
    setServerError(null);
    const payload = {
      name: v.name.trim(),
      displayName: v.displayName.trim() || null,
      type: v.type,
      taxNumber: v.taxNumber.trim() || null,
      euVatNumber: v.euVatNumber.trim() || null,
      country: v.country.trim().toUpperCase() || null,
      email: v.email.trim() || null,
      defaultCurrency: v.defaultCurrency || null,
      defaultPaymentTermDays: v.defaultPaymentTermDays ? Number(v.defaultPaymentTermDays) : null,
      iban: v.iban.trim() || null,
      color: v.color || null,
      tags: parseList(v.tags),
      notes: v.notes.trim() || null,
      aliases: parseList(v.aliases),
    };
    const res = await fetch("/api/partners", {
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
    <FormDrawer title="Új partner" closeHref={closeHref}>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <ServerError message={serverError} />

        <Field label="Név *" error={errors.name?.message}>
          <input className="input" autoFocus placeholder="Pl. Adobe Inc."
            {...register("name", { required: "A név kötelező" })} />
        </Field>
        <Field label="Megjelenített név">
          <input className="input" placeholder="Pl. Adobe" {...register("displayName")} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Típus">
            <select className="input" {...register("type")}>
              {PARTNER_TYPES.map((t) => <option key={t} value={t}>{PARTNER_TYPE_LABELS[t]}</option>)}
            </select>
          </Field>
          <Field label="Ország (ISO-2)">
            <input className="input" maxLength={2} placeholder="HU" {...register("country")} />
          </Field>
          <Field label="Adószám" error={errors.taxNumber?.message}>
            <input className="input" placeholder="12345678-1-42"
              {...register("taxNumber", {
                pattern: { value: /^\d{8}-\d-\d{2}$/, message: "Formátum: 12345678-1-42" },
              })} />
          </Field>
          <Field label="EU adószám" error={errors.euVatNumber?.message}>
            <input className="input" placeholder="HU12345678"
              {...register("euVatNumber", {
                pattern: { value: /^[A-Z]{2}[A-Z0-9]{2,12}$/, message: "Pl. HU12345678" },
              })} />
          </Field>
          <Field label="E-mail" error={errors.email?.message}>
            <input className="input" type="email" placeholder="szamla@ceg.hu"
              {...register("email", {
                pattern: { value: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, message: "Érvénytelen e-mail cím" },
              })} />
          </Field>
          <Field label="Alap deviza">
            <select className="input" {...register("defaultCurrency")}>
              <option value="">–</option>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Fizetési határidő (nap)" error={errors.defaultPaymentTermDays?.message}>
            <input className="input" inputMode="numeric" placeholder="8"
              {...register("defaultPaymentTermDays", {
                pattern: { value: /^\d*$/, message: "Egész számot adj meg" },
              })} />
          </Field>
          <Field label="Szín">
            <select className="input" {...register("color")}>
              {PALETTE.map((c) => <option key={c} value={c}>{COLOR_LABELS[c]}</option>)}
            </select>
          </Field>
        </div>

        <Field label="IBAN">
          <input className="input" placeholder="HU12 3456 7890…" {...register("iban")} />
        </Field>
        <Field label="Címkék (vesszővel elválasztva)">
          <input className="input" placeholder="szoftver, marketing" {...register("tags")} />
        </Field>
        <Field label="Aliasok (vesszővel elválasztva)">
          <input className="input" placeholder="ADOBE SYSTEMS, ADOBE*CC" {...register("aliases")} />
        </Field>
        <Field label="Megjegyzés">
          <textarea className="input py-1.5 min-h-[64px]" {...register("notes")} />
        </Field>

        <FormActions closeHref={closeHref} submitting={isSubmitting} />
      </form>
    </FormDrawer>
  );
}
