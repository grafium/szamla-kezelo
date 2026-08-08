"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Egy kattintásos párosítás-megerősítés + kézi számlaválasztás.

export function MatchActions({ transactionId, suggestions, allInvoices }: {
  transactionId: string;
  suggestions: { invoiceId: string; score: number; label: string }[];
  allInvoices: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [manualOpen, setManualOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);

  const act = async (action: "match" | "ignore", invoiceId?: string) => {
    setBusy(true);
    const res = await fetch("/api/matching", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId, invoiceId, action }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
  };

  return (
    <div className="flex flex-col gap-1.5">
      {suggestions.map((s) => (
        <div key={s.invoiceId} className="flex items-center justify-between gap-2">
          <span className="text-[13px] truncate">
            <span className="badge mr-2"
              style={{
                background: s.score >= 0.85 ? "var(--green-bg)" : "var(--yellow-bg)",
                color: s.score >= 0.85 ? "var(--green)" : "var(--yellow)",
              }}>
              {Math.round(s.score * 100)}%
            </span>
            {s.label}
          </span>
          <button className="btn-primary shrink-0" disabled={busy} onClick={() => act("match", s.invoiceId)}>
            Párosítás
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2 pt-1">
        {!manualOpen ? (
          <>
            <button className="btn-text" onClick={() => setManualOpen(true)}>Kézi párosítás…</button>
            <button className="btn-text" disabled={busy} onClick={() => act("ignore")}>Figyelmen kívül hagyás</button>
          </>
        ) : (
          <>
            <select className="input flex-1" value={selected} onChange={(e) => setSelected(e.target.value)}>
              <option value="">Válassz számlát…</option>
              {allInvoices.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
            </select>
            <button className="btn-primary shrink-0" disabled={!selected || busy} onClick={() => act("match", selected)}>
              Párosítás
            </button>
            <button className="btn-text shrink-0" onClick={() => setManualOpen(false)}>Mégse</button>
          </>
        )}
      </div>
    </div>
  );
}
