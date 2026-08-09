// prisma/seed.ts — Grafium Kft. demo adatok
// Futtatás: npx tsx prisma/seed.ts (üres adatbázist feltételez)
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  addDays,
  subDays,
  addMonths,
  subMonths,
  setDate,
  startOfDay,
  startOfMonth,
  endOfMonth,
  getDaysInMonth,
} from "date-fns";

const prisma = new PrismaClient();
const NOW = new Date();

// ---------- helpers ----------
let _seed = 42;
function rand(): number {
  _seed = (_seed * 9301 + 49297) % 233280;
  return _seed / 233280;
}
function randInt(min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}
const money = (major: number) => Math.round(major * 100); // fillér/cent
const d = (daysOffset: number) =>
  daysOffset >= 0 ? addDays(NOW, daysOffset) : subDays(NOW, -daysOffset);
const tags = (...xs: string[]) => JSON.stringify(xs);

function fxRate(currency: string, date: Date): number {
  if (currency === "HUF") return 1;
  const i = Math.floor(date.getTime() / 86_400_000);
  const base = currency === "EUR" ? 395 : 365;
  const mul = currency === "EUR" ? 1.7 : 2.3;
  return Math.round((base + 2 * Math.sin(i * mul)) * 100) / 100;
}
const toBase = (grossMinor: number, rate: number) => Math.round(grossMinor * rate);

function grossToParts(vatRate: string, gross: number) {
  if (vatRate === "27") {
    const net = Math.round(gross / 1.27);
    return { net, vat: gross - net, gross };
  }
  return { net: gross, vat: 0, gross }; // EU | HO | AAM | TAM | FAD ...
}

// ---------- main ----------
async function main() {
  // Éles indulás üres adatbázissal: demó adatot csak kifejezett kérésre töltünk.
  if (process.env.SEED_DEMO !== "1") {
    console.log("Demó seed kihagyva (SEED_DEMO != 1)");
    return;
  }
  // Idempotencia: ha már van adat (pl. korábbi Vercel-build seedelt), nem fut újra.
  const existing = await prisma.organization.count();
  if (existing > 0) {
    console.log("A seed kihagyva — az adatbázis már tartalmaz adatokat.");
    return;
  }

  console.log("Seedelés indul...", NOW.toISOString());

  // 1. Organization
  const org = await prisma.organization.create({
    data: {
      name: "Grafium Kft.",
      taxNumber: "12345678-2-41",
      baseCurrency: "HUF",
      inboundEmailToken: "grafium-x7k2",
    },
  });

  // 2. User
  const user = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: "demo@grafium.hu",
      name: "Demo Felhasználó",
      role: "OWNER",
      passwordHash: bcrypt.hashSync("demo1234", 10),
    },
  });

  // 3. ExchangeRate — elmúlt 60 nap + következő 30 nap
  const rateRows: any[] = [];
  for (let i = -60; i <= 30; i++) {
    const date = startOfDay(d(i));
    rateRows.push({
      date,
      baseCurrency: "EUR",
      targetCurrency: "HUF",
      rate: Math.round((395 + 2 * Math.sin(i * 1.7)) * 100) / 100,
      source: "MNB",
    });
    rateRows.push({
      date,
      baseCurrency: "USD",
      targetCurrency: "HUF",
      rate: Math.round((365 + 2 * Math.sin(i * 2.3)) * 100) / 100,
      source: "MNB",
    });
  }
  await prisma.exchangeRate.createMany({ data: rateRows });

  // 4. Kategóriák
  async function cat(
    name: string,
    color: string,
    opts: { type?: string; parentId?: string; monthlyBudget?: number } = {}
  ) {
    return prisma.category.create({
      data: {
        organizationId: org.id,
        name,
        color,
        type: opts.type ?? "EXPENSE",
        parentId: opts.parentId,
        monthlyBudget: opts.monthlyBudget,
      },
    });
  }
  const cSzoftver = await cat("Szoftver", "blue", { monthlyBudget: money(650_000) });
  const cInfra = await cat("Infrastruktúra", "purple", { monthlyBudget: money(180_000) });
  const cMarketing = await cat("Marketing", "pink", { monthlyBudget: money(400_000) });
  const cIroda = await cat("Iroda", "orange");
  const cBerlet = await cat("Bérlet", "orange", { parentId: cIroda.id });
  const cRezsi = await cat("Rezsi", "yellow", { parentId: cIroda.id, monthlyBudget: money(120_000) });
  const cKonyveles = await cat("Könyvelés", "green");
  const cJogi = await cat("Jogi", "gray");
  const cAlvallalkozo = await cat("Alvállalkozók", "red", { monthlyBudget: money(2_000_000) });
  const cTelekom = await cat("Telekommunikáció", "blue");
  const cEszkozok = await cat("Eszközök", "green");
  const cUtazas = await cat("Utazás", "yellow");
  const cBevetel = await cat("Bevétel", "green", { type: "INCOME" });

  // 5. Partnerek
  type Region = "HU" | "EU" | "US" | "OTHER";
  interface PDef {
    key: string;
    name: string;
    region: Region;
    country: string;
    currency: string;
    color: string;
    tags: string[];
    taxNumber?: string;
    euVatNumber?: string;
    aliases?: string[];
    city?: string;
    website?: string;
    vatOverride?: string; // pl. TAM (biztosítás)
    invPrefix: string;
    defaultCategoryId?: string;
  }
  const partnerDefs: PDef[] = [
    { key: "telekom", name: "Magyar Telekom Nyrt.", region: "HU", country: "HU", currency: "HUF", color: "pink", tags: ["telekom", "szolgáltató"], taxNumber: "10773381-2-44", city: "Budapest", website: "https://www.telekom.hu", invPrefix: "MT", defaultCategoryId: cTelekom.id, aliases: ["MAGYAR TELEKOM NYRT"] },
    { key: "mvm", name: "MVM Next Energiakereskedelmi Zrt.", region: "HU", country: "HU", currency: "HUF", color: "yellow", tags: ["rezsi", "szolgáltató"], taxNumber: "26713111-2-44", city: "Budapest", invPrefix: "MVM", defaultCategoryId: cRezsi.id, aliases: ["MVM NEXT ENERGIAKER."] },
    { key: "google", name: "Google Ireland Ltd", region: "EU", country: "IE", currency: "EUR", color: "blue", tags: ["szoftver", "felhő"], euVatNumber: "IE6388047V", city: "Dublin", website: "https://workspace.google.com", invPrefix: "GI", defaultCategoryId: cSzoftver.id, aliases: ["GOOGLE*CLOUD IE", "GOOGLE IRELAND LTD"] },
    { key: "adobe", name: "Adobe Systems Software Ireland Ltd", region: "EU", country: "IE", currency: "EUR", color: "red", tags: ["szoftver", "kreatív"], euVatNumber: "IE6364992H", city: "Dublin", website: "https://www.adobe.com", invPrefix: "ADB", defaultCategoryId: cSzoftver.id, aliases: ["ADOBE SYSTEMS SOFTWARE IE", "ADOBE *CREATIVE CLOUD"] },
    { key: "figma", name: "Figma Inc", region: "US", country: "US", currency: "USD", color: "purple", tags: ["szoftver", "design"], city: "San Francisco", website: "https://www.figma.com", invPrefix: "FIG", defaultCategoryId: cSzoftver.id, aliases: ["FIGMA MONTHLY RENEWAL", "FIGMA INC"] },
    { key: "github", name: "GitHub Inc", region: "US", country: "US", currency: "USD", color: "gray", tags: ["szoftver", "fejlesztés"], city: "San Francisco", website: "https://github.com", invPrefix: "GH", defaultCategoryId: cSzoftver.id, aliases: ["GITHUB, INC."] },
    { key: "vercel", name: "Vercel Inc", region: "US", country: "US", currency: "USD", color: "gray", tags: ["infrastruktúra", "hosting"], city: "San Francisco", website: "https://vercel.com", invPrefix: "VRC", defaultCategoryId: cInfra.id, aliases: ["VERCEL INC."] },
    { key: "anthropic", name: "Anthropic PBC", region: "US", country: "US", currency: "USD", color: "orange", tags: ["szoftver", "AI"], city: "San Francisco", website: "https://www.anthropic.com", invPrefix: "ANT", defaultCategoryId: cSzoftver.id, aliases: ["ANTHROPIC", "CLAUDE.AI SUBSCRIPTION"] },
    { key: "notion", name: "Notion Labs Inc", region: "US", country: "US", currency: "USD", color: "gray", tags: ["szoftver", "produktivitás"], city: "San Francisco", website: "https://www.notion.so", invPrefix: "NTN", defaultCategoryId: cSzoftver.id, aliases: ["NOTION LABS, INC."] },
    { key: "slack", name: "Slack Technologies Limited", region: "EU", country: "IE", currency: "EUR", color: "purple", tags: ["szoftver", "kommunikáció"], euVatNumber: "IE3336483DH", city: "Dublin", website: "https://slack.com", invPrefix: "SLK", defaultCategoryId: cSzoftver.id, aliases: ["SLACK TECHNOLOGIES LTD"] },
    { key: "microsoft", name: "Microsoft Ireland Operations Ltd", region: "EU", country: "IE", currency: "EUR", color: "blue", tags: ["szoftver"], euVatNumber: "IE8256796U", city: "Dublin", website: "https://www.microsoft.com", invPrefix: "MS", defaultCategoryId: cSzoftver.id, aliases: ["MSFT*M365 BUSINESS", "MICROSOFT IRELAND"] },
    { key: "openai", name: "OpenAI LLC", region: "US", country: "US", currency: "USD", color: "green", tags: ["szoftver", "AI"], city: "San Francisco", website: "https://openai.com", invPrefix: "OAI", defaultCategoryId: cSzoftver.id, aliases: ["OPENAI *CHATGPT SUBSCR"] },
    { key: "szamvitel", name: "Számvitel Plusz Kft.", region: "HU", country: "HU", currency: "HUF", color: "green", tags: ["könyvelés"], taxNumber: "23456789-2-13", city: "Budapest", invPrefix: "SZP", defaultCategoryId: cKonyveles.id },
    { key: "ugyved", name: "Dr. Kovács Ügyvédi Iroda", region: "HU", country: "HU", currency: "HUF", color: "gray", tags: ["jogi"], taxNumber: "18345672-2-42", city: "Budapest", invPrefix: "DKU", defaultCategoryId: cJogi.id },
    { key: "pixel", name: "Pixel Stúdió Bt.", region: "HU", country: "HU", currency: "HUF", color: "pink", tags: ["alvállalkozó", "design"], taxNumber: "21987654-2-41", city: "Budapest", invPrefix: "PIX", defaultCategoryId: cAlvallalkozo.id },
    { key: "kodmester", name: "Kódmester Kft.", region: "HU", country: "HU", currency: "HUF", color: "blue", tags: ["alvállalkozó", "fejlesztés"], taxNumber: "25678123-2-13", city: "Szeged", invPrefix: "KM", defaultCategoryId: cAlvallalkozo.id },
    { key: "irodahaz", name: "Irodaház Zrt.", region: "HU", country: "HU", currency: "HUF", color: "orange", tags: ["iroda", "bérlet"], taxNumber: "24561234-2-41", city: "Budapest", invPrefix: "IH", defaultCategoryId: cBerlet.id },
    { key: "digitalocean", name: "DigitalOcean LLC", region: "US", country: "US", currency: "USD", color: "blue", tags: ["infrastruktúra", "hosting"], city: "New York", website: "https://www.digitalocean.com", invPrefix: "DO", defaultCategoryId: cInfra.id, aliases: ["DIGITALOCEAN.COM"] },
    { key: "cloudflare", name: "Cloudflare Inc", region: "US", country: "US", currency: "USD", color: "orange", tags: ["infrastruktúra"], city: "San Francisco", website: "https://www.cloudflare.com", invPrefix: "CF", defaultCategoryId: cInfra.id, aliases: ["CLOUDFLARE"] },
    { key: "mailchimp", name: "Mailchimp (The Rocket Science Group LLC)", region: "US", country: "US", currency: "USD", color: "yellow", tags: ["marketing"], city: "Atlanta", website: "https://mailchimp.com", invPrefix: "MC", defaultCategoryId: cMarketing.id, aliases: ["MAILCHI*MP MONTHLY"] },
    { key: "canva", name: "Canva Pty Ltd", region: "OTHER", country: "AU", currency: "USD", color: "purple", tags: ["szoftver", "design"], city: "Sydney", website: "https://www.canva.com", invPrefix: "CNV", defaultCategoryId: cSzoftver.id, aliases: ["CANVA* I04328-2333"] },
    { key: "zoom", name: "Zoom Video Communications Inc", region: "US", country: "US", currency: "USD", color: "blue", tags: ["szoftver", "kommunikáció"], city: "San Jose", website: "https://zoom.us", invPrefix: "ZM", defaultCategoryId: cSzoftver.id, aliases: ["ZOOM.US 888-799-9666"] },
    { key: "wise", name: "Wise Europe SA", region: "EU", country: "BE", currency: "EUR", color: "green", tags: ["pénzügy", "bank"], euVatNumber: "BE0713629988", city: "Brussels", website: "https://wise.com", invPrefix: "WS", defaultCategoryId: cInfra.id, aliases: ["WISE EUROPE SA/NV", "TRANSFERWISE"] },
    { key: "nav", name: "Nemzeti Adó- és Vámhivatal", region: "HU", country: "HU", currency: "HUF", color: "red", tags: ["adó", "hivatal"], taxNumber: "15789934-2-51", city: "Budapest", invPrefix: "NAV", vatOverride: "TAM", defaultCategoryId: cKonyveles.id },
    { key: "generali", name: "Generali Biztosító Zrt.", region: "HU", country: "HU", currency: "HUF", color: "red", tags: ["biztosítás"], taxNumber: "10308024-2-44", city: "Budapest", invPrefix: "GEN", vatOverride: "TAM", defaultCategoryId: cIroda.id },
  ];

  const partners: Record<string, { id: string; def: PDef; aliasNames: string[] }> = {};
  for (const def of partnerDefs) {
    const p = await prisma.partner.create({
      data: {
        organizationId: org.id,
        name: def.name,
        type: "SUPPLIER",
        taxNumber: def.taxNumber,
        euVatNumber: def.euVatNumber,
        country: def.country,
        city: def.city,
        website: def.website,
        defaultCurrency: def.currency,
        defaultCategoryId: def.defaultCategoryId,
        color: def.color,
        tags: JSON.stringify(def.tags),
      },
    });
    if (def.aliases) {
      for (const alias of def.aliases) {
        await prisma.partnerAlias.create({ data: { partnerId: p.id, alias } });
      }
    }
    partners[def.key] = { id: p.id, def, aliasNames: def.aliases ?? [] };
  }

  function vatRateFor(pkey: string): string {
    const def = partners[pkey].def;
    if (def.vatOverride) return def.vatOverride;
    if (def.region === "HU") return "27";
    if (def.region === "EU") return "EU";
    return "HO";
  }

  // 10. Bankszámlák (korábban létrehozva, hogy a fizetésekhez linkelhessük)
  const accHUF = await prisma.bankAccount.create({
    data: {
      organizationId: org.id,
      name: "HUF főszámla",
      bankName: "OTP Bank",
      accountNumber: "11712004-20456789-00000000",
      currency: "HUF",
      openingBalance: money(4_800_000),
      currentBalance: money(4_800_000),
      color: "green",
    },
  });
  const accEUR = await prisma.bankAccount.create({
    data: {
      organizationId: org.id,
      name: "EUR számla",
      bankName: "Wise",
      iban: "BE79 9670 1234 5678",
      swift: "TRWIBEB1XXX",
      currency: "EUR",
      openingBalance: money(12_500),
      currentBalance: money(12_500),
      color: "blue",
    },
  });
  const accUSD = await prisma.bankAccount.create({
    data: {
      organizationId: org.id,
      name: "USD számla",
      bankName: "Wise",
      accountNumber: "8310998877",
      swift: "TRWIUS35XXX",
      currency: "USD",
      openingBalance: money(9_200),
      currentBalance: money(9_200),
      color: "purple",
    },
  });
  const accountByCurrency: Record<string, { id: string }> = {
    HUF: accHUF,
    EUR: accEUR,
    USD: accUSD,
  };

  // 6. Előfizetések
  interface SDef {
    key: string;
    partnerKey: string;
    name: string;
    currency: string;
    amount: number; // minor
    cycle: "MONTHLY" | "QUARTERLY" | "ANNUAL";
    status: "ACTIVE" | "TRIAL" | "CANCELLED";
    monthsAgo: number;
    anchorDay: number;
    categoryId: string;
    url?: string;
    last4?: string;
    seats?: number;
    pricePerSeat?: number;
    paymentMethod?: string;
    trialDaysFromNow?: number;
    cancellationDeadlineDays?: number;
    noticePeriodDays?: number;
    endMonthsAgo?: number;
    priceIncrease?: { oldAmount: number; newAmount: number; lastN: number };
    notes?: string;
  }
  const subDefs: SDef[] = [
    { key: "gws", partnerKey: "google", name: "Google Workspace Business Standard", currency: "EUR", amount: 8 * 1380, cycle: "MONTHLY", status: "ACTIVE", monthsAgo: 18, anchorDay: 3, categoryId: cSzoftver.id, url: "https://admin.google.com", last4: "4821", seats: 8, pricePerSeat: 1380 },
    { key: "adobecc", partnerKey: "adobe", name: "Adobe Creative Cloud All Apps", currency: "EUR", amount: money(719.88), cycle: "ANNUAL", status: "ACTIVE", monthsAgo: 14, anchorDay: 12, categoryId: cSzoftver.id, url: "https://account.adobe.com", last4: "4821" },
    { key: "figma", partnerKey: "figma", name: "Figma Professional", currency: "USD", amount: 4950, cycle: "MONTHLY", status: "ACTIVE", monthsAgo: 16, anchorDay: 8, categoryId: cSzoftver.id, url: "https://www.figma.com", last4: "4821", seats: 3, pricePerSeat: 1650, priceIncrease: { oldAmount: 4500, newAmount: 4950, lastN: 2 }, notes: "2 hónapja ~10% áremelés (45 → 49,50 USD)." },
    { key: "ghteam", partnerKey: "github", name: "GitHub Team", currency: "USD", amount: 2400, cycle: "MONTHLY", status: "ACTIVE", monthsAgo: 20, anchorDay: 15, categoryId: cSzoftver.id, url: "https://github.com/organizations", last4: "0934", seats: 6, pricePerSeat: 400 },
    { key: "vercel", partnerKey: "vercel", name: "Vercel Pro", currency: "USD", amount: 2000, cycle: "MONTHLY", status: "ACTIVE", monthsAgo: 12, anchorDay: 21, categoryId: cInfra.id, url: "https://vercel.com/dashboard", last4: "0934" },
    { key: "anthropic", partnerKey: "anthropic", name: "Anthropic API", currency: "USD", amount: 15000, cycle: "MONTHLY", status: "ACTIVE", monthsAgo: 9, anchorDay: 5, categoryId: cSzoftver.id, url: "https://console.anthropic.com", last4: "0934" },
    { key: "notion", partnerKey: "notion", name: "Notion Business", currency: "USD", amount: 96000, cycle: "ANNUAL", status: "ACTIVE", monthsAgo: 13, anchorDay: 20, categoryId: cSzoftver.id, url: "https://www.notion.so", last4: "4821" },
    { key: "slack", partnerKey: "slack", name: "Slack Pro", currency: "EUR", amount: 8 * 870, cycle: "MONTHLY", status: "ACTIVE", monthsAgo: 17, anchorDay: 11, categoryId: cSzoftver.id, url: "https://slack.com/billing", last4: "4821", seats: 8, pricePerSeat: 870 },
    { key: "m365", partnerKey: "microsoft", name: "Microsoft 365 Business Standard", currency: "EUR", amount: 105600, cycle: "ANNUAL", status: "ACTIVE", monthsAgo: 11, anchorDay: 26, categoryId: cSzoftver.id, url: "https://admin.microsoft.com", last4: "4821", seats: 8, pricePerSeat: 13200, cancellationDeadlineDays: 90, noticePeriodDays: 30 },
    { key: "telekomnet", partnerKey: "telekom", name: "Telekom üzleti internet + mobil flotta", currency: "HUF", amount: money(24_990), cycle: "MONTHLY", status: "ACTIVE", monthsAgo: 20, anchorDay: 10, categoryId: cTelekom.id, url: "https://www.telekom.hu/uzleti", paymentMethod: "DIRECT_DEBIT" },
    { key: "mvmaram", partnerKey: "mvm", name: "MVM áram — iroda", currency: "HUF", amount: money(52_400), cycle: "MONTHLY", status: "ACTIVE", monthsAgo: 20, anchorDay: 14, categoryId: cRezsi.id, paymentMethod: "DIRECT_DEBIT" },
    { key: "berlet", partnerKey: "irodahaz", name: "Irodabérlet — Váci út 22.", currency: "HUF", amount: money(485_000), cycle: "MONTHLY", status: "ACTIVE", monthsAgo: 19, anchorDay: 1, categoryId: cBerlet.id, paymentMethod: "TRANSFER", cancellationDeadlineDays: 40, noticePeriodDays: 60 },
    { key: "konyveles", partnerKey: "szamvitel", name: "Könyvelési átalánydíj", currency: "HUF", amount: money(95_000), cycle: "MONTHLY", status: "ACTIVE", monthsAgo: 20, anchorDay: 8, categoryId: cKonyveles.id, paymentMethod: "TRANSFER" },
    { key: "zoom", partnerKey: "zoom", name: "Zoom Pro", currency: "USD", amount: 14990, cycle: "ANNUAL", status: "ACTIVE", monthsAgo: 10, anchorDay: 18, categoryId: cSzoftver.id, url: "https://zoom.us/billing", last4: "0934", cancellationDeadlineDays: 5, noticePeriodDays: 30 },
    { key: "cloudflare", partnerKey: "cloudflare", name: "Cloudflare Pro", currency: "USD", amount: 2500, cycle: "MONTHLY", status: "CANCELLED", monthsAgo: 15, anchorDay: 6, categoryId: cInfra.id, url: "https://dash.cloudflare.com", last4: "0934", endMonthsAgo: 2, notes: "Free plan-re váltottunk." },
    { key: "mailchimp", partnerKey: "mailchimp", name: "Mailchimp Standard", currency: "USD", amount: 2000, cycle: "MONTHLY", status: "TRIAL", monthsAgo: 0, anchorDay: 1, categoryId: cMarketing.id, url: "https://mailchimp.com", last4: "4821", trialDaysFromNow: 6 },
    { key: "canva", partnerKey: "canva", name: "Canva Teams", currency: "USD", amount: 30000, cycle: "ANNUAL", status: "TRIAL", monthsAgo: 0, anchorDay: 1, categoryId: cSzoftver.id, url: "https://www.canva.com", last4: "4821", trialDaysFromNow: 9 },
    { key: "docean", partnerKey: "digitalocean", name: "DigitalOcean droplets + spaces", currency: "USD", amount: 4800, cycle: "MONTHLY", status: "ACTIVE", monthsAgo: 16, anchorDay: 1, categoryId: cInfra.id, url: "https://cloud.digitalocean.com", last4: "0934" },
    { key: "generali", partnerKey: "generali", name: "Generali vagyonbiztosítás", currency: "HUF", amount: money(38_500), cycle: "QUARTERLY", status: "ACTIVE", monthsAgo: 18, anchorDay: 4, categoryId: cIroda.id, paymentMethod: "TRANSFER" },
  ];

  const cycleMonths = (c: string) => (c === "MONTHLY" ? 1 : c === "QUARTERLY" ? 3 : 12);

  interface OccRec {
    id: string;
    subKey: string;
    dueDate: Date;
    amount: number; // actual
    currency: string;
    partnerKey: string;
    categoryId: string;
    subscriptionId: string;
    paymentMethod: string;
  }
  const subs: Record<string, any> = {};
  const pastOccs: OccRec[] = [];
  let occInNext30 = 0;

  for (const sd of subDefs) {
    const partner = partners[sd.partnerKey];
    const vatRate = vatRateFor(sd.partnerKey);
    const step = cycleMonths(sd.cycle);
    const paymentMethod = sd.paymentMethod ?? "CARD";

    let startDate: Date;
    let dates: Date[] = [];
    let trialEndsAt: Date | undefined;
    let endDate: Date | undefined;

    if (sd.status === "TRIAL") {
      startDate = subDays(NOW, 14);
      trialEndsAt = d(sd.trialDaysFromNow!);
      let dt = trialEndsAt;
      let i = 0;
      const horizon = addMonths(NOW, 12);
      while (dt <= horizon) {
        dates.push(dt);
        i++;
        dt = addMonths(trialEndsAt, i * step);
      }
    } else {
      startDate = setDate(subMonths(NOW, sd.monthsAgo), sd.anchorDay);
      if (sd.status === "CANCELLED") endDate = subMonths(NOW, sd.endMonthsAgo!);
      const horizon = addMonths(NOW, 12);
      let i = 0;
      let dt = startDate;
      while (dt <= horizon) {
        if (!endDate || dt <= endDate) dates.push(dt);
        i++;
        dt = addMonths(startDate, i * step);
      }
    }

    const past = dates.filter((x) => x <= NOW).slice(-8);
    const future = dates.filter((x) => x > NOW);
    const nextBillingDate =
      future[0] ?? endDate ?? addMonths(past[past.length - 1] ?? NOW, step);

    const sub = await prisma.subscription.create({
      data: {
        organizationId: org.id,
        partnerId: partner.id,
        name: sd.name,
        currency: sd.currency,
        amount: sd.amount,
        vatRate,
        billingCycle: sd.cycle,
        startDate,
        nextBillingDate,
        endDate,
        cancellationDeadline: sd.cancellationDeadlineDays != null ? d(sd.cancellationDeadlineDays) : undefined,
        noticePeriodDays: sd.noticePeriodDays,
        autoRenew: sd.status !== "CANCELLED",
        status: sd.status,
        trialEndsAt,
        paymentMethod,
        paymentSourceLast4: sd.last4,
        categoryId: sd.categoryId,
        seats: sd.seats,
        pricePerSeat: sd.pricePerSeat,
        reminderDaysBefore: sd.cycle === "ANNUAL" ? "[30,14,3]" : "[14,3,1]",
        url: sd.url,
        tags: JSON.stringify(partners[sd.partnerKey].def.tags),
        notes: sd.notes,
      },
    });
    subs[sd.key] = { ...sub, def: sd };

    if (sd.status === "CANCELLED") continue;

    // Occurrence-ök
    for (const dt of past) {
      let expected = sd.amount;
      let actual = sd.amount;
      if (sd.priceIncrease) {
        const idx = past.indexOf(dt);
        const isRecent = idx >= past.length - sd.priceIncrease.lastN;
        expected = sd.priceIncrease.oldAmount;
        actual = isRecent ? sd.priceIncrease.newAmount : sd.priceIncrease.oldAmount;
      }
      const occ = await prisma.subscriptionOccurrence.create({
        data: {
          subscriptionId: sub.id,
          dueDate: dt,
          expectedAmount: expected,
          currency: sd.currency,
          status: "PAID",
          actualAmount: actual,
          varianceAmount: actual - expected,
        },
      });
      pastOccs.push({
        id: occ.id,
        subKey: sd.key,
        dueDate: dt,
        amount: actual,
        currency: sd.currency,
        partnerKey: sd.partnerKey,
        categoryId: sd.categoryId,
        subscriptionId: sub.id,
        paymentMethod,
      });
    }
    for (const dt of future) {
      await prisma.subscriptionOccurrence.create({
        data: {
          subscriptionId: sub.id,
          dueDate: dt,
          expectedAmount: sd.amount,
          currency: sd.currency,
          status: "UPCOMING",
        },
      });
      if (dt <= d(30)) occInNext30++;
    }
  }

  // ---------- Számlák ----------
  const invSeq: Record<string, number> = {};
  function invoiceNumber(pkey: string, date: Date): string {
    const def = partners[pkey].def;
    invSeq[pkey] = (invSeq[pkey] ?? randInt(10, 900)) + 1;
    const n = invSeq[pkey];
    const y = date.getFullYear();
    const styles = [
      `${def.invPrefix}-${y}-${String(n).padStart(5, "0")}`,
      `${def.invPrefix}-INV-${String(90000 + n)}`,
      `${def.invPrefix}-${y}/${String(n).padStart(3, "0")}`,
    ];
    return styles[def.invPrefix.length % 3];
  }

  interface InvOpts {
    partnerKey: string;
    issueDate: Date;
    dueDate: Date;
    gross: number;
    currency: string;
    status: string;
    categoryId: string;
    subscriptionId?: string;
    description?: string;
    paymentMethod?: string;
    paymentDate?: Date;
  }
  const paidInvoicesByCurrency: Record<string, any[]> = { HUF: [], EUR: [], USD: [] };
  let invoiceCount = 0;

  async function createInvoice(o: InvOpts) {
    const pkey = o.partnerKey;
    const vatRate = vatRateFor(pkey);
    const { net, vat, gross } = grossToParts(vatRate, o.gross);
    const rate = fxRate(o.currency, o.issueDate);
    const inv = await prisma.invoice.create({
      data: {
        organizationId: org.id,
        partnerId: partners[pkey].id,
        direction: "INCOMING",
        invoiceNumber: invoiceNumber(pkey, o.issueDate),
        issueDate: o.issueDate,
        fulfillmentDate: o.issueDate,
        dueDate: o.dueDate,
        currency: o.currency,
        netAmount: net,
        vatRate,
        vatAmount: vat,
        grossAmount: gross,
        exchangeRate: rate,
        baseAmount: toBase(gross, rate),
        exchangeRateDate: startOfDay(o.issueDate),
        status: o.status,
        paymentMethod: o.paymentMethod ?? (o.currency === "HUF" ? "TRANSFER" : "CARD"),
        categoryId: o.categoryId,
        subscriptionId: o.subscriptionId,
        description: o.description,
        sourceType: pick(["UPLOAD", "EMAIL", "MANUAL", "UPLOAD"]),
        tags: JSON.stringify(partners[pkey].def.tags.slice(0, 2)),
      },
    });
    invoiceCount++;
    if (o.status === "PAID") {
      const payDate = o.paymentDate ?? subDays(o.dueDate, randInt(0, 4));
      await prisma.payment.create({
        data: {
          organizationId: org.id,
          invoiceId: inv.id,
          partnerId: partners[pkey].id,
          paymentDate: payDate,
          amount: gross,
          currency: o.currency,
          exchangeRate: rate,
          baseAmount: toBase(gross, rate),
          method: inv.paymentMethod === "CARD" ? "CARD" : "TRANSFER",
          bankAccountId: accountByCurrency[o.currency].id,
          reference: inv.invoiceNumber,
        },
      });
      paidInvoicesByCurrency[o.currency].push({ inv, pkey });
    }
    return inv;
  }

  // 8/a. Előfizetéshez kötött számlák (~50) a legutóbbi PAID occurrence-ökből
  const sortedOccs = [...pastOccs].sort((a, b) => b.dueDate.getTime() - a.dueDate.getTime());
  const linkedOccs = sortedOccs.slice(0, 50);
  for (const occ of linkedOccs) {
    const issueDate = subDays(occ.dueDate, randInt(0, 2));
    const inv = await createInvoice({
      partnerKey: occ.partnerKey,
      issueDate,
      dueDate: addDays(issueDate, randInt(8, 15)),
      gross: occ.amount,
      currency: occ.currency,
      status: "PAID",
      categoryId: occ.categoryId,
      subscriptionId: occ.subscriptionId,
      description: subs[occ.subKey].name,
      paymentMethod: occ.paymentMethod,
      paymentDate: occ.dueDate,
    });
    await prisma.subscriptionOccurrence.update({
      where: { id: occ.id },
      data: { invoiceId: inv.id },
    });
  }

  // 8/b. Önálló számlák — összesen 120 számla legyen
  interface StdDef { pkey: string; min: number; max: number; cur: string; cat: string; desc: string }
  const stdDefs: StdDef[] = [
    { pkey: "telekom", min: 18_000, max: 46_000, cur: "HUF", cat: cTelekom.id, desc: "Mobil- és internetszolgáltatás" },
    { pkey: "mvm", min: 32_000, max: 88_000, cur: "HUF", cat: cRezsi.id, desc: "Villamos energia" },
    { pkey: "szamvitel", min: 95_000, max: 145_000, cur: "HUF", cat: cKonyveles.id, desc: "Könyvelési díj + bérszámfejtés" },
    { pkey: "ugyved", min: 120_000, max: 350_000, cur: "HUF", cat: cJogi.id, desc: "Jogi tanácsadás, szerződések" },
    { pkey: "pixel", min: 180_000, max: 780_000, cur: "HUF", cat: cAlvallalkozo.id, desc: "Grafikai alvállalkozói díj" },
    { pkey: "kodmester", min: 420_000, max: 1_600_000, cur: "HUF", cat: cAlvallalkozo.id, desc: "Fejlesztési alvállalkozói díj" },
    { pkey: "irodahaz", min: 42_000, max: 120_000, cur: "HUF", cat: cIroda.id, desc: "Üzemeltetési és közös költség" },
    { pkey: "generali", min: 38_500, max: 38_500, cur: "HUF", cat: cIroda.id, desc: "Vagyonbiztosítás díja" },
    { pkey: "nav", min: 45_000, max: 260_000, cur: "HUF", cat: cKonyveles.id, desc: "Adóhatósági határozat / illeték" },
    { pkey: "openai", min: 40, max: 220, cur: "USD", cat: cSzoftver.id, desc: "API használat" },
    { pkey: "google", min: 55, max: 420, cur: "EUR", cat: cInfra.id, desc: "Google Cloud használat" },
    { pkey: "wise", min: 12, max: 65, cur: "EUR", cat: cInfra.id, desc: "Utalási és konverziós díjak" },
    { pkey: "anthropic", min: 60, max: 340, cur: "USD", cat: cSzoftver.id, desc: "API túlhasználat" },
    { pkey: "figma", min: 15, max: 90, cur: "USD", cat: cSzoftver.id, desc: "FigJam kiegészítő" },
  ];
  function stdInvoiceData(i: number) {
    const def = stdDefs[i % stdDefs.length];
    const gross = def.cur === "HUF" ? money(randInt(def.min, def.max)) : money(randInt(def.min, def.max));
    return { def, gross };
  }

  const remaining = 120 - invoiceCount;
  // speciális státuszok
  const specials: { status: string; issueOff: number; dueOff: number }[] = [];
  // 4 OVERDUE: dueDate 3-40 napja lejárt
  for (const off of [4, 12, 25, 38]) specials.push({ status: "OVERDUE", issueOff: -off - 15, dueOff: -off });
  // 6 APPROVED: dueDate 1-21 nap múlva
  for (const off of [2, 5, 9, 13, 17, 21]) specials.push({ status: "APPROVED", issueOff: off - 15, dueOff: off });
  // 2 AWAITING_APPROVAL
  specials.push({ status: "AWAITING_APPROVAL", issueOff: -2, dueOff: 12 });
  specials.push({ status: "AWAITING_APPROVAL", issueOff: -5, dueOff: 18 });
  // 1 DISPUTED, 1 CANCELLED
  specials.push({ status: "DISPUTED", issueOff: -34, dueOff: -14 });
  specials.push({ status: "CANCELLED", issueOff: -60, dueOff: -40 });

  let stdIdx = 0;
  for (const sp of specials) {
    const { def, gross } = stdInvoiceData(stdIdx++);
    await createInvoice({
      partnerKey: def.pkey,
      issueDate: d(sp.issueOff),
      dueDate: d(sp.dueOff),
      gross,
      currency: def.cur,
      status: sp.status,
      categoryId: def.cat,
      description: def.desc,
    });
  }

  // a többi PAID, az elmúlt 14 hónapra szórva
  const paidStandaloneCount = remaining - specials.length;
  for (let i = 0; i < paidStandaloneCount; i++) {
    const { def, gross } = stdInvoiceData(stdIdx++);
    const daysAgo = randInt(10, 14 * 30);
    const issueDate = d(-daysAgo);
    const dueDate = addDays(issueDate, randInt(8, 30));
    await createInvoice({
      partnerKey: def.pkey,
      issueDate,
      dueDate,
      gross,
      currency: def.cur,
      status: "PAID",
      categoryId: def.cat,
      description: def.desc,
    });
  }

  // 9. Beszerzések (30)
  interface PurDef {
    name: string;
    grossMajor: number;
    cur: string;
    cat: string;
    monthsAgo: number;
    isAsset?: boolean;
    lifetime?: number;
    warrantyYears?: number;
    warrantyExplicit?: Date;
    pkey?: string;
    tags?: string[];
  }
  const purDefs: PurDef[] = [
    { name: 'MacBook Pro 14" M3 Pro', grossMajor: 1_099_990, cur: "HUF", cat: cEszkozok.id, monthsAgo: 11, isAsset: true, lifetime: 36, warrantyYears: 2, tags: ["laptop"] },
    { name: "Dell U2723QE monitor (2 db)", grossMajor: 389_980, cur: "HUF", cat: cEszkozok.id, monthsAgo: 8, isAsset: true, lifetime: 36, warrantyYears: 3, tags: ["monitor"] },
    { name: "Herman Miller Aeron szék", grossMajor: 649_000, cur: "HUF", cat: cEszkozok.id, monthsAgo: 5, isAsset: true, lifetime: 36, warrantyYears: 3, tags: ["bútor"] },
    { name: "Lenovo ThinkPad X1 Carbon", grossMajor: 899_990, cur: "HUF", cat: cEszkozok.id, monthsAgo: 10, isAsset: true, lifetime: 36, warrantyExplicit: d(38), tags: ["laptop"] },
    { name: "iPhone 15 Pro (céges)", grossMajor: 519_990, cur: "HUF", cat: cEszkozok.id, monthsAgo: 10, isAsset: true, lifetime: 24, warrantyExplicit: d(52), tags: ["telefon"] },
    { name: 'LG UltraFine 32" monitor', grossMajor: 329_990, cur: "HUF", cat: cEszkozok.id, monthsAgo: 3, isAsset: true, lifetime: 36, warrantyYears: 2, tags: ["monitor"] },
    { name: "Ergonomikus irodai székek (4 db)", grossMajor: 476_000, cur: "HUF", cat: cEszkozok.id, monthsAgo: 7, isAsset: true, lifetime: 36, warrantyYears: 2, tags: ["bútor"] },
    { name: 'Konferenciaterem TV 75"', grossMajor: 549_990, cur: "HUF", cat: cEszkozok.id, monthsAgo: 9, isAsset: true, lifetime: 36, warrantyYears: 3, tags: ["av"] },
    { name: "Sonos hangrendszer tárgyalóba", grossMajor: 189_990, cur: "HUF", cat: cEszkozok.id, monthsAgo: 12, isAsset: true, lifetime: 24, warrantyYears: 2, tags: ["av"] },
    { name: "Synology DS923+ NAS + 4×4TB", grossMajor: 264_990, cur: "HUF", cat: cEszkozok.id, monthsAgo: 6, isAsset: true, lifetime: 36, warrantyYears: 3, tags: ["it"] },
    { name: "Állítható magasságú asztal (2 db)", grossMajor: 358_000, cur: "HUF", cat: cEszkozok.id, monthsAgo: 4, isAsset: true, lifetime: 36, warrantyYears: 2, tags: ["bútor"] },
    { name: "Logitech MX billentyűzet + egér szett", grossMajor: 89_990, cur: "HUF", cat: cEszkozok.id, monthsAgo: 2, isAsset: true, lifetime: 24, warrantyYears: 1, tags: ["periféria"] },
    { name: "Sketch éves licenc", grossMajor: 99, cur: "USD", cat: cSzoftver.id, monthsAgo: 7 },
    { name: "1Password Teams éves díj", grossMajor: 479, cur: "USD", cat: cSzoftver.id, monthsAgo: 9 },
    { name: "Envato Elements csomag", grossMajor: 198, cur: "USD", cat: cMarketing.id, monthsAgo: 5 },
    { name: "Iroda dekoráció és növények", grossMajor: 86_500, cur: "HUF", cat: cIroda.id, monthsAgo: 3 },
    { name: "Nyomtató toner készlet", grossMajor: 64_900, cur: "HUF", cat: cIroda.id, monthsAgo: 1 },
    { name: "Irodaszerek negyedéves rendelés", grossMajor: 48_700, cur: "HUF", cat: cIroda.id, monthsAgo: 2 },
    { name: "Kávégép szerviz + kávé", grossMajor: 72_300, cur: "HUF", cat: cIroda.id, monthsAgo: 4 },
    { name: "Domain megújítások (gr4f.hu, grafium.hu)", grossMajor: 42, cur: "EUR", cat: cInfra.id, monthsAgo: 6 },
    { name: "SSL tanúsítvány (wildcard)", grossMajor: 129, cur: "EUR", cat: cInfra.id, monthsAgo: 8 },
    { name: "Repülőjegy — Berlin design konferencia", grossMajor: 320, cur: "EUR", cat: cUtazas.id, monthsAgo: 4 },
    { name: "Szállás — Berlin (3 éj, 2 fő)", grossMajor: 540, cur: "EUR", cat: cUtazas.id, monthsAgo: 4 },
    { name: "BKK éves bérletek (3 fő)", grossMajor: 311_400, cur: "HUF", cat: cUtazas.id, monthsAgo: 7 },
    { name: "Stock fotó csomag (Shutterstock)", grossMajor: 199, cur: "USD", cat: cMarketing.id, monthsAgo: 3 },
    { name: "Meta hirdetési keret feltöltés", grossMajor: 450, cur: "EUR", cat: cMarketing.id, monthsAgo: 2 },
    { name: "Google Ads egyenleg feltöltés", grossMajor: 600, cur: "EUR", cat: cMarketing.id, monthsAgo: 1, pkey: "google" },
    { name: "Csapatépítő vacsora", grossMajor: 148_500, cur: "HUF", cat: cIroda.id, monthsAgo: 5 },
    { name: "Projektor bérlés ügyfélprezentációhoz", grossMajor: 38_000, cur: "HUF", cat: cIroda.id, monthsAgo: 6 },
    { name: "Szakkönyvek és online kurzusok", grossMajor: 94_800, cur: "HUF", cat: cSzoftver.id, monthsAgo: 8 },
  ];
  const purchases: any[] = [];
  for (const pd of purDefs) {
    const purchaseDate = subDays(subMonths(NOW, pd.monthsAgo), randInt(0, 20));
    const gross = money(pd.grossMajor);
    const vatRate = pd.cur === "HUF" ? "27" : pd.pkey ? vatRateFor(pd.pkey) : "HO";
    const { net, vat } = grossToParts(vatRate, gross);
    const rate = fxRate(pd.cur, purchaseDate);
    const warrantyUntil =
      pd.warrantyExplicit ?? (pd.warrantyYears ? addMonths(purchaseDate, pd.warrantyYears * 12) : undefined);
    const pur = await prisma.purchase.create({
      data: {
        organizationId: org.id,
        partnerId: pd.pkey ? partners[pd.pkey].id : undefined,
        name: pd.name,
        purchaseDate,
        currency: pd.cur,
        netAmount: net,
        vatAmount: vat,
        grossAmount: gross,
        exchangeRate: rate,
        baseAmount: toBase(gross, rate),
        categoryId: pd.cat,
        paymentMethod: pd.cur === "HUF" ? pick(["CARD", "TRANSFER"]) : "CARD",
        warrantyUntil,
        isAsset: pd.isAsset ?? false,
        assetLifetimeMonths: pd.isAsset ? pd.lifetime : undefined,
        tags: JSON.stringify(pd.tags ?? []),
      },
    });
    purchases.push(pur);
  }

  // 11. Bankkivonatok — előző teljes hónap
  const periodStart = startOfMonth(subMonths(NOW, 1));
  const periodEnd = endOfMonth(subMonths(NOW, 1));
  const daysInPeriod = getDaysInMonth(periodStart);
  const randomBookingDate = () => addDays(periodStart, randInt(0, daysInPeriod - 1));

  interface TxDraft {
    bookingDate: Date;
    amount: number;
    counterpartyName: string;
    reference: string;
    matchStatus: string;
    matchConfidence?: number;
    matchedInvoiceId?: string;
    partnerId?: string;
    transactionType?: string;
  }

  const unmatchedTemplates: Record<string, { name: string; ref: string; min: number; max: number; credit?: boolean }[]> = {
    HUF: [
      { name: "OTP BANK NYRT.", ref: "Számlavezetési díj", min: -4200, max: -2900 },
      { name: "OTP BANK NYRT.", ref: "Tranzakciós illeték", min: -2400, max: -600 },
      { name: "Kreatív Ügynökség Kft.", ref: "GRF-2026/031 számla kiegyenlítése", min: 850_000, max: 2_450_000, credit: true },
      { name: "Webshop Hungary Zrt.", ref: "Fejlesztési díj 2. részlet", min: 1_200_000, max: 3_800_000, credit: true },
      { name: "Startup Garage Kft.", ref: "Arculattervezés előleg", min: 400_000, max: 1_100_000, credit: true },
      { name: "MOL Nyrt.", ref: "Üzemanyag — céges kártya", min: -32_000, max: -18_000 },
      { name: "Díjbeszedő Holding Zrt.", ref: "Víz- és csatornadíj", min: -21_000, max: -14_000 },
      { name: "FŐTÁV Zrt.", ref: "Távhő díj", min: -46_000, max: -28_000 },
      { name: "POSTA", ref: "Postaköltség", min: -8_400, max: -2_100 },
      { name: "Rendezvényterem Kft.", ref: "Terembérlés workshop", min: -95_000, max: -60_000 },
    ],
    EUR: [
      { name: "WISE", ref: "Conversion HUF -> EUR", min: -18, max: -6 },
      { name: "ACME GMBH", ref: "Invoice GRF-EU-2026-014", min: 1_800, max: 4_500, credit: true },
      { name: "NORDIC DESIGN OY", ref: "Brand refresh milestone", min: 2_200, max: 6_400, credit: true },
      { name: "LINKEDIN IRELAND", ref: "LNKD*PREMIUM SUBSCR", min: -60, max: -35 },
      { name: "WISE", ref: "Monthly account fee", min: -8, max: -3 },
    ],
    USD: [
      { name: "STRIPE PAYOUT", ref: "STRIPE TRANSFER REF 8842", min: 1_400, max: 5_200, credit: true },
      { name: "AWS EMEA", ref: "AWS EMEA charges", min: -160, max: -45 },
      { name: "UPWORK", ref: "UPWORK FREELANCER FEE", min: -420, max: -120 },
      { name: "WISE", ref: "USD account fee", min: -9, max: -3 },
      { name: "US CLIENT LLC", ref: "Design retainer July", min: 2_000, max: 6_000, credit: true },
    ],
  };

  async function buildStatement(
    account: any,
    currency: string,
    totalTx: number,
    matchedTarget: number,
    status: string,
    stmtNo: string
  ) {
    const pool = [...paidInvoicesByCurrency[currency]];
    const drafts: TxDraft[] = [];
    const matchedN = Math.min(pool.length, matchedTarget);
    for (let i = 0; i < matchedN; i++) {
      const { inv, pkey } = pool[i];
      const p = partners[pkey];
      const useAlias = p.aliasNames.length > 0 && rand() < 0.7;
      const counterpartyName = useAlias ? pick(p.aliasNames) : p.def.name.toUpperCase();
      const withRef = rand() < 0.7;
      drafts.push({
        bookingDate: randomBookingDate(),
        amount: -inv.grossAmount,
        counterpartyName,
        reference: withRef ? `Számla ${inv.invoiceNumber}` : "Kártyás vásárlás",
        matchStatus: "AUTO_MATCHED",
        matchConfidence: Math.round((0.85 + rand() * 0.15) * 100) / 100,
        matchedInvoiceId: inv.id,
        partnerId: p.id,
        transactionType: inv.paymentMethod === "CARD" ? "CARD_PAYMENT" : "TRANSFER",
      });
    }
    const templates = unmatchedTemplates[currency];
    for (let i = drafts.length; i < totalTx; i++) {
      const t = templates[i % templates.length];
      const amt = money(randInt(Math.min(t.min, t.max), Math.max(t.min, t.max)));
      drafts.push({
        bookingDate: randomBookingDate(),
        amount: amt,
        counterpartyName: t.name,
        reference: t.ref,
        matchStatus: "UNMATCHED",
        transactionType: t.credit ? "CREDIT_TRANSFER" : amt > -money(10_000) && currency === "HUF" ? "FEE" : "TRANSFER",
      });
    }
    drafts.sort((a, b) => a.bookingDate.getTime() - b.bookingDate.getTime());
    const sum = drafts.reduce((s, x) => s + x.amount, 0);
    const buffer = currency === "HUF" ? money(3_500_000) : money(6_000);
    const openingBalance = Math.max(buffer, buffer - sum);
    const closingBalance = openingBalance + sum;

    const stmt = await prisma.bankStatement.create({
      data: {
        organizationId: org.id,
        bankAccountId: account.id,
        statementNumber: stmtNo,
        periodStart,
        periodEnd,
        openingBalance,
        closingBalance,
        currency,
        importedBy: user.id,
        transactionCount: drafts.length,
        matchedCount: matchedN,
        status,
      },
    });
    let running = openingBalance;
    const txRows = drafts.map((t) => {
      running += t.amount;
      return {
        bankStatementId: stmt.id,
        bankAccountId: account.id,
        bookingDate: t.bookingDate,
        valueDate: t.bookingDate,
        amount: t.amount,
        currency,
        counterpartyName: t.counterpartyName,
        reference: t.reference,
        transactionType: t.transactionType,
        balanceAfter: running,
        matchStatus: t.matchStatus,
        matchConfidence: t.matchConfidence,
        matchedInvoiceId: t.matchedInvoiceId,
        partnerId: t.partnerId,
      };
    });
    await prisma.bankTransaction.createMany({ data: txRows });
    await prisma.bankAccount.update({
      where: { id: account.id },
      data: { openingBalance, currentBalance: closingBalance },
    });
    return { matchedN, total: drafts.length };
  }

  const mkStmtNo = (bank: string) =>
    `${periodStart.getFullYear()}-${String(periodStart.getMonth() + 1).padStart(2, "0")}/${bank}`;
  const sHUF = await buildStatement(accHUF, "HUF", 110, 72, "NEEDS_REVIEW", mkStmtNo("OTP-1"));
  const sEUR = await buildStatement(accEUR, "EUR", 40, 26, "NEEDS_REVIEW", mkStmtNo("WISE-EUR"));
  const sUSD = await buildStatement(accUSD, "USD", 30, 20, "RECONCILED", mkStmtNo("WISE-USD"));

  // 12. Emlékeztetők — 6 db a következő 14 napban
  const soonSub =
    Object.values(subs).find(
      (s: any) => s.status === "ACTIVE" && s.nextBillingDate > NOW && s.nextBillingDate <= d(14)
    ) ?? subs["gws"];
  const soonSub2 =
    Object.values(subs).find(
      (s: any) =>
        s.status === "ACTIVE" && s.id !== soonSub.id && s.nextBillingDate > NOW && s.nextBillingDate <= d(14)
    ) ?? subs["berlet"];
  const approvedInv = await prisma.invoice.findFirst({
    where: { organizationId: org.id, status: "APPROVED" },
    orderBy: { dueDate: "asc" },
  });
  const warrantyPurchase = purchases.find((p) => p.name.startsWith("Lenovo"));

  const fmtHu = (dt: Date) => dt.toISOString().slice(0, 10);
  const reminderRows = [
    {
      type: "SUBSCRIPTION_RENEWAL",
      entityType: "SUBSCRIPTION",
      entityId: soonSub.id,
      triggerDate: subDays(soonSub.nextBillingDate, 1) > NOW ? subDays(soonSub.nextBillingDate, 1) : d(1),
      message: `Hamarosan megújul: ${soonSub.name} (${fmtHu(soonSub.nextBillingDate)}).`,
    },
    {
      type: "SUBSCRIPTION_RENEWAL",
      entityType: "SUBSCRIPTION",
      entityId: soonSub2.id,
      triggerDate: subDays(soonSub2.nextBillingDate, 1) > NOW ? subDays(soonSub2.nextBillingDate, 1) : d(2),
      message: `Hamarosan esedékes: ${soonSub2.name} (${fmtHu(soonSub2.nextBillingDate)}).`,
    },
    {
      type: "CANCELLATION_DEADLINE",
      entityType: "SUBSCRIPTION",
      entityId: subs["zoom"].id,
      triggerDate: d(3),
      message: "A Zoom Pro éves előfizetés lemondási határideje 5 napon belül lejár — döntsd el, hosszabbítunk-e!",
    },
    {
      type: "INVOICE_DUE",
      entityType: "INVOICE",
      entityId: approvedInv!.id,
      triggerDate: subDays(approvedInv!.dueDate, 2) > NOW ? subDays(approvedInv!.dueDate, 2) : d(1),
      message: `Fizetési határidő közeleg: ${approvedInv!.invoiceNumber} (${fmtHu(approvedInv!.dueDate)}).`,
    },
    {
      type: "TRIAL_ENDING",
      entityType: "SUBSCRIPTION",
      entityId: subs["mailchimp"].id,
      triggerDate: d(4),
      message: "A Mailchimp Standard próbaidőszaka 6 nap múlva lejár — utána 20 USD/hó.",
    },
    {
      type: "WARRANTY_EXPIRING",
      entityType: "PURCHASE",
      entityId: warrantyPurchase.id,
      triggerDate: d(8),
      message: "A Lenovo ThinkPad X1 Carbon garanciája hamarosan lejár — érdemes átvizsgáltatni.",
    },
  ];
  for (const r of reminderRows) {
    await prisma.reminder.create({
      data: { organizationId: org.id, status: "SCHEDULED", channel: "BOTH", ...r },
    });
  }

  // 13. Mentett szűrők
  const savedFilters = [
    {
      name: "Lejárt tartozások",
      entityType: "invoices",
      filterJson: JSON.stringify({ logic: "AND", items: [{ field: "status", op: "anyOf", value: ["OVERDUE"] }] }),
    },
    {
      name: "Következő 30 nap előfizetései",
      entityType: "subscriptions",
      filterJson: JSON.stringify({ logic: "AND", items: [{ field: "nextBillingDate", op: "nextNDays", value: 30 }] }),
    },
    {
      name: "Párosítatlan banki tételek",
      entityType: "bank-transactions",
      filterJson: JSON.stringify({ logic: "AND", items: [{ field: "matchStatus", op: "anyOf", value: ["UNMATCHED"] }] }),
    },
    {
      name: "Idei EUR költések",
      entityType: "invoices",
      filterJson: JSON.stringify({
        logic: "AND",
        items: [
          { field: "currency", op: "anyOf", value: ["EUR"] },
          { field: "issueDate", op: "thisYear" },
        ],
      }),
    },
  ];
  let sortOrder = 0;
  for (const f of savedFilters) {
    await prisma.savedFilter.create({
      data: {
        organizationId: org.id,
        userId: user.id,
        isShared: true,
        isPinned: true,
        sortOrder: sortOrder++,
        ...f,
      },
    });
  }

  // 14. Párosítási szabályok
  await prisma.matchingRule.create({
    data: {
      organizationId: org.id,
      name: "Google Cloud terhelések",
      referenceContains: "GOOGLE CLOUD",
      partnerId: partners["google"].id,
      categoryId: cInfra.id,
    },
  });
  await prisma.matchingRule.create({
    data: {
      organizationId: org.id,
      name: "OTP bankköltségek",
      referenceContains: "OTP DÍJ",
      categoryId: cInfra.id,
    },
  });

  // 15. Beérkező (Inbox) mellékletek
  const inboxRows = [
    {
      fileName: "szamla-01.pdf",
      storageUrl: "/uploads/demo/szamla-01.pdf",
      mimeType: "application/pdf",
      ocrFields: {
        partnerName: { value: "Magyar Telekom Nyrt.", confidence: 0.96 },
        invoiceNumber: { value: "MT-2026-08341", confidence: 0.91 },
        grossAmount: { value: 24990, confidence: 0.88 },
        currency: { value: "HUF", confidence: 0.99 },
        dueDate: { value: fmtHu(d(9)), confidence: 0.74 },
      },
    },
    {
      fileName: "szamla-02.pdf",
      storageUrl: "/uploads/demo/szamla-02.pdf",
      mimeType: "application/pdf",
      ocrFields: {
        partnerName: { value: "Kódmester Kft.", confidence: 0.93 },
        invoiceNumber: { value: "KM-2026/118", confidence: 0.86 },
        grossAmount: { value: 1524000, confidence: 0.69 },
        currency: { value: "HUF", confidence: 0.98 },
        dueDate: { value: fmtHu(d(14)), confidence: 0.82 },
      },
    },
    {
      fileName: "adobe-invoice.pdf",
      storageUrl: "/uploads/demo/adobe-invoice.pdf",
      mimeType: "application/pdf",
      ocrFields: {
        partnerName: { value: "Adobe Systems Software Ireland", confidence: 0.89 },
        invoiceNumber: { value: "ADB-INV-99412", confidence: 0.94 },
        grossAmount: { value: 71988, confidence: 0.9 },
        currency: { value: "EUR", confidence: 0.95 },
        dueDate: { value: fmtHu(d(6)), confidence: 0.62 },
      },
    },
    {
      fileName: "scan-rezsi.jpg",
      storageUrl: "/uploads/demo/scan-rezsi.jpg",
      mimeType: "image/jpeg",
      ocrFields: {
        partnerName: { value: "MVM Next Energiakereskedelmi Zrt", confidence: 0.71 },
        invoiceNumber: { value: "MVM-2026-77120?", confidence: 0.55 },
        grossAmount: { value: 61240, confidence: 0.77 },
        currency: { value: "HUF", confidence: 0.97 },
      },
    },
    {
      fileName: "szamla-05.pdf",
      storageUrl: "/uploads/demo/szamla-05.pdf",
      mimeType: "application/pdf",
      ocrFields: {
        partnerName: { value: "Pixel Stúdió Bt.", confidence: 0.92 },
        invoiceNumber: { value: "PIX-2026/044", confidence: 0.88 },
        grossAmount: { value: 385000, confidence: 0.9 },
        currency: { value: "HUF", confidence: 0.99 },
        dueDate: { value: fmtHu(d(11)), confidence: 0.79 },
      },
    },
  ];
  for (const a of inboxRows) {
    await prisma.attachment.create({
      data: {
        organizationId: org.id,
        fileName: a.fileName,
        mimeType: a.mimeType,
        fileSize: randInt(80_000, 900_000),
        storageUrl: a.storageUrl,
        uploadedBy: user.id,
        entityType: "INBOX",
        ocrStatus: "DONE",
        ocrFields: JSON.stringify(a.ocrFields),
        inboxStatus: "NEEDS_REVIEW",
      },
    });
  }

  console.log("Kész.");
  console.log(`  Számlák: ${invoiceCount} (ebből előfizetéshez kötve: ${linkedOccs.length})`);
  console.log(`  Occurrence a következő 30 napban: ${occInNext30}`);
  console.log(
    `  Banki tételek: HUF ${sHUF.total} (${sHUF.matchedN} párosítva), EUR ${sEUR.total} (${sEUR.matchedN}), USD ${sUSD.total} (${sUSD.matchedN})`
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
