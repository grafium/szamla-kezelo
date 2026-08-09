// E-mail küldés (D csomag): Resend API, ha van RESEND_API_KEY, egyébként
// konzolra naplózó ConsoleSender (fejlesztéshez / demóhoz).

export interface EmailSender {
  send(to: string, subject: string, html: string): Promise<void>;
}

export class ResendSender implements EmailSender {
  constructor(private apiKey: string, private from: string) {}

  async send(to: string, subject: string, html: string): Promise<void> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: this.from, to, subject, html }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Resend hiba (${res.status}): ${body}`);
    }
  }
}

export class ConsoleSender implements EmailSender {
  async send(to: string, subject: string, html: string): Promise<void> {
    console.log(`[ConsoleSender] E-mail → ${to} | Tárgy: ${subject} | ${html.length} karakter HTML`);
  }
}

/**
 * A környezeti változók kézzel kerülnek be (Vercel felület), ezért a gyakori
 * elgépeléseket eltakarítjuk: köré írt idézőjel, felesleges szóköz, sortörés.
 * Elfogadott formátum: `email@pelda.hu` vagy `Név <email@pelda.hu>`.
 */
export function normalizeFromAddress(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/^["']|["']$/g, "").trim();
  if (!cleaned) return null;
  const plain = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
  const named = /^(.+?)\s*<\s*([^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)\s*>$/;
  if (plain.test(cleaned)) return cleaned;
  const m = cleaned.match(named);
  if (m) return `${m[1].trim()} <${m[2].trim()}>`;
  return null;
}

export function getEmailSender(): EmailSender {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (apiKey) {
    const from = normalizeFromAddress(process.env.EMAIL_FROM);
    if (!from) {
      throw new Error(
        `Hibás EMAIL_FROM környezeti változó (${JSON.stringify(process.env.EMAIL_FROM ?? null)}). ` +
          "Várt formátum: email@pelda.hu vagy Név <email@pelda.hu> — idézőjel és szóköz nélkül."
      );
    }
    return new ResendSender(apiKey, from);
  }
  return new ConsoleSender();
}
