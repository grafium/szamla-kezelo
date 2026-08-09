import { prisma } from "./prisma";

// Értesítési beállítások (9.3) — a User.notificationPrefs JSON mezőben tárolva:
// { email?: boolean, amountThreshold?: number (minor unit), quietCategoryIds?: string[], quietPartnerIds?: string[] }
// A csendes szűrés kézbesítéskor érvényesül (harang-panel + napi összefoglaló),
// az emlékeztetők maguk szervezet-szintűek maradnak.

export interface NotificationPrefs {
  email: boolean;
  amountThreshold: number | null;
  quietCategoryIds: string[];
  quietPartnerIds: string[];
}

export function parseNotificationPrefs(json: string | null | undefined): NotificationPrefs {
  let raw: any = {};
  try {
    raw = JSON.parse(json || "{}") ?? {};
  } catch {
    raw = {};
  }
  return {
    email: raw.email !== false,
    amountThreshold:
      typeof raw.amountThreshold === "number" && raw.amountThreshold > 0 ? raw.amountThreshold : null,
    quietCategoryIds: Array.isArray(raw.quietCategoryIds) ? raw.quietCategoryIds.filter((x: unknown) => typeof x === "string") : [],
    quietPartnerIds: Array.isArray(raw.quietPartnerIds) ? raw.quietPartnerIds.filter((x: unknown) => typeof x === "string") : [],
  };
}

export interface ReminderSource {
  partnerId: string | null;
  categoryId: string | null;
  amount: number | null; // minor unit
}

/**
 * Az emlékeztetők forrás-entitásainak (előfizetés/számla/előfordulás/vásárlás)
 * partner-, kategória- és összegadatai — kötegelt betöltéssel.
 * Az entityType kis-/nagybetű-független (a seed "SUBSCRIPTION", a motor "Subscription" formát használ).
 */
export async function resolveReminderSources(
  reminders: { id: string; entityType: string; entityId: string }[]
): Promise<Map<string, ReminderSource>> {
  const byKind: Record<string, string[]> = { occurrence: [], subscription: [], invoice: [], purchase: [] };
  const kindOf = (entityType: string): keyof typeof byKind | null => {
    const t = entityType.toLowerCase();
    if (t === "subscriptionoccurrence") return "occurrence";
    if (t === "subscription") return "subscription";
    if (t === "invoice") return "invoice";
    if (t === "purchase") return "purchase";
    return null;
  };
  for (const r of reminders) {
    const kind = kindOf(r.entityType);
    if (kind) byKind[kind].push(r.entityId);
  }

  const [occurrences, subscriptions, invoices, purchases] = await Promise.all([
    byKind.occurrence.length
      ? prisma.subscriptionOccurrence.findMany({
          where: { id: { in: byKind.occurrence } },
          select: { id: true, expectedAmount: true, subscription: { select: { partnerId: true, categoryId: true } } },
        })
      : [],
    byKind.subscription.length
      ? prisma.subscription.findMany({
          where: { id: { in: byKind.subscription } },
          select: { id: true, partnerId: true, categoryId: true, amount: true },
        })
      : [],
    byKind.invoice.length
      ? prisma.invoice.findMany({
          where: { id: { in: byKind.invoice } },
          select: { id: true, partnerId: true, categoryId: true, grossAmount: true },
        })
      : [],
    byKind.purchase.length
      ? prisma.purchase.findMany({
          where: { id: { in: byKind.purchase } },
          select: { id: true, partnerId: true, categoryId: true, grossAmount: true },
        })
      : [],
  ]);

  const sourceByEntityId = new Map<string, ReminderSource>();
  for (const o of occurrences) {
    sourceByEntityId.set(o.id, {
      partnerId: o.subscription.partnerId,
      categoryId: o.subscription.categoryId,
      amount: o.expectedAmount,
    });
  }
  for (const s of subscriptions) {
    sourceByEntityId.set(s.id, { partnerId: s.partnerId, categoryId: s.categoryId, amount: s.amount });
  }
  for (const i of invoices) {
    sourceByEntityId.set(i.id, { partnerId: i.partnerId, categoryId: i.categoryId, amount: i.grossAmount });
  }
  for (const p of purchases) {
    sourceByEntityId.set(p.id, { partnerId: p.partnerId, categoryId: p.categoryId, amount: p.grossAmount });
  }

  const out = new Map<string, ReminderSource>();
  for (const r of reminders) {
    out.set(r.id, sourceByEntityId.get(r.entityId) ?? { partnerId: null, categoryId: null, amount: null });
  }
  return out;
}

/** Csendes mód: illik-e a forrás a felhasználó csendes partner-/kategórialistáira? */
export function isQuiet(source: ReminderSource | undefined, prefs: NotificationPrefs): boolean {
  if (!source) return false;
  if (source.partnerId && prefs.quietPartnerIds.includes(source.partnerId)) return true;
  if (source.categoryId && prefs.quietCategoryIds.includes(source.categoryId)) return true;
  return false;
}
