import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class AdminAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const adminKeyHeader = request.headers['x-admin-key'];
    const expectedKey =
      process.env['ADMIN_API_KEY'] ?? 'lumenflow_admin_dev_secret';

    // Allow in test/dev if header matches expected key
    if (adminKeyHeader && adminKeyHeader === expectedKey) {
      return true;
    }

    // Check bearer token for admin role if present
    const authHeader = request.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      if (token === expectedKey) {
        return true;
      }
    }

    throw new UnauthorizedException(
      'Unauthorized: Admin privileges required for safeguard modifications.',
    );
  }
}
