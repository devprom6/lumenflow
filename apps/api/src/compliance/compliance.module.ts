import { Module } from '@nestjs/common';
import { MockComplianceHookService } from './mock-compliance-hook.service';
import { HttpComplianceService } from './http-compliance.service';
import { COMPLIANCE_HOOK } from './compliance.interface';

/**
 * ComplianceModule selects the active compliance implementation at startup:
 *  - COMPLIANCE_API_URL set → HttpComplianceService (real sanctions/PEP screening)
 *  - Otherwise              → MockComplianceHookService (dev / test mode)
 *
 * Only the selected implementation is instantiated, so the other one never
 * throws about missing environment variables during startup.
 */
@Module({
  providers: [
    {
      provide: COMPLIANCE_HOOK,
      useFactory: () => {
        if (process.env['COMPLIANCE_API_URL']) {
          return new HttpComplianceService();
        }
        return new MockComplianceHookService();
      },
    },
  ],
  exports: [COMPLIANCE_HOOK],
})
export class ComplianceModule {}
