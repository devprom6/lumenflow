export type SupportedWallet =
  | 'freighter'
  | 'xbull'
  | 'albedo'
  | 'lobstr'
  | 'testnet-dev';

export interface WalletInfo {
  id: SupportedWallet;
  name: string;
  icon: string;
  description: string;
}

export const SUPPORTED_WALLETS: WalletInfo[] = [
  {
    id: 'freighter',
    name: 'Freighter',
    icon: 'F',
    description: 'Browser extension by Stellar Development Foundation',
  },
  {
    id: 'xbull',
    name: 'xBull',
    icon: 'X',
    description: 'Feature-rich Stellar wallet and extension',
  },
  {
    id: 'albedo',
    name: 'Albedo',
    icon: 'A',
    description: 'Web-based delegated signing, no extension required',
  },
  {
    id: 'lobstr',
    name: 'Lobstr',
    icon: 'L',
    description: 'Popular mobile Stellar wallet',
  },
  {
    id: 'testnet-dev',
    name: 'Testnet Dev Wallet',
    icon: 'D',
    description: 'Automated Testnet signer for local development & E2E tests',
  },
];
