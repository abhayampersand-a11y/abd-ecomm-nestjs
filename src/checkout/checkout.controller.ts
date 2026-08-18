import { Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedCustomer } from '../auth/strategies/jwt.strategy';
import { CheckoutService } from './checkout.service';

@Controller('checkout')
@UseGuards(JwtAuthGuard)
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  /**
   * POST /checkout — screens 11/14 no "PAY"
   *
   * Aapdo cart Shopify ne aapi ne `checkoutUrl` pacho aape chhe. App e URL
   * **Checkout Sheet Kit** ma kholе — browser ma nahi, nahi to grahak app ni
   * bahar nikli jaay chhe ane pacho nathi aavto.
   *
   * Order banya pachhi shu? Sheet no completion callback j signal chhe.
   * Server-side pakku signal `orders/create` webhook thi aavse — e webhooks
   * na kaam sathe aavse.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async start(@CurrentUser() user: AuthenticatedCustomer) {
    return this.checkout.start(user.id);
  }
}
