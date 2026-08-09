import { redirect } from "next/navigation";
import { MobileNav, Sidebar } from "@/components/sidebar";
import { currentUserOrDemo } from "@/auth";
import { prisma } from "@/lib/prisma";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUserOrDemo();
  if (!user) {
    // Üres adatbázis → első-indítási varázsló; különben kötelező bejelentkezés.
    const orgCount = await prisma.organization.count();
    if (orgCount === 0) redirect("/setup");
    redirect("/login");
  }
  let inboxCount = 0;
  let reminderCount = 0;
  let pinnedViews: { name: string; href: string }[] = [];

  if (user) {
    const orgId = user.organizationId;
    [inboxCount, reminderCount] = await Promise.all([
      prisma.attachment.count({ where: { organizationId: orgId, inboxStatus: "NEEDS_REVIEW", deletedAt: null } }),
      prisma.reminder.count({ where: { organizationId: orgId, status: "SCHEDULED", triggerDate: { lte: new Date() } } }),
    ]);
    const views = await prisma.savedFilter.findMany({
      where: { organizationId: orgId, isPinned: true },
      orderBy: { sortOrder: "asc" },
      take: 6,
    });
    const routeByEntity: Record<string, string> = {
      invoices: "/szamlak",
      subscriptions: "/elofizetesek",
      "bank-transactions": "/banki-kivonatok/tetelek",
      partners: "/partnerek",
      purchases: "/vasarlasok",
      payments: "/kifizetesek",
    };
    pinnedViews = views
      .filter((v) => routeByEntity[v.entityType])
      .map((v) => ({
        name: v.name,
        href: `${routeByEntity[v.entityType]}?f=${encodeURIComponent(v.filterJson)}`,
      }));
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar inboxCount={inboxCount} reminderCount={reminderCount} pinnedViews={pinnedViews} />
      <div className="flex-1 min-w-0 pb-16 md:pb-0">
        {children}
      </div>
      <MobileNav />
    </div>
  );
}
