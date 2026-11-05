import { Logger } from '@nestjs/common';
import type { NotificationProvider, NotificationPayload } from '../notification.interface';

/**
 * Email notification provider.
 *
 * Uses SendGrid if SENDGRID_API_KEY is set, otherwise attempts a direct SMTP
 * connection using SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM.
 * Degrades gracefully (warn log only) if neither is configured.
 */
export class EmailNotificationProvider implements NotificationProvider {
  readonly name = 'Email';
  private readonly logger = new Logger(EmailNotificationProvider.name);
  private readonly sendgridKey?: string;
  private readonly smtpHost?: string;
  private readonly smtpPort: number;
  private readonly smtpUser?: string;
  private readonly smtpPass?: string;
  private readonly smtpFrom: string;

  constructor() {
    this.sendgridKey = process.env['SENDGRID_API_KEY'];
    this.smtpHost = process.env['SMTP_HOST'];
    this.smtpPort = Number(process.env['SMTP_PORT'] ?? 587);
    this.smtpUser = process.env['SMTP_USER'];
    this.smtpPass = process.env['SMTP_PASS'];
    this.smtpFrom = process.env['SMTP_FROM'] ?? 'noreply@lumenflow.app';
  }

  async send(payload: NotificationPayload): Promise<void> {
    const to = payload.data?.['email'];
    if (!to) {
      this.logger.debug(`No email address for user ${payload.userId}, skipping email.`);
      return;
    }

    if (this.sendgridKey) {
      await this.sendViaSendGrid(to, payload.title, payload.body);
    } else if (this.smtpHost) {
      await this.sendViaSmtp(to, payload.title, payload.body);
    } else {
      this.logger.warn(
        `[EMAIL NOT SENT] No SENDGRID_API_KEY or SMTP_HOST configured. ` +
        `Would have sent to ${to}: "${payload.title}"`,
      );
    }
  }

  private async sendViaSendGrid(to: string, subject: string, body: string): Promise<void> {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.sendgridKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: this.smtpFrom },
        subject,
        content: [{ type: 'text/plain', value: body }],
      }),
    });

    if (!res.ok) {
      throw new Error(`SendGrid returned ${res.status}: ${await res.text()}`);
    }

    this.logger.log(`Email sent via SendGrid to ${to}: "${subject}"`);
  }

  private async sendViaSmtp(to: string, subject: string, body: string): Promise<void> {
    // Simple SMTP implementation using Node.js net module
    const { createConnection } = await import('node:net');

    return new Promise((resolve, reject) => {
      const socket = createConnection({ host: this.smtpHost!, port: this.smtpPort });
      let buffer = '';
      let step = 0;

      const send = (cmd: string) => socket.write(cmd + '\r\n');

      const b64 = (s: string) => Buffer.from(s).toString('base64');

      const steps = [
        () => send(`EHLO lumenflow.app`),
        () => {
          if (this.smtpUser) send('AUTH LOGIN');
          else { step++; steps[step]?.(); }
        },
        () => send(b64(this.smtpUser!)),
        () => send(b64(this.smtpPass ?? '')),
        () => send(`MAIL FROM:<${this.smtpFrom}>`),
        () => send(`RCPT TO:<${to}>`),
        () => send('DATA'),
        () => send(
          `From: ${this.smtpFrom}\r\nTo: ${to}\r\nSubject: ${subject}\r\n\r\n${body}\r\n.`,
        ),
        () => { send('QUIT'); socket.end(); resolve(); },
      ];

      socket.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        if (buffer.endsWith('\r\n')) {
          const code = parseInt(buffer.slice(0, 3), 10);
          buffer = '';
          if (code >= 400) {
            reject(new Error(`SMTP error ${code}`));
            socket.destroy();
            return;
          }
          step++;
          steps[step]?.();
        }
      });

      socket.on('error', reject);
      socket.on('connect', () => { /* wait for banner */ });
    });
  }
}
