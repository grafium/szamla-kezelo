"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  parseCsv, detectDelimiter, guessTemplate, normalizeRow, type NormalizedRow,
} from "@/services/bank-import/csv";
import { BANK_TEMPLATES } from "@/services/bank-import/templates";
import { Field, ServerError } from "@/components/forms/shared";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";
import type { Currency } from "@/lib/constants";

// Bankimport-varázsló (kliens): állapotgép 5 lépéssel
// 1. Fájl → 2. Számla és sablon → 3. Oszlopok → 4. Előnézet → 5. Eredmény

interface AccountOption {
  id: string;
  name: string;
  bankName: string | null;
  currency: string;
}

const TARGET_FIELDS = [
  { key: "bookingDate", label: "Könyvelési dátum", required: true },
  { key: "valueDate", label: "Értéknap", required: false },
  { key: "amount", label: "Összeg", required: true },
  { key: "currency", label: "Devizanem", required: false },
  { key: "counterpartyName", label: "Ellenpartner neve", required: false },
  { key: "counterpartyAccount", label: "Ellenpartner számlaszáma", required: false },
  { key: "reference", label: "Közlemény", required: false },
] as const;
type FieldKey = (typeof TARGET_FIELDS)[number]["key"];
type Mapping = Record<FieldKey, number | null>;

const EMPTY_MAPPING: Mapping = {
  bookingDate: null, valueDate: null, amount: null, currency: null,
  counterpartyName: null, counterpartyAccount: null, reference: null,
};

const STEPS = ["Fájl", "Számla és sablon", "Oszlopok", "Előnézet", "Import"];

function templateMapping(templateId: string, headers: string[]): Mapping {
  const t = BANK_TEMPLATES.find((x) => x.id === templateId);
  const mapping: Mapping = { ...EMPTY_MAPPING };
  if (!t) return mapping;
  const lower = headers.map((h) => h.trim().toLowerCase());
  const find = (name?: string) => {
    if (!name) return null;
    const i = lower.indexOf(name.toLowerCase());
    return i >= 0 ? i : null;
  };
  mapping.bookingDate = find(t.columns.bookingDate);
  mapping.valueDate = find(t.columns.valueDate);
  mapping.amount = find(t.columns.amount);
  mapping.currency = find(t.columns.currency);
  mapping.counterpartyName = find(t.columns.counterpartyName);
  mapping.counterpartyAccount = find(t.columns.counterpartyAccount);
  mapping.reference = find(t.columns.reference);
  return mapping;
}

interface ImportResult {
  statementId: string | null;
  imported: number;
  skippedDuplicates: number;
  autoMatched: number;
}

export function ImportWizard({ bankAccounts }: { bankAccounts: AccountOption[] }) {
  const [step, setStep] = useState(0);
  const [csvText, setCsvText] = useState("");
  const [pasteMode, setPasteMode] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [encodingWarning, setEncodingWarning] = useState(false);
  const [usedEncoding, setUsedEncoding] = useState<"utf-8" | "iso-8859-2">("utf-8");
  const bufferRef = useRef<ArrayBuffer | null>(null);

  const [accountId, setAccountId] = useState(bankAccounts[0]?.id ?? "");
  const [templateId, setTemplateId] = useState<string>("");
  const [statementNumber, setStatementNumber] = useState("");
  const [mapping, setMapping] = useState<Mapping>(EMPTY_MAPPING);

  const [importing, setImporting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const account = bankAccounts.find((a) => a.id === accountId) ?? null;

  const parsed = useMemo(() => {
    if (!csvText.trim()) return null;
    const template = BANK_TEMPLATES.find((t) => t.id === templateId);
    const delimiter = template?.delimiter ?? detectDelimiter(csvText);
    return parseCsv(csvText, delimiter);
  }, [csvText, templateId]);

  const normalized = useMemo(() => {
    if (!parsed || mapping.bookingDate == null || mapping.amount == null) return [];
    return parsed.rows.map((row) => {
      try {
        const data = normalizeRow(
          row,
          {
            bookingDate: mapping.bookingDate!,
            valueDate: mapping.valueDate ?? undefined,
            amount: mapping.amount!,
            currency: mapping.currency ?? undefined,
            counterpartyName: mapping.counterpartyName ?? undefined,
            counterpartyAccount: mapping.counterpartyAccount ?? undefined,
            reference: mapping.reference ?? undefined,
          },
          { currencyFallback: account?.currency }
        );
        return { ok: true as const, data, row };
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : "Hibás sor", row };
      }
    });
  }, [parsed, mapping, account?.currency]);
  const validRows = normalized.filter((r) => r.ok);

  const loadText = (text: string) => {
    setCsvText(text);
    const delimiter = detectDelimiter(text);
    const { headers } = parseCsv(text, delimiter);
    const guessed = guessTemplate(headers);
    if (guessed) {
      setTemplateId(guessed);
      const t = BANK_TEMPLATES.find((x) => x.id === guessed)!;
      const reparsed = parseCsv(text, t.delimiter);
      setMapping(templateMapping(guessed, reparsed.headers));
    } else {
      setTemplateId("");
      setMapping(EMPTY_MAPPING);
    }
  };

  const decodeBuffer = (buffer: ArrayBuffer, encoding: "utf-8" | "iso-8859-2") => {
    const text = new TextDecoder(encoding).decode(buffer);
    setUsedEncoding(encoding);
    setEncodingWarning(encoding === "utf-8" && text.includes("�"));
    loadText(text);
  };

  const onFile = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const buffer = reader.result as ArrayBuffer;
      bufferRef.current = buffer;
      decodeBuffer(buffer, "utf-8");
    };
    reader.readAsArrayBuffer(file);
  };

  const selectTemplate = (tid: string) => {
    setTemplateId(tid);
    if (!csvText.trim()) return;
    if (tid) {
      const t = BANK_TEMPLATES.find((x) => x.id === tid)!;
      const reparsed = parseCsv(csvText, t.delimiter);
      setMapping(templateMapping(tid, reparsed.headers));
    } else {
      setMapping(EMPTY_MAPPING);
    }
  };

  const runImport = async () => {
    if (!account) return;
    setImporting(true);
    setServerError(null);
    const res = await fetch("/api/bank-import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bankAccountId: account.id,
        statementNumber: statementNumber.trim() || undefined,
        currencyFallback: account.currency,
        rows: validRows.map(({ data }) => ({
          bookingDate: data.bookingDate.toISOString(),
          valueDate: data.valueDate?.toISOString(),
          amount: data.amount,
          currency: data.currency,
          counterpartyName: data.counterpartyName,
          counterpartyAccount: data.counterpartyAccount,
          reference: data.reference,
        })),
      }),
    });
    setImporting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setServerError(body?.error ?? "Az importálás nem sikerült");
      return;
    }
    setResult(await res.json());
    setStep(4);
  };

  const canNext =
    step === 0 ? !!parsed && parsed.rows.length > 0
    : step === 1 ? !!accountId
    : step === 2 ? mapping.bookingDate != null && mapping.amount != null
    : step === 3 ? validRows.length > 0
    : false;

  return (
    <div className="flex flex-col gap-5">
      {/* Lépésjelző */}
      <ol className="flex flex-wrap items-center gap-2 text-[13px]">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <span
              className="w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-medium"
              style={{
                background: i === step ? "var(--accent)" : i < step ? "var(--green-bg)" : "var(--bg-hover)",
                color: i === step ? "#fff" : i < step ? "var(--green)" : "var(--text-tertiary)",
              }}
            >
              {i < step ? "✓" : i + 1}
            </span>
            <span style={{ color: i === step ? "var(--text)" : "var(--text-tertiary)" }}>{label}</span>
            {i < STEPS.length - 1 && <span aria-hidden style={{ color: "var(--text-tertiary)" }}>›</span>}
          </li>
        ))}
      </ol>

      {/* 1. Fájl */}
      {step === 0 && (
        <section className="card p-4 flex flex-col gap-4">
          <h3>CSV-fájl kiválasztása</h3>
          <div className="flex flex-col gap-2">
            <label className="btn-secondary self-start cursor-pointer">
              Fájl tallózása…
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
              />
            </label>
            {fileName && (
              <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                Betöltve: <span className="font-medium">{fileName}</span>
                {parsed && ` — ${parsed.rows.length} sor, ${parsed.headers.length} oszlop`}
                {usedEncoding === "iso-8859-2" && " (ISO-8859-2)"}
              </p>
            )}
            {encodingWarning && bufferRef.current && (
              <div className="flex items-center gap-2 text-[13px]">
                <span style={{ color: "var(--orange)" }}>
                  A fájl hibás karaktereket tartalmaz — lehet, hogy nem UTF-8 kódolású.
                </span>
                <button className="btn-secondary" onClick={() => decodeBuffer(bufferRef.current!, "iso-8859-2")}>
                  Újraolvasás ISO-8859-2 kódolással
                </button>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <button className="btn-text self-start" onClick={() => setPasteMode((v) => !v)}>
              {pasteMode ? "Beillesztés elrejtése" : "Vagy illeszd be a CSV tartalmát…"}
            </button>
            {pasteMode && (
              <textarea
                className="input min-h-[160px] font-mono text-[12px]"
                placeholder={"Könyvelés dátuma;Összeg;Közlemény\n2026.08.01;-12 500;Példa tétel"}
                value={fileName ? "" : csvText}
                onChange={(e) => { setFileName(null); bufferRef.current = null; setEncodingWarning(false); loadText(e.target.value); }}
              />
            )}
          </div>
          {parsed && parsed.rows.length > 0 && (
            <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
              Felismert oszlopok: {parsed.headers.join(" · ")}
            </p>
          )}
        </section>
      )}

      {/* 2. Számla + sablon */}
      {step === 1 && (
        <section className="card p-4 grid sm:grid-cols-2 gap-4">
          <Field label="Bankszámla *">
            {bankAccounts.length === 0 ? (
              <div className="flex flex-col items-start gap-2">
                <span className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                  Még nincs rögzített bankszámla, ezért nem lehet kivonatot importálni.
                  Vegyél fel egyet a beállításokban, majd térj vissza ide.
                </span>
                <Link href="/beallitasok" className="btn-primary">Bankszámla felvétele</Link>
              </div>
            ) : (
              <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {bankAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency}{a.bankName ? ` · ${a.bankName}` : ""})
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Bank-sablon">
            <select className="input" value={templateId} onChange={(e) => selectTemplate(e.target.value)}>
              <option value="">Egyéni (kézi hozzárendelés)</option>
              {BANK_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>{t.bankName}</option>
              ))}
            </select>
          </Field>
          <Field label="Kivonat azonosító" className="sm:col-span-2">
            <input
              className="input"
              placeholder="pl. 2026-08/OTP-1 (nem kötelező)"
              value={statementNumber}
              onChange={(e) => setStatementNumber(e.target.value)}
            />
          </Field>
          {templateId && (
            <p className="text-[13px] sm:col-span-2" style={{ color: "var(--text-secondary)" }}>
              A sablon a fejléc alapján lett felismerve — a következő lépésben módosíthatod az oszlop-hozzárendelést.
            </p>
          )}
        </section>
      )}

      {/* 3. Oszlop-hozzárendelés */}
      {step === 2 && parsed && (
        <section className="card p-4 flex flex-col gap-3">
          <h3>Oszlop-hozzárendelés</h3>
          <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
            Rendeld a CSV oszlopait a mezőkhöz. A csillagozott mezők kötelezők.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            {TARGET_FIELDS.map((f) => (
              <Field key={f.key} label={f.required ? `${f.label} *` : f.label}>
                <select
                  className="input"
                  value={mapping[f.key] ?? ""}
                  onChange={(e) =>
                    setMapping((m) => ({ ...m, [f.key]: e.target.value === "" ? null : Number(e.target.value) }))
                  }
                >
                  <option value="">— nincs —</option>
                  {parsed.headers.map((h, i) => (
                    <option key={i} value={i}>{h || `(${i + 1}. oszlop)`}</option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
        </section>
      )}

      {/* 4. Előnézet */}
      {step === 3 && (
        <section className="card p-0 overflow-hidden">
          <div className="p-4 pb-2">
            <h3>Előnézet</h3>
            <p className="text-[13px] mt-1" style={{ color: "var(--text-secondary)" }}>
              {parsed?.rows.length ?? 0} sor összesen · {validRows.length} importálható
              {normalized.length - validRows.length > 0 &&
                ` · ${normalized.length - validRows.length} hibás sor (kimarad)`}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Dátum</th><th>Ellenpartner</th><th>Közlemény</th><th className="num">Összeg</th>
                </tr>
              </thead>
              <tbody>
                {normalized.slice(0, 10).map((r, i) => (
                  <tr key={i} style={r.ok ? undefined : { background: "var(--red-bg)" }}>
                    {r.ok ? (
                      <>
                        <td className="text-[13px]">{formatDate(r.data.bookingDate)}</td>
                        <td className="text-[13px]">{r.data.counterpartyName ?? "–"}</td>
                        <td className="text-[13px] max-w-[240px] truncate" style={{ color: "var(--text-secondary)" }}>
                          {r.data.reference ?? "–"}
                        </td>
                        <td className="num" style={{ color: r.data.amount < 0 ? "var(--red)" : "var(--green)" }}>
                          {formatMoney(r.data.amount, (r.data.currency ?? account?.currency ?? "HUF") as Currency)}
                        </td>
                      </>
                    ) : (
                      <td colSpan={4} className="text-[13px]" style={{ color: "var(--red)" }}>
                        {r.error} — {r.row.join(" ; ").slice(0, 120)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 5. Eredmény */}
      {step === 4 && result && (
        <section className="card p-6 flex flex-col items-start gap-3">
          <h3>Import kész</h3>
          <ul className="text-[14px] flex flex-col gap-1">
            <li>Importált tételek: <span className="num font-medium">{result.imported}</span></li>
            <li>Kihagyott duplikátumok: <span className="num font-medium">{result.skippedDuplicates}</span></li>
            <li>Automatikusan párosítva: <span className="num font-medium">{result.autoMatched}</span></li>
          </ul>
          <div className="flex gap-2 pt-2">
            {result.statementId ? (
              <Link href={`/banki-kivonatok/${result.statementId}`} className="btn-primary">
                Kivonat megnyitása
              </Link>
            ) : (
              <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                Minden sor duplikátum volt — nem jött létre új kivonat.
              </p>
            )}
            <Link href="/banki-kivonatok" className="btn-secondary">Vissza a kivonatokhoz</Link>
          </div>
        </section>
      )}

      <ServerError message={serverError} />

      {/* Navigáció */}
      {step < 4 && (
        <div className="flex items-center gap-2">
          {step > 0 && (
            <button className="btn-secondary" onClick={() => setStep((s) => s - 1)} disabled={importing}>
              Vissza
            </button>
          )}
          {step < 3 ? (
            <button className="btn-primary" onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
              Tovább
            </button>
          ) : (
            <button className="btn-primary" onClick={runImport} disabled={!canNext || importing}>
              {importing ? "Importálás…" : `Importálás (${validRows.length} tétel)`}
            </button>
          )}
          <Link href="/banki-kivonatok" className="btn-text">Mégse</Link>
        </div>
      )}
    </div>
  );
}
