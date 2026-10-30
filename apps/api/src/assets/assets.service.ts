import { Injectable, Logger } from '@nestjs/common';
import type { Asset } from '@lumenflow/shared-types';
import { RedisService } from '../redis/redis.service';

export interface SupportedAssetInfo {
  asset: Asset;
  name: string;
  symbol: string;
  decimals: number;
  iconUrl?: string;
}

@Injectable()
export class AssetsService {
  private readonly logger = new Logger(AssetsService.name);
  private static readonly CACHE_KEY = 'cache:assets:supported';
  private static readonly CACHE_TTL_SECONDS = 3600; // 1 hour TTL

  private readonly supportedAssets: SupportedAssetInfo[] = [
    {
      asset: { type: 'native', code: 'XLM' },
      name: 'Stellar Lumens',
      symbol: 'XLM',
      decimals: 7,
      iconUrl: 'https://cryptologos.cc/logos/stellar-xlm-logo.svg',
    },
    {
      asset: {
        type: 'credit_alphanum4',
        code: 'USDC',
        issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
      },
      name: 'USD Coin (Testnet)',
      symbol: 'USDC',
      decimals: 7,
      iconUrl: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.svg',
    },
    {
      asset: {
        type: 'credit_alphanum4',
        code: 'EURC',
        issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
      },
      name: 'Euro Coin (Testnet)',
      symbol: 'EURC',
      decimals: 7,
      iconUrl: 'https://cryptologos.cc/logos/euro-coin-eurc-logo.svg',
    },
  ];

  constructor(private readonly redisService?: RedisService) {}

  async getSupportedAssets(): Promise<SupportedAssetInfo[]> {
    if (this.redisService) {
      try {
        const cached = await this.redisService.get(AssetsService.CACHE_KEY);
        if (cached) {
          return JSON.parse(cached) as SupportedAssetInfo[];
        }
      } catch (err) {
        this.logger.debug(`Cache read error: ${String(err)}`);
      }
    }

    const assets = this.supportedAssets;

    if (this.redisService) {
      try {
        await this.redisService.set(
          AssetsService.CACHE_KEY,
          JSON.stringify(assets),
          AssetsService.CACHE_TTL_SECONDS,
        );
      } catch (err) {
        this.logger.debug(`Cache write error: ${String(err)}`);
      }
    }

    return assets;
  }
}
