import { Injectable, Logger } from '@nestjs/common';
import { maskEmail, maskPhone } from '../../common/utils/identifier.util';
import type { OtpMessage, OtpSender } from './otp-sender.interface';

/**
 * Dev stub — OTP terminal ma print kare chhe.
 * Aa thi aakhi app SMS gateway vagar develop ane test thai shake chhe.
 *
 * Production ma vaparva mate NATHI (AppModule provider selection dev ma j
 * aa vapre chhe; OTP_PROVIDER=msg91 karo etle real sender aavi jashe).
 */
@Injectable()
export class ConsoleOtpSender implements OtpSender {
  private readonly logger = new Logger('OTP');

  async send({ type, to, code, ttlSeconds }: OtpMessage): Promise<void> {
    const masked = type === 'EMAIL' ? maskEmail(to) : maskPhone(to);

    this.logger.log(
      `\n` +
        `  ┌─────────────────────────────────────────────┐\n` +
        `  │  OTP (dev)                                  │\n` +
        `  │  To   : ${to.padEnd(35)}│\n` +
        `  │  Code : ${code.padEnd(35)}│\n` +
        `  │  Valid: ${`${ttlSeconds}s`.padEnd(35)}│\n` +
        `  └─────────────────────────────────────────────┘\n` +
        `  (masked form je logs ma jaay: ${masked})`,
    );
  }
}
