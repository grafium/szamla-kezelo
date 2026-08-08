import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentUserOrDemo } from "@/auth";
import { prisma } from "@/lib/prisma";
import { parseNotificationPrefs } from "@/lib/notification-prefs";

// Értesítési beállítások (9.3): a User.notificationPrefs JSON olvasása/frissítése.
// Az összeghatár minor unitban érkezik (a kliens váltja át fő egységből).

const schema = z.object({
  email: z.boolean().optional(),
  amountThreshold: z.number().int().nonnegative().nullable().optional(),
  quietCategoryIds: z.array(z.string()).optional(),
  quietPartnerIds: z.array(z.string()).optional(),
});

export async function GET() {
  const user = await currentUserOrDemo();
  if (!user) return NextResponse.json({ error: "Bejelentkezés szükséges" }, { status: 401 });
  return NextResponse.json(parseNotificationPrefs(user.notificationPrefs));
}

export async function PATCH(req: NextRequest) {
  const user = await currentUserOrDemo();
  if (!user) return NextResponse.json({ error: "Bejelentkezés szükséges" }, { status: 401 });

  const body = schema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Érvénytelen adat", details: body.error.flatten() }, { status: 400 });
  }

  const current = parseNotificationPrefs(user.notificationPrefs);
  const next = {
    email: body.data.email ?? current.email,
    amountThreshold:
      body.data.amountThreshold !== undefined ? body.data.amountThreshold : current.amountThreshold,
    quietCategoryIds: body.data.quietCategoryIds ?? current.quietCategoryIds,
    quietPartnerIds: body.data.quietPartnerIds ?? current.quietPartnerIds,
  };

  await prisma.user.update({
    where: { id: user.id },
    data: { notificationPrefs: JSON.stringify(next) },
  });

  return NextResponse.json(next);
}
