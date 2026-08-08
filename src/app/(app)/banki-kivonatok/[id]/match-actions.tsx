"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseMajor, isValidAmount } from "@/components/forms/shared";
import { formatMoney } from "@/lib/money";
import type { Currency } from "@/lib/constants";

// Egy kattintásos párosítás-megerősítés + kézi számlaválasztás +
// felosztás több számla között + párosítási szabály mentése.

type Mode = null | "manual" | "split" | "rule";

interface SplitRow {
  invoiceId: string;
  amount: string; // fő egységben, vessző is jó
}

export function MatchActions({
  transactionId, suggestions, allInvoices,
  txAmount, txCurrency, reference, counterpartyName, partners,
}: {
  transactionId: string;
  suggestions: { invoiceId: string; score: number; label: string }[];
  allInvoices: { id: string; label: string }[];
  txAmount: number; // előjeles, minor unit
  txCurrency: string;
  reference: string | null;
  counterpartyName: string | null;
  partners: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [splitRows, setSplitRows] = useState<SplitRow[]>([
    { invoiceId: "", amount: "" },
    { invoiceId: "", amount: "" },
  ]);

  const [ruleName, setRuleName] = useState(counterpartyName ?? "");
  const [rulePattern, setRulePattern] = useState(reference ?? "");
  const [rulePartnerId, setRulePartnerId] = useState("");
  const [ruleSaved, setRuleSaved] = useState(false);

  const act = async (action: "match" | "ignore", invoiceId?: string) => {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/matching", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId, invoiceId, action }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
    else setError((await res.json().catch(() => null))?.error ?? "Hiba történt");
  };

  // --- Felosztás ---
  const absAmount = Math.abs(txAmount);
  const splitSum = splitRows.reduce(
    (s, r) => s + (isValidAmount(r.amount) ? parseMajor(r.amount) : 0), 0
  );
  const splitValid =
    splitRows.length >= 2 &&
    splitRows.every((r) => r.invoiceId && isValidAmount(r.amount) && parseMajor(r.amount) > 0) &&
    splitSum <= absAmount;

  const submitSplit = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/matching", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transactionId,
        action: "split",
        parts: splitRows.map((r) => ({ invoiceId: r.invoiceId, amount: parseMajor(r.amount) })),
      }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
    else setError((await res.json().catch(() => null))?.error ?? "A felosztás nem sikerült");
  };

  const submitRule = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/matching-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: ruleName.trim() || rulePattern.trim(),
        referenceContains: rulePattern.trim(),
        partnerId: rulePartnerId || undefined,
      }),
    });
    setBusy(false);
    if (res.ok) {
      setRuleSaved(true);
      setMode(null);
      router.refresh();
    } else {
      setError((await res.json().catch(() => null))?.error ?? "A szabály mentése nem sikerült");
    }
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

      {mode === null && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button className="btn-text" onClick={() => setMode("manual")}>Kézi párosítás…</button>
          <button className="btn-text" onClick={() => setMode("split")}>Felosztás…</button>
          <button className="btn-text" onClick={() => setMode("rule")}>
            {ruleSaved ? "Szabály mentve ✓" : "Szabály mentése…"}
          </button>
          <button className="btn-text" disabled={busy} onClick={() => act("ignore")}>Figyelmen kívül hagyás</button>
        </div>
      )}

      {mode === "manual" && (
        <div className="flex items-center gap-2 pt-1">
          <select className="input flex-1" value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">Válassz számlát…</option>
            {allInvoices.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
          </select>
          <button className="btn-primary shrink-0" disabled={!selected || busy} onClick={() => act("match", selected)}>
            Párosítás
          </button>
          <button className="btn-text shrink-0" onClick={() => setMode(null)}>Mégse</button>
        </div>
      )}

      {mode === "split" && (
        <div className="flex flex-col gap-2 pt-1">
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            A banki tétel ({formatMoney(txAmount, txCurrency as Currency)}) felosztása több számla között.
            Az összegek fő egységben (pl. 12500 vagy 49,99).
          </p>
          {splitRows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <select
                className="input flex-1"
                value={r.invoiceId}
                onChange={(e) =>
                  setSplitRows((rows) => rows.map((x, j) => (j === i ? { ...x, invoiceId: e.target.value } : x)))
                }
              >
                <option value="">Válassz számlát…</option>
                {allInvoices.map((inv) => <option key={inv.id} value={inv.id}>{inv.label}</option>)}
              </select>
              <input
                className="input w-[120px]"
                placeholder="Összeg"
                value={r.amount}
                onChange={(e) =>
                  setSplitRows((rows) => rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))
                }
              />
              {splitRows.length > 2 && (
                <button
                  className="btn-text px-2"
                  aria-label="Sor törlése"
                  onClick={() => setSplitRows((rows) => rows.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-text" onClick={() => setSplitRows((rows) => [...rows, { invoiceId: "", amount: "" }])}>
              + További számla
            </button>
            <span className="text-[12px] num" style={{ color: splitSum > absAmount ? "var(--red)" : "var(--text-tertiary)" }}>
              Felosztva: {formatMoney(splitSum, txCurrency as Currency)} / {formatMoney(absAmount, txCurrency as Currency)}
            </span>
          </div>
          {splitSum > absAmount && (
            <p className="text-[12px]" style={{ color: "var(--red)" }}>
              A felosztott összegek nem haladhatják meg a banki tétel összegét.
            </p>
          )}
          <div className="flex items-center gap-2">
            <button className="btn-primary" disabled={!splitValid || busy} onClick={submitSplit}>
              Felosztás mentése
            </button>
            <button className="btn-text" onClick={() => setMode(null)}>Mégse</button>
          </div>
        </div>
      )}

      {mode === "rule" && (
        <div className="flex flex-col gap-2 pt-1">
          <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            Ha a közlemény tartalmazza a mintát, a jövőbeli importok automatikusan megkapják a partnert.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              className="input flex-1"
              placeholder="Szabály neve"
              value={ruleName}
              onChange={(e) => setRuleName(e.target.value)}
            />
            <input
              className="input flex-1"
              placeholder="Közlemény tartalmazza…"
              value={rulePattern}
              onChange={(e) => setRulePattern(e.target.value)}
            />
            <select className="input flex-1" value={rulePartnerId} onChange={(e) => setRulePartnerId(e.target.value)}>
              <option value="">Partner (nem kötelező)</option>
              {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-primary" disabled={rulePattern.trim().length < 2 || busy} onClick={submitRule}>
              Szabály mentése
            </button>
            <button className="btn-text" onClick={() => setMode(null)}>Mégse</button>
          </div>
        </div>
      )}

      {error && <p className="text-[12px]" style={{ color: "var(--red)" }}>{error}</p>}
    </div>
  );
}
