"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { INVOICE_STATUSES, INVOICE_STATUS_LABELS } from "@/lib/constants";

// Oldalszintű tömeges műveletek: a szűrt + lapozott lista összes látható
// számlájára hatnak (soronkénti kijelölés RSC-táblával nem megoldható egyszerűen).

export function BulkBar({ ids, categoryOptions }: {
  ids: string[];
  categoryOptions: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState("PAID");
  const [categoryId, setCategoryId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: "status" | "category" | "delete", value?: string) => {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/invoices/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, action, value }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Hiba történt a művelet közben");
      return;
    }
    router.refresh();
  };

  return (
    <div className="card p-3 mb-3 flex flex-wrap items-center gap-3">
      <span className="label-upper">Műveletek az oldalon látható {ids.length} számlára</span>

      <div className="flex items-center gap-1.5">
        <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}
          aria-label="Új státusz" disabled={busy}>
          {INVOICE_STATUSES.map((s) => <option key={s} value={s}>{INVOICE_STATUS_LABELS[s]}</option>)}
        </select>
        <button className="btn-secondary" disabled={busy} onClick={() => run("status", status)}>Alkalmaz</button>
      </div>

      <div className="flex items-center gap-1.5">
        <select className="input w-auto" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
          aria-label="Új kategória" disabled={busy}>
          <option value="">Kategória nélkül</option>
          {categoryOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="btn-secondary" disabled={busy} onClick={() => run("category", categoryId || undefined)}>
          Alkalmaz
        </button>
      </div>

      <button className="btn-secondary" disabled={busy} onClick={() => run("status", "PAID")}>
        Kifizetettnek jelöl
      </button>

      <button className="btn-text" style={{ color: "var(--red)" }} disabled={busy}
        onClick={() => {
          if (confirm(`Biztosan törlöd az oldalon látható ${ids.length} számlát?`)) run("delete");
        }}>
        Törlés
      </button>

      {error && (
        <span className="badge" style={{ background: "var(--red-bg)", color: "var(--red)" }}>{error}</span>
      )}
    </div>
  );
}
