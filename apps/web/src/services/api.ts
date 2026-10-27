import type {
  Asset,
  Quote,
  Order,
  OfframpQuote,
  BridgeQuote,
  BridgeRoute,
  UnsignedTransfer,
  TransferStatus,
} from '@lumenflow/shared-types';

const API_BASE_URL =
  process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000';

export interface ChallengeResponse {
  transaction: string;
  networkPassphrase: string;
}

export interface VerifyResponse {
  token: string;
  user: {
    id: string;
    publicKey: string;
  };
}

export interface BuildSwapResponse {
  unsignedXdr: string;
  quoteId: string;
  orderId: string;
  addedTrustline: boolean;
  networkPassphrase: string;
}

export interface SubmitSwapResponse {
  orderId: string;
  status: string;
  stellarTxHash: string;
  ledger?: number;
}

async function extractErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as Record<string, unknown>;
    if (typeof data['message'] === 'string') {
      return data['message'];
    }
  } catch {
    // Ignore JSON parse errors
  }
  return fallback;
}

export class ApiService {
  private static getHeaders(jwtToken?: string | null): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Idempotency-Key': `web-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    };

    if (jwtToken) {
      headers['Authorization'] = `Bearer ${jwtToken}`;
    }

    return headers;
  }

  static async getChallenge(publicKey: string): Promise<ChallengeResponse> {
    const res = await fetch(`${API_BASE_URL}/auth/challenge`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ publicKey }),
    });

    if (!res.ok) {
      const message = await extractErrorMessage(res, 'Failed to get auth challenge');
      throw new Error(message);
    }

    return (await res.json()) as ChallengeResponse;
  }

  static async verifyChallenge(signedTransactionXdr: string): Promise<VerifyResponse> {
    const res = await fetch(`${API_BASE_URL}/auth/verify`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ transaction: signedTransactionXdr }),
    });

    if (!res.ok) {
      const message = await extractErrorMessage(res, 'Failed to verify auth challenge');
      throw new Error(message);
    }

    return (await res.json()) as VerifyResponse;
  }

  static async getAssets(): Promise<Asset[]> {
    const res = await fetch(`${API_BASE_URL}/assets`, {
      headers: this.getHeaders(),
    });

    if (!res.ok) {
      // Fallback supported testnet assets
      return [
        { type: 'native', code: 'XLM' },
        {
          type: 'credit_alphanum4',
          code: 'USDC',
          issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
        },
        {
          type: 'credit_alphanum4',
          code: 'EURC',
          issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
        },
      ];
    }

    const data = (await res.json()) as { assets: Asset[] };
    return data.assets;
  }

  static async getQuote(
    sourceAsset: Asset,
    destinationAsset: Asset,
    sourceAmount: string,
    slippageTolerance: number,
    token?: string | null,
  ): Promise<Quote> {
    const res = await fetch(`${API_BASE_URL}/swap/quote`, {
      method: 'POST',
      headers: this.getHeaders(token),
      body: JSON.stringify({
        sourceAsset,
        destinationAsset,
        sourceAmount,
        slippageTolerance,
      }),
    });

    if (!res.ok) {
      const message = await extractErrorMessage(res, 'Failed to fetch swap quote');
      throw new Error(message);
    }

    return (await res.json()) as Quote;
  }

  static async buildSwap(
    quoteId: string,
    senderPublicKey: string,
    token?: string | null,
  ): Promise<BuildSwapResponse> {
    const res = await fetch(`${API_BASE_URL}/swap/build`, {
      method: 'POST',
      headers: this.getHeaders(token),
      body: JSON.stringify({
        quoteId,
        senderPublicKey,
      }),
    });

    if (!res.ok) {
      const message = await extractErrorMessage(res, 'Failed to build swap transaction');
      throw new Error(message);
    }

    return (await res.json()) as BuildSwapResponse;
  }

  static async submitSwap(
    orderId: string,
    signedXdr: string,
    token?: string | null,
  ): Promise<SubmitSwapResponse> {
    const res = await fetch(`${API_BASE_URL}/swap/submit`, {
      method: 'POST',
      headers: this.getHeaders(token),
      body: JSON.stringify({
        orderId,
        signedXdr,
      }),
    });

    if (!res.ok) {
      const message = await extractErrorMessage(res, 'Failed to submit swap transaction');
      throw new Error(message);
    }

    return (await res.json()) as SubmitSwapResponse;
  }

  static async getTransactions(
    publicKey?: string | null,
    token?: string | null,
  ): Promise<Order[]> {
    const url = publicKey
      ? `${API_BASE_URL}/transactions?publicKey=${encodeURIComponent(publicKey)}`
      : `${API_BASE_URL}/transactions`;

    const res = await fetch(url, {
      headers: this.getHeaders(token),
    });

    if (!res.ok) {
      return [];
    }

    return (await res.json()) as Order[];
  }

  static async getOrder(orderId: string, token?: string | null): Promise<Order> {
    const res = await fetch(`${API_BASE_URL}/orders/${orderId}`, {
      headers: this.getHeaders(token),
    });

    if (!res.ok) {
      const message = await extractErrorMessage(res, 'Failed to fetch order');
      throw new Error(message);
    }

    return (await res.json()) as Order;
  }

  static async getOfframpQuote(
    sourceAsset: Asset,
    destinationCurrency: string,
    sourceAmount: string,
    token?: string | null,
  ): Promise<OfframpQuote> {
    const res = await fetch(`${API_BASE_URL}/offramp/quote`, {
      method: 'POST',
      headers: this.getHeaders(token),
      body: JSON.stringify({
        sourceAsset,
        destinationCurrency,
        sourceAmount,
      }),
    });

    if (!res.ok) {
      const message = await extractErrorMessage(res, 'Failed to fetch offramp quote');
      throw new Error(message);
    }

    return (await res.json()) as OfframpQuote;
  }

  static async createOfframpOrder(
    quoteId: string,
    userAddress: string,
    destinationDetails?: Record<string, string>,
    token?: string | null,
  ): Promise<{ order: Order; interactiveUrl: string; anchorTxId: string }> {
    const res = await fetch(`${API_BASE_URL}/offramp/orders`, {
      method: 'POST',
      headers: this.getHeaders(token),
      body: JSON.stringify({
        quoteId,
        userAddress,
        destinationDetails,
      }),
    });

    if (!res.ok) {
      const message = await extractErrorMessage(res, 'Failed to create offramp order');
      throw new Error(message);
    }

    return (await res.json()) as { order: Order; interactiveUrl: string; anchorTxId: string };
  }

  static async getOfframpOrderStatus(orderId: string, token?: string | null): Promise<Order> {
    const res = await fetch(`${API_BASE_URL}/offramp/orders/${orderId}`, {
      headers: this.getHeaders(token),
    });

    if (!res.ok) {
      const message = await extractErrorMessage(res, 'Failed to fetch offramp order status');
      throw new Error(message);
    }

    return (await res.json()) as Order;
  }

  static async getBridgeRoutes(token?: string | null): Promise<BridgeRoute[]> {
    try {
      const res = await fetch(`${API_BASE_URL}/bridge/routes`, {
        headers: this.getHeaders(token),
      });
      if (res.ok) {
        return (await res.json()) as BridgeRoute[];
      }
    } catch {
      // In offline / fallback mode
    }

    return [
      {
        id: 'stellar-eth-usdc',
        fromChain: 'stellar',
        toChain: 'ethereum',
        fromAsset: 'USDC',
        toAsset: 'USDC',
        minAmount: '10',
        maxAmount: '50000',
        estimatedDurationSeconds: 120,
        enabled: true,
      },
      {
        id: 'stellar-polygon-usdc',
        fromChain: 'stellar',
        toChain: 'polygon',
        fromAsset: 'USDC',
        toAsset: 'USDC',
        minAmount: '5',
        maxAmount: '25000',
        estimatedDurationSeconds: 60,
        enabled: true,
      },
    ];
  }

  static async getBridgeQuote(
    params: {
      fromChain: string;
      toChain: string;
      fromAsset: string;
      toAsset: string;
      amount: string;
      slippageTolerance?: number | undefined;
    },
    token?: string | null,
  ): Promise<BridgeQuote> {
    const res = await fetch(`${API_BASE_URL}/bridge/quote`, {
      method: 'POST',
      headers: this.getHeaders(token),
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const message = await extractErrorMessage(res, 'Failed to fetch bridge quote');
      throw new Error(message);
    }

    return (await res.json()) as BridgeQuote;
  }

  static async initiateBridgeTransfer(
    quoteId: string,
    sender: string,
    destinationRecipient?: string,
    token?: string | null,
  ): Promise<{ order: Order; transfer: UnsignedTransfer }> {
    const res = await fetch(`${API_BASE_URL}/bridge/transfer`, {
      method: 'POST',
      headers: this.getHeaders(token),
      body: JSON.stringify({
        quoteId,
        sender,
        destinationRecipient,
      }),
    });

    if (!res.ok) {
      const message = await extractErrorMessage(res, 'Failed to initiate bridge transfer');
      throw new Error(message);
    }

    return (await res.json()) as { order: Order; transfer: UnsignedTransfer };
  }

  static async getBridgeTransferStatus(
    id: string,
    token?: string | null,
  ): Promise<{ order: Order; status?: TransferStatus | undefined }> {
    const res = await fetch(`${API_BASE_URL}/bridge/transfer/${id}`, {
      headers: this.getHeaders(token),
    });

    if (!res.ok) {
      const message = await extractErrorMessage(res, 'Failed to get bridge transfer status');
      throw new Error(message);
    }

    return (await res.json()) as { order: Order; status?: TransferStatus };
  }
}
