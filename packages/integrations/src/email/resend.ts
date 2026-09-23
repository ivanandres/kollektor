import { fetchJson, type FetchLike } from '../http/fetch-json';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailService {
  send(msg: EmailMessage): Promise<void>;
}

export class ResendEmailService implements EmailService {
  private readonly fetchImpl: FetchLike;
  constructor(private readonly cfg: { apiKey: string; from: string; fetch?: FetchLike }) {
    this.fetchImpl = cfg.fetch ?? fetch;
  }
  async send(msg: EmailMessage): Promise<void> {
    await fetchJson(this.fetchImpl, 'https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.cfg.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: this.cfg.from,
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
      }),
    });
  }
}

/** Dev/test fallback: keeps messages in memory and logs them. */
export class ConsoleEmailService implements EmailService {
  readonly outbox: EmailMessage[] = [];
  constructor(private readonly log = true) {}
  async send(msg: EmailMessage): Promise<void> {
    this.outbox.push(msg);
    if (this.log)
      console.info(`[email] to=${msg.to} subject="${msg.subject}"\n${msg.text ?? msg.html}`);
  }
}
