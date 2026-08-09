"use client";

import { useState } from "react";
import { Field, ServerError } from "@/components/forms/shared";

// Jelszó módosítása — PATCH /api/password (csak valódi sessionnel).

export function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [next2, setNext2] = useState("");
  const [errors, setErrors] = useState<{ next?: string; next2?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: { next?: string; next2?: string } = {};
    if (next.length < 8) errs.next = "Az új jelszó legalább 8 karakter legyen";
    if (next2 !== next) errs.next2 = "A két jelszó nem egyezik";
    setErrors(errs);
    setSaved(false);
    if (Object.keys(errs).length > 0) return;

    setBusy(true);
    setServerError(null);
    const res = await fetch("/api/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    });
    setBusy(false);
    if (res.ok) {
      setSaved(true);
      setCurrent("");
      setNext("");
      setNext2("");
      setTimeout(() => setSaved(false), 3000);
    } else {
      setServerError((await res.json().catch(() => null))?.error ?? "A mentés nem sikerült");
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <Field label="Jelenlegi jelszó">
        <input className="input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
      </Field>
      <Field label="Új jelszó (min. 8 karakter)" error={errors.next}>
        <input className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
      </Field>
      <Field label="Új jelszó újra" error={errors.next2}>
        <input className="input" type="password" value={next2} onChange={(e) => setNext2(e.target.value)} autoComplete="new-password" />
      </Field>
      <div className="flex items-center gap-2">
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "Mentés…" : "Jelszó módosítása"}
        </button>
        {saved && (
          <span className="badge" style={{ background: "var(--green-bg)", color: "var(--green)" }}>
            Elmentve
          </span>
        )}
      </div>
      <ServerError message={serverError} />
    </form>
  );
}
