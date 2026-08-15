import type { IdentifierType } from '@prisma/client';

export const OTP_SENDER = Symbol('OTP_SENDER');

export interface OtpMessage {
  type: IdentifierType;
  /** Normalized destination (E.164 phone athva lowercase email) */
  to: string;
  code: string;
  ttlSeconds: number;
}

/**
 * Aa interface j "provider swap" no seam chhe.
 *
 * Aaje: ConsoleOtpSender (log ma print — SMS cost zero, dev fast)
 * Kaale: Msg91OtpSender / TwilioOtpSender — fakt aa ek file add karvani,
 *        OtpService ma ek line pan badlavani nahi.
 */
export interface OtpSender {
  send(message: OtpMessage): Promise<void>;
}
