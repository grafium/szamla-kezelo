// MNB (Magyar Nemzeti Bank) hivatalos devizaárfolyam-lekérdezés.
//
// A nyilvános SOAP végpont: http://www.mnb.hu/arfolyamok.asmx
// (a https:// változat 404-et ad, ezért marad a http).
// A válasz egy SOAP boríték, amelynek a *szövegében* HTML-escape-elt XML van:
//   <MNBExchangeRates><Day date="2026-08-07"><Rate unit="1" curr="EUR">366,40000</Rate>…
// Két sajátosság: az érték tizedesvesszős, és a `unit` attribútum megadja,
// hány egységre vonatkozik az árfolyam (pl. JPY unit="100").
//
// Külső függőség nélkül, egyszerű regex-parszolóval dolgozunk.

/** Egy napi árfolyam: 1 <currency> = rate HUF. */
export interface MnbRate {
  date: Date;
  currency: string;
  rate: number;
}

const MNB_ENDPOINT = "http://www.mnb.hu/arfolyamok.asmx";
const MNB_NS = "http://www.mnb.hu/webservices/";
const TIMEOUT_MS = 15_000;

function toIsoDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** "2026-08-07" → helyi idő szerinti nap eleje (a seed és a getRate is így tárol). */
function parseDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

async function soapCall(action: string, innerXml: string): Promise<string> {
  const envelope =
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>' +
    innerXml +
    "</soap:Body></soap:Envelope>";

  let res: Response;
  try {
    res = await fetch(MNB_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: `"${MNB_NS}${action}"`,
      },
      body: envelope,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (e) {
    throw new Error(`MNB árfolyam-szolgáltatás nem érhető el: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!res.ok) {
    throw new Error(`MNB árfolyam-szolgáltatás hibát adott (HTTP ${res.status})`);
  }
  const body = await res.text();
  const match = body.match(new RegExp(`<${action}Result>([\\s\\S]*?)</${action}Result>`));
  if (!match) {
    throw new Error(`Az MNB válasza nem értelmezhető (hiányzó ${action}Result elem)`);
  }
  return unescapeXml(match[1]);
}

/**
 * Az MNB belső XML-jének feldolgozása.
 * A `unit` attribútummal osztunk, így mindig 1 egységre vetített HUF-árfolyamot adunk.
 */
export function parseMnbXml(xml: string, currencies?: string[]): MnbRate[] {
  const wanted = currencies?.map((c) => c.toUpperCase());
  const out: MnbRate[] = [];
  const dayRe = /<Day\s+date="(\d{4}-\d{2}-\d{2})"\s*>([\s\S]*?)<\/Day>/g;
  let day: RegExpExecArray | null;
  while ((day = dayRe.exec(xml)) !== null) {
    const date = parseDay(day[1]);
    const rateRe = /<Rate\s+unit="(\d+)"\s+curr="([A-Z]{3})"\s*>([^<]*)<\/Rate>/g;
    let r: RegExpExecArray | null;
    while ((r = rateRe.exec(day[2])) !== null) {
      const unit = Number(r[1]);
      const currency = r[2];
      if (wanted && !wanted.includes(currency)) continue;
      const value = Number(r[3].trim().replace(/\s/g, "").replace(",", "."));
      if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(unit) || unit <= 0) continue;
      out.push({ date, currency, rate: value / unit });
    }
  }
  return out;
}

/** Árfolyamok egy dátumtartományra. Hétvégén/ünnepnapon nincs publikált nap — ezek egyszerűen hiányoznak. */
export async function fetchMnbRates(
  startDate: Date,
  endDate: Date,
  currencies: string[] = ["EUR", "USD"]
): Promise<MnbRate[]> {
  const inner =
    `<GetExchangeRates xmlns="${MNB_NS}">` +
    `<startDate>${toIsoDay(startDate)}</startDate>` +
    `<endDate>${toIsoDay(endDate)}</endDate>` +
    `<currencyNames>${currencies.join(",")}</currencyNames>` +
    `</GetExchangeRates>`;
  const xml = await soapCall("GetExchangeRates", inner);
  const rates = parseMnbXml(xml, currencies);
  if (rates.length === 0) {
    throw new Error("Az MNB nem adott vissza árfolyamot a kért időszakra");
  }
  return rates;
}

/** A legutóbbi (mai vagy utolsó munkanapi) MNB-árfolyamok. */
export async function fetchMnbCurrentRates(currencies: string[] = ["EUR", "USD"]): Promise<MnbRate[]> {
  const xml = await soapCall("GetCurrentExchangeRates", `<GetCurrentExchangeRates xmlns="${MNB_NS}" />`);
  const rates = parseMnbXml(xml, currencies);
  if (rates.length === 0) {
    throw new Error("Az MNB nem adott vissza aktuális árfolyamot");
  }
  return rates;
}
