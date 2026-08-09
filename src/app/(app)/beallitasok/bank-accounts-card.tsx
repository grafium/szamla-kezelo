"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field, ServerError, parseMajor, isValidAmount } from "@/components/forms/shared";
import { formatMoney } from "@/lib/money";
import { CURRENCIES, PALETTE, type Currency } from "@/lib/constants";

// Bankszámlák kezelése: lista + inline űrlap létrehozáshoz/szerkesztéshez,
// aktiválás/deaktiválás és puha törlés (kivonattal rendelkező számla nem törölhető).

export interface BankAccountItem {
  id: string;
  name: string;
  bankName: string | null;
  accountNumber: string | null;
  iban: string | null;
  swift: string | null;
  currency: string;
  openingBalance: number;
  currentBalance: number;
  color: string | null;
  isActive: boolean;
}

interface FormState {
  name: string;
  bankName: string;
  accountNumber: string;
  iban: string;
  swift: string;
  currency: Currency;
  openingBalance: string;
  color: string;
}

const EMPTY_FORM: FormState = {
  name: "", bankName: "", accountNumber: "", iban: "", swift: "",
  currency: "HUF", openingBalance: "0", color: "blue",
};

function toForm(a: BankAccountItem): FormState {
  return {
    name: a.name,
    bankName: a.bankName ?? "",
    accountNumber: a.accountNumber ?? "",
    iban: a.iban ?? "",
    swift: a.swift ?? "",
    currency: (CURRENCIES as readonly string[]).includes(a.currency) ? (a.currency as Currency) : "HUF",
    openingBalance: String(a.openingBalance / 100).replace(".", ","),
    color: a.color ?? "blue",
  };
}

type FieldErrors = Partial<Record<keyof FormState, string>>;

export function BankAccountsManager({ accounts }: { accounts: BankAccountItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null); // null = nincs szerkesztés
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const openCreate = () => {
    setForm(EMPTY_FORM); setFieldErrors({}); setError(null);
    setEditingId(null); setCreating(true);
  };
  const openEdit = (a: BankAccountItem) => {
    setForm(toForm(a)); setFieldErrors({}); setError(null);
    setCreating(false); setEditingId(a.id);
  };
  const closeForm = () => { setCreating(false); setEditingId(null); setFieldErrors({}); };

  const validate = (): FieldErrors => {
    const errs: FieldErrors = {};
    if (!form.name.trim()) errs.name = "A név kötelező";
    if (!isValidAmount(form.openingBalance)) errs.openingBalance = "Érvénytelen összeg";
    const acc = form.accountNumber.replace(/\s+/g, "");
    if (acc && !/^[\d-]{17,26}$/.test(acc)) {
      errs.accountNumber = "16 vagy 24 számjegy, kötőjelekkel tagolva (pl. 11773016-11111018)";
    }
    const iban = form.iban.replace(/\s+/g, "").toUpperCase();
    if (iban && !/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) {
      errs.iban = "Érvénytelen IBAN — pl. HU42117730161111101800000000";
    }
    const swift = form.swift.replace(/\s+/g, "").toUpperCase();
    if (swift && !/^[A-Z0-9]{8,11}$/.test(swift)) errs.swift = "Érvénytelen SWIFT/BIC kód";
    return errs;
  };

  const submit = async () => {
    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setBusy(true);
    setError(null);
    const payload = {
      name: form.name.trim(),
      bankName: form.bankName.trim(),
      accountNumber: form.accountNumber.trim(),
      iban: form.iban.trim(),
      swift: form.swift.trim(),
      currency: form.currency,
      openingBalance: parseMajor(form.openingBalance),
      color: form.color,
    };
    const res = await fetch(editingId ? `/api/bank-accounts/${editingId}` : "/api/bank-accounts", {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (res.ok) {
      closeForm();
      router.refresh();
    } else {
      const json = await res.json().catch(() => null);
      const serverFields = json?.details?.fieldErrors as Record<string, string[]> | undefined;
      if (serverFields) {
        const mapped: FieldErrors = {};
        for (const [key, messages] of Object.entries(serverFields)) {
          if (messages?.[0]) mapped[key as keyof FormState] = messages[0];
        }
        setFieldErrors(mapped);
      }
      setError(json?.error ?? "A mentés nem sikerült");
    }
  };

  const toggleActive = async (a: BankAccountItem) => {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/bank-accounts/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !a.isActive }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
    else setError((await res.json().catch(() => null))?.error ?? "A módosítás nem sikerült");
  };

  const remove = async (a: BankAccountItem) => {
    if (!confirm(`Biztosan törlöd a(z) „${a.name}” bankszámlát?`)) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/bank-accounts/${a.id}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) router.refresh();
    else setError((await res.json().catch(() => null))?.error ?? "A törlés nem sikerült");
  };

  const formBlock = (
    <div className="flex flex-col gap-2 pt-2 border-t" style={{ borderColor: "var(--divider)" }}>
      <div className="grid sm:grid-cols-2 gap-2">
        <Field label="Név *" error={fieldErrors.name}>
          <input className="input" value={form.name} onChange={(e) => set("name", e.target.value)}
            placeholder="pl. OTP folyószámla" />
        </Field>
        <Field label="Bank neve" error={fieldErrors.bankName}>
          <input className="input" value={form.bankName} onChange={(e) => set("bankName", e.target.value)}
            placeholder="pl. OTP Bank" />
        </Field>
        <Field label="Számlaszám" error={fieldErrors.accountNumber}>
          <input className="input" value={form.accountNumber} onChange={(e) => set("accountNumber", e.target.value)}
            placeholder="11773016-11111018" />
        </Field>
        <Field label="IBAN" error={fieldErrors.iban}>
          <input className="input" value={form.iban} onChange={(e) => set("iban", e.target.value)}
            placeholder="HU42117730161111101800000000" />
        </Field>
        <Field label="SWIFT / BIC" error={fieldErrors.swift}>
          <input className="input" value={form.swift} onChange={(e) => set("swift", e.target.value)}
            placeholder="OTPVHUHB" />
        </Field>
        <Field label="Deviza" error={fieldErrors.currency}>
          <select className="input" value={form.currency}
            onChange={(e) => set("currency", e.target.value as Currency)}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Nyitó egyenleg" error={fieldErrors.openingBalance}>
          <input className="input num" value={form.openingBalance}
            onChange={(e) => set("openingBalance", e.target.value)} placeholder="1 234 567,89" />
        </Field>
        <Field label="Szín" error={fieldErrors.color}>
          <select className="input" value={form.color} onChange={(e) => set("color", e.target.value)}>
            {PALETTE.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
      </div>
      <div className="flex items-center gap-2">
        <button className="btn-primary" disabled={busy} onClick={submit}>
          {busy ? "Mentés…" : "Mentés"}
        </button>
        <button className="btn-text" onClick={closeForm}>Mégse</button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {accounts.length === 0 ? (
          <p className="text-[13px]" style={{ color: "var(--text-tertiary)" }}>
            Még nincs bankszámla. Vegyél fel egyet, hogy tudj kivonatot importálni.
          </p>
        ) : (
          accounts.map((a) => (
            <div key={a.id} className="flex flex-col gap-1">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: `var(--${a.color ?? "gray"})` }} />
                  <span className="font-medium text-[14px]">{a.name}</span>
                  {a.bankName && (
                    <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>{a.bankName}</span>
                  )}
                  {!a.isActive && (
                    <span className="badge" style={{ background: "var(--gray-bg)", color: "var(--gray)" }}>
                      Inaktív
                    </span>
                  )}
                </span>
                <span className="num text-[14px]">{formatMoney(a.currentBalance, a.currency as Currency)}</span>
              </div>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                  {[a.iban || a.accountNumber, a.currency].filter(Boolean).join(" · ")}
                </span>
                <span className="flex items-center gap-1 shrink-0">
                  <button className="btn-text px-2" disabled={busy} onClick={() => openEdit(a)}>Szerkesztés</button>
                  <button className="btn-text px-2" disabled={busy} onClick={() => toggleActive(a)}>
                    {a.isActive ? "Deaktiválás" : "Aktiválás"}
                  </button>
                  <button className="btn-text px-2" disabled={busy}
                    aria-label={`Bankszámla törlése: ${a.name}`} onClick={() => remove(a)}>
                    Törlés
                  </button>
                </span>
              </div>
              {editingId === a.id && formBlock}
            </div>
          ))
        )}
      </div>

      {creating ? formBlock : (
        <button className="btn-secondary self-start" onClick={openCreate}>+ Új bankszámla</button>
      )}

      <ServerError message={error} />
    </div>
  );
}
