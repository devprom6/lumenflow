import { Injectable, Logger } from '@nestjs/common';
import { Keypair, StrKey } from '@stellar/stellar-sdk';
import * as crypto from 'node:crypto';
import type { KmsService } from './kms.interface';

/**
 * Environment-based KMS for development and staging.
 * Loads the Ed25519 keypair from SEP10_SERVER_SECRET env var.
 * DO NOT use in production — use AwsKmsService or another HSM-backed implementation.
 */
@Injectable()
export class EnvKmsService implements KmsService {
  private readonly logger = new Logger(EnvKmsService.name);
  private readonly keypair: Keypair;

  constructor() {
    const secret = process.env['SEP10_SERVER_SECRET'];

    if (secret && StrKey.isValidEd25519SecretSeed(secret)) {
      this.keypair = Keypair.fromSecret(secret);
      this.logger.log('EnvKmsService: loaded keypair from SEP10_SERVER_SECRET');
    } else {
      if (process.env['NODE_ENV'] === 'production') {
        throw new Error(
          'SEP10_SERVER_SECRET must be set to a valid Ed25519 seed in production.',
        );
      }
      const seed = crypto
        .createHash('sha256')
        .update('lumenflow-testnet-sep10-server-key')
        .digest();
      this.keypair = Keypair.fromRawEd25519Seed(seed);
      this.logger.warn(
        'EnvKmsService: SEP10_SERVER_SECRET not set — using deterministic dev fallback.',
      );
    }
  }

  // Interface requires Promise return types so callers can use await uniformly,
  // but the underlying crypto is synchronous. Using Promise.resolve avoids
  // @typescript-eslint/require-await while keeping the interface contract.

  sign(_keyId: string, data: Buffer): Promise<Buffer> {
    return Promise.resolve(Buffer.from(this.keypair.sign(data)));
  }

  verify(_keyId: string, data: Buffer, signature: Buffer): Promise<boolean> {
    try {
      return Promise.resolve(this.keypair.verify(data, signature));
    } catch {
      return Promise.resolve(false);
    }
  }

  getPublicKey(_keyId: string): Promise<string> {
    return Promise.resolve(this.keypair.publicKey());
  }
}
