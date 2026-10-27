import http from 'node:http';
import { URL, URLSearchParams } from 'node:url';
import crypto from 'node:crypto';
import {
  Keypair,
  TransactionBuilder,
  Account,
  Operation,
  Memo,
  Networks,
  Transaction,
} from '@stellar/stellar-sdk';

export interface MockAnchorOptions {
  port?: number | undefined;
  host?: string | undefined;
  signingSecret?: string | undefined;
  apiUrl?: string | undefined;
}

export interface MockSep24Tx {
  id: string;
  kind: string;
  status: string;
  status_eta?: number | undefined;
  amount_in?: string | undefined;
  amount_out?: string | undefined;
  amount_fee?: string | undefined;
  withdraw_anchor_account?: string | undefined;
  withdraw_memo?: string | undefined;
  withdraw_memo_type?: string | undefined;
  account?: string | undefined;
  started_at: string;
  completed_at?: string | undefined;
}

export class MockAnchorServer {
  private server: http.Server | null = null;
  readonly anchorKeypair: Keypair;
  readonly port: number;
  readonly host: string;
  readonly signingSecret: string;
  readonly apiUrl: string;

  private readonly transactions = new Map<string, MockSep24Tx>();
  private readonly customers = new Map<string, Record<string, unknown>>();

  constructor(options: MockAnchorOptions = {}) {
    this.port = options.port ?? 4001;
    this.host = options.host ?? 'localhost';
    this.signingSecret =
      options.signingSecret ??
      process.env['WEBHOOK_SIGNING_SECRET'] ??
      'mock_webhook_secret_key_12345';
    this.apiUrl =
      options.apiUrl ?? process.env['API_URL'] ?? 'http://localhost:4000';

    // Deterministic keypair for mock anchor server
    this.anchorKeypair = Keypair.fromRawEd25519Seed(
      Buffer.from('01234567890123456789012345678901'),
    );
  }

  get baseUrl(): string {
    return `http://${this.host}:${this.port}`;
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
        void this.handleRequest(req, res);
      });
      this.server.listen(this.port, () => {
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-webhook-signature');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const pathname = parsedUrl.pathname;

    try {
      // 1. SEP-1: stellar.toml
      if (pathname === '/.well-known/stellar.toml' && req.method === 'GET') {
        const toml = `
# LumenFlow Mock Anchor stellar.toml
VERSION = "2.0.0"
NETWORK_PASSPHRASE = "${Networks.TESTNET}"
SIGNING_KEY = "${this.anchorKeypair.publicKey()}"
WEB_AUTH_ENDPOINT = "${this.baseUrl}/auth"
TRANSFER_SERVER_SEP0024 = "${this.baseUrl}/sep24"
KYC_SERVER = "${this.baseUrl}/kyc"
ACCOUNTS = ["${this.anchorKeypair.publicKey()}"]

[[CURRENCIES]]
code = "USDC"
issuer = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
status = "live"
is_asset_anchored = true
anchor_asset_type = "fiat"
desc = "USDC Mock Fiat Anchor Token"
`;
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(toml.trim());
        return;
      }

      // 2. SEP-10: GET /auth (Challenge)
      if (pathname === '/auth' && req.method === 'GET') {
        const clientAccount = parsedUrl.searchParams.get('account');
        if (!clientAccount) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing account query parameter' }));
          return;
        }

        const anchorAccount = new Account(this.anchorKeypair.publicKey(), '0');
        const builder = new TransactionBuilder(anchorAccount, {
          fee: '100',
          networkPassphrase: Networks.TESTNET,
        });

        builder.addOperation(
          Operation.manageData({
            name: 'LumenFlow Auth Challenge',
            value: Buffer.from(Date.now().toString()),
            source: clientAccount,
          }),
        );
        builder.setTimeout(300);
        builder.addMemo(Memo.text('sep10-challenge'));

        const tx = builder.build();
        tx.sign(this.anchorKeypair);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            transaction: tx.toXDR(),
            network_passphrase: Networks.TESTNET,
          }),
        );
        return;
      }

      // 3. SEP-10: POST /auth (Submit signed challenge)
      if (pathname === '/auth' && req.method === 'POST') {
        const bodyText = await this.readBody(req);
        const body = JSON.parse(bodyText) as { transaction?: string };
        if (!body.transaction) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing transaction parameter' }));
          return;
        }

        const tx = new Transaction(body.transaction, Networks.TESTNET);
        if (tx.signatures.length < 2) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Challenge transaction lacks required signatures' }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            token: `mock-sep10-token-${Date.now()}-${tx.source}`,
          }),
        );
        return;
      }

      // 4. SEP-12: GET /kyc/customer
      if (pathname === '/kyc/customer' && req.method === 'GET') {
        const account = parsedUrl.searchParams.get('account') ?? 'default';
        const customer = this.customers.get(account) ?? {
          id: `cust-${account}`,
          status: 'ACCEPTED',
          provided_fields: {},
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(customer));
        return;
      }

      // 5. SEP-12: PUT /kyc/customer
      if (pathname === '/kyc/customer' && req.method === 'PUT') {
        const bodyText = await this.readBody(req);
        const data = JSON.parse(bodyText) as Record<string, unknown>;
        const account = (data['account'] as string) ?? 'default';
        const record = {
          id: `cust-${account}`,
          status: 'ACCEPTED',
          provided_fields: data,
        };
        this.customers.set(account, record);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(record));
        return;
      }

      // 6. SEP-24: POST /sep24/transactions/withdraw/interactive
      if (pathname === '/sep24/transactions/withdraw/interactive' && req.method === 'POST') {
        const bodyText = await this.readBody(req);
        const params = new URLSearchParams(bodyText);
        const _assetCode = params.get('asset_code') ?? 'USDC';
        const account = params.get('account') ?? '';
        const amount = params.get('amount') ?? '100.00';

        const txId = `sep24-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const txRecord: MockSep24Tx = {
          id: txId,
          kind: 'withdrawal',
          status: 'incomplete',
          status_eta: 300,
          amount_in: amount,
          amount_out: (Number(amount) * 1550).toFixed(2),
          amount_fee: '1.00',
          account,
          started_at: new Date().toISOString(),
        };
        this.transactions.set(txId, txRecord);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            type: 'interactive_customer_info_needed',
            url: `${this.baseUrl}/interactive?transaction_id=${txId}`,
            id: txId,
          }),
        );
        return;
      }

      // 7. SEP-24: GET /sep24/transaction
      if (pathname === '/sep24/transaction' && req.method === 'GET') {
        const txId = parsedUrl.searchParams.get('id');
        if (!txId || !this.transactions.has(txId)) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Transaction ${txId} not found` }));
          return;
        }

        const tx = this.transactions.get(txId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ transaction: tx }));
        return;
      }

      // 8. Interactive flow: GET /interactive
      if (pathname === '/interactive' && req.method === 'GET') {
        const txId = parsedUrl.searchParams.get('transaction_id') ?? '';
        const html = `
<!DOCTYPE html>
<html>
<head><title>LumenFlow Mock Anchor Interactive Flow</title></head>
<body style="font-family: sans-serif; padding: 2rem;">
  <h2>Anchor Offramp: Bank Details</h2>
  <p>Transaction ID: <strong>${txId}</strong></p>
  <form method="POST" action="/interactive/complete">
    <input type="hidden" name="transaction_id" value="${txId}" />
    <label>Bank Name:<br><input name="bank_name" value="Access Bank" required /></label><br><br>
    <label>Account Number:<br><input name="account_number" value="0123456789" required /></label><br><br>
    <label>Account Name:<br><input name="account_name" value="Jane Doe" required /></label><br><br>
    <button type="submit">Confirm Payout Details</button>
  </form>
</body>
</html>
`;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html.trim());
        return;
      }

      // 9. Interactive flow: POST /interactive/complete
      if (pathname === '/interactive/complete' && req.method === 'POST') {
        const bodyText = await this.readBody(req);
        const params = new URLSearchParams(bodyText);
        const txId = params.get('transaction_id');

        if (!txId || !this.transactions.has(txId)) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Transaction ${txId} not found` }));
          return;
        }

        const tx = this.transactions.get(txId);
        if (!tx) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Transaction ${txId} not found` }));
          return;
        }

        tx.status = 'pending_user_transfer_start';
        tx.withdraw_anchor_account = this.anchorKeypair.publicKey();
        tx.withdraw_memo = `lf-${txId.slice(-6)}`;
        tx.withdraw_memo_type = 'text';

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'success',
            message: 'Bank details recorded. Ready for Stellar transfer.',
            transaction: tx,
          }),
        );
        return;
      }

      // 10. Webhook simulator helper: POST /api/trigger-webhook
      if (pathname === '/api/trigger-webhook' && req.method === 'POST') {
        const bodyText = await this.readBody(req);
        const payload = JSON.parse(bodyText) as {
          orderId: string;
          status: string;
          externalId?: string;
          stellarTxHash?: string;
          amount?: string;
          eventId?: string;
        };

        const webhookPayload = {
          eventId: payload.eventId ?? `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          orderId: payload.orderId,
          status: payload.status,
          externalId: payload.externalId ?? 'ext-anchor-123',
          stellarTxHash: payload.stellarTxHash,
          amount: payload.amount ?? '100.00',
          timestamp: new Date().toISOString(),
        };

        const signature = this.signPayload(JSON.stringify(webhookPayload));
        const webhookRes = await fetch(`${this.apiUrl}/webhooks/anchor`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-webhook-signature': `sha256=${signature}`,
          },
          body: JSON.stringify(webhookPayload),
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            webhookDelivered: true,
            apiStatus: webhookRes.status,
            signature,
            payload: webhookPayload,
          }),
        );
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Route ${pathname} not found` }));
    } catch (err: unknown) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: `Internal server error: ${err instanceof Error ? err.message : String(err)}`,
        }),
      );
    }
  }

  signPayload(payloadString: string): string {
    return crypto
      .createHmac('sha256', this.signingSecret)
      .update(payloadString)
      .digest('hex');
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (chunk: Buffer) => {
        data += chunk.toString();
      });
      req.on('end', () => resolve(data));
      req.on('error', (err: Error) => reject(err));
    });
  }
}
