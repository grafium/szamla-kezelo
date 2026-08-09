import { NextResponse } from "next/server";
import { addDays, startOfDay } from "date-fns";
import { currentUserOrDemo } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  isQuiet,
  parseNotificationPrefs,
  resolveReminderSources,
} from "@/lib/notification-prefs";

// Harang-panel adatai: a következő 7 nap emlékeztetői + olvasatlan darabszám.
// A felhasználó csendes listáira (partner/kategória) illő tételeket kiszűrjük,
// az összeghatárt elérő tételeket urgent jelöléssel adjuk vissza.

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUserOrDemo();
  if (!user) return NextResponse.json({ error: "Bejelentkezés szükséges" }, { status: 401 });

  const today = startOfDay(new Date());
  const prefs = parseNotificationPrefs(user.notificationPrefs);

  const reminders = await prisma.reminder.findMany({
    where: {
      organizationId: user.organizationId,
      status: { in: ["SCHEDULED", "SENT", "SNOOZED"] },
      triggerDate: { lte: addDays(new Date(), 7) },
    },
    orderBy: { triggerDate: "asc" },
    take: 20,
  });

  const sources = await resolveReminderSources(reminders);
  const visible = reminders.filter((r) => !isQuiet(sources.get(r.id), prefs));

  const endOfToday = addDays(today, 1);
  const items = visible.map((r) => {
    const source = sources.get(r.id);
    return {
      id: r.id,
      type: r.type,
      entityType: r.entityType,
      entityId: r.entityId,
      message: r.message,
      triggerDate: r.triggerDate.toISOString(),
      status: r.status,
      urgent:
        prefs.amountThreshold != null &&
        source?.amount != null &&
        source.amount >= prefs.amountThreshold,
    };
  });

  const unreadCount = visible.filter(
    (r) => r.status === "SCHEDULED" && r.triggerDate < endOfToday
  ).length;

  return NextResponse.json({ items, unreadCount });
}
