import type { AlertHook } from '../alerts/alert-hook.interface';

export interface WebhookRetryJobData {
  eventId: string;
  provider: string;
  targetUrl: string;
  payload: Record<string, unknown>;
  attempt: number;
  maxAttempts?: number | undefined;
}

export interface WebhookDispatcher {
  dispatch(targetUrl: string, payload: Record<string, unknown>): Promise<boolean>;
}

export interface DeadLetterQueueRecord {
  eventId: string;
  provider: string;
  targetUrl: string;
  payload: Record<string, unknown>;
  failedAt: string;
  attempts: number;
  reason: string;
}

export class WebhookRetryProcessor {
  private readonly dlq: DeadLetterQueueRecord[] = [];
  private readonly successfulEvents = new Set<string>();

  constructor(
    private readonly dispatcher: WebhookDispatcher,
    private readonly alertHook: AlertHook,
    private readonly defaultMaxAttempts = 3,
  ) {}

  public getDlqRecords(): DeadLetterQueueRecord[] {
    return [...this.dlq];
  }

  public async process(data: WebhookRetryJobData): Promise<{
    eventId: string;
    status: 'SUCCESS' | 'RETRY' | 'SENT_TO_DLQ';
    attempt: number;
    nextDelayMs?: number | undefined;
  }> {
    // Idempotency check: if this event already succeeded in a prior retry, don't re-dispatch
    if (this.successfulEvents.has(data.eventId)) {
      return {
        eventId: data.eventId,
        status: 'SUCCESS',
        attempt: data.attempt,
      };
    }

    const maxAttempts = data.maxAttempts ?? this.defaultMaxAttempts;

    try {
      const ok = await this.dispatcher.dispatch(data.targetUrl, data.payload);
      if (ok) {
        this.successfulEvents.add(data.eventId);
        return {
          eventId: data.eventId,
          status: 'SUCCESS',
          attempt: data.attempt,
        };
      }
    } catch {
      // Dispatch failed
    }

    // Failed attempt
    const nextAttempt = data.attempt + 1;
    if (nextAttempt > maxAttempts) {
      // Exceeded max attempts: Route to DLQ
      const dlqRecord: DeadLetterQueueRecord = {
        eventId: data.eventId,
        provider: data.provider,
        targetUrl: data.targetUrl,
        payload: data.payload,
        failedAt: new Date().toISOString(),
        attempts: data.attempt,
        reason: `Exceeded maximum webhook retry attempts (${maxAttempts})`,
      };
      this.dlq.push(dlqRecord);

      await this.alertHook.sendAlert({
        type: 'WEBHOOK_DLQ',
        severity: 'CRITICAL',
        title: `Webhook dead-lettered: ${data.eventId} (${data.provider})`,
        details: {
          eventId: data.eventId,
          provider: data.provider,
          targetUrl: data.targetUrl,
          totalAttempts: data.attempt,
        },
        timestamp: new Date().toISOString(),
      });

      return {
        eventId: data.eventId,
        status: 'SENT_TO_DLQ',
        attempt: data.attempt,
      };
    }

    // Exponential backoff delay: 2^attempt * 1000ms
    const nextDelayMs = Math.pow(2, data.attempt) * 1000;

    return {
      eventId: data.eventId,
      status: 'RETRY',
      attempt: nextAttempt,
      nextDelayMs,
    };
  }
}
