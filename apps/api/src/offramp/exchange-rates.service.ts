/**
 * Exchange Rates Service
 *
 * Fetches dynamic exchange rates from a real rate provider API (e.g. Open
 * Exchange Rates, CoinGecko, or the anchor's own rate endpoint). Falls
 * back to static rates when no provider URL is configured or the API is
 * unreachable.
 */

import { Injectable, Logger } from '@nestjs/common';

export interface ExchangeRateResponse {
  currency: string;
  rate: number;
  source: 'api' | 'fallback';
  fetchedAt: string;
}

interface RateCache {
  rates: Map<string, number>;
  fetchedAt: number;
}

const FALLBACK_RATES: Record<string, number> = {
  NGN: 1550.0,
  KES: 130.0,
  GHS: 15.5,
  ZAR: 18.5,
  UGX: 3750.0,
  TZS: 2600.0,
};

const CACHE_TTL_MS = 60_000; // 1 minute

@Injectable()
export class ExchangeRatesService {
  private readonly logger = new Logger(ExchangeRatesService.name);
  private cache: RateCache = { rates: new Map(), fetchedAt: 0 };

  /**
   * Get the exchange rate for a currency code (e.g. NGN, KES, GHS).
   * Returns rate as: 1 USDC = X local currency units.
   */
  async getRate(currency: string): Promise<ExchangeRateResponse> {
    const upperCurrency = currency.toUpperCase();

    // Try fetching from real API if configured
    const rateApiUrl = process.env['EXCHANGE_RATE_API_URL'];
    const rateApiKey = process.env['EXCHANGE_RATE_API_KEY'];

    if (rateApiUrl && this.isCacheFresh()) {
      const cached = this.cache.rates.get(upperCurrency);
      if (cached !== undefined) {
        return {
          currency: upperCurrency,
          rate: cached,
          source: 'api',
          fetchedAt: new Date(this.cache.fetchedAt).toISOString(),
        };
      }
    }

    if (rateApiUrl) {
      try {
        const rates = await this.fetchRatesFromApi(rateApiUrl, rateApiKey);
        this.cache = { rates, fetchedAt: Date.now() };

        const rate = rates.get(upperCurrency);
        if (rate !== undefined) {
          return {
            currency: upperCurrency,
            rate,
            source: 'api',
            fetchedAt: new Date().toISOString(),
          };
        }
      } catch (err) {
        this.logger.warn(`Failed to fetch rates from API: ${String(err)}. Using fallback.`);
      }
    }

    // Fallback to static rates
    const fallbackRate = FALLBACK_RATES[upperCurrency] ?? 1.0;
    return {
      currency: upperCurrency,
      rate: fallbackRate,
      source: 'fallback',
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * Get rates for multiple currencies at once.
   */
  async getRates(currencies: string[]): Promise<ExchangeRateResponse[]> {
    return Promise.all(currencies.map((c) => this.getRate(c)));
  }

  private isCacheFresh(): boolean {
    return Date.now() - this.cache.fetchedAt < CACHE_TTL_MS;
  }

  private async fetchRatesFromApi(
    apiUrl: string,
    apiKey?: string,
  ): Promise<Map<string, number>> {
    const url = apiKey
      ? `${apiUrl}?app_id=${apiKey}&base=USD`
      : apiUrl;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        throw new Error(`Rate API returned ${res.status}`);
      }

      const data = await res.json() as { rates?: Record<string, number> };
      const ratesMap = new Map<string, number>();

      if (data.rates) {
        for (const [code, rate] of Object.entries(data.rates)) {
          ratesMap.set(code.toUpperCase(), rate);
        }
      }

      // Merge in fallback rates for currencies not in API response
      for (const [code, rate] of Object.entries(FALLBACK_RATES)) {
        if (!ratesMap.has(code)) {
          ratesMap.set(code, rate);
        }
      }

      return ratesMap;
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }
}
