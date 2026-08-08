import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentUserOrDemo } from "@/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  name: z.string().min(1, "A név kötelező"),
  entityType: z.string(),
  filterJson: z.string(),
  isPinned: z.boolean().optional(),
  isShared: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const user = await currentUserOrDemo();
  if (!user) return NextResponse.json({ error: "Bejelentkezés szükséges" }, { status: 401 });

  const body = schema.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Érvénytelen adat", details: body.error.flatten() }, { status: 400 });
  }

  const saved = await prisma.savedFilter.create({
    data: {
      organizationId: user.organizationId,
      userId: user.id,
      name: body.data.name,
      entityType: body.data.entityType,
      filterJson: body.data.filterJson,
      isPinned: body.data.isPinned ?? false,
      isShared: body.data.isShared ?? false,
    },
  });
  return NextResponse.json(saved);
}
