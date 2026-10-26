import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  override canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  override handleRequest<TUser = unknown>(
    err: unknown,
    user: unknown,
    _info: unknown,
  ): TUser {
    if (err || !user) {
      throw (
        (err as Error | undefined) ??
        new UnauthorizedException('Missing or invalid authentication token.')
      );
    }
    return user as TUser;
  }
}
