"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockAnchorServer = void 0;
const node_http_1 = __importDefault(require("node:http"));
const node_url_1 = require("node:url");
const node_crypto_1 = __importDefault(require("node:crypto"));
const stellar_sdk_1 = require("@stellar/stellar-sdk");
class MockAnchorServer {
    server = null;
    anchorKeypair;
    port;
    host;
    signingSecret;
    apiUrl;
    transactions = new Map();
    customers = new Map();
    constructor(options = {}) {
        this.port = options.port ?? 4001;
        this.host = options.host ?? 'localhost';
        this.signingSecret =
            options.signingSecret ??
                process.env['WEBHOOK_SIGNING_SECRET'] ??
                'mock_webhook_secret_key_12345';
        this.apiUrl =
            options.apiUrl ?? process.env['API_URL'] ?? 'http://localhost:4000';
        // Deterministic keypair for mock anchor server
        this.anchorKeypair = stellar_sdk_1.Keypair.fromRawEd25519Seed(Buffer.from('01234567890123456789012345678901'));
    }
    get baseUrl() {
        return `http://${this.host}:${this.port}`;
    }
    async start() {
        return new Promise((resolve) => {
            this.server = node_http_1.default.createServer((req, res) => {
                void this.handleRequest(req, res);
            });
            this.server.listen(this.port, () => {
                resolve();
            });
        });
    }
    async stop() {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => resolve());
            }
            else {
                resolve();
            }
        });
    }
    async handleRequest(req, res) {
        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-webhook-signature');
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }
        const parsedUrl = new node_url_1.URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
        const pathname = parsedUrl.pathname;
        try {
            // 1. SEP-1: stellar.toml
            if (pathname === '/.well-known/stellar.toml' && req.method === 'GET') {
                const toml = `
# LumenFlow Mock Anchor stellar.toml
VERSION = "2.0.0"
NETWORK_PASSPHRASE = "${stellar_sdk_1.Networks.TESTNET}"
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
                const anchorAccount = new stellar_sdk_1.Account(this.anchorKeypair.publicKey(), '0');
                const tx = new stellar_sdk_1.TransactionBuilder(anchorAccount, {
                    fee: '100',
                    networkPassphrase: stellar_sdk_1.Networks.TESTNET,
                })
                    .addOperation(stellar_sdk_1.Operation.manageData({
                    name: 'LumenFlow Auth Challenge',
                    value: Buffer.from(Date.now().toString()),
                    source: clientAccount,
                }))
                    .setTimeout(300)
                    .setMemo(stellar_sdk_1.Memo.text('sep10-challenge'))
                    .build();
                tx.sign(this.anchorKeypair);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    transaction: tx.toXDR(),
                    network_passphrase: stellar_sdk_1.Networks.TESTNET,
                }));
                return;
            }
            // 3. SEP-10: POST /auth (Submit signed challenge)
            if (pathname === '/auth' && req.method === 'POST') {
                const bodyText = await this.readBody(req);
                const body = JSON.parse(bodyText);
                if (!body.transaction) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Missing transaction parameter' }));
                    return;
                }
                // Verify transaction parses and has signatures
                const tx = new stellar_sdk_1.Transaction(body.transaction, stellar_sdk_1.Networks.TESTNET);
                if (tx.signatures.length < 2) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Challenge transaction lacks required signatures' }));
                    return;
                }
                // Issue mock JWT
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    token: `mock-sep10-token-${Date.now()}-${tx.source}`,
                }));
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
                const data = JSON.parse(bodyText);
                const account = data['account'] ?? 'default';
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
                const assetCode = params.get('asset_code') ?? 'USDC';
                const account = params.get('account') ?? '';
                const amount = params.get('amount') ?? '100.00';
                const txId = `sep24-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                const txRecord = {
                    id: txId,
                    kind: 'withdrawal',
                    status: 'incomplete',
                    status_eta: 300,
                    amount_in: amount,
                    amount_out: (Number(amount) * 1550).toFixed(2), // USDC to NGN mock rate
                    amount_fee: '1.00',
                    account,
                    started_at: new Date().toISOString(),
                };
                this.transactions.set(txId, txRecord);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    type: 'interactive_customer_info_needed',
                    url: `${this.baseUrl}/interactive?transaction_id=${txId}`,
                    id: txId,
                }));
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
                tx.status = 'pending_user_transfer_start';
                tx.withdraw_anchor_account = this.anchorKeypair.publicKey();
                tx.withdraw_memo = `lf-${txId.slice(-6)}`;
                tx.withdraw_memo_type = 'text';
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    status: 'success',
                    message: 'Bank details recorded. Ready for Stellar transfer.',
                    transaction: tx,
                }));
                return;
            }
            // 10. Webhook simulator helper: POST /api/trigger-webhook
            if (pathname === '/api/trigger-webhook' && req.method === 'POST') {
                const bodyText = await this.readBody(req);
                const payload = JSON.parse(bodyText);
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
                res.end(JSON.stringify({
                    webhookDelivered: true,
                    apiStatus: webhookRes.status,
                    signature,
                    payload: webhookPayload,
                }));
                return;
            }
            // 404 for unhandled routes
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Route ${pathname} not found` }));
        }
        catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                error: `Internal server error: ${err instanceof Error ? err.message : String(err)}`,
            }));
        }
    }
    signPayload(payloadString) {
        return node_crypto_1.default
            .createHmac('sha256', this.signingSecret)
            .update(payloadString)
            .digest('hex');
    }
    readBody(req) {
        return new Promise((resolve, reject) => {
            let data = '';
            req.on('data', (chunk) => {
                data += chunk.toString();
            });
            req.on('end', () => resolve(data));
            req.on('error', (err) => reject(err));
        });
    }
}
exports.MockAnchorServer = MockAnchorServer;
//# sourceMappingURL=server.js.map