"use client";

import { useState } from "react";
import { Field, ServerError } from "@/components/forms/shared";

// Értesítési beállítások (9.3): e-mail ki/be, összeghatár (fő egységben, HUF),
// csendes kategóriák és csendes partnerek. Mentés → PATCH /api/notification-prefs.

export interface PrefsInitial {
  email: boolean;
  amountThreshold: number | null; // minor unit
  quietCategoryIds: string[];
  quietPartnerIds: string[];
}

export function NotificationPrefsForm({ initial, partners, categories }: {
  initial: PrefsInitial;
  partners: { id: string; name: string }[];
  categories: { id: string; name: string }[];
}) {
  const [email, setEmail] = useState(initial.email);
  const [threshold, setThreshold] = useState(
    initial.amountThreshold != null ? String(Math.round(initial.amountThreshold / 100)) : ""
  );
  const [quietCategoryIds, setQuietCategoryIds] = useState<string[]>(initial.quietCategoryIds);
  const [quietPartnerIds, setQuietPartnerIds] = useState<string[]>(initial.quietPartnerIds);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (list: string[], setList: (v: string[]) => void, id: string) => {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    const trimmed = threshold.trim().replace(/\s+/g, "").replace(",", ".");
    const major = trimmed === "" ? null : Number(trimmed);
    if (major != null && (!Number.isFinite(major) || major < 0)) {
      setError("Érvénytelen összeghatár");
      setBusy(false);
      return;
    }
    const res = await fetch("/api/notification-prefs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        amountThreshold: major != null ? Math.round(major * 100) : null, // fő egység → minor unit
        quietCategoryIds,
        quietPartnerIds,
      }),
    });
    setBusy(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } else {
      setError((await res.json().catch(() => null))?.error ?? "A mentés nem sikerült");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2 text-[14px]">
        <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} />
        E-mail összefoglalók küldése (napi + heti)
      </label>

      <Field label="Összeghatár (Ft) — efölött „nagy összeg” jelölés">
        <input
          className="input"
          inputMode="numeric"
          placeholder="pl. 100 000"
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
        />
      </Field>

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Csendes kategóriák">
          <div
            className="flex flex-col gap-1 max-h-[160px] overflow-y-auto rounded-md border p-2"
            style={{ borderColor: "var(--border)" }}
          >
            {categories.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={quietCategoryIds.includes(c.id)}
                  onChange={() => toggle(quietCategoryIds, setQuietCategoryIds, c.id)}
                />
                {c.name}
              </label>
            ))}
          </div>
        </Field>
        <Field label="Csendes partnerek">
          <div
            className="flex flex-col gap-1 max-h-[160px] overflow-y-auto rounded-md border p-2"
            style={{ borderColor: "var(--border)" }}
          >
            {partners.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={quietPartnerIds.includes(p.id)}
                  onChange={() => toggle(quietPartnerIds, setQuietPartnerIds, p.id)}
                />
                {p.name}
              </label>
            ))}
          </div>
        </Field>
      </div>

      <p className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
        A csendes listákra illő tételek nem jelennek meg a harang-panelben és a napi összefoglalóban.
      </p>

      <div className="flex items-center gap-2">
        <button className="btn-primary" disabled={busy} onClick={save}>
          {busy ? "Mentés…" : "Mentés"}
        </button>
        {saved && (
          <span className="badge" style={{ background: "var(--green-bg)", color: "var(--green)" }}>
            Elmentve
          </span>
        )}
      </div>
      <ServerError message={error} />
    </div>
  );
}
