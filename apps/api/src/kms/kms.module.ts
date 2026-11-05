import { Module } from '@nestjs/common';
import { KMS_SERVICE } from './kms.interface';
import { EnvKmsService } from './env-kms.service';
import { AwsKmsService } from './aws-kms.service';

/**
 * KmsModule selects the KMS implementation at startup based on env vars:
 *  - AWS_KMS_KEY_ID set → AwsKmsService (production / AWS-hosted)
 *  - Otherwise         → EnvKmsService  (dev / staging, reads SEP10_SERVER_SECRET)
 *
 * Only the selected implementation is instantiated, so the other one never
 * throws about missing environment variables during startup.
 */
@Module({
  providers: [
    {
      provide: KMS_SERVICE,
      useFactory: () => {
        if (process.env['AWS_KMS_KEY_ID']) {
          return new AwsKmsService();
        }
        return new EnvKmsService();
      },
    },
  ],
  exports: [KMS_SERVICE],
})
export class KmsModule {}
