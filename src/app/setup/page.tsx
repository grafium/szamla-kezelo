import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { setupTokenRequired } from "@/lib/setup-token";
import { SetupForm } from "./setup-form";

// Első-indítási varázsló: csak teljesen üres adatbázison érhető el.
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const orgCount = await prisma.organization.count();
  if (orgCount > 0) redirect("/");

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="card w-full max-w-[440px] p-8 flex flex-col gap-4">
        <div>
          <h1 className="text-[24px]">Első indítás</h1>
          <p className="text-[13px] mt-1" style={{ color: "var(--text-secondary)" }}>
            Első indítás — hozd létre a szervezetet és az admin fiókot
          </p>
        </div>
        <SetupForm tokenRequired={setupTokenRequired()} />
      </div>
    </main>
  );
}
