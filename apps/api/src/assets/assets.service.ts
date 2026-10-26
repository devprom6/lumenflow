import { Injectable } from '@nestjs/common';
import type { Asset } from '@lumenflow/shared-types';

export interface SupportedAssetInfo {
  asset: Asset;
  name: string;
  symbol: string;
  decimals: number;
  iconUrl?: string;
}

@Injectable()
export class AssetsService {
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

  getSupportedAssets(): SupportedAssetInfo[] {
    return this.supportedAssets;
  }
}
