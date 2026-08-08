"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Condition, FieldDef, FilterGroup, Operator } from "@/lib/filters/types";
import { isGroup, OPERATOR_LABELS, OPERATORS_BY_TYPE } from "@/lib/filters/types";

// Kombinálható szűrőfelület (7.1): gyorsszűrő chipek + "+ Szűrő" popover +
// aktív szűrő chipek + mentett nézetek. Az állapot az URL ?f= paraméterében él.

export interface QuickFilter {
  label: string;
  group: FilterGroup;
}

export function FilterBar({
  fields,
  quickFilters = [],
  savedViews = [],
  entityType,
}: {
  fields: FieldDef[];
  quickFilters?: QuickFilter[];
  savedViews?: { id: string; name: string; filterJson: string }[];
  entityType: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);

  const current: FilterGroup | null = useMemo(() => {
    const raw = params.get("f");
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }, [params]);

  const apply = (group: FilterGroup | null) => {
    const next = new URLSearchParams(params.toString());
    if (group && group.items.length > 0) next.set("f", JSON.stringify(group));
    else next.delete("f");
    next.delete("oldal");
    startTransition(() => router.push(`${pathname}?${next.toString()}`));
  };

  const conditions = (current?.items.filter((i) => !isGroup(i)) ?? []) as Condition[];

  const removeCondition = (idx: number) => {
    if (!current) return;
    const items = current.items.filter((_, i) => i !== idx);
    apply(items.length ? { ...current, items } : null);
  };

  const addCondition = (cond: Condition) => {
    const group: FilterGroup = current ?? { logic: "AND", items: [] };
    apply({ ...group, items: [...group.items, cond] });
    setAddOpen(false);
  };

  const isQuickActive = (qf: QuickFilter) =>
    current != null && JSON.stringify(current) === JSON.stringify(qf.group);

  const saveView = async (name: string) => {
    await fetch("/api/saved-filters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, entityType, filterJson: JSON.stringify(current) }),
    });
    setSaveOpen(false);
    router.refresh();
  };

  return (
    <div className="flex flex-wrap items-center gap-2 py-3">
      {quickFilters.map((qf) => (
        <button
          key={qf.label}
          className="badge cursor-pointer border"
          style={
            isQuickActive(qf)
              ? { background: "var(--accent-soft)", color: "var(--accent)", borderColor: "var(--accent)" }
              : { background: "var(--bg)", color: "var(--text-secondary)", borderColor: "var(--border)" }
          }
          onClick={() => apply(isQuickActive(qf) ? null : qf.group)}
        >
          {qf.label}
        </button>
      ))}

      <div className="relative">
        <button className="btn-text" onClick={() => setAddOpen(!addOpen)}>+ Szűrő</button>
        {addOpen && (
          <FilterPopover fields={fields} onAdd={addCondition} onClose={() => setAddOpen(false)} />
        )}
      </div>

      {conditions.map((cond, i) => {
        const def = fields.find((f) => f.key === cond.field);
        return (
          <span
            key={i}
            className="badge border"
            style={{ background: "var(--bg-tertiary)", color: "var(--text)", borderColor: "var(--border)" }}
          >
            <span style={{ color: "var(--text-tertiary)" }}>{def?.label ?? cond.field}</span>
            <span>{OPERATOR_LABELS[cond.op]}</span>
            {cond.value != null && cond.value !== "" && (
              <span className="font-medium">{formatValue(cond, def)}</span>
            )}
            <button
              aria-label="Szűrő törlése"
              className="ml-1 hover:opacity-70"
              onClick={() => removeCondition(i)}
            >
              ×
            </button>
          </span>
        );
      })}

      {conditions.length > 0 && (
        <>
          <button className="btn-text" onClick={() => apply(null)}>Összes törlése</button>
          <div className="relative">
            <button className="btn-text" onClick={() => setSaveOpen(!saveOpen)}>Nézet mentése</button>
            {saveOpen && <SaveViewPopover onSave={saveView} onClose={() => setSaveOpen(false)} />}
          </div>
        </>
      )}

      {savedViews.length > 0 && (
        <div className="ml-auto flex items-center gap-1">
          <span className="label-upper hidden lg:inline">Nézetek:</span>
          {savedViews.map((v) => (
            <button
              key={v.id}
              className="btn-text"
              onClick={() => { try { apply(JSON.parse(v.filterJson)); } catch {} }}
            >
              {v.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function formatValue(cond: Condition, def?: FieldDef): string {
  const v = cond.value;
  if (Array.isArray(v)) {
    if (def?.options) {
      return v.map((x) => def.options!.find((o) => o.value === x)?.label ?? x).join(", ");
    }
    return v.join(" – ");
  }
  if (def?.options) return def.options.find((o) => o.value === v)?.label ?? String(v);
  return String(v);
}

function FilterPopover({ fields, onAdd, onClose }: {
  fields: FieldDef[];
  onAdd: (c: Condition) => void;
  onClose: () => void;
}) {
  const [fieldKey, setFieldKey] = useState(fields[0]?.key ?? "");
  const def = fields.find((f) => f.key === fieldKey) ?? fields[0];
  const ops = OPERATORS_BY_TYPE[def?.type ?? "text"];
  const [op, setOp] = useState<Operator>(ops[0]);
  const [value, setValue] = useState("");
  const [value2, setValue2] = useState("");

  const currentOps = OPERATORS_BY_TYPE[def?.type ?? "text"];
  const effectiveOp = currentOps.includes(op) ? op : currentOps[0];

  const needsValue = !["empty", "notEmpty", "isTrue", "isFalse", "today", "tomorrow",
    "thisWeek", "nextWeek", "thisMonth", "lastMonth", "thisYear", "lastYear", "fiscalYear",
  ].includes(effectiveOp);
  const needsN = ["nextNDays", "lastNDays"].includes(effectiveOp);
  const isBetween = effectiveOp === "between";

  const submit = () => {
    let v: unknown = value;
    if (!needsValue) v = undefined;
    else if (needsN) v = Number(value) || 30;
    else if (isBetween) v = [value, value2];
    else if (def.type === "select" || def.type === "tags") v = value.split(",").map((s) => s.trim()).filter(Boolean);
    else if (def.type === "number" || def.type === "money") v = Number(value);
    onAdd({ field: def.key, op: effectiveOp, value: v });
  };

  const inputType = def.type === "date" && !needsN ? "date" : def.type === "number" || def.type === "money" || needsN ? "number" : "text";

  return (
    <div
      className="absolute left-0 top-9 z-40 w-[300px] rounded-lg p-3 flex flex-col gap-2"
      style={{ background: "var(--bg)", boxShadow: "var(--shadow-md)" }}
    >
      <div className="flex items-center justify-between">
        <span className="label-upper">Feltétel hozzáadása</span>
        <button className="btn-text px-1" onClick={onClose} aria-label="Bezárás">×</button>
      </div>
      <select className="input" value={fieldKey} onChange={(e) => setFieldKey(e.target.value)} aria-label="Mező">
        {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
      </select>
      <select className="input" value={effectiveOp} onChange={(e) => setOp(e.target.value as Operator)} aria-label="Operátor">
        {currentOps.map((o) => <option key={o} value={o}>{OPERATOR_LABELS[o]}</option>)}
      </select>
      {needsValue && (
        def.type === "select" && def.options ? (
          <select className="input" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Érték">
            <option value="">Válassz…</option>
            {def.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : (
          <>
            <input
              className="input" type={inputType} value={value}
              placeholder={needsN ? "N (napok száma)" : def.type === "tags" ? "címke1, címke2" : "Érték"}
              onChange={(e) => setValue(e.target.value)}
              aria-label="Érték"
            />
            {isBetween && (
              <input
                className="input" type={inputType} value={value2}
                placeholder="Felső határ" onChange={(e) => setValue2(e.target.value)}
                aria-label="Felső határ"
              />
            )}
          </>
        )
      )}
      <button className="btn-primary justify-center" onClick={submit}>Hozzáadás</button>
    </div>
  );
}

function SaveViewPopover({ onSave, onClose }: { onSave: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  return (
    <div
      className="absolute left-0 top-9 z-40 w-[260px] rounded-lg p-3 flex flex-col gap-2"
      style={{ background: "var(--bg)", boxShadow: "var(--shadow-md)" }}
    >
      <div className="flex items-center justify-between">
        <span className="label-upper">Nézet mentése</span>
        <button className="btn-text px-1" onClick={onClose} aria-label="Bezárás">×</button>
      </div>
      <input className="input" placeholder="Nézet neve" value={name} onChange={(e) => setName(e.target.value)} />
      <button className="btn-primary justify-center" disabled={!name} onClick={() => onSave(name)}>
        Mentés
      </button>
    </div>
  );
}
