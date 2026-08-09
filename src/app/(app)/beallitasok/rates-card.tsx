"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui";
import { ServerError } from "@/components/forms/shared";

// Devizaárfolyamok kártya: a tárolt párok legfrissebb értéke + kézi frissítés
// (POST /api/rates/refresh, ugyanaz a logika, mint a napi cronban).

export interface RateItem {
  pair: string;
  rate: string | null;
  date: string | null;
  source: string | null;
}

const SOURCE_COLORS: Record<string, string> = { MNB: "blue", ECB: "purple", MANUAL: "gray" };

export function RatesCard({ rates }: { rates: RateItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    const res = await fetch("/api/rates/refresh", { method: "POST" });
    const json = await res.json().catch(() => null);
    setBusy(false);
    if (res.ok) {
      setMessage(
        `${json?.upserted ?? 0} árfolyam frissült (forrás: ${json?.source ?? "—"})` +
          (json?.bootstrapped ? " — üres tábla, 90 nap visszatöltve" : "") +
          (json?.carriedForward ? `, ${json.carriedForward} pár továbbvive a mai napra` : "")
      );
      router.refresh();
    } else {
      setError(json?.error ?? "Az árfolyamok frissítése nem sikerült");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {rates.map((r) => (
          <div key={r.pair} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 min-w-0">
              <span className="font-medium text-[14px]">{r.pair}</span>
              {r.source && <Badge color={SOURCE_COLORS[r.source] ?? "gray"}>{r.source}</Badge>}
            </span>
            <span className="flex items-baseline gap-2">
              <span className="num text-[14px]">{r.rate ?? "–"}</span>
              <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>{r.date ?? "nincs adat"}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button className="btn-secondary" disabled={busy} onClick={refresh}>
          {busy ? "Frissítés…" : "Frissítés most"}
        </button>
        {message && (
          <span className="text-[13px]" style={{ color: "var(--text-secondary)" }}>{message}</span>
        )}
      </div>

      <p className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
        Forrás: MNB (EUR/HUF, USD/HUF) és ECB (EUR/USD). Hétvégén és ünnepnapon az utolsó
        munkanapi árfolyam érvényes.
      </p>

      <ServerError message={error} />
    </div>
  );
}
