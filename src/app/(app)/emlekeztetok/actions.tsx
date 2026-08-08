"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Emlékeztető műveletgombok (9.2): kifizetettnek jelölés, halasztás 3 nappal, elrejtés.

export function ReminderActions({ reminderId, type, entityType, entityId }: {
  reminderId: string; type: string; entityType: string; entityId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const act = async (action: string) => {
    setBusy(true);
    await fetch(`/api/reminders/${reminderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusy(false);
    router.refresh();
  };

  return (
    <div className="flex gap-1">
      {(type === "INVOICE_DUE" || type === "INVOICE_OVERDUE" || type === "SUBSCRIPTION_RENEWAL") && (
        <button className="btn-text" disabled={busy} onClick={() => act("paid")}
          title="Megjelöltem kifizetettként">✓ Kifizetve</button>
      )}
      <button className="btn-text" disabled={busy} onClick={() => act("snooze")}
        title="Halasztás 3 nappal">◷ +3 nap</button>
      <button className="btn-text" disabled={busy} onClick={() => act("dismiss")}
        title="Elrejtés">×</button>
    </div>
  );
}
