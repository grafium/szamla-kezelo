import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Napi árfolyam-frissítés. Éles környezetben az MNB (HUF) és ECB (EUR/USD)
// API-ját kell hívni; itt az utolsó ismert árfolyamot visszük tovább a mai napra
// (hétvégén/ünnepnapon amúgy is az utolsó munkanapi árfolyam érvényes).

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? req.headers.get("authorization")?.replace("Bearer ", "");
  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Érvénytelen token" }, { status: 401 });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const pairs: [string, string][] = [["EUR", "HUF"], ["USD", "HUF"], ["EUR", "USD"]];
  let updated = 0;

  for (const [from, to] of pairs) {
    const last = await prisma.exchangeRate.findFirst({
      where: { baseCurrency: from, targetCurrency: to },
      orderBy: { date: "desc" },
    });
    if (!last) continue;
    await prisma.exchangeRate.upsert({
      where: { date_baseCurrency_targetCurrency: { date: today, baseCurrency: from, targetCurrency: to } },
      create: { date: today, baseCurrency: from, targetCurrency: to, rate: last.rate, source: last.source },
      update: {},
    });
    updated++;
  }
  return NextResponse.json({ ok: true, updated });
}
