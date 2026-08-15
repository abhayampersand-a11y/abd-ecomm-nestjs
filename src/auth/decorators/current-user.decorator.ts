import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedCustomer } from '../strategies/jwt.strategy';

/**
 * `@CurrentUser() user: AuthenticatedCustomer`
 *
 * JwtAuthGuard ni pachhi j vaparvu — nahi to undefined aavse.
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedCustomer | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const user = request.user as AuthenticatedCustomer;
    return data ? user?.[data] : user;
  },
);
