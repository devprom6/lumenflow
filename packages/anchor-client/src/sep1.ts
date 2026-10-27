import {
  Sep1StellarTomlSchema,
  type Sep1StellarToml,
  type Sep1Currency,
} from './types';
import { Sep1Error } from './errors';

export function parseStellarToml(tomlText: string): Sep1StellarToml {
  const lines = tomlText.split(/\r?\n/);
  const result: Record<string, unknown> = {};
  let currentCurrency: Record<string, unknown> | null = null;
  const currencies: Sep1Currency[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    if (line === '[[CURRENCIES]]') {
      if (currentCurrency) {
        currencies.push(currentCurrency as unknown as Sep1Currency);
      }
      currentCurrency = {};
      continue;
    }

    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) {
      continue;
    }

    const key = line.slice(0, eqIndex).trim();
    let valueStr = line.slice(eqIndex + 1).trim();

    // Strip inline comments if not inside string
    if (!valueStr.startsWith('"')) {
      const hashIndex = valueStr.indexOf('#');
      if (hashIndex !== -1) {
        valueStr = valueStr.slice(0, hashIndex).trim();
      }
    }

    let parsedValue: unknown = valueStr;

    if (valueStr.startsWith('"') && valueStr.endsWith('"')) {
      parsedValue = valueStr.slice(1, -1);
    } else if (valueStr === 'true') {
      parsedValue = true;
    } else if (valueStr === 'false') {
      parsedValue = false;
    } else if (valueStr.startsWith('[') && valueStr.endsWith(']')) {
      // Simple string/value array parsing
      const items = valueStr
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => (s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s));
      parsedValue = items;
    } else if (!isNaN(Number(valueStr)) && valueStr !== '') {
      parsedValue = Number(valueStr);
    }

    if (currentCurrency) {
      currentCurrency[key] = parsedValue;
    } else {
      result[key] = parsedValue;
    }
  }

  if (currentCurrency) {
    currencies.push(currentCurrency as unknown as Sep1Currency);
  }

  if (currencies.length > 0) {
    result['CURRENCIES'] = currencies;
  }

  const parsed = Sep1StellarTomlSchema.safeParse(result);
  if (!parsed.success) {
    throw new Sep1Error(
      `Invalid stellar.toml structure: ${parsed.error.message}`,
      parsed.error.issues,
    );
  }

  return parsed.data;
}

export async function discoverStellarToml(
  domainOrUrl: string,
  options?: { timeoutMs?: number | undefined },
): Promise<Sep1StellarToml> {
  const timeoutMs = options?.timeoutMs ?? 5000;
  let targetUrl: string;

  if (domainOrUrl.startsWith('http://') || domainOrUrl.startsWith('https://')) {
    targetUrl = domainOrUrl.endsWith('/.well-known/stellar.toml')
      ? domainOrUrl
      : `${domainOrUrl.replace(/\/$/, '')}/.well-known/stellar.toml`;
  } else {
    // SEP-1 spec requires HTTPS, except allow localhost/127.0.0.1 for local testing
    const isLocal =
      domainOrUrl.startsWith('localhost') ||
      domainOrUrl.startsWith('127.0.0.1');
    const proto = isLocal ? 'http' : 'https';
    targetUrl = `${proto}://${domainOrUrl}/.well-known/stellar.toml`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(targetUrl, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) {
      throw new Sep1Error(
        `Failed to fetch stellar.toml from ${targetUrl} (status ${res.status})`,
      );
    }

    const text = await res.text();
    return parseStellarToml(text);
  } catch (err: unknown) {
    clearTimeout(timer);
    if (err instanceof Sep1Error) {
      throw err;
    }
    throw new Sep1Error(
      `Could not retrieve stellar.toml from ${domainOrUrl}: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }
}
