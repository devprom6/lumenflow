/**
 * Network configuration for LumenFlow.
 *
 * Only TESTNET is supported in this build. Attempting to configure MAINNET
 * will throw at runtime to prevent accidental mainnet use during development.
 */

export type StellarNetwork = 'TESTNET';

export interface NetworkConfig {
  network: StellarNetwork;
  networkPassphrase: string;
  horizonUrl: string;
  rpcUrl: string;
}

const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';

/**
 * Returns the network configuration driven by environment variables.
 * Throws if MAINNET is requested — this build is Testnet-only.
 */
export function getNetworkConfig(): NetworkConfig {
  const network = (process.env['STELLAR_NETWORK'] ?? 'TESTNET').toUpperCase();

  if (network === 'PUBLIC' || network === 'MAINNET') {
    throw new Error(
      '[LumenFlow] Mainnet is not supported in this build. ' +
        'Set STELLAR_NETWORK=TESTNET. ' +
        'Mainnet support requires a completed security review and compliance setup.',
    );
  }

  return {
    network: 'TESTNET',
    networkPassphrase:
      process.env['STELLAR_NETWORK_PASSPHRASE'] ?? TESTNET_PASSPHRASE,
    horizonUrl:
      process.env['STELLAR_HORIZON_URL'] ??
      'https://horizon-testnet.stellar.org',
    rpcUrl:
      process.env['STELLAR_RPC_URL'] ??
      'https://soroban-testnet.stellar.org',
  };
}
