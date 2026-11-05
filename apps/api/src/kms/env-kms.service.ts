import { Injectable, Logger } from '@nestjs/common';
import { Keypair, StrKey } from '@stellar/stellar-sdk';
import * as crypto from 'node:crypto';
import type { KmsService } from './kms.interface';

/**
 * Environment-based KMS implementation for development and staging.
 * Loads the Ed25519 keypair from the SEP10_SERVER_SECRET environment variable.
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
      // Deterministic dev fallback — never carries real value
      const seed = crypto
        .createHash('sha256')
        .update('lumenflow-testnet-sep10-server-key')
        .digest();
      this.keypair = Keypair.fromRawEd25519Seed(seed);
      this.logger.warn(
        'EnvKmsService: SEP10_SERVER_SECRET not set — using deterministic dev fallback key. ' +
          'Set SEP10_SERVER_SECRET in production.',
      );
    }
  }

  /**
   * Signs the provided data buffer with the Ed25519 keypair.
   * keyId is accepted for interface compatibility but only one key is managed here.
   */
  async sign(keyId: string, data: Buffer): Promise<Buffer> {
    this.logger.debug(`sign() called for keyId=${keyId}`);
    const signature = this.keypair.sign(data);
    return Buffer.from(signature);
  }

  /**
   * Verifies an Ed25519 signature against the provided data.
   */
  async verify(
    keyId: string,
    data: Buffer,
    signature: Buffer,
  ): Promise<boolean> {
    this.logger.debug(`verify() called for keyId=${keyId}`);
    try {
      return this.keypair.verify(data, signature);
    } catch {
      return false;
    }
  }

  /**
   * Returns the Stellar public key (G... address) for the managed keypair.
   */
  async getPublicKey(keyId: string): Promise<string> {
    this.logger.debug(`getPublicKey() called for keyId=${keyId}`);
    return this.keypair.publicKey();
  }
}
