import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentUserOrDemo } from "@/auth";
import { prisma } from "@/lib/prisma";
import { INVOICE_STATUSES } from "@/lib/constants";

const patchSchema = z.object({
  status: z.enum(INVOICE_STATUSES).optional(),
  categoryId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUserOrDemo();
  if (!user) return NextResponse.json({ error: "Bejelentkezés szükséges" }, { status: 401 });
  if (user.role === "VIEWER") return NextResponse.json({ error: "Nincs jogosultságod a módosításhoz" }, { status: 403 });

  const body = patchSchema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Érvénytelen adat", details: body.error.flatten() }, { status: 400 });
  }

  const invoice = await prisma.invoice.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
  });
  if (!invoice) return NextResponse.json({ error: "A számla nem található" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (body.data.status) data.status = body.data.status;
  if (body.data.categoryId !== undefined) data.categoryId = body.data.categoryId;
  if (body.data.notes !== undefined) data.notes = body.data.notes;
  if (body.data.tags) data.tags = JSON.stringify(body.data.tags);

  const updated = await prisma.invoice.update({ where: { id }, data });

  // Kifizetettnek jelöléskor kifizetés-rekord is készül
  if (body.data.status === "PAID" && invoice.status !== "PAID") {
    await prisma.payment.create({
      data: {
        organizationId: user.organizationId,
        invoiceId: id,
        partnerId: invoice.partnerId,
        paymentDate: new Date(),
        amount: invoice.grossAmount,
        currency: invoice.currency,
        exchangeRate: invoice.exchangeRate,
        baseAmount: invoice.baseAmount,
        method: invoice.paymentMethod,
      },
    });
  }

  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId,
      userId: user.id,
      action: "UPDATE",
      entityType: "Invoice",
      entityId: id,
      changes: JSON.stringify({ before: { status: invoice.status }, after: data }),
    },
  });

  return NextResponse.json(updated);
}
