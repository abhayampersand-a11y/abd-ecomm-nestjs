import { Logger } from '@nestjs/common';
import type { PushMessage, PushResult, PushSender } from './push-sender.interface';

/**
 * Development no sender — terminal ma print kare chhe, kyaay mokalto nathi.
 *
 * `ConsoleOtpSender` jevo j hetu: Firebase project ane real device vagar pan
 * aakho campaign flow (targeting, batching, counts) test thai shake.
 */
export class ConsolePushSender implements PushSender {
  private readonly logger = new Logger('ConsolePushSender');

  async send(messages: PushMessage[]): Promise<PushResult[]> {
    for (const m of messages) {
      this.logger.log(
        `PUSH → ${m.platform} ${maskToken(m.token)} | ${m.title} — ${m.body}` +
          (m.deepLink ? ` | link: ${m.deepLink}` : ''),
      );
    }

    return messages.map((m) => ({ token: m.token, ok: true }));
  }
}

/** Token log ma kyarey aakho na jaay — enathi bija na device par push moklai shake */
export function maskToken(token: string): string {
  return token.length <= 12 ? '***' : `***${token.slice(-8)}`;
}
