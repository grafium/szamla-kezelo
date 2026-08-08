import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentUserOrDemo } from "@/auth";
import { prisma } from "@/lib/prisma";
import { INVOICE_STATUSES } from "@/lib/constants";

const bulkSchema = z.object({
  ids: z.array(z.string()).min(1, "Legalább egy számlát ki kell jelölni"),
  action: z.enum(["status", "category", "delete"]),
  value: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const user = await currentUserOrDemo();
  if (!user) return NextResponse.json({ error: "Bejelentkezés szükséges" }, { status: 401 });
  if (user.role === "VIEWER") return NextResponse.json({ error: "Nincs jogosultságod a módosításhoz" }, { status: 403 });

  const body = bulkSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Érvénytelen adat", details: body.error.flatten() }, { status: 400 });
  }
  const { ids, action, value } = body.data;

  // Minden lekérdezés a szervezetre szűkítve — idegen azonosítók hatástalanok.
  const where = { id: { in: ids }, organizationId: user.organizationId, deletedAt: null };

  let count = 0;
  if (action === "status") {
    if (!value || !(INVOICE_STATUSES as readonly string[]).includes(value)) {
      return NextResponse.json({ error: "Érvénytelen státusz" }, { status: 400 });
    }
    count = (await prisma.invoice.updateMany({ where, data: { status: value } })).count;
  } else if (action === "category") {
    if (value) {
      const category = await prisma.category.findFirst({
        where: { id: value, organizationId: user.organizationId, deletedAt: null },
      });
      if (!category) return NextResponse.json({ error: "A kategória nem található" }, { status: 400 });
    }
    count = (await prisma.invoice.updateMany({ where, data: { categoryId: value || null } })).count;
  } else {
    count = (await prisma.invoice.updateMany({ where, data: { deletedAt: new Date() } })).count;
  }

  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId,
      userId: user.id,
      action: "BULK_UPDATE",
      entityType: "Invoice",
      entityId: "bulk",
      changes: JSON.stringify({ action, value: value ?? null, ids, count }),
    },
  });

  return NextResponse.json({ count });
}
