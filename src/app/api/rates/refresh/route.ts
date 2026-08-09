import { NextRequest, NextResponse } from "next/server";
import { currentUserOrDemo } from "@/auth";
import { prisma } from "@/lib/prisma";
import { clientIp } from "@/lib/audit";
import { syncRates } from "@/services/rates/sync";

// Kézi árfolyam-frissítés a beállítások oldalról (session-auth, OWNER/ADMIN).
// Ugyanazt a szinkron-logikát futtatja, mint a napi cron, days=1 értékkel.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const user = await currentUserOrDemo();
  if (!user) return NextResponse.json({ error: "Bejelentkezés szükséges" }, { status: 401 });
  if (user.role !== "OWNER" && user.role !== "ADMIN") {
    return NextResponse.json({ error: "Nincs jogosultságod az árfolyamok frissítéséhez" }, { status: 403 });
  }

  const result = await syncRates(1);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error ?? "Az árfolyam-frissítés nem sikerült" },
      { status: 502 }
    );
  }

  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId,
      userId: user.id,
      ipAddress: clientIp(req),
      action: "UPDATE",
      entityType: "ExchangeRate",
      entityId: "sync",
      changes: JSON.stringify({ after: { source: result.source, upserted: result.upserted } }),
    },
  });

  return NextResponse.json({
    ok: true,
    fetched: result.fetched,
    upserted: result.upserted,
    source: result.source,
    bootstrapped: result.bootstrapped,
    carriedForward: result.carriedForward,
    warnings: result.warnings,
  });
}
