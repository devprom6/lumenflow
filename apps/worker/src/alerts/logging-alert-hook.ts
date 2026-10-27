import type { AlertHook, AlertPayload } from './alert-hook.interface';

export class LoggingAlertHook implements AlertHook {
  private readonly alerts: AlertPayload[] = [];

  public async sendAlert(alert: AlertPayload): Promise<void> {
    await Promise.resolve();
    this.alerts.push(alert);
    const prefix = `[ALERT][${alert.severity}][${alert.type}]`;
    console.warn(`${prefix} ${alert.title}`, JSON.stringify(alert.details));
  }

  public getAlerts(): AlertPayload[] {
    return [...this.alerts];
  }

  public clear(): void {
    this.alerts.length = 0;
  }
}
