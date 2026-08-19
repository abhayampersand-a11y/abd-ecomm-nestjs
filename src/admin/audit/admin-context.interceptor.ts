import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import { getClientIp } from '../../common/utils/request.util';
import type { AuthenticatedAdmin } from '../auth/admin-auth.service';
import { adminContext } from './admin-context';

/**
 * Admin ni request ne AsyncLocalStorage ma vinti de chhe, jethi ander gme te
 * jagya e thi audit ma actor ane IP lakhaay.
 *
 * Global chhe (APP_INTERCEPTOR), pan kaam fakt `/admin` par j kare chhe —
 * baaki badhi requests ne ek `startsWith` thi vadhare kai kharcho nathi.
 * Guards interceptors pehla chale chhe, etle ahiya `req.user` bharelo hoy chhe.
 */
@Injectable()
export class AdminContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest<Request>();

    if (!req.path?.includes('/admin/')) return next.handle();

    const admin = req.user as AuthenticatedAdmin | undefined;

    return adminContext.run(
      { actor: admin?.email ?? 'anonymous', ip: getClientIp(req) },
      () => next.handle(),
    );
  }
}
