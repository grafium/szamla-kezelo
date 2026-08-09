import { NextRequest, NextResponse } from "next/server";
import { currentUserOrDemo } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import {
  INVOICE_STATUS_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
  BILLING_CYCLE_LABELS,
  PAYMENT_METHOD_LABELS,
  MATCH_STATUS_LABELS,
  PARTNER_TYPE_LABELS,
} from "@/lib/constants";

// Adatexport (Beállítások): teljes szervezeti mentés JSON-ban, illetve
// entitásonkénti CSV (pontosvesszős, UTF-8 BOM, magyar fejlécekkel).
// Csak OWNER/ADMIN szerepkörrel érhető el.

const BOM = "\uFEFF";

/** Minor unit → fő egység, tizedesvesszővel (HUF: egész, egyéb: 2 tizedes). */
function csvAmount(minor: number | null | undefined, currency: string): string {
  if (minor == null) return "";
  const major = minor / 100;
  if (currency === "HUF") return String(Math.round(major));
  return major.toFixed(2).replace(".", ",");
}

function csvDate(date: Date | null | undefined): string {
  return date ? formatDate(date) : "";
}

function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [headers.map(csvCell).join(";"), ...rows.map((r) => r.map(csvCell).join(";"))];
  return BOM + lines.join("\r\n") + "\r\n";
}

function csvResponse(filenameBase: string, content: string): NextResponse {
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(content, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filenameBase}-${date}.csv"`,
    },
  });
}

const label = (map: Record<string, string>, key: string | null | undefined) =>
  key ? map[key] ?? key : "";

export async function GET(req: NextRequest) {
  const user = await currentUserOrDemo();
  if (!user) return NextResponse.json({ error: "Bejelentkezés szükséges" }, { status: 401 });
  if (user.role !== "OWNER" && user.role !== "ADMIN") {
    return NextResponse.json({ error: "Nincs jogosultságod az exporthoz" }, { status: 403 });
  }

  const orgId = user.organizationId;
  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") ?? "json";
  const entity = searchParams.get("entity");

  if (format === "json") {
    const [
      organization, users, partners, categories, invoices, subscriptions,
      purchases, bankAccounts, bankStatements, bankTransactions, payments,
      reminders, savedFilters, matchingRules,
    ] = await Promise.all([
      prisma.organization.findUnique({ where: { id: orgId } }),
      prisma.user.findMany({
        where: { organizationId: orgId },
        select: {
          id: true, organizationId: true, email: true, name: true, role: true,
          locale: true, notificationPrefs: true, createdAt: true, updatedAt: true, deletedAt: true,
        },
      }),
      prisma.partner.findMany({ where: { organizationId: orgId }, include: { aliases: true } }),
      prisma.category.findMany({ where: { organizationId: orgId } }),
      prisma.invoice.findMany({ where: { organizationId: orgId }, include: { lineItems: true } }),
      prisma.subscription.findMany({ where: { organizationId: orgId }, include: { occurrences: true } }),
      prisma.purchase.findMany({ where: { organizationId: orgId } }),
      prisma.bankAccount.findMany({ where: { organizationId: orgId } }),
      prisma.bankStatement.findMany({ where: { organizationId: orgId } }),
      prisma.bankTransaction.findMany({ where: { bankAccount: { organizationId: orgId } } }),
      prisma.payment.findMany({ where: { organizationId: orgId } }),
      prisma.reminder.findMany({ where: { organizationId: orgId } }),
      prisma.savedFilter.findMany({ where: { organizationId: orgId } }),
      prisma.matchingRule.findMany({ where: { organizationId: orgId } }),
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      organization, users, partners, categories, invoices, subscriptions,
      purchases, bankAccounts, bankStatements, bankTransactions, payments,
      reminders, savedFilters, matchingRules,
    };
    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="szamlakezelo-export-${date}.json"`,
      },
    });
  }

  if (format !== "csv") {
    return NextResponse.json({ error: "Ismeretlen formátum" }, { status: 400 });
  }

  switch (entity) {
    case "invoices": {
      const rows = await prisma.invoice.findMany({
        where: { organizationId: orgId, deletedAt: null },
        include: { partner: true, category: true },
        orderBy: { issueDate: "desc" },
      });
      return csvResponse("szamlak", toCsv(
        ["Számlaszám", "Partner", "Irány", "Kelt", "Teljesítés", "Fizetési határidő", "Deviza",
          "Nettó", "ÁFA-kulcs", "ÁFA", "Bruttó", "Státusz", "Fizetési mód", "Kategória", "Megjegyzés"],
        rows.map((i) => [
          i.invoiceNumber, i.partner?.name ?? "",
          i.direction === "INCOMING" ? "Bejövő" : "Kimenő",
          csvDate(i.issueDate), csvDate(i.fulfillmentDate), csvDate(i.dueDate), i.currency,
          csvAmount(i.netAmount, i.currency), i.vatRate, csvAmount(i.vatAmount, i.currency),
          csvAmount(i.grossAmount, i.currency), label(INVOICE_STATUS_LABELS, i.status),
          label(PAYMENT_METHOD_LABELS, i.paymentMethod), i.category?.name ?? "", i.description ?? "",
        ])
      ));
    }
    case "subscriptions": {
      const rows = await prisma.subscription.findMany({
        where: { organizationId: orgId, deletedAt: null },
        include: { partner: true, category: true },
        orderBy: { name: "asc" },
      });
      return csvResponse("elofizetesek", toCsv(
        ["Név", "Partner", "Deviza", "Összeg", "Számlázási ciklus", "Kezdet",
          "Következő számlázás", "Lejárat", "Státusz", "Kategória"],
        rows.map((s) => [
          s.name, s.partner.name, s.currency, csvAmount(s.amount, s.currency),
          label(BILLING_CYCLE_LABELS, s.billingCycle), csvDate(s.startDate),
          csvDate(s.nextBillingDate), csvDate(s.endDate),
          label(SUBSCRIPTION_STATUS_LABELS, s.status), s.category?.name ?? "",
        ])
      ));
    }
    case "partners": {
      const rows = await prisma.partner.findMany({
        where: { organizationId: orgId, deletedAt: null },
        orderBy: { name: "asc" },
      });
      return csvResponse("partnerek", toCsv(
        ["Név", "Típus", "Adószám", "EU adószám", "Ország", "Irányítószám", "Város", "Cím",
          "E-mail", "Telefon", "Weboldal"],
        rows.map((p) => [
          p.name, label(PARTNER_TYPE_LABELS, p.type), p.taxNumber ?? "", p.euVatNumber ?? "",
          p.country ?? "", p.postalCode ?? "", p.city ?? "", p.address ?? "",
          p.email ?? "", p.phone ?? "", p.website ?? "",
        ])
      ));
    }
    case "purchases": {
      const rows = await prisma.purchase.findMany({
        where: { organizationId: orgId, deletedAt: null },
        include: { partner: true, category: true },
        orderBy: { purchaseDate: "desc" },
      });
      return csvResponse("vasarlasok", toCsv(
        ["Név", "Partner", "Vásárlás dátuma", "Deviza", "Nettó", "ÁFA", "Bruttó",
          "Kategória", "Fizetési mód", "Garancia vége"],
        rows.map((p) => [
          p.name, p.partner?.name ?? "", csvDate(p.purchaseDate), p.currency,
          csvAmount(p.netAmount, p.currency), csvAmount(p.vatAmount, p.currency),
          csvAmount(p.grossAmount, p.currency), p.category?.name ?? "",
          label(PAYMENT_METHOD_LABELS, p.paymentMethod), csvDate(p.warrantyUntil),
        ])
      ));
    }
    case "payments": {
      const rows = await prisma.payment.findMany({
        where: { organizationId: orgId, deletedAt: null },
        include: { partner: true, invoice: true },
        orderBy: { paymentDate: "desc" },
      });
      return csvResponse("kifizetesek", toCsv(
        ["Dátum", "Partner", "Számlaszám", "Összeg", "Deviza", "Fizetési mód", "Közlemény"],
        rows.map((p) => [
          csvDate(p.paymentDate), p.partner?.name ?? "", p.invoice?.invoiceNumber ?? "",
          csvAmount(p.amount, p.currency), p.currency,
          label(PAYMENT_METHOD_LABELS, p.method), p.reference ?? "",
        ])
      ));
    }
    case "bank-transactions": {
      const rows = await prisma.bankTransaction.findMany({
        where: { bankAccount: { organizationId: orgId } },
        include: { bankAccount: true, partner: true },
        orderBy: { bookingDate: "desc" },
      });
      return csvResponse("banki-tetelek", toCsv(
        ["Bankszámla", "Könyvelés dátuma", "Értéknap", "Összeg", "Deviza",
          "Ellenoldali név", "Ellenoldali számlaszám", "Közlemény", "Párosítás"],
        rows.map((t) => [
          t.bankAccount.name, csvDate(t.bookingDate), csvDate(t.valueDate),
          csvAmount(t.amount, t.currency), t.currency,
          t.counterpartyName ?? "", t.counterpartyAccount ?? t.counterpartyIban ?? "",
          t.reference ?? "", label(MATCH_STATUS_LABELS, t.matchStatus),
        ])
      ));
    }
    default:
      return NextResponse.json({ error: "Ismeretlen entitás" }, { status: 400 });
  }
}
