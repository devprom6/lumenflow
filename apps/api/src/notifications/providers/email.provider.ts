import { Logger } from '@nestjs/common';
import type { NotificationProvider, NotificationPayload } from '../notification.interface';

/**
 * Email notification provider.
 * Uses SendGrid if SENDGRID_API_KEY is set, otherwise falls back to raw SMTP.
 * Degrades gracefully (warn log) if neither is configured.
 */
export class EmailNotificationProvider implements NotificationProvider {
  readonly name = 'Email';
  private readonly logger = new Logger(EmailNotificationProvider.name);
  private readonly sendgridKey: string | undefined;
  private readonly smtpHost: string | undefined;
  private readonly smtpPort: number;
  private readonly smtpUser: string | undefined;
  private readonly smtpPass: string | undefined;
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

    if (this.sendgridKey !== undefined) {
      await this.sendViaSendGrid(to, payload.title, payload.body, this.sendgridKey);
    } else if (this.smtpHost !== undefined) {
      await this.sendViaSmtp(to, payload.title, payload.body);
    } else {
      this.logger.warn(
        `[EMAIL NOT SENT] No SENDGRID_API_KEY or SMTP_HOST configured. ` +
          `Would have sent to ${to}: "${payload.title}"`,
      );
    }
  }

  private async sendViaSendGrid(
    to: string,
    subject: string,
    body: string,
    apiKey: string,
  ): Promise<void> {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
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
    const { createConnection } = await import('node:net');
    const host = this.smtpHost as string; // guarded by caller
    const user = this.smtpUser;
    const pass = this.smtpPass;
    const from = this.smtpFrom;
    const port = this.smtpPort;

    return new Promise((resolve, reject) => {
      const socket = createConnection({ host, port });
      let buffer = '';
      let step = 0;

      const send = (cmd: string) => socket.write(cmd + '\r\n');
      const b64 = (s: string) => Buffer.from(s).toString('base64');

      const steps: Array<() => void> = [
        () => send('EHLO lumenflow.app'),
        () => {
          if (user !== undefined) {
            send('AUTH LOGIN');
          } else {
            step++;
            steps[step]?.();
          }
        },
        () => send(b64(user ?? '')),
        () => send(b64(pass ?? '')),
        () => send(`MAIL FROM:<${from}>`),
        () => send(`RCPT TO:<${to}>`),
        () => send('DATA'),
        () => send(`From: ${from}\r\nTo: ${to}\r\nSubject: ${subject}\r\n\r\n${body}\r\n.`),
        () => {
          send('QUIT');
          socket.end();
          resolve();
        },
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
    });
  }
}
