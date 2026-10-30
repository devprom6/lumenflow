import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as Sentry from '@sentry/node';

@Injectable()
export class SentryService implements OnModuleInit {
  private readonly logger = new Logger(SentryService.name);
  private isInitialized = false;

  onModuleInit(): void {
    const dsn = process.env['SENTRY_DSN'];
    if (!dsn || dsn.trim() === '') {
      this.logger.log('Sentry DSN not configured; error tracking disabled (env-gated)');
      return;
    }

    try {
      Sentry.init({
        dsn,
        environment: process.env['NODE_ENV'] ?? 'development',
        tracesSampleRate: process.env['NODE_ENV'] === 'production' ? 0.1 : 1.0,
      });
      this.isInitialized = true;
      this.logger.log('Sentry error tracking initialized successfully');
    } catch (err) {
      this.logger.warn(`Failed to initialize Sentry: ${String(err)}`);
    }
  }

  captureException(exception: unknown, context?: Record<string, unknown>): void {
    if (!this.isInitialized) return;
    Sentry.withScope((scope) => {
      if (context) {
        scope.setExtras(context);
      }
      Sentry.captureException(exception);
    });
  }

  captureMessage(message: string, level: Sentry.SeverityLevel = 'info'): void {
    if (!this.isInitialized) return;
    Sentry.captureMessage(message, level);
  }

  isEnabled(): boolean {
    return this.isInitialized;
  }
}
