import { currentUserOrDemo } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/topbar";
import { EmptyState } from "@/components/ui";
import { ImportWizard } from "./wizard";

export const dynamic = "force-dynamic";

// Bankimport-varázsló: CSV-fájl → bankszámla + sablon → oszlopok → előnézet → import.

export default async function BankImportPage() {
  const user = await currentUserOrDemo();
  if (!user) return <EmptyState text="Futtasd a seed szkriptet: npm run db:seed" />;

  const bankAccounts = await prisma.bankAccount.findMany({
    where: { organizationId: user.organizationId, deletedAt: null, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, bankName: true, currency: true },
  });

  return (
    <>
      <Topbar title="Kivonat importálása" breadcrumb={["Banki kivonatok"]} />
      <main className="max-w-[960px] mx-auto px-4 md:px-8 py-6">
        <ImportWizard
          bankAccounts={bankAccounts.map((a) => ({
            id: a.id,
            name: a.name,
            bankName: a.bankName,
            currency: a.currency,
          }))}
        />
      </main>
    </>
  );
}
