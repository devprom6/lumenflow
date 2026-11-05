import { Injectable, Logger, NotImplementedException } from '@nestjs/common';
import type { KmsService } from './kms.interface';

/**
 * AWS KMS implementation stub.
 * To activate: set AWS_KMS_KEY_ID and AWS_REGION env vars,
 * then install @aws-sdk/client-kms and implement the methods below.
 *
 * Example installation:
 *   pnpm --filter api add @aws-sdk/client-kms
 */
@Injectable()
export class AwsKmsService implements KmsService {
  private readonly logger = new Logger(AwsKmsService.name);
  private readonly keyId: string;
  private readonly region: string;

  constructor() {
    const keyId = process.env['AWS_KMS_KEY_ID'];
    const region = process.env['AWS_REGION'];

    if (!keyId) {
      throw new Error('AWS_KMS_KEY_ID environment variable is required for AwsKmsService.');
    }
    if (!region) {
      throw new Error('AWS_REGION environment variable is required for AwsKmsService.');
    }

    this.keyId = keyId;
    this.region = region;

    this.logger.log(
      `AwsKmsService initialised — keyId=${this.keyId}, region=${this.region}`,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async sign(_keyId: string, _data: Buffer): Promise<Buffer> {
    throw new NotImplementedException(
      'Configure AWS_KMS_KEY_ID and install @aws-sdk/client-kms to enable AWS KMS',
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async verify(_keyId: string, _data: Buffer, _signature: Buffer): Promise<boolean> {
    throw new NotImplementedException(
      'Configure AWS_KMS_KEY_ID and install @aws-sdk/client-kms to enable AWS KMS',
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getPublicKey(_keyId: string): Promise<string> {
    throw new NotImplementedException(
      'Configure AWS_KMS_KEY_ID and install @aws-sdk/client-kms to enable AWS KMS',
    );
  }
}
