import { forwardRef, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AddressesController } from './addresses.controller';
import { AddressesService } from './addresses.service';

/**
 * ⚠️ AuthModule sathe circular chhe — juo `AuthService` no constructor.
 * Banne baaju `forwardRef` hovu jaruri chhe.
 */
@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [AddressesController],
  providers: [AddressesService],
  exports: [AddressesService],
})
export class AddressesModule {}
