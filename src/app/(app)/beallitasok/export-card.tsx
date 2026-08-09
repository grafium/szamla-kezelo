"use client";

import { useState } from "react";

// Adatexport: teljes JSON-mentés + entitásonkénti CSV-letöltés.
// A letöltést maga az API végzi (Content-Disposition: attachment).

const ENTITIES: { id: string; label: string }[] = [
  { id: "invoices", label: "Számlák" },
  { id: "subscriptions", label: "Előfizetések" },
  { id: "partners", label: "Partnerek" },
  { id: "purchases", label: "Vásárlások" },
  { id: "payments", label: "Kifizetések" },
  { id: "bank-transactions", label: "Banki tételek" },
];

export function ExportCard() {
  const [entity, setEntity] = useState("invoices");

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
        Teljes szervezeti mentés egyetlen JSON-fájlban, vagy entitásonkénti CSV
        (pontosvesszős, Excel-kompatibilis, magyar fejlécekkel).
      </p>
      <div>
        <a href="/api/export?format=json" className="btn-primary inline-flex">
          Teljes mentés (JSON)
        </a>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <select
          className="input max-w-[220px]"
          value={entity}
          onChange={(e) => setEntity(e.target.value)}
          aria-label="Exportálandó entitás"
        >
          {ENTITIES.map((e) => (
            <option key={e.id} value={e.id}>{e.label}</option>
          ))}
        </select>
        <a
          href={`/api/export?entity=${entity}&format=csv`}
          className="btn-secondary inline-flex"
        >
          CSV letöltése
        </a>
      </div>
    </div>
  );
}
