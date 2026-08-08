import { NextRequest, NextResponse } from "next/server";
import { currentUserOrDemo } from "@/auth";
import { prisma } from "@/lib/prisma";

// Párosítási szabály törlése (szervezet-szintű jogosultsággal).

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUserOrDemo();
  if (!user) return NextResponse.json({ error: "Bejelentkezés szükséges" }, { status: 401 });
  if (user.role === "VIEWER") return NextResponse.json({ error: "Nincs jogosultságod a törléshez" }, { status: 403 });

  const rule = await prisma.matchingRule.findFirst({
    where: { id, organizationId: user.organizationId },
  });
  if (!rule) return NextResponse.json({ error: "A szabály nem található" }, { status: 404 });

  await prisma.matchingRule.delete({ where: { id } });

  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId,
      userId: user.id,
      action: "DELETE",
      entityType: "MatchingRule",
      entityId: id,
      changes: JSON.stringify({ before: { name: rule.name, referenceContains: rule.referenceContains } }),
    },
  });

  return NextResponse.json({ ok: true });
}
