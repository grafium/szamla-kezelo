"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

// Bal oldalsáv — 240px, összecsukható 56px-re (3.4 fejezet).

const MAIN_ITEMS = [
  { href: "/", label: "Áttekintés", icon: "◫" },
  { href: "/szamlak", label: "Számlák", icon: "▤" },
  { href: "/elofizetesek", label: "Előfizetések", icon: "↻" },
  { href: "/vasarlasok", label: "Egyszeri vásárlások", icon: "▣" },
  { href: "/banki-kivonatok", label: "Banki kivonatok", icon: "▥" },
  { href: "/partnerek", label: "Partnerek", icon: "◔" },
  { href: "/kifizetesek", label: "Kifizetések", icon: "⇄" },
  { href: "/riportok", label: "Riportok", icon: "◪" },
];

const SECONDARY_ITEMS = [
  { href: "/beerkezo", label: "Beérkező", icon: "▽" },
  { href: "/emlekeztetok", label: "Emlékeztetők", icon: "◷" },
  { href: "/beallitasok", label: "Beállítások", icon: "⚙" },
];

export function Sidebar({
  inboxCount = 0,
  reminderCount = 0,
  pinnedViews = [],
}: {
  inboxCount?: number;
  reminderCount?: number;
  pinnedViews?: { name: string; href: string }[];
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <aside
      className="hidden md:flex flex-col shrink-0 h-screen sticky top-0 border-r overflow-y-auto"
      style={{
        width: collapsed ? 56 : 240,
        background: "var(--bg-secondary)",
        borderColor: "var(--border)",
      }}
    >
      <div className="flex items-center gap-2 px-3 h-12 shrink-0">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="btn-text px-1.5"
          aria-label={collapsed ? "Oldalsáv kinyitása" : "Oldalsáv összecsukása"}
        >
          {collapsed ? "»" : "«"}
        </button>
        {!collapsed && (
          <Link href="/" className="font-semibold text-[15px] tracking-tight truncate">
            Számlakezelő
          </Link>
        )}
      </div>

      <nav className="flex flex-col gap-px px-2 pb-4">
        {MAIN_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-item ${isActive(item.href) ? "active" : ""}`}
            title={item.label}
          >
            <span aria-hidden className="w-4 text-center shrink-0">{item.icon}</span>
            {!collapsed && <span className="truncate">{item.label}</span>}
          </Link>
        ))}

        <div className="my-2 border-t" style={{ borderColor: "var(--divider)" }} />

        {SECONDARY_ITEMS.map((item) => {
          const count =
            item.href === "/beerkezo" ? inboxCount :
            item.href === "/emlekeztetok" ? reminderCount : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${isActive(item.href) ? "active" : ""}`}
              title={item.label}
            >
              <span aria-hidden className="w-4 text-center shrink-0">{item.icon}</span>
              {!collapsed && (
                <span className="flex items-center justify-between flex-1 min-w-0">
                  <span className="truncate">{item.label}</span>
                  {count > 0 && (
                    <span
                      className="badge"
                      style={{ background: "var(--red-bg)", color: "var(--red)" }}
                    >
                      {count}
                    </span>
                  )}
                </span>
              )}
            </Link>
          );
        })}

        {!collapsed && pinnedViews.length > 0 && (
          <>
            <div className="my-2 border-t" style={{ borderColor: "var(--divider)" }} />
            <div className="label-upper px-2 pb-1">Mentett nézetek</div>
            {pinnedViews.map((v) => (
              <Link key={v.href} href={v.href} className="nav-item" title={v.name}>
                <span aria-hidden className="w-4 text-center shrink-0">✦</span>
                <span className="truncate">{v.name}</span>
              </Link>
            ))}
          </>
        )}
      </nav>
    </aside>
  );
}

/** Mobil alsó navigáció (12. fejezet — reszponzív). */
export function MobileNav() {
  const pathname = usePathname();
  const items = [
    { href: "/", label: "Áttekintés", icon: "◫" },
    { href: "/szamlak", label: "Számlák", icon: "▤" },
    { href: "/elofizetesek", label: "Előfiz.", icon: "↻" },
    { href: "/banki-kivonatok", label: "Bank", icon: "▥" },
    { href: "/emlekeztetok", label: "Értesítés", icon: "◷" },
  ];
  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 flex border-t"
      style={{ background: "var(--bg)", borderColor: "var(--border)" }}
    >
      {items.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className="flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px]"
            style={{ color: active ? "var(--accent)" : "var(--text-tertiary)" }}
          >
            <span aria-hidden>{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
