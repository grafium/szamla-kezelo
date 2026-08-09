import { addDays, endOfWeek, startOfDay } from "date-fns";
import { currentUserOrDemo } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/topbar";
import { Badge, Card, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { REMINDER_TYPE_COLORS, REMINDER_TYPE_LABELS } from "@/lib/constants";
import { ReminderActions } from "./actions";

export const dynamic = "force-dynamic";

export default async function RemindersPage() {
  const user = await currentUserOrDemo();
  if (!user) return <EmptyState text="Futtasd a seed szkriptet: npm run db:seed" />;

  const reminders = await prisma.reminder.findMany({
    where: {
      organizationId: user.organizationId,
      status: { in: ["SCHEDULED", "SENT", "SNOOZED"] },
    },
    orderBy: { triggerDate: "asc" },
  });

  const today = startOfDay(new Date());
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
  const groups: { title: string; items: typeof reminders }[] = [
    { title: "Ma", items: reminders.filter((r) => r.triggerDate <= addDays(today, 1) && r.triggerDate >= today) },
    { title: "Ezen a héten", items: reminders.filter((r) => r.triggerDate > addDays(today, 1) && r.triggerDate <= weekEnd) },
    { title: "Később", items: reminders.filter((r) => r.triggerDate > weekEnd) },
    { title: "Korábbi", items: reminders.filter((r) => r.triggerDate < today) },
  ];

  return (
    <>
      <Topbar title="Emlékeztetők" />
      <main className="max-w-[1280px] mx-auto px-4 md:px-8 py-6 flex flex-col gap-5">
        {reminders.length === 0 ? (
          <EmptyState icon="◷" text="Nincs aktív emlékeztető" />
        ) : (
          groups.filter((g) => g.items.length > 0).map((g) => (
            <Card key={g.title} title={g.title}>
              <div className="flex flex-col gap-1">
                {g.items.map((r) => (
                  <div key={r.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-2 py-2 rounded-md hover:bg-[var(--bg-hover)]">
                    <div className="flex items-center gap-3 min-w-0">
                      <Badge color={REMINDER_TYPE_COLORS[r.type] ?? "gray"}>
                        {REMINDER_TYPE_LABELS[r.type] ?? r.type}
                      </Badge>
                      <span className="text-[14px] truncate">{r.message}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                        {formatDate(r.triggerDate)}
                      </span>
                      <ReminderActions reminderId={r.id} type={r.type} entityType={r.entityType} entityId={r.entityId} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))
        )}
      </main>
    </>
  );
}
