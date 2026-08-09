import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { compare, hashSync } from "bcryptjs";
import { requireUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { clientIp } from "@/lib/audit";

// Jelszóváltoztatás — kizárólag valódi (bejelentkezett) sessionnel,
// demó-módban sem elérhető session nélkül.

const schema = z.object({
  currentPassword: z.string().min(1, "Add meg a jelenlegi jelszót"),
  newPassword: z.string().min(8, "Az új jelszó legalább 8 karakter legyen"),
});

export async function PATCH(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Bejelentkezés szükséges" }, { status: 401 });

  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    const first = body.error.issues[0]?.message ?? "Érvénytelen adat";
    return NextResponse.json({ error: first, details: body.error.flatten() }, { status: 400 });
  }

  const ok = await compare(body.data.currentPassword, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "A jelenlegi jelszó nem megfelelő" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hashSync(body.data.newPassword, 10) },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId,
      userId: user.id,
      ipAddress: clientIp(req),
      action: "PASSWORD_CHANGE",
      entityType: "User",
      entityId: user.id,
    },
  });

  return NextResponse.json({ ok: true });
}
