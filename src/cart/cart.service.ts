import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Cart, CartItem } from '@prisma/client';
import type { CartDto, CartItemDto } from '../common/dto/cart.dto';
import type { ProductDto, VariantDto } from '../common/dto/product.dto';
import { fromMinor, toMinor } from '../common/utils/money.util';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../products/products.service';

type CartWithItems = Cart & { items: CartItem[] };

/**
 * Cart aapdo potano chhe — Postgres ma.
 *
 * Kem Shopify no nahi: Shopify no cart Storefront API ni session par ubho
 * chhe. Aapno DB ma hoy to user app fari install kare ke bija phone par
 * login kare, cart tya no tya rahe chhe. Checkout vakhte j Shopify ne jaay chhe.
 *
 * ⚠️ Aa service PAISA NO FAISLO NATHI KARTI. Bhaav fakt dekhaadva mate
 * ganay chhe; shipping, tax ane discount Shopify checkout ganse.
 */
@Injectable()
export class CartService {
  private readonly logger = new Logger(CartService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
  ) {}

  async get(customerId: string): Promise<CartDto> {
    const cart = await this.prisma.cart.findUnique({
      where: { customerId },
      include: { items: { orderBy: { createdAt: 'asc' } } },
    });

    return this.toDto(cart);
  }

  async addItem(
    customerId: string,
    input: { productId: string; variantId: string; quantity: number },
  ): Promise<CartDto> {
    // Product ane variant kharekhar chhe ke nahi e ahiya j nakki thay chhe.
    // Aa check vagar app koi pan variantId mokli shake ane cart ma bhoot
    // line bani jaay, je checkout vakhte j fail thaay — bahu mODu.
    const { product, variant } = await this.resolveVariant(
      input.productId,
      input.variantId,
    );

    const cart = await this.ensureCart(customerId);

    // E j variant fari aavyu to navi line nahi — quantity vadhe chhe.
    // (Aa `@@unique([cartId, variantId])` par aadhaar raakhe chhe.)
    await this.prisma.cartItem.upsert({
      where: { cartId_variantId: { cartId: cart.id, variantId: variant.id } },
      create: {
        cartId: cart.id,
        variantId: variant.id,
        productHandle: product.id,
        quantity: input.quantity,
        title: product.title,
        variantTitle: variant.title,
        imageUrl: this.imageFor(product, variant),
        priceAmount: variant.price.amount,
        priceCurrency: variant.price.currencyCode,
      },
      update: { quantity: { increment: input.quantity } },
    });

    return this.get(customerId);
  }

  async updateItem(
    customerId: string,
    itemId: string,
    quantity: number,
  ): Promise<CartDto> {
    // `deleteMany`/`updateMany` + customerId jaan-bujhi ne: bija na cart ni
    // line no id aapo to 0 rows badlaay chhe, ane 404 male chhe. Sidhu
    // `update({ where: { id } })` karso to koi pan bija ni line badali shake.
    const { count } = await this.prisma.cartItem.updateMany({
      where: { id: itemId, cart: { customerId } },
      data: { quantity },
    });

    if (count === 0) {
      throw new NotFoundException('Cart item not found');
    }

    return this.get(customerId);
  }

  async removeItem(customerId: string, itemId: string): Promise<CartDto> {
    const { count } = await this.prisma.cartItem.deleteMany({
      where: { id: itemId, cart: { customerId } },
    });

    if (count === 0) {
      throw new NotFoundException('Cart item not found');
    }

    return this.get(customerId);
  }

  async clear(customerId: string): Promise<CartDto> {
    await this.prisma.cartItem.deleteMany({ where: { cart: { customerId } } });
    return this.get(customerId);
  }

  /**
   * Voucher fakt SAACHVIYE chhiye — valid chhe ke nahi e nathi joata.
   *
   * ⚠️ Aapne jate discount ganvani lalach na raakhvi. Shopify na discount
   * niyamo (min amount, aa collection j, ek j vaar, tarikh) ahiya fari
   * lakhso to ek din e Shopify sathe mel nahi khaay — ane app ek rakam
   * batavse jyare grahak biji rakam bhare. Checkout j nakki karshe.
   */
  async applyDiscount(customerId: string, code: string): Promise<CartDto> {
    const cart = await this.ensureCart(customerId);

    await this.prisma.cart.update({
      where: { id: cart.id },
      data: { discountCode: code.trim().toUpperCase() },
    });

    return this.get(customerId);
  }

  async removeDiscount(customerId: string): Promise<CartDto> {
    await this.prisma.cart.updateMany({
      where: { customerId },
      data: { discountCode: null },
    });

    return this.get(customerId);
  }

  // -------------------------------------------------------------------------

  private async ensureCart(customerId: string): Promise<Cart> {
    return this.prisma.cart.upsert({
      where: { customerId },
      create: { customerId },
      update: {},
    });
  }

  private async resolveVariant(
    productId: string,
    variantId: string,
  ): Promise<{ product: ProductDto; variant: VariantDto }> {
    // ProductsService Redis-cached chhe, etle aa saamanya rite DB/network
    // sudhi jatu j nathi.
    const product = await this.products.findOne(productId);

    const variant = product.variants.find((v) => v.id === variantId);
    if (!variant) {
      throw new NotFoundException('This option is no longer available');
    }

    if (!variant.inStock) {
      // ⚠️ Aa chhelli khaatri NATHI. Aapdo stock data thoduk juno hoi shake
      // chhe; kharekhar no faislo Shopify checkout j kare chhe. Aa fakt
      // grahak ne vehela kahi de chhe, checkout sudhi pahonchya pehla.
      throw new BadRequestException('This option is out of stock');
    }

    return { product, variant };
  }

  private imageFor(product: ProductDto, variant: VariantDto): string | null {
    // Variant no potano photo hoy to e, nahi to product no pehlo.
    // (VariantDto ma atyare image nathi — Phase 2 ma aave to ahiya j jodashe.)
    return product.image?.url ?? product.images[0]?.url ?? null;
  }

  private toDto(cart: CartWithItems | null): CartDto {
    const items = cart?.items ?? [];

    const itemDtos: CartItemDto[] = items.map((i) => {
      const unit = toMinor(i.priceAmount, i.priceCurrency);
      const line = unit * i.quantity;

      return {
        id: i.id,
        productId: i.productHandle,
        variantId: i.variantId,
        title: i.title,
        variantTitle: i.variantTitle,
        image: i.imageUrl
          ? { url: i.imageUrl, alt: null, width: null, height: null }
          : null,
        quantity: i.quantity,
        unitPrice: {
          amount: fromMinor(unit, i.priceCurrency),
          currencyCode: i.priceCurrency,
        },
        lineTotal: {
          amount: fromMinor(line, i.priceCurrency),
          currencyCode: i.priceCurrency,
        },
      };
    });

    // Khali cart mate pan currency joiye chhe (app "₹0" batave chhe), etle
    // pehli line ni currency laiye chhiye — na hoy to store ni default.
    const currency = items[0]?.priceCurrency ?? 'INR';

    const subtotalMinor = items.reduce(
      (sum, i) => sum + toMinor(i.priceAmount, i.priceCurrency) * i.quantity,
      0,
    );

    return {
      items: itemDtos,
      itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
      subtotal: {
        amount: fromMinor(subtotalMinor, currency),
        currencyCode: currency,
      },
      discountCode: cart?.discountCode ?? null,
    };
  }
}
