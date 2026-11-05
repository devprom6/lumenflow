import { Injectable, Logger } from '@nestjs/common';
import type {
  ComplianceHook,
  ComplianceCheckParams,
  ComplianceDecision,
} from './compliance.interface';

/** The shape we expect from the compliance provider's response body. */
interface ProviderScreenResponse {
  status: 'ALLOWED' | 'BLOCKED' | 'FLAGGED';
  reason?: string;
  matchedList?: string;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Real HTTP compliance screening service.
 *
 * Reads COMPLIANCE_API_URL and COMPLIANCE_API_KEY from environment variables
 * and POSTs each transaction to the provider's /screen endpoint.
 *
 * Retry behaviour:
 *  - 429 / 5xx → retry up to MAX_RETRIES times with exponential back-off
 *  - 400 / 401 / 403 → throw immediately (misconfiguration or bad request)
 *  - Network error → fail-open (return ALLOW) with a warning log
 */
@Injectable()
export class HttpComplianceService implements ComplianceHook {
  readonly name = 'HttpComplianceService';
  private readonly logger = new Logger(HttpComplianceService.name);

  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor() {
    const apiUrl = process.env['COMPLIANCE_API_URL'];
    const apiKey = process.env['COMPLIANCE_API_KEY'];

    if (!apiUrl) {
      throw new Error(
        'COMPLIANCE_API_URL environment variable is required for HttpComplianceService.',
      );
    }

    this.apiUrl = apiUrl.replace(/\/$/, ''); // strip trailing slash
    this.apiKey = apiKey ?? '';

    if (!apiKey) {
      this.logger.warn(
        'COMPLIANCE_API_KEY is not set — requests will be sent without an API key.',
      );
    }
  }

  async screenTransaction(
    params: ComplianceCheckParams,
  ): Promise<ComplianceDecision> {
    const body = JSON.stringify({
      userId: params.userId,
      userAddress: params.userAddress,
      amount: params.amountUsd,
      destinationCurrency: params.destinationCurrency,
      ...(params.destinationDetails && {
        destinationDetails: params.destinationDetails,
      }),
    });

    let attempt = 0;

    while (attempt <= MAX_RETRIES) {
      let response: Response;

      try {
        response = await fetch(`${this.apiUrl}/screen`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.apiKey ? { 'X-Api-Key': this.apiKey } : {}),
          },
          body,
        });
      } catch (networkErr: unknown) {
        // Network-level failure (DNS, timeout, connection refused)
        this.logger.warn(
          `Compliance API network error on attempt ${attempt + 1}: ${String(networkErr)}. ` +
            `Failing open (ALLOW) to avoid blocking legitimate users.`,
        );
        return {
          allowed: true,
          action: 'ALLOW',
          reason: 'Compliance check skipped due to network error (fail-open)',
        };
      }

      const status = response.status;

      // Hard failures — misconfiguration or bad input, do not retry
      if (status === 400 || status === 401 || status === 403) {
        const text = await response.text().catch(() => '(no body)');
        throw new Error(
          `Compliance API returned ${status}: ${text}. ` +
            `Check COMPLIANCE_API_URL and COMPLIANCE_API_KEY configuration.`,
        );
      }

      // Transient failures — retry
      if (status === 429 || status >= 500) {
        attempt++;
        if (attempt > MAX_RETRIES) {
          this.logger.warn(
            `Compliance API returned ${status} after ${MAX_RETRIES} retries for ` +
              `userId=${params.userId}. Failing open (ALLOW).`,
          );
          return {
            allowed: true,
            action: 'ALLOW',
            reason: `Compliance check skipped after ${MAX_RETRIES} retries (fail-open)`,
          };
        }
        const delay = RETRY_DELAY_MS * 2 ** (attempt - 1);
        this.logger.warn(
          `Compliance API ${status} — retry ${attempt}/${MAX_RETRIES} in ${delay}ms`,
        );
        await sleep(delay);
        continue;
      }

      // Success path — parse and map the provider response
      let data: ProviderScreenResponse;
      try {
        data = (await response.json()) as ProviderScreenResponse;
      } catch {
        this.logger.warn(
          `Compliance API returned non-JSON body (status=${status}). Failing open.`,
        );
        return {
          allowed: true,
          action: 'ALLOW',
          reason: 'Compliance check skipped: unparseable response (fail-open)',
        };
      }

      return this.mapProviderResponse(data, params);
    }

    // Should not be reached, but TypeScript requires a return
    return { allowed: true, action: 'ALLOW' };
  }

  private mapProviderResponse(
    data: ProviderScreenResponse,
    params: ComplianceCheckParams,
  ): ComplianceDecision {
    switch (data.status) {
      case 'BLOCKED':
        this.logger.warn(
          `Transaction BLOCKED by compliance provider for userId=${params.userId} ` +
            `address=${params.userAddress}: ${data.reason ?? 'no reason given'}`,
        );
        return {
          allowed: false,
          action: 'BLOCK',
          reason: data.reason ?? 'Blocked by compliance provider',
          matchedList: data.matchedList,
        };

      case 'FLAGGED':
        this.logger.log(
          `Transaction FLAGGED by compliance provider for userId=${params.userId} ` +
            `address=${params.userAddress}: ${data.reason ?? 'no reason given'}`,
        );
        return {
          allowed: true,
          action: 'FLAG',
          reason: data.reason ?? 'Flagged for secondary review by compliance provider',
          matchedList: data.matchedList,
        };

      case 'ALLOWED':
      default:
        return {
          allowed: true,
          action: 'ALLOW',
          reason: data.reason,
        };
    }
  }
}
