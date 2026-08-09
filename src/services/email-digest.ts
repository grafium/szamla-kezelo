import { addDays, startOfDay } from "date-fns";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { getRate } from "@/lib/rates";
import { convertMinor } from "@/lib/money";
import type { Currency } from "@/lib/constants";
import {
  isQuiet,
  parseNotificationPrefs,
  resolveReminderSources,
  type NotificationPrefs,
} from "@/lib/notification-prefs";

// E-mail összefoglalók (D csomag): napi összefoglaló + heti előretekintés.
// A prefs (csendes listák, összeghatár) felhasználónként szűri/jelöli a sorokat.

const APP_URL = () => process.env.APP_URL ?? "http://localhost:3000";

interface DigestRow {
  date: Date;
  label: string;
  partner: string;
  amount: number | null;
  currency: Currency;
  href: string;
  big: boolean; // összeghatár felett
}

const TABLE_STYLE = 'style="border-collapse:collapse;width:100%;font-family:Arial,Helvetica,sans-serif;font-size:14px"';
const TH_STYLE = 'style="text-align:left;padding:6px 10px;border-bottom:2px solid #ddd;color:#555"';
const TD_STYLE = 'style="padding:6px 10px;border-bottom:1px solid #eee"';
const BIG_BADGE = '<span style="background:#fdecea;color:#c62828;border-radius:4px;padding:1px 6px;font-size:12px;margin-left:6px">nagy összeg</span>';

function renderTable(rows: DigestRow[]): string {
  const body = rows
    .map(
      (r) => `<tr>
  <td ${TD_STYLE}>${formatDate(r.date)}</td>
  <td ${TD_STYLE}><a href="${r.href}" style="color:#1565c0;text-decoration:none">${r.label}</a>${r.big ? BIG_BADGE : ""}</td>
  <td ${TD_STYLE}>${r.partner}</td>
  <td ${TD_STYLE} align="right">${r.amount != null ? formatMoney(r.amount, r.currency) : "–"}</td>
</tr>`
    )
    .join("\n");
  return `<table ${TABLE_STYLE}>
<thead><tr><th ${TH_STYLE}>Dátum</th><th ${TH_STYLE}>Tétel</th><th ${TH_STYLE}>Partner</th><th ${TH_STYLE} align="right">Összeg</th></tr></thead>
<tbody>${body}</tbody>
</table>`;
}

async function baseConverter(baseCurrency: Currency) {
  const today = startOfDay(new Date());
  const rateEUR = await getRate("EUR", baseCurrency, today);
  const rateUSD = await getRate("USD", baseCurrency, today);
  return (amount: number, currency: string) =>
    currency === baseCurrency ? amount :
    currency === "EUR" ? convertMinor(amount, rateEUR, baseCurrency) :
    currency === "USD" ? convertMinor(amount, rateUSD, baseCurrency) : amount;
}

/** Napi összefoglaló: a következő 7 nap terhelései + a mai emlékeztetők. */
export async function buildDailyDigest(
  organizationId: string,
  prefs: NotificationPrefs = parseNotificationPrefs("{}")
): Promise<{ subject: string; html: string }> {
  const today = startOfDay(new Date());
  const in7 = addDays(today, 7);
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const base = org.baseCurrency as Currency;

  const [occurrences, invoices, todaysReminders] = await Promise.all([
    prisma.subscriptionOccurrence.findMany({
      where: {
        status: "UPCOMING",
        dueDate: { gte: today, lte: in7 },
        subscription: { organizationId, deletedAt: null, status: { in: ["ACTIVE", "TRIAL"] } },
      },
      include: { subscription: { include: { partner: true } } },
      orderBy: { dueDate: "asc" },
    }),
    prisma.invoice.findMany({
      where: {
        organizationId, deletedAt: null, direction: "INCOMING",
        status: { in: ["APPROVED", "AWAITING_APPROVAL", "PARTIALLY_PAID", "OVERDUE"] },
        dueDate: { gte: today, lte: in7 },
      },
      include: { partner: true },
      orderBy: { dueDate: "asc" },
    }),
    prisma.reminder.findMany({
      where: {
        organizationId,
        status: { in: ["SCHEDULED", "SENT", "SNOOZED"] },
        triggerDate: { gte: today, lt: addDays(today, 1) },
      },
      orderBy: { triggerDate: "asc" },
    }),
  ]);

  // Csendes mód: a felhasználó csendes partner-/kategórialistáira illő tételek kimaradnak
  const visibleOcc = occurrences.filter(
    (o) =>
      !isQuiet({ partnerId: o.subscription.partnerId, categoryId: o.subscription.categoryId, amount: o.expectedAmount }, prefs)
  );
  const visibleInv = invoices.filter(
    (i) => !isQuiet({ partnerId: i.partnerId, categoryId: i.categoryId, amount: i.grossAmount }, prefs)
  );
  const reminderSources = await resolveReminderSources(todaysReminders);
  const visibleReminders = todaysReminders.filter((r) => !isQuiet(reminderSources.get(r.id), prefs));

  const isBig = (amount: number | null) =>
    prefs.amountThreshold != null && amount != null && amount >= prefs.amountThreshold;

  const rows: DigestRow[] = [
    ...visibleOcc.map((o) => ({
      date: o.dueDate,
      label: `${o.subscription.name} megújul`,
      partner: o.subscription.partner.name,
      amount: o.expectedAmount,
      currency: o.currency as Currency,
      href: `${APP_URL()}/elofizetesek`,
      big: isBig(o.expectedAmount),
    })),
    ...visibleInv.map((i) => ({
      date: i.dueDate,
      label: `Számla esedékes: ${i.invoiceNumber}`,
      partner: i.partner?.name ?? "–",
      amount: i.grossAmount,
      currency: i.currency as Currency,
      href: `${APP_URL()}/szamlak`,
      big: isBig(i.grossAmount),
    })),
  ].sort((a, b) => +a.date - +b.date);

  const toBaseNow = await baseConverter(base);
  const total = rows.reduce((s, r) => s + (r.amount != null ? toBaseNow(r.amount, r.currency) : 0), 0);
  const subject = `Ezen a héten ${rows.length} terhelés vár rád, összesen ${formatMoney(total, base)} értékben`;

  const remindersHtml = visibleReminders.length
    ? `<h3 style="font-family:Arial,Helvetica,sans-serif;font-size:15px;margin:20px 0 8px">Mai emlékeztetők</h3>
<ul style="font-family:Arial,Helvetica,sans-serif;font-size:14px;margin:0;padding-left:20px">
${visibleReminders.map((r) => `<li style="margin-bottom:4px">${r.message}</li>`).join("\n")}
</ul>`
    : "";

  const html = `<div style="max-width:640px;margin:0 auto">
<h2 style="font-family:Arial,Helvetica,sans-serif;font-size:18px">Napi összefoglaló — ${org.name}</h2>
<p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#555">
A következő 7 nap várható terhelései (${rows.length} tétel, összesen ${formatMoney(total, base)}):
</p>
${rows.length ? renderTable(rows) : '<p style="font-family:Arial,Helvetica,sans-serif;font-size:14px">Nincs várható terhelés a következő 7 napban.</p>'}
${remindersHtml}
<p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;margin-top:20px">
<a href="${APP_URL()}/emlekeztetok" style="color:#1565c0">Összes emlékeztető megnyitása →</a>
</p>
</div>`;

  return { subject, html };
}

/** Heti előretekintés: a következő 7 nap MINDEN pénzügyi eseménye egy kronologikus táblában. */
export async function buildWeeklyPreview(
  organizationId: string,
  prefs: NotificationPrefs = parseNotificationPrefs("{}")
): Promise<{ subject: string; html: string }> {
  const today = startOfDay(new Date());
  const in7 = addDays(today, 7);
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });

  const [occurrences, invoices, subs, purchases] = await Promise.all([
    prisma.subscriptionOccurrence.findMany({
      where: {
        status: "UPCOMING",
        dueDate: { gte: today, lte: in7 },
        subscription: { organizationId, deletedAt: null, status: { in: ["ACTIVE", "TRIAL"] } },
      },
      include: { subscription: { include: { partner: true } } },
    }),
    prisma.invoice.findMany({
      where: {
        organizationId, deletedAt: null, direction: "INCOMING",
        status: { in: ["APPROVED", "AWAITING_APPROVAL", "PARTIALLY_PAID", "OVERDUE"] },
        dueDate: { gte: today, lte: in7 },
      },
      include: { partner: true },
    }),
    prisma.subscription.findMany({
      where: {
        organizationId, deletedAt: null, status: { in: ["ACTIVE", "TRIAL"] },
        cancellationDeadline: { gte: today, lte: in7 },
      },
      include: { partner: true },
    }),
    prisma.purchase.findMany({
      where: { organizationId, deletedAt: null, warrantyUntil: { gte: today, lte: in7 } },
      include: { partner: true },
    }),
  ]);

  const isBig = (amount: number | null) =>
    prefs.amountThreshold != null && amount != null && amount >= prefs.amountThreshold;

  const rows: DigestRow[] = [
    ...occurrences
      .filter((o) => !isQuiet({ partnerId: o.subscription.partnerId, categoryId: o.subscription.categoryId, amount: null }, prefs))
      .map((o) => ({
        date: o.dueDate,
        label: `${o.subscription.name} megújul`,
        partner: o.subscription.partner.name,
        amount: o.expectedAmount,
        currency: o.currency as Currency,
        href: `${APP_URL()}/elofizetesek`,
        big: isBig(o.expectedAmount),
      })),
    ...invoices
      .filter((i) => !isQuiet({ partnerId: i.partnerId, categoryId: i.categoryId, amount: null }, prefs))
      .map((i) => ({
        date: i.dueDate,
        label: `Számla határidő: ${i.invoiceNumber}`,
        partner: i.partner?.name ?? "–",
        amount: i.grossAmount,
        currency: i.currency as Currency,
        href: `${APP_URL()}/szamlak`,
        big: isBig(i.grossAmount),
      })),
    ...subs
      .filter((s) => !isQuiet({ partnerId: s.partnerId, categoryId: s.categoryId, amount: null }, prefs))
      .map((s) => ({
        date: s.cancellationDeadline!,
        label: `Lemondási határidő: ${s.name}`,
        partner: s.partner.name,
        amount: null,
        currency: s.currency as Currency,
        href: `${APP_URL()}/elofizetesek`,
        big: false,
      })),
    ...purchases
      .filter((p) => !isQuiet({ partnerId: p.partnerId, categoryId: p.categoryId, amount: null }, prefs))
      .map((p) => ({
        date: p.warrantyUntil!,
        label: `Garancia lejár: ${p.name}`,
        partner: p.partner?.name ?? "–",
        amount: null,
        currency: p.currency as Currency,
        href: `${APP_URL()}/vasarlasok`,
        big: false,
      })),
  ].sort((a, b) => +a.date - +b.date);

  const subject = `Heti előretekintés: ${rows.length} pénzügyi esemény a következő 7 napban`;
  const html = `<div style="max-width:640px;margin:0 auto">
<h2 style="font-family:Arial,Helvetica,sans-serif;font-size:18px">Heti előretekintés — ${org.name}</h2>
<p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#555">
A következő 7 nap pénzügyi eseményei időrendben (${rows.length} tétel):
</p>
${rows.length ? renderTable(rows) : '<p style="font-family:Arial,Helvetica,sans-serif;font-size:14px">Nincs esemény a következő 7 napban.</p>'}
<p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;margin-top:20px">
<a href="${APP_URL()}" style="color:#1565c0">Megnyitás a Számlakezelőben →</a>
</p>
</div>`;

  return { subject, html };
}
