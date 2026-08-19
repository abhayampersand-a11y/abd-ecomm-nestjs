import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedAdmin } from './admin-auth.service';

/** `@CurrentAdmin() admin: AuthenticatedAdmin` — AdminJwtGuard ni pachhi j */
export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.user as AuthenticatedAdmin;
  },
);
