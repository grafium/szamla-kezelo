import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { hungarianTaxNumber } from "@/lib/validation";
import { CURRENCIES } from "@/lib/constants";

// Első-indítási varázsló (/setup): szervezet + admin fiók + alap-kategóriák.
// Csak teljesen üres adatbázison fut — meglévő szervezet mellett 403.

const setupSchema = z.object({
  orgName: z.string().min(1, "A cégnév kötelező"),
  taxNumber: hungarianTaxNumber.optional().or(z.literal("")),
  baseCurrency: z.enum(CURRENCIES),
  adminName: z.string().min(1, "A név kötelező"),
  adminEmail: z.string().email("Érvénytelen e-mail cím"),
  password: z.string().min(8, "A jelszó legalább 8 karakter legyen"),
});

// Alapértelmezett kategóriakészlet új szervezethez
const DEFAULT_CATEGORIES: { name: string; color: string; type: string }[] = [
  { name: "Szoftver", color: "blue", type: "EXPENSE" },
  { name: "Infrastruktúra", color: "purple", type: "EXPENSE" },
  { name: "Iroda", color: "orange", type: "EXPENSE" },
  { name: "Könyvelés", color: "green", type: "EXPENSE" },
  { name: "Telekommunikáció", color: "pink", type: "EXPENSE" },
  { name: "Eszközök", color: "gray", type: "EXPENSE" },
  { name: "Egyéb", color: "yellow", type: "EXPENSE" },
  { name: "Bevétel", color: "green", type: "INCOME" },
];

export async function POST(req: NextRequest) {
  const existing = await prisma.organization.count();
  if (existing > 0) {
    return NextResponse.json(
      { error: "A rendszer már be van állítva — jelentkezz be" },
      { status: 403 }
    );
  }

  const body = setupSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json(
      { error: "Érvénytelen adat", details: body.error.flatten() },
      { status: 400 }
    );
  }
  const data = body.data;

  const org = await prisma.organization.create({
    data: {
      name: data.orgName,
      taxNumber: data.taxNumber || null,
      baseCurrency: data.baseCurrency,
      timezone: "Europe/Budapest",
      inboundEmailToken: randomBytes(4).toString("hex"), // 8 hex karakter
    },
  });

  const user = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: data.adminEmail,
      name: data.adminName,
      role: "OWNER",
      passwordHash: bcrypt.hashSync(data.password, 10),
    },
  });

  await prisma.category.createMany({
    data: DEFAULT_CATEGORIES.map((c) => ({ organizationId: org.id, ...c })),
  });

  await prisma.auditLog.create({
    data: {
      organizationId: org.id,
      userId: user.id,
      action: "SETUP",
      entityType: "Organization",
      entityId: org.id,
      changes: JSON.stringify({
        after: { name: org.name, baseCurrency: org.baseCurrency, adminEmail: user.email },
      }),
    },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
