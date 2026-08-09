import { prisma } from "@/lib/prisma";
import { fetchMnbRates, fetchMnbCurrentRates, type MnbRate } from "./mnb";
import { fetchEcbDaily, fetchEcbHistory, type EcbRate } from "./ecb";

// Árfolyam-szinkron: az MNB (HUF-alapú) és az ECB (EUR-alapú) hivatalos
// árfolyamait tölti be az ExchangeRate táblába. Ezt hívja a napi cron
// (token-alapú auth) és a beállítások „Frissítés most” gombja (session-auth).
//
// Tárolt párok: EUR→HUF, USD→HUF (MNB), EUR→USD (ECB).
// Hétvégén/ünnepnapon nincs publikált árfolyam — ezek a napok egyszerűen
// hiányoznak a forrásból; a mai napra viszont mindig továbbvisszük az utolsó
// ismert értéket, hogy a getRate() sose maradjon árfolyam nélkül.

export const RATE_PAIRS: [string, string][] = [
  ["EUR", "HUF"],
  ["USD", "HUF"],
  ["EUR", "USD"],
];

export const MAX_DAYS = 90;
const BOOTSTRAP_DAYS = 90;

export interface RateSyncResult {
  ok: boolean;
  /** A forrásokból beolvasott árfolyam-sorok száma. */
  fetched: number;
  /** Az adatbázisba írt (létrehozott vagy frissített) sorok száma. */
  upserted: number;
  /** Mely forrásból dolgoztunk: "MNB", "ECB", "MNB+ECB". */
  source: string;
  /** A kért időszak napjai, amelyekre nincs publikált árfolyam (hétvége/ünnepnap). */
  missingDays: string[];
  /** Üres tábla esetén automatikus 90 napos visszatöltés történt. */
  bootstrapped: boolean;
  /** Hány párra vittük tovább az utolsó ismert árfolyamot a mai napra. */
  carriedForward: number;
  /** Hiba esetén magyar nyelvű üzenet. */
  error?: string;
  /** Nem végzetes hibák (pl. az ECB kiegészítő lekérés elszállt). */
  warnings: string[];
}

/** Tesztelhetőséghez injektálható lekérdezők (alapértelmezésben a valós MNB/ECB hívások). */
export interface RateSyncDeps {
  fetchMnb?: (startDate: Date, endDate: Date) => Promise<MnbRate[]>;
  fetchEcb?: (startDate: Date, endDate: Date) => Promise<EcbRate[]>;
}

interface RateRow {
  date: Date;
  baseCurrency: string;
  targetCurrency: string;
  rate: number;
  source: string;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isoDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Egynapos szinkronnál a „legfrissebb publikáció” végpontokat használjuk: hétvégén
// és ünnepnapon ezek az utolsó munkanap árfolyamát adják vissza (a dátumtartományos
// lekérdezés ilyenkor üres lenne). Több napnál a tartományos/90 napos állomány jön.
async function defaultFetchMnb(startDate: Date, endDate: Date): Promise<MnbRate[]> {
  if (isoDay(startDate) === isoDay(endDate)) return fetchMnbCurrentRates(["EUR", "USD"]);
  return fetchMnbRates(startDate, endDate, ["EUR", "USD"]);
}

async function defaultFetchEcb(startDate: Date, endDate: Date): Promise<EcbRate[]> {
  if (isoDay(startDate) === isoDay(endDate)) return fetchEcbDaily(["USD", "HUF"]);
  const rates = await fetchEcbHistory(["USD", "HUF"]);
  return rates.filter((r) => r.date >= startDate && r.date <= endDate);
}

/** MNB-sorokból EUR→HUF és USD→HUF párok. */
function fromMnb(rates: MnbRate[]): RateRow[] {
  return rates
    .filter((r) => r.currency === "EUR" || r.currency === "USD")
    .map((r) => ({
      date: r.date,
      baseCurrency: r.currency,
      targetCurrency: "HUF",
      rate: r.rate,
      source: "MNB",
    }));
}

/** ECB-sorokból EUR→USD (+ igény esetén az EUR→HUF / USD→HUF keresztárfolyamok). */
function fromEcb(rates: EcbRate[], includeHuf: boolean): RateRow[] {
  const byDay = new Map<string, Map<string, number>>();
  for (const r of rates) {
    const key = isoDay(r.date);
    if (!byDay.has(key)) byDay.set(key, new Map());
    byDay.get(key)!.set(r.currency, r.rate);
  }
  const out: RateRow[] = [];
  for (const [key, map] of byDay) {
    const [y, m, d] = key.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    const usd = map.get("USD");
    const huf = map.get("HUF");
    if (usd) out.push({ date, baseCurrency: "EUR", targetCurrency: "USD", rate: usd, source: "ECB" });
    if (includeHuf && huf) {
      out.push({ date, baseCurrency: "EUR", targetCurrency: "HUF", rate: huf, source: "ECB" });
      if (usd) {
        out.push({
          date,
          baseCurrency: "USD",
          targetCurrency: "HUF",
          rate: Math.round((huf / usd) * 10000) / 10000,
          source: "ECB",
        });
      }
    }
  }
  return out;
}

async function upsertRows(rows: RateRow[]): Promise<number> {
  let upserted = 0;
  for (const row of rows) {
    await prisma.exchangeRate.upsert({
      where: {
        date_baseCurrency_targetCurrency: {
          date: row.date,
          baseCurrency: row.baseCurrency,
          targetCurrency: row.targetCurrency,
        },
      },
      create: row,
      update: { rate: row.rate, source: row.source },
    });
    upserted++;
  }
  return upserted;
}

/** A mai napra továbbvisszük az utolsó ismert árfolyamot, ha nincs friss publikáció. */
async function carryForwardToToday(today: Date): Promise<number> {
  let carried = 0;
  for (const [from, to] of RATE_PAIRS) {
    const existing = await prisma.exchangeRate.findUnique({
      where: { date_baseCurrency_targetCurrency: { date: today, baseCurrency: from, targetCurrency: to } },
    });
    if (existing) continue;
    const last = await prisma.exchangeRate.findFirst({
      where: { baseCurrency: from, targetCurrency: to, date: { lt: today } },
      orderBy: { date: "desc" },
    });
    if (!last) continue;
    await prisma.exchangeRate.create({
      data: { date: today, baseCurrency: from, targetCurrency: to, rate: last.rate, source: last.source },
    });
    carried++;
  }
  return carried;
}

/**
 * Árfolyamok szinkronizálása.
 * @param days hány napra visszamenőleg (1–90, alapértelmezés 1)
 */
export async function syncRates(days = 1, deps: RateSyncDeps = {}): Promise<RateSyncResult> {
  const warnings: string[] = [];
  const today = startOfDay(new Date());

  // Üres tábla (friss éles adatbázis) → automatikus 90 napos visszatöltés.
  const existingCount = await prisma.exchangeRate.count({
    where: { OR: RATE_PAIRS.map(([b, t]) => ({ baseCurrency: b, targetCurrency: t })) },
  });
  const bootstrapped = existingCount === 0;

  const requested = Math.min(Math.max(Math.trunc(days) || 1, 1), MAX_DAYS);
  const effectiveDays = bootstrapped ? BOOTSTRAP_DAYS : requested;

  const endDate = today;
  const startDate = startOfDay(new Date(today.getTime() - (effectiveDays - 1) * 86_400_000));

  const fetchMnb = deps.fetchMnb ?? defaultFetchMnb;
  const fetchEcb = deps.fetchEcb ?? defaultFetchEcb;

  let rows: RateRow[] = [];
  let source = "";
  let mnbError: string | null = null;

  try {
    const mnb = await fetchMnb(startDate, endDate);
    rows = fromMnb(mnb);
    source = "MNB";
  } catch (e) {
    mnbError = e instanceof Error ? e.message : String(e);
  }

  try {
    const ecb = await fetchEcb(startDate, endDate);
    // Ha az MNB elérhetetlen, az ECB EUR-alapú árfolyamaiból származtatjuk a HUF-párokat is.
    rows = rows.concat(fromEcb(ecb, rows.length === 0));
    source = source ? "MNB+ECB" : "ECB";
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (rows.length === 0) {
      return {
        ok: false,
        fetched: 0,
        upserted: 0,
        source: "—",
        missingDays: [],
        bootstrapped: false,
        carriedForward: 0,
        warnings,
        error: `Egyik árfolyamforrás sem érhető el (MNB: ${mnbError ?? "nem hívtuk"}; ECB: ${msg})`,
      };
    }
    warnings.push(`Az ECB-lekérés nem sikerült, csak MNB-árfolyamokat mentettünk: ${msg}`);
  }

  if (rows.length === 0) {
    return {
      ok: false,
      fetched: 0,
      upserted: 0,
      source: "—",
      missingDays: [],
      bootstrapped: false,
      carriedForward: 0,
      warnings,
      error: `Egyik árfolyamforrás sem adott vissza adatot (MNB: ${mnbError ?? "üres válasz"})`,
    };
  }
  if (mnbError) warnings.push(`Az MNB-lekérés nem sikerült, ECB-árfolyamokra váltottunk: ${mnbError}`);

  const upserted = await upsertRows(rows);
  const carriedForward = await carryForwardToToday(today);

  // Hiányzó napok: a kért időszak azon napjai, amelyekre nincs publikált EUR→HUF árfolyam.
  const haveDays = new Set(rows.filter((r) => r.targetCurrency === "HUF").map((r) => isoDay(r.date)));
  const missingDays: string[] = [];
  for (let i = 0; i < effectiveDays; i++) {
    const day = startOfDay(new Date(startDate.getTime() + i * 86_400_000));
    if (!haveDays.has(isoDay(day))) missingDays.push(isoDay(day));
  }

  return {
    ok: true,
    fetched: rows.length,
    upserted,
    source,
    missingDays,
    bootstrapped,
    carriedForward,
    warnings,
  };
}

/** A tárolt párok legfrissebb árfolyama a beállítások kártyához. */
export async function getLatestRates() {
  return Promise.all(
    RATE_PAIRS.map(async ([from, to]) => {
      const row = await prisma.exchangeRate.findFirst({
        where: { baseCurrency: from, targetCurrency: to },
        orderBy: { date: "desc" },
      });
      return {
        baseCurrency: from,
        targetCurrency: to,
        rate: row?.rate ?? null,
        date: row?.date ?? null,
        source: row?.source ?? null,
      };
    })
  );
}
