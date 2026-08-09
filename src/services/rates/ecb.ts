// ECB (Európai Központi Bank) referencia-árfolyamok.
//
// Napi fájl:  https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml
// 90 napos:   https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml
// Formátum:   <Cube time="2026-08-07"><Cube currency="USD" rate="1.1535"/>…</Cube>
// Az árfolyamok EUR-alapúak: 1 EUR = rate <currency>.
//
// Külső függőség nélkül, egyszerű regex-parszolóval dolgozunk.

/** Egy napi ECB-árfolyam: 1 EUR = rate <currency>. */
export interface EcbRate {
  date: Date;
  currency: string;
  rate: number;
}

const ECB_DAILY = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
const ECB_HIST_90D = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml";
const TIMEOUT_MS = 15_000;

/** "2026-08-07" → helyi idő szerinti nap eleje. */
function parseDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

async function get(url: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  } catch (e) {
    throw new Error(`Az ECB árfolyam-szolgáltatás nem érhető el: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!res.ok) {
    throw new Error(`Az ECB árfolyam-szolgáltatás hibát adott (HTTP ${res.status})`);
  }
  return res.text();
}

/** Az ECB eurofxref XML feldolgozása. Az idézőjel lehet " vagy ' is. */
export function parseEcbXml(xml: string, currencies?: string[]): EcbRate[] {
  const wanted = currencies?.map((c) => c.toUpperCase());
  const out: EcbRate[] = [];
  const dayRe = /<Cube\s+time=["'](\d{4}-\d{2}-\d{2})["']\s*>([\s\S]*?)<\/Cube>/g;
  let day: RegExpExecArray | null;
  while ((day = dayRe.exec(xml)) !== null) {
    const date = parseDay(day[1]);
    const rateRe = /<Cube\s+currency=["']([A-Z]{3})["']\s+rate=["']([\d.]+)["']\s*\/>/g;
    let r: RegExpExecArray | null;
    while ((r = rateRe.exec(day[2])) !== null) {
      const currency = r[1];
      if (wanted && !wanted.includes(currency)) continue;
      const value = Number(r[2]);
      if (!Number.isFinite(value) || value <= 0) continue;
      out.push({ date, currency, rate: value });
    }
  }
  return out;
}

/** A legfrissebb ECB-árfolyamok (EUR-alapon). Alapértelmezésben USD és HUF (kereszt-ellenőrzéshez). */
export async function fetchEcbDaily(currencies: string[] = ["USD", "HUF"]): Promise<EcbRate[]> {
  const rates = parseEcbXml(await get(ECB_DAILY), currencies);
  if (rates.length === 0) {
    throw new Error("Az ECB nem adott vissza árfolyamot");
  }
  return rates;
}

/** Az elmúlt 90 nap ECB-árfolyamai (visszatöltéshez). */
export async function fetchEcbHistory(currencies: string[] = ["USD", "HUF"]): Promise<EcbRate[]> {
  const rates = parseEcbXml(await get(ECB_HIST_90D), currencies);
  if (rates.length === 0) {
    throw new Error("Az ECB nem adott vissza árfolyamot a 90 napos állományban");
  }
  return rates;
}
