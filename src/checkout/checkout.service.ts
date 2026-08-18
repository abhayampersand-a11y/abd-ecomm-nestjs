import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ShopifyCheckoutError,
  ShopifyCheckoutService,
} from '../shopify/shopify-checkout.service';

export interface CheckoutStartedDto {
  /**
   * Aa URL app e **Checkout Sheet Kit** ma kholvu — browser ma nahi.
   * Sheet band thay tyare eno callback j "order thayo ke nahi" kahe chhe.
   */
  checkoutUrl: string;
  /** Debug/support mate — grahak ne na batavvu */
  cartToken: string;
  itemCount: number;
}

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shopifyCheckout: ShopifyCheckoutService,
  ) {}

  async start(customerId: string): Promise<CheckoutStartedDto> {
    const cart = await this.prisma.cart.findUnique({
      where: { customerId },
      include: { items: true },
    });

    if (!cart || cart.items.length === 0) {
      throw new BadRequestException('Your cart is empty');
    }

    const buyer = await this.buyerIdentity(customerId);

    try {
      const shopifyCart = await this.shopifyCheckout.createCart({
        lines: cart.items.map((i) => ({
          variantId: i.variantId,
          quantity: i.quantity,
        })),
        buyer,
        discountCode: cart.discountCode,
      });

      this.logger.log(
        `Checkout shuru — customer=${customerId} lines=${cart.items.length} ` +
          `buyer=${buyer.email ? 'email' : buyer.phone ? 'phone' : 'NONE'}`,
      );

      return {
        checkoutUrl: shopifyCart.checkoutUrl,
        cartToken: shopifyCart.id,
        itemCount: shopifyCart.totalQuantity,
      };
    } catch (err) {
      if (err instanceof ShopifyCheckoutError) {
        // Shopify e j kaaran aapyu chhe (out of stock, invalid variant) —
        // e grahak ne kaam nu chhe, etle jem chhe tem aage aapiye chhiye.
        throw new BadRequestException(err.message);
      }

      this.logger.error(
        `Checkout fail — customer=${customerId}: ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException(
        'Checkout is unavailable right now. Please try again.',
      );
    }
  }

  // -------------------------------------------------------------------------

  /**
   * Order kona naam e chadse e AHIYA nakki thay chhe.
   *
   * ⚠️ Email pehla, phone pachhi — jaan-bujhi ne. Shopify order ne customer
   * sathe jodva mate email par sauthi vadhu bharoso kare chhe.
   *
   * ⚠️ FAKT VERIFIED value j moklvi. `contactEmail` (registration screen ma
   * type karelo, un-verified) ahiya kyarey na aave — nahi to grahak bija no
   * email type kare ane eno order bija na account ma chadi jaay.
   *
   * Jo grahak pase fakt phone hoy ane Shopify ma e phone vaalo record na hoy,
   * to Shopify navo customer banaavse. E vaandho nahi — grahak jyare potano
   * email verify karse tyare `reconcileAfterEmailVerified()` e be records
   * jodi daise. E machinery pehla thi chhe.
   */
  private async buyerIdentity(
    customerId: string,
  ): Promise<{ email?: string | null; phone?: string | null }> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { primaryEmail: true, primaryPhone: true },
    });

    return {
      email: customer?.primaryEmail ?? null,
      phone: customer?.primaryPhone ?? null,
    };
  }
}
