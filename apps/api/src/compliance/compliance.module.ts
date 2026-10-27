import { Module } from '@nestjs/common';
import { MockComplianceHookService } from './mock-compliance-hook.service';
import { COMPLIANCE_HOOK } from './compliance.interface';

@Module({
  providers: [
    MockComplianceHookService,
    {
      provide: COMPLIANCE_HOOK,
      useExisting: MockComplianceHookService,
    },
  ],
  exports: [MockComplianceHookService, COMPLIANCE_HOOK],
})
export class ComplianceModule {}
