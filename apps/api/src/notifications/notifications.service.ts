import { Injectable, Logger } from '@nestjs/common';
import type { NotificationProvider, NotificationPayload } from './notification.interface';
import { EmailNotificationProvider } from './providers/email.provider';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly providers: NotificationProvider[];

  constructor() {
    this.providers = [];

    // Register email provider if any email config is set
    const hasEmail =
      process.env['SENDGRID_API_KEY'] ||
      process.env['SMTP_HOST'];

    if (hasEmail) {
      this.providers.push(new EmailNotificationProvider());
      this.logger.log('EmailNotificationProvider registered');
    } else {
      this.logger.warn(
        'No email provider configured (SENDGRID_API_KEY or SMTP_HOST). ' +
        'Notifications will be logged only.',
      );
      // Always include a logging-only fallback so notification calls never throw
      this.providers.push({
        name: 'LoggingFallback',
        send: (payload) => {
          this.logger.log(
            `[NOTIFICATION] userId=${payload.userId} title="${payload.title}" body="${payload.body}"`,
          );
          return Promise.resolve();
        },
      });
    }
  }

  async notifyOrderStatus(
    userId: string,
    orderId: string,
    status: string,
    details?: Record<string, string>,
  ): Promise<void> {
    const title = `Your LumenFlow order is ${status.toLowerCase()}`;
    const body =
      status === 'COMPLETED'
        ? `Order ${orderId} completed successfully.`
        : status === 'FAILED'
        ? `Order ${orderId} failed. Please contact support.`
        : `Order ${orderId} status changed to ${status}.`;

    await this.fanOut({ userId, title, body, data: { orderId, status, ...details } });
  }

  async notifyPayoutComplete(
    userId: string,
    orderId: string,
    amount: string,
    currency: string,
  ): Promise<void> {
    await this.fanOut({
      userId,
      title: 'Payout complete',
      body: `${amount} ${currency} has been sent to your account. Order: ${orderId}`,
      data: { orderId, amount, currency },
    });
  }

  async notifyBridgeComplete(userId: string, transferId: string): Promise<void> {
    await this.fanOut({
      userId,
      title: 'Bridge transfer complete',
      body: `Your cross-chain transfer ${transferId} has been confirmed.`,
      data: { transferId },
    });
  }

  private async fanOut(payload: NotificationPayload): Promise<void> {
    await Promise.allSettled(
      this.providers.map((provider) =>
        provider.send(payload).catch((err: unknown) => {
          this.logger.error(
            `Notification provider '${provider.name}' failed for userId=${payload.userId}: ${String(err)}`,
          );
        }),
      ),
    );
  }
}
