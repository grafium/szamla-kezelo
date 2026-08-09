import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentUserOrDemo } from "@/auth";
import { prisma } from "@/lib/prisma";
import { clientIp } from "@/lib/audit";

// Párosítási szabály létrehozása: ha a közlemény tartalmazza a mintát,
// az importált tétel megkapja a partnert/kategóriát.

const schema = z.object({
  name: z.string().min(1, "A név megadása kötelező").max(120),
  referenceContains: z.string().min(2, "A minta legalább 2 karakter legyen").max(200),
  partnerId: z.string().optional(),
  categoryId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const user = await currentUserOrDemo();
  if (!user) return NextResponse.json({ error: "Bejelentkezés szükséges" }, { status: 401 });
  if (user.role === "VIEWER") return NextResponse.json({ error: "Nincs jogosultságod a létrehozáshoz" }, { status: 403 });

  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Érvénytelen adat", details: body.error.flatten() }, { status: 400 });
  }
  const data = body.data;

  if (data.partnerId) {
    const partner = await prisma.partner.findFirst({
      where: { id: data.partnerId, organizationId: user.organizationId, deletedAt: null },
    });
    if (!partner) return NextResponse.json({ error: "A partner nem található" }, { status: 400 });
  }
  if (data.categoryId) {
    const category = await prisma.category.findFirst({
      where: { id: data.categoryId, organizationId: user.organizationId, deletedAt: null },
    });
    if (!category) return NextResponse.json({ error: "A kategória nem található" }, { status: 400 });
  }

  const created = await prisma.matchingRule.create({
    data: {
      organizationId: user.organizationId,
      name: data.name,
      referenceContains: data.referenceContains,
      partnerId: data.partnerId || null,
      categoryId: data.categoryId || null,
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId,
      userId: user.id,
      ipAddress: clientIp(req),
      action: "CREATE",
      entityType: "MatchingRule",
      entityId: created.id,
      changes: JSON.stringify({ after: { name: created.name, referenceContains: created.referenceContains } }),
    },
  });

  return NextResponse.json(created, { status: 201 });
}
