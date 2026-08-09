import { NextRequest, NextResponse } from "next/server";
import { syncRates, MAX_DAYS } from "@/services/rates/sync";
import { isAuthorizedCron } from "@/lib/cron-auth";

// Napi árfolyam-frissítés (cron). Az MNB SOAP-végpontjáról tölti az EUR→HUF és
// USD→HUF árfolyamot, az ECB-ből az EUR→USD-t; MNB-hiba esetén mindent az
// ECB EUR-alapú árfolyamaiból származtat. Ha egyik forrás sem érhető el, 502-t
// ad vissza — csendben nem „sikerül”.
//
// Query: ?token=<CRON_SECRET>&days=N   (N = 1…90, alapértelmezés 1)

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Érvénytelen token" }, { status: 401 });
  }

  const daysParam = Number(req.nextUrl.searchParams.get("days") ?? "1");
  const days = Number.isFinite(daysParam) ? Math.min(Math.max(Math.trunc(daysParam), 1), MAX_DAYS) : 1;

  const result = await syncRates(days);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error ?? "Az árfolyam-frissítés nem sikerült" },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    fetched: result.fetched,
    upserted: result.upserted,
    source: result.source,
    missingDays: result.missingDays,
    bootstrapped: result.bootstrapped,
    carriedForward: result.carriedForward,
    warnings: result.warnings,
  });
}
