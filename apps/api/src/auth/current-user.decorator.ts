import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthUserDto } from './dtos/auth.dto';

interface RequestWithUser {
  user?: AuthUserDto;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUserDto | undefined => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    return request.user;
  },
);
