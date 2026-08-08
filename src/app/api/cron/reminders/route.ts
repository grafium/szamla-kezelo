import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runReminderEngine } from "@/lib/reminders";
import { generateAllOccurrences } from "@/lib/occurrences";

// Napi cron: előfordulás-generálás + emlékeztető-motor.
// Hívás: GET /api/cron/reminders?token=<CRON_SECRET>

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? req.headers.get("authorization")?.replace("Bearer ", "");
  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Érvénytelen token" }, { status: 401 });
  }

  const orgs = await prisma.organization.findMany({ where: { deletedAt: null } });
  let occurrences = 0;
  let reminders = 0;
  for (const org of orgs) {
    occurrences += await generateAllOccurrences(org.id);
    reminders += await runReminderEngine(org.id);
  }
  return NextResponse.json({ ok: true, occurrencesCreated: occurrences, remindersCreated: reminders });
}
