"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Közös elemek a rögzítő űrlap-drawerekhez: 480px-es jobb oldali panel (Esc zárja),
// mezőcímke hibaszöveggel, szerverhiba-jelvény és összeg-/címke-parszolók.

export function FormDrawer({ title, closeHref, children }: {
  title: string; closeHref: string; children: React.ReactNode;
}) {
  const router = useRouter();
  const close = () => router.push(closeHref);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-40 flex justify-end drawer-overlay" onClick={close}>
      <aside
        className="drawer-panel h-full overflow-y-auto p-6 flex flex-col gap-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog" aria-label={title}
      >
        <div className="flex items-start justify-between gap-3">
          <h2>{title}</h2>
          <button className="btn-text px-2" onClick={close} aria-label="Bezárás (Esc)">×</button>
        </div>
        {children}
      </aside>
    </div>
  );
}

export function Field({ label, error, children, className = "" }: {
  label: string; error?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 min-w-0 ${className}`}>
      <span className="label-upper">{label}</span>
      {children}
      {error && <span className="text-[12px]" style={{ color: "var(--red)" }}>{error}</span>}
    </label>
  );
}

export function ServerError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="badge self-start" style={{ background: "var(--red-bg)", color: "var(--red)" }}>
      {message}
    </div>
  );
}

export function FormActions({ closeHref, submitting }: { closeHref: string; submitting: boolean }) {
  return (
    <div className="flex gap-2 pt-2">
      <button type="submit" className="btn-primary" disabled={submitting}>
        {submitting ? "Mentés…" : "Mentés"}
      </button>
      <Link href={closeHref} className="btn-secondary">Mégse</Link>
    </div>
  );
}

/** Fő egységben megadott összeg ("12 990" / "49,99" / "49.99") → minor unit int. */
export function parseMajor(value: string): number {
  const n = Number(value.trim().replace(/\s+/g, "").replace(",", "."));
  return Math.round(n * 100);
}

/** Érvényes-e a fő egységben megadott összeg? (react-hook-form validate-hez) */
export function isValidAmount(value: string): boolean {
  const s = value.trim().replace(/\s+/g, "").replace(",", ".");
  return s !== "" && Number.isFinite(Number(s));
}

/** Vesszővel elválasztott lista → trimmelt, nem üres string tömb. */
export function parseList(value: string): string[] {
  return value.split(",").map((t) => t.trim()).filter(Boolean);
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export type Option = { id: string; name: string };
