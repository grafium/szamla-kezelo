"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { NotificationBell } from "@/components/notifications";

// Sticky felső fejléc: oldalcím + morzsamenü balra, akció + ⌘K kereső jobbra.

export function Topbar({
  title,
  breadcrumb,
  action,
}: {
  title: string;
  breadcrumb?: string[];
  action?: React.ReactNode;
}) {
  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between gap-4 h-12 px-6 md:px-8 border-b"
      style={{ background: "var(--bg)", borderColor: "var(--border)" }}
    >
      <div className="flex items-center gap-2 min-w-0">
        {breadcrumb?.map((b, i) => (
          <span key={i} className="hidden sm:flex items-center gap-2 text-[13px]" style={{ color: "var(--text-tertiary)" }}>
            {b} <span aria-hidden>/</span>
          </span>
        ))}
        <span className="font-semibold text-[15px] tracking-tight truncate">{title}</span>
      </div>
      <div className="flex items-center gap-2">
        <SearchButton />
        <NotificationBell />
        <ThemeToggle />
        {action}
      </div>
    </header>
  );
}

function SearchButton() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <>
      <button className="btn-secondary hidden sm:inline-flex" onClick={() => setOpen(true)}>
        <span style={{ color: "var(--text-tertiary)" }}>Keresés…</span>
        <kbd
          className="text-[11px] px-1 rounded border"
          style={{ borderColor: "var(--border)", color: "var(--text-tertiary)" }}
        >
          ⌘K
        </kbd>
      </button>
      {open && <CommandPalette onClose={() => setOpen(false)} />}
    </>
  );
}

function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ label: string; sub: string; href: string }[]>([]);

  useEffect(() => {
    if (!q) { setResults([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (res.ok) setResults(await res.json());
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const commands = [
    { label: "Új számla", sub: "Parancs", href: "/szamlak?uj=1" },
    { label: "Új előfizetés", sub: "Parancs", href: "/elofizetesek?uj=1" },
    { label: "Áttekintés", sub: "Ugrás", href: "/" },
    { label: "Számlák", sub: "Ugrás", href: "/szamlak" },
    { label: "Előfizetések", sub: "Ugrás", href: "/elofizetesek" },
    { label: "Banki kivonatok", sub: "Ugrás", href: "/banki-kivonatok" },
    { label: "Partnerek", sub: "Ugrás", href: "/partnerek" },
  ].filter((c) => !q || c.label.toLowerCase().includes(q.toLowerCase()));

  const items = [...results, ...commands].slice(0, 10);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] drawer-overlay"
      onClick={onClose}
      role="dialog"
      aria-label="Parancspaletta"
    >
      <div
        className="w-[560px] max-w-[92vw] rounded-xl overflow-hidden"
        style={{ background: "var(--bg)", boxShadow: "var(--shadow-md)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          className="w-full h-12 px-4 text-[15px] outline-none border-b bg-transparent"
          style={{ borderColor: "var(--divider)" }}
          placeholder="Keresés: partner, számlaszám, összeg, közlemény…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="max-h-[320px] overflow-y-auto py-1">
          {items.length === 0 && (
            <div className="px-4 py-6 text-center text-[13px]" style={{ color: "var(--text-tertiary)" }}>
              Nincs találat
            </div>
          )}
          {items.map((item, i) => (
            <button
              key={i}
              className="w-full flex items-center justify-between px-4 h-9 text-left text-[14px] hover:bg-[var(--bg-hover)]"
              onClick={() => { router.push(item.href); onClose(); }}
            >
              <span className="truncate">{item.label}</span>
              <span className="text-[12px] shrink-0" style={{ color: "var(--text-tertiary)" }}>{item.sub}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };
  return (
    <button className="btn-text px-2" onClick={toggle} aria-label="Sötét mód váltása" title="Sötét mód">
      {dark === null ? "◐" : dark ? "☀" : "☾"}
    </button>
  );
}
