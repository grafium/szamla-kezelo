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
  const emailErrors: { email: string; error: string }[] = [];
  if (digest === "daily" || digest === "weekly") {
    const sender = getEmailSender();
    const today = startOfDay(new Date());
    for (const org of orgs) {
      const users = await prisma.user.findMany({
        where: { organizationId: org.id, deletedAt: null },
      });
      let orgEmailsSent = 0;
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
          orgEmailsSent++;
        } catch (err) {
          // A hiba okát a válasz is tartalmazza — különben a sikertelen küldés
          // néma marad (pl. hitelesítetlen feladó domain a Resendnél).
          const message = err instanceof Error ? err.message : String(err);
          console.error(`E-mail küldési hiba (${user.email}):`, message);
          emailErrors.push({ email: user.email, error: message.slice(0, 300) });
        }
      }
      // A ma esedékes, e-mail csatornás emlékeztetők elküldöttnek jelölése.
      // Csak akkor, ha tényleg ment ki levél — különben az emlékeztető
      // értesítés nélkül tűnne el, és a következő futás sem próbálná újra.
      if (digest === "daily" && orgEmailsSent > 0) {
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
    ...(emailErrors.length ? { emailErrors } : {}),
  });
}
