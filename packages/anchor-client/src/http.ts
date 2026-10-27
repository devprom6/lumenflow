import { type z } from 'zod';
import {
  AnchorClientError,
  TimeoutError,
  NetworkError,
} from './errors';
import { type AnchorClientOptions } from './types';

export interface RequestOptions extends AnchorClientOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | undefined;
  headers?: Record<string, string> | undefined;
  body?: string | undefined;
  token?: string | undefined;
}

export async function requestWithRetry<T>(
  url: string,
  schema: z.ZodType<T>,
  options: RequestOptions = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 8000;
  const maxRetries = options.maxRetries ?? 2;
  const retryDelayMs = options.retryDelayMs ?? 200;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.headers ?? {}),
  };

  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const init: RequestInit = {
        method: options.method ?? 'GET',
        headers,
        signal: controller.signal,
      };
      if (options.body !== undefined) {
        init.body = options.body;
      }

      const response = await fetch(url, init);

      clearTimeout(timer);

      if (!response.ok) {
        const text = await response.text();
        let parsedJson: unknown;
        try {
          parsedJson = JSON.parse(text);
        } catch {
          parsedJson = text;
        }

        // Retry on 5xx errors
        if (response.status >= 500 && attempt < maxRetries) {
          lastError = new AnchorClientError(
            'ANCHOR_ERROR',
            `Anchor returned status ${response.status}: ${text}`,
            { statusCode: response.status, details: parsedJson },
          );
          await new Promise((resolve) =>
            setTimeout(resolve, retryDelayMs * Math.pow(2, attempt)),
          );
          continue;
        }

        throw new AnchorClientError(
          'ANCHOR_ERROR',
          `Anchor error (${response.status}): ${text}`,
          { statusCode: response.status, details: parsedJson },
        );
      }

      const json: unknown = await response.json();
      const parseResult = schema.safeParse(json);
      if (!parseResult.success) {
        throw new AnchorClientError(
          'VALIDATION_ERROR',
          `Failed to validate anchor response: ${parseResult.error.message}`,
          { details: parseResult.error.issues },
        );
      }

      return parseResult.data;
    } catch (err: unknown) {
      clearTimeout(timer);

      if (err instanceof AnchorClientError) {
        // Only retry on 5xx anchor errors handled above
        if (err.statusCode && err.statusCode < 500) {
          throw err;
        }
      }

      if (err instanceof Error && err.name === 'AbortError') {
        lastError = new TimeoutError(`Request to ${url} timed out after ${timeoutMs}ms`);
      } else if (err instanceof AnchorClientError) {
        lastError = err;
      } else {
        lastError = new NetworkError(
          `Network error contacting ${url}: ${err instanceof Error ? err.message : String(err)}`,
          err,
        );
      }

      if (attempt < maxRetries) {
        await new Promise((resolve) =>
          setTimeout(resolve, retryDelayMs * Math.pow(2, attempt)),
        );
        continue;
      }
    }
  }

  throw (
    lastError ??
    new AnchorClientError('ANCHOR_ERROR', `Request to ${url} failed after ${maxRetries} retries`)
  );
}
