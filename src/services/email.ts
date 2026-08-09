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

export function getEmailSender(): EmailSender {
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    return new ResendSender(apiKey, process.env.EMAIL_FROM ?? "szamlakezelo@demo.local");
  }
  return new ConsoleSender();
}
