import type { Request } from 'express';
import type { SessionContext } from '../../auth/token.service';

/**
 * Client no asli IP. `app.set('trust proxy', ...)` main.ts ma set karyu chhe,
 * etle nginx/ALB pachhal pan `req.ip` saacho aave chhe.
 *
 * ⚠️ Production ma trust proxy no hop count barabar set karvo — vadhare
 * trust karso to attacker X-Forwarded-For spoof kari ne IP rate limit
 * bypass kari shake chhe.
 */
export function getClientIp(req: Request): string | undefined {
  return req.ip ?? req.socket?.remoteAddress ?? undefined;
}

export function getSessionContext(
  req: Request,
  deviceId?: string,
): SessionContext {
  return {
    deviceId,
    userAgent: req.get('user-agent') ?? undefined,
    ip: getClientIp(req),
  };
}
