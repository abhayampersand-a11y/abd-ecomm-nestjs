import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedCustomer } from '../auth/strategies/jwt.strategy';
import { RegisterDeviceDto, UnregisterDeviceDto } from './dto/device-token.dto';
import { NotificationsService } from './notifications.service';

/**
 * Grahak ni baaju — fakt device token register/unregister.
 *
 * Notifications MOKALVA nu kaam ahiya nathi, e admin ni baaju chhe. Ek j
 * controller ma banne rakhso to ek din koi route par thi guard chhooti jashe
 * ane koi pan vyakti aakhi customer base ne push mokli shakse.
 */
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /**
   * POST /notifications/device-token
   * Body: { "platform": "ANDROID", "token": "fcm-token", "deviceId": "pixel-8" }
   *
   * App e aa dar launch e call karvi — FCM/APNs tokens jate badlaata rahe
   * chhe, ane juno token vaparso to notification kyaay nahi pahonche ane
   * koi error pan nahi aave.
   */
  @Post('device-token')
  @HttpCode(HttpStatus.OK)
  async register(
    @CurrentUser() user: AuthenticatedCustomer,
    @Body() dto: RegisterDeviceDto,
  ) {
    return this.notifications.registerDevice(user.id, dto);
  }

  /**
   * DELETE /notifications/device-token
   * Logout vakhte — nahi to e phone par juna user na notifications aavta rahese.
   */
  @Delete('device-token')
  @HttpCode(HttpStatus.OK)
  async unregister(
    @CurrentUser() user: AuthenticatedCustomer,
    @Body() dto: UnregisterDeviceDto,
  ) {
    return this.notifications.unregisterDevice(user.id, dto.token);
  }
}
