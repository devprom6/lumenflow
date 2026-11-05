import { Injectable, Logger, NotImplementedException } from '@nestjs/common';
import type { KmsService } from './kms.interface';

/**
 * AWS KMS stub. Set AWS_KMS_KEY_ID and AWS_REGION, then install
 * @aws-sdk/client-kms and implement the methods to activate.
 */
@Injectable()
export class AwsKmsService implements KmsService {
  private readonly logger = new Logger(AwsKmsService.name);
  private readonly keyId: string;
  private readonly region: string;

  constructor() {
    const keyId = process.env['AWS_KMS_KEY_ID'];
    const region = process.env['AWS_REGION'];

    if (!keyId) throw new Error('AWS_KMS_KEY_ID is required for AwsKmsService.');
    if (!region) throw new Error('AWS_REGION is required for AwsKmsService.');

    this.keyId = keyId;
    this.region = region;
    this.logger.log(`AwsKmsService — keyId=${this.keyId}, region=${this.region}`);
  }

  sign(_keyId: string, _data: Buffer): Promise<Buffer> {
    throw new NotImplementedException(
      'Install @aws-sdk/client-kms and implement AwsKmsService.sign()',
    );
  }

  verify(_keyId: string, _data: Buffer, _signature: Buffer): Promise<boolean> {
    throw new NotImplementedException(
      'Install @aws-sdk/client-kms and implement AwsKmsService.verify()',
    );
  }

  getPublicKey(_keyId: string): Promise<string> {
    throw new NotImplementedException(
      'Install @aws-sdk/client-kms and implement AwsKmsService.getPublicKey()',
    );
  }
}
