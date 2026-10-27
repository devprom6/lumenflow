import { Keypair } from '@stellar/stellar-sdk';
export interface MockAnchorOptions {
    port?: number;
    host?: string;
    signingSecret?: string;
    apiUrl?: string;
}
export interface MockSep24Tx {
    id: string;
    kind: string;
    status: string;
    status_eta?: number;
    amount_in?: string;
    amount_out?: string;
    amount_fee?: string;
    withdraw_anchor_account?: string;
    withdraw_memo?: string;
    withdraw_memo_type?: string;
    account?: string;
    started_at: string;
    completed_at?: string;
}
export declare class MockAnchorServer {
    private server;
    readonly anchorKeypair: Keypair;
    readonly port: number;
    readonly host: string;
    readonly signingSecret: string;
    readonly apiUrl: string;
    private readonly transactions;
    private readonly customers;
    constructor(options?: MockAnchorOptions);
    get baseUrl(): string;
    start(): Promise<void>;
    stop(): Promise<void>;
    private handleRequest;
    signPayload(payloadString: string): string;
    private readBody;
}
//# sourceMappingURL=server.d.ts.map