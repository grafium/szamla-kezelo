import { currentUserOrDemo } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/topbar";
import { Badge, Card, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

// Beérkező: feldolgozatlan feltöltések OCR-mezőkkel. A 0,8 alatti megbízhatóságú
// mezők sárga kiemelést kapnak a jóváhagyás előtt.

export default async function InboxPage() {
  const user = await currentUserOrDemo();
  if (!user) return <EmptyState text="Futtasd a seed szkriptet: npm run db:seed" />;
  const org = user.organization;

  const items = await prisma.attachment.findMany({
    where: { organizationId: org.id, inboxStatus: "NEEDS_REVIEW", deletedAt: null },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <Topbar title="Beérkező"
        action={<button className="btn-primary">+ Számla feltöltése</button>} />
      <main className="max-w-[1280px] mx-auto px-4 md:px-8 py-6 flex flex-col gap-4">
        <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
          Húzd ide a PDF/JPG/PNG számlákat, vagy továbbítsd őket e-mailben:{" "}
          <code className="badge" style={{ background: "var(--gray-bg)", color: "var(--gray)" }}>
            szamla-{org.inboundEmailToken ?? "…"}@app.hu
          </code>
        </p>

        {items.length === 0 ? (
          <EmptyState icon="▽" text="Nincs feldolgozásra váró dokumentum" />
        ) : (
          <div className="grid gap-3">
            {items.map((item) => {
              let fields: Record<string, { value: string; confidence: number }> = {};
              try { fields = JSON.parse(item.ocrFields); } catch {}
              return (
                <Card key={item.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{item.fileName}</span>
                        <Badge color={item.ocrStatus === "DONE" ? "green" : "yellow"}>
                          {item.ocrStatus === "DONE" ? "OCR kész" : "OCR folyamatban"}
                        </Badge>
                      </div>
                      <div className="text-[12px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                        Feltöltve: {formatDate(item.createdAt)} · {(item.fileSize / 1024).toFixed(0)} KB
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button className="btn-primary">Jóváhagyás</button>
                      <button className="btn-secondary">Elvetés</button>
                    </div>
                  </div>
                  {Object.keys(fields).length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
                      {Object.entries(fields).map(([key, f]) => (
                        <div key={key} className="rounded-md px-2 py-1.5"
                          style={f.confidence < 0.8
                            ? { background: "var(--yellow-bg)" }
                            : { background: "var(--bg-tertiary)" }}>
                          <div className="label-upper">{key}</div>
                          <div className="text-[13px] truncate">{f.value}</div>
                          <div className="text-[11px]" style={{ color: f.confidence < 0.8 ? "var(--yellow)" : "var(--text-tertiary)" }}>
                            {Math.round(f.confidence * 100)}% megbízhatóság
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
