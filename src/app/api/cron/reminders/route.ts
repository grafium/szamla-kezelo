import { NextRequest, NextResponse } from "next/server";
import { addDays, startOfDay } from "date-fns";
import { prisma } from "@/lib/prisma";
import { runReminderEngine } from "@/lib/reminders";
import { generateAllOccurrences } from "@/lib/occurrences";
import { getEmailSender } from "@/services/email";
import { buildDailyDigest, buildWeeklyPreview } from "@/services/email-digest";
import { parseNotificationPrefs } from "@/lib/notification-prefs";

// Napi cron: előfordulás-generálás + emlékeztető-motor.
// Hívás: GET /api/cron/reminders?token=<CRON_SECRET>
// E-mail összefoglalók: &digest=daily (napi) vagy &digest=weekly (heti előretekintés).

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

  // E-mail összefoglaló küldése (ConsoleSender, ha nincs RESEND_API_KEY)
  const digest = req.nextUrl.searchParams.get("digest");
  let emailsSent = 0;
  if (digest === "daily" || digest === "weekly") {
    const sender = getEmailSender();
    const today = startOfDay(new Date());
    for (const org of orgs) {
      const users = await prisma.user.findMany({
        where: { organizationId: org.id, deletedAt: null },
      });
      for (const user of users) {
        const prefs = parseNotificationPrefs(user.notificationPrefs);
        if (!prefs.email) continue;
        const { subject, html } =
          digest === "daily"
            ? await buildDailyDigest(org.id, prefs)
            : await buildWeeklyPreview(org.id, prefs);
        try {
          await sender.send(user.email, subject, html);
          emailsSent++;
        } catch (err) {
          console.error(`E-mail küldési hiba (${user.email}):`, err);
        }
      }
      // A ma esedékes, e-mail csatornás emlékeztetők elküldöttnek jelölése
      if (digest === "daily") {
        await prisma.reminder.updateMany({
          where: {
            organizationId: org.id,
            status: "SCHEDULED",
            channel: { in: ["EMAIL", "BOTH"] },
            triggerDate: { gte: today, lt: addDays(today, 1) },
          },
          data: { status: "SENT", sentAt: new Date() },
        });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    occurrencesCreated: occurrences,
    remindersCreated: reminders,
    ...(digest ? { digest, emailsSent } : {}),
  });
}
