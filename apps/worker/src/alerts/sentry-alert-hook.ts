import * as Sentry from '@sentry/node';
import type { AlertHook, AlertPayload } from './alert-hook.interface';

export class SentryAlertHook implements AlertHook {
  private readonly isInitialized: boolean;

  constructor(private readonly fallbackHook?: AlertHook) {
    const dsn = process.env['SENTRY_DSN'];
    if (dsn && dsn.trim() !== '') {
      Sentry.init({
        dsn,
        environment: process.env['NODE_ENV'] ?? 'development',
      });
      this.isInitialized = true;
    } else {
      this.isInitialized = false;
    }
  }

  async sendAlert(alert: AlertPayload): Promise<void> {
    if (this.isInitialized) {
      const level: Sentry.SeverityLevel =
        alert.severity === 'CRITICAL'
          ? 'error'
          : alert.severity === 'WARNING'
            ? 'warning'
            : 'info';

      Sentry.withScope((scope) => {
        scope.setLevel(level);
        scope.setTag('alertType', alert.type);
        scope.setTag('severity', alert.severity);
        scope.setExtras(alert.details);
        Sentry.captureMessage(`[Worker Alert] ${alert.title}: ${JSON.stringify(alert.details)}`, level);
      });
    }

    if (this.fallbackHook) {
      await this.fallbackHook.sendAlert(alert);
    }
  }
}
