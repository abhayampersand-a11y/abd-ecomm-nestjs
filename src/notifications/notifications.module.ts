import { Logger, Module, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { ConsolePushSender } from './push/console-push.sender';
import { PUSH_SENDER } from './push/push-sender.interface';

/**
 * `AuthModule` no `otpSenderProvider` jevo j dhancho.
 *
 * FCM joiye tyare: `FcmPushSender` lakhvo (PushSender implement karto),
 * ahiya case ummerivo, ane `.env` ma PUSH_PROVIDER=fcm karvu. Baaki koi
 * file ne khabar pan nahi pade.
 */
const pushSenderProvider: Provider = {
  provide: PUSH_SENDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>) => {
    const provider = config.get('PUSH_PROVIDER', { infer: true });

    switch (provider) {
      case 'console':
        return new ConsolePushSender();
      case 'fcm':
        throw new Error(
          'PUSH_PROVIDER="fcm" is not implemented yet. ' +
            'Add that sender in src/notifications/push/ (implementing the PushSender interface).',
        );
      default:
        throw new Error(`Unknown PUSH_PROVIDER: ${provider}`);
    }
  },
};

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, pushSenderProvider, Logger],
  exports: [NotificationsService],
})
export class NotificationsModule {}
