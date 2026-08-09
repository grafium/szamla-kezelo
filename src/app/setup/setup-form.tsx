"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field, ServerError } from "@/components/forms/shared";
import { CURRENCIES } from "@/lib/constants";

// Első-indítási űrlap: POST /api/setup → siker esetén /login?uj=1.

type FieldErrors = Partial<Record<
  "orgName" | "taxNumber" | "baseCurrency" | "adminName" | "adminEmail" | "password" | "password2" | "token",
  string
>>;

/**
 * tokenRequired: a szerveren be van állítva a SETUP_TOKEN, tehát a telepítés
 * csak a kulcs megadásával indul el.
 */
export function SetupForm({ tokenRequired = false }: { tokenRequired?: boolean }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [orgName, setOrgName] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [baseCurrency, setBaseCurrency] = useState("HUF");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: FieldErrors = {};
    if (!orgName.trim()) errs.orgName = "A cégnév kötelező";
    if (taxNumber.trim() && !/^\d{8}-\d-\d{2}$/.test(taxNumber.trim())) {
      errs.taxNumber = "Érvénytelen adószám — a helyes formátum: 12345678-1-42";
    }
    if (!adminName.trim()) errs.adminName = "A név kötelező";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail.trim())) {
      errs.adminEmail = "Érvénytelen e-mail cím";
    }
    if (password.length < 8) errs.password = "A jelszó legalább 8 karakter legyen";
    if (password2 !== password) errs.password2 = "A két jelszó nem egyezik";
    if (tokenRequired && !token.trim()) errs.token = "A telepítési kulcs kötelező";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setBusy(true);
    setServerError(null);
    const res = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orgName: orgName.trim(),
        taxNumber: taxNumber.trim(),
        baseCurrency,
        adminName: adminName.trim(),
        adminEmail: adminEmail.trim(),
        password,
        ...(tokenRequired ? { token: token.trim() } : {}),
      }),
    });
    if (res.ok) {
      router.push("/login?uj=1");
      return;
    }
    setBusy(false);
    const payload = await res.json().catch(() => null);
    setServerError(payload?.error ?? "A beállítás nem sikerült");
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      {tokenRequired && (
        <Field label="Telepítési kulcs *" error={errors.token}>
          <input
            className="input"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="a SETUP_TOKEN értéke"
            autoComplete="off"
          />
        </Field>
      )}
      <Field label="Cégnév *" error={errors.orgName}>
        <input className="input" value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Példa Kft." />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Adószám" error={errors.taxNumber}>
          <input className="input" value={taxNumber} onChange={(e) => setTaxNumber(e.target.value)} placeholder="12345678-1-42" />
        </Field>
        <Field label="Alapdeviza" error={errors.baseCurrency}>
          <select className="input" value={baseCurrency} onChange={(e) => setBaseCurrency(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Admin név *" error={errors.adminName}>
        <input className="input" value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="Kovács Anna" />
      </Field>
      <Field label="Admin e-mail *" error={errors.adminEmail}>
        <input className="input" type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="anna@pelda.hu" />
      </Field>
      <Field label="Jelszó (min. 8 karakter) *" error={errors.password}>
        <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Field label="Jelszó újra *" error={errors.password2}>
        <input className="input" type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} />
      </Field>
      <button type="submit" className="btn-primary justify-center" disabled={busy}>
        {busy ? "Létrehozás…" : "Szervezet és fiók létrehozása"}
      </button>
      <ServerError message={serverError} />
    </form>
  );
}
