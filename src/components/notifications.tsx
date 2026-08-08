"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { REMINDER_TYPE_COLORS, REMINDER_TYPE_LABELS } from "@/lib/constants";

// Harang ikon + értesítési panel a fejlécben (D csomag).
// Betöltéskor és megnyitáskor kérdezi le a GET /api/notifications végpontot,
// a műveletek a meglévő PATCH /api/reminders/[id] végpontot hívják.

interface NotificationItem {
  id: string;
  type: string;
  entityType: string;
  entityId: string;
  message: string;
  triggerDate: string;
  status: string;
  urgent: boolean;
}

function formatDateHu(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}. ${pad(d.getMonth() + 1)}. ${pad(d.getDate())}.`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
      setUnreadCount(typeof data.unreadCount === "number" ? data.unreadCount : 0);
    } catch {
      // hálózati hiba — a panel üres marad
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!open) return;
    load();
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, load]);

  const act = async (id: string, action: "paid" | "snooze" | "dismiss") => {
    setBusyId(id);
    await fetch(`/api/reminders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusyId(null);
    load();
  };

  // Csoportosítás: Ma / Ezen a héten / Később (kliensoldalon, az API válaszából)
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(today.getTime() + 24 * 3600 * 1000);
  const dow = (today.getDay() + 6) % 7; // hétfő = 0
  const weekEnd = new Date(today.getTime() + (7 - dow) * 24 * 3600 * 1000);

  const sorted = [...items].sort((a, b) => Number(b.urgent) - Number(a.urgent));
  const groups: { title: string; items: NotificationItem[] }[] = [
    { title: "Ma", items: sorted.filter((i) => new Date(i.triggerDate) < endOfToday) },
    {
      title: "Ezen a héten",
      items: sorted.filter((i) => {
        const d = new Date(i.triggerDate);
        return d >= endOfToday && d < weekEnd;
      }),
    },
    { title: "Később", items: sorted.filter((i) => new Date(i.triggerDate) >= weekEnd) },
  ].filter((g) => g.items.length > 0);

  return (
    <div ref={rootRef} className="relative">
      <button
        className="btn-text px-2 relative"
        aria-label="Értesítések"
        title="Értesítések"
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden>🔔</span>
        {unreadCount > 0 && (
          <span
            className="badge absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 justify-center text-[10px] leading-none"
            style={{ background: "var(--red)", color: "#fff" }}
          >
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-[400px] max-w-[92vw] rounded-lg overflow-hidden z-50"
          style={{ background: "var(--bg)", boxShadow: "var(--shadow-md)", border: "1px solid var(--border)" }}
          role="dialog"
          aria-label="Értesítési panel"
        >
          <div className="px-4 py-2.5 border-b flex items-center justify-between" style={{ borderColor: "var(--divider)" }}>
            <span className="font-semibold text-[14px]">Értesítések</span>
            {unreadCount > 0 && (
              <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                {unreadCount} olvasatlan
              </span>
            )}
          </div>

          <div className="max-h-[380px] overflow-y-auto py-1">
            {groups.length === 0 && (
              <div className="px-4 py-8 text-center text-[13px]" style={{ color: "var(--text-tertiary)" }}>
                Nincs értesítés a következő 7 napra
              </div>
            )}
            {groups.map((g) => (
              <div key={g.title}>
                <div className="label-upper px-4 pt-2 pb-1">{g.title}</div>
                {g.items.map((item) => (
                  <div
                    key={item.id}
                    className="px-4 py-2 flex flex-col gap-1 hover:bg-[var(--bg-hover)]"
                    style={item.urgent ? { borderLeft: "2px solid var(--red)" } : undefined}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="badge shrink-0"
                        style={{
                          background: `var(--${REMINDER_TYPE_COLORS[item.type] ?? "gray"}-bg)`,
                          color: `var(--${REMINDER_TYPE_COLORS[item.type] ?? "gray"})`,
                        }}
                      >
                        {REMINDER_TYPE_LABELS[item.type] ?? item.type}
                      </span>
                      {item.urgent && (
                        <span className="badge shrink-0" style={{ background: "var(--red-bg)", color: "var(--red)" }}>
                          nagy összeg
                        </span>
                      )}
                      <span className="text-[12px] ml-auto shrink-0" style={{ color: "var(--text-tertiary)" }}>
                        {formatDateHu(item.triggerDate)}
                      </span>
                    </div>
                    <div className="text-[13px]">{item.message}</div>
                    <div className="flex gap-1">
                      {(item.type === "INVOICE_DUE" || item.type === "INVOICE_OVERDUE" || item.type === "SUBSCRIPTION_RENEWAL") && (
                        <button
                          className="btn-text"
                          disabled={busyId === item.id}
                          title="Megjelöltem kifizetettként"
                          onClick={() => act(item.id, "paid")}
                        >
                          ✓ Kifizetve
                        </button>
                      )}
                      <button
                        className="btn-text"
                        disabled={busyId === item.id}
                        title="Halasztás 3 nappal"
                        onClick={() => act(item.id, "snooze")}
                      >
                        ◷ +3 nap
                      </button>
                      <button
                        className="btn-text"
                        disabled={busyId === item.id}
                        title="Elrejtés"
                        onClick={() => act(item.id, "dismiss")}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="px-4 py-2.5 border-t" style={{ borderColor: "var(--divider)" }}>
            <Link
              href="/emlekeztetok"
              className="text-[13px] font-medium"
              style={{ color: "var(--blue)" }}
              onClick={() => setOpen(false)}
            >
              Összes emlékeztető →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
