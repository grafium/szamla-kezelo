"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field, ServerError } from "@/components/forms/shared";

// Párosítási szabályok kezelése: lista törléssel + új szabály űrlap.

export interface RuleItem {
  id: string;
  name: string;
  referenceContains: string;
  partnerName: string | null;
  categoryName: string | null;
}

export function MatchingRulesManager({ rules, partners, categories }: {
  rules: RuleItem[];
  partners: { id: string; name: string }[];
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [pattern, setPattern] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [categoryId, setCategoryId] = useState("");

  const remove = async (id: string) => {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/matching-rules/${id}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) router.refresh();
    else setError((await res.json().catch(() => null))?.error ?? "A törlés nem sikerült");
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/matching-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim() || pattern.trim(),
        referenceContains: pattern.trim(),
        partnerId: partnerId || undefined,
        categoryId: categoryId || undefined,
      }),
    });
    setBusy(false);
    if (res.ok) {
      setName(""); setPattern(""); setPartnerId(""); setCategoryId("");
      setFormOpen(false);
      router.refresh();
    } else {
      setError((await res.json().catch(() => null))?.error ?? "A mentés nem sikerült");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {rules.length === 0 ? (
          <p className="text-[13px]" style={{ color: "var(--text-tertiary)" }}>Nincs mentett szabály.</p>
        ) : (
          rules.map((r) => (
            <div key={r.id} className="flex items-start justify-between gap-2">
              <div className="text-[13px] min-w-0">
                <span className="font-medium">{r.name}</span>
                <span style={{ color: "var(--text-secondary)" }}> — ha a közlemény tartalmazza: </span>
                <code>{r.referenceContains}</code>
                {(r.partnerName || r.categoryName) && (
                  <span className="block text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                    → {[r.partnerName, r.categoryName].filter(Boolean).join(" · ")}
                  </span>
                )}
              </div>
              <button
                className="btn-text px-2 shrink-0"
                disabled={busy}
                aria-label={`Szabály törlése: ${r.name}`}
                onClick={() => remove(r.id)}
              >
                Törlés
              </button>
            </div>
          ))
        )}
      </div>

      {!formOpen ? (
        <button className="btn-secondary self-start" onClick={() => setFormOpen(true)}>+ Új szabály</button>
      ) : (
        <div className="flex flex-col gap-2 pt-1 border-t" style={{ borderColor: "var(--divider)" }}>
          <div className="grid sm:grid-cols-2 gap-2 pt-2">
            <Field label="Név">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="pl. Google Cloud terhelések" />
            </Field>
            <Field label="Közlemény tartalmazza *">
              <input className="input" value={pattern} onChange={(e) => setPattern(e.target.value)}
                placeholder="pl. GOOGLE CLOUD" />
            </Field>
            <Field label="Partner">
              <select className="input" value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
                <option value="">— nincs —</option>
                {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Kategória">
              <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">— nincs —</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-primary" disabled={pattern.trim().length < 2 || busy} onClick={create}>
              Mentés
            </button>
            <button className="btn-text" onClick={() => setFormOpen(false)}>Mégse</button>
          </div>
        </div>
      )}

      <ServerError message={error} />
    </div>
  );
}
