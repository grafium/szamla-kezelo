import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { clientIp } from "@/lib/audit";
import { setupTokenMatches, setupTokenRequired } from "@/lib/setup-token";
import { hungarianTaxNumber } from "@/lib/validation";
import { CURRENCIES } from "@/lib/constants";

// Első-indítási varázsló (/setup): szervezet + admin fiók + alap-kategóriák.
// Csak teljesen üres adatbázison fut — meglévő szervezet mellett 403.
//
// Két védelem zárja a varázsló ablakát:
// 1. A telepítés egyetlen tranzakcióban fut, és fix azonosítóval létrehoz egy
//    SetupGuard sort. Két egyidejű kérés közül a második az egyedi kulcson
//    elhasal, tehát nem születhet két szervezet (a puszta count() ellenőrzés
//    ezt nem zárta ki: mindkét kérés nullát láthatott).
// 2. Ha a SETUP_TOKEN környezeti változó be van állítva, a kérésnek ismernie
//    kell a kulcsot — így a varázsló friss telepítésnél sem áll nyitva
//    bárkinek addig, amíg ki nem töltik.

const SETUP_GUARD_ID = "singleton";

const setupSchema = z.object({
  orgName: z.string().min(1, "A cégnév kötelező"),
  taxNumber: hungarianTaxNumber.optional().or(z.literal("")),
  baseCurrency: z.enum(CURRENCIES),
  adminName: z.string().min(1, "A név kötelező"),
  adminEmail: z.string().email("Érvénytelen e-mail cím"),
  password: z.string().min(8, "A jelszó legalább 8 karakter legyen"),
  token: z.string().optional(),
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

// A már-beállított állapot jelzése a tranzakcióból.
class AlreadySetUpError extends Error {}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

export async function POST(req: NextRequest) {
  const body = setupSchema.safeParse(await req.json().catch(() => null));

  // A kulcsot a séma-hibák előtt ellenőrizzük, hogy hitelesítés nélkül ne
  // adjunk vissza részletes validációs információt a végpontról.
  if (setupTokenRequired()) {
    const given = (body.success ? body.data.token : null) ?? req.headers.get("x-setup-token") ?? "";
    if (!setupTokenMatches(given)) {
      return NextResponse.json(
        { error: "Érvénytelen vagy hiányzó telepítési kulcs" },
        { status: 403 }
      );
    }
  }

  if (!body.success) {
    return NextResponse.json(
      { error: "Érvénytelen adat", details: body.error.flatten() },
      { status: 400 }
    );
  }
  const data = body.data;
  const ipAddress = clientIp(req);

  try {
    await prisma.$transaction(async (tx) => {
      if ((await tx.organization.count()) > 0) throw new AlreadySetUpError();
      // Ez a sor a zár: egyidejű második kérés itt kap P2002-t.
      await tx.setupGuard.create({ data: { id: SETUP_GUARD_ID } });

      const org = await tx.organization.create({
        data: {
          name: data.orgName,
          taxNumber: data.taxNumber || null,
          baseCurrency: data.baseCurrency,
          timezone: "Europe/Budapest",
          inboundEmailToken: randomBytes(4).toString("hex"), // 8 hex karakter
        },
      });

      const user = await tx.user.create({
        data: {
          organizationId: org.id,
          email: data.adminEmail,
          name: data.adminName,
          role: "OWNER",
          passwordHash: bcrypt.hashSync(data.password, 10),
        },
      });

      await tx.category.createMany({
        data: DEFAULT_CATEGORIES.map((c) => ({ organizationId: org.id, ...c })),
      });

      await tx.auditLog.create({
        data: {
          organizationId: org.id,
          userId: user.id,
          ipAddress,
          action: "SETUP",
          entityType: "Organization",
          entityId: org.id,
          changes: JSON.stringify({
            after: { name: org.name, baseCurrency: org.baseCurrency, adminEmail: user.email },
          }),
        },
      });
    });
  } catch (err) {
    if (err instanceof AlreadySetUpError || isUniqueViolation(err)) {
      return NextResponse.json(
        { error: "A rendszer már be van állítva — jelentkezz be" },
        { status: 403 }
      );
    }
    throw err;
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
