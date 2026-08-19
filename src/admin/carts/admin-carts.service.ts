import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { fromMinor, toMinor } from '../../common/utils/money.util';
import { PrismaService } from '../../prisma/prisma.service';
import { fullName } from '../dto/admin-customer.dto';
import type { ListCartsDto } from '../dto/list-carts.dto';
import {
  toAdminPage,
  toSkipTake,
  type AdminPageDto,
} from '../dto/pagination.dto';

type CartItemRow = {
  id: string;
  productHandle: string;
  variantId: string;
  title: string;
  variantTitle: string | null;
  imageUrl: string | null;
  quantity: number;
  priceAmount: string;
  priceCurrency: string;
};

/**
 * Chalu ane chhodi delaa carts.
 *
 * ⚠️ AA AAKHI FILE MA JE PAN RAKAM CHHE E "ANDAAJ" CHHE.
 *
 * Cart lines ma add karti vakhte no bhaav saachvelo chhe (juo schema no
 * comment). Bhaav pachhi badlaayo hoy, discount lagvano hoy, shipping ane
 * tax to haju ganya j nathi — asli rakam Shopify checkout j nakki kare chhe.
 * Etle panel ma aa ne "estimated cart value" j lakhvu, "revenue" kyarey nahi.
 */
@Injectable()
export class AdminCartsService {
  /** Recovery mate default: 24 kalak thi shant padelu cart */
  static readonly ABANDONED_AFTER_HOURS = 24;

  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListCartsDto): Promise<AdminPageDto<unknown>> {
    const where = this.buildWhere(query);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.cart.findMany({
        where,
        orderBy: this.buildOrderBy(query.sort),
        ...toSkipTake(query),
        include: {
          items: true,
          customer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              primaryPhone: true,
              primaryEmail: true,
              status: true,
            },
          },
        },
      }),
      this.prisma.cart.count({ where }),
    ]);

    const items = rows.map((cart) => ({
      id: cart.id,
      customer: {
        id: cart.customer.id,
        name: fullName(cart.customer),
        phone: cart.customer.primaryPhone,
        email: cart.customer.primaryEmail,
        status: cart.customer.status,
      },
      itemCount: cart.items.reduce((sum, i) => sum + i.quantity, 0),
      lineCount: cart.items.length,
      estimatedValue: this.estimateValue(cart.items),
      discountCode: cart.discountCode,
      idleHours: this.idleHours(cart.updatedAt),
      updatedAt: cart.updatedAt.toISOString(),
      createdAt: cart.createdAt.toISOString(),
    }));

    return toAdminPage(items, total, query);
  }

  /**
   * Chhodi delaa carts — recovery campaign ni list.
   *
   * ⚠️ Ahiya e carts pan aavse jemna maalik e order kari j lidho hoy. Orders
   * aapda DB ma nathi (Shopify ma chhe), etle "aa vyakti e kharidi lidhu chhe"
   * e ahiya thi khabar padvani rit j nathi. List par thi koi ne message
   * mokalta pehla enu order history joi levu — `/admin/customers/:id/orders`.
   */
  async abandoned(query: ListCartsDto) {
    return this.list({
      ...query,
      idleHours: query.idleHours ?? AdminCartsService.ABANDONED_AFTER_HOURS,
    });
  }

  async findOne(id: string) {
    const cart = await this.prisma.cart.findUnique({
      where: { id },
      include: {
        items: { orderBy: { createdAt: 'asc' } },
        customer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            primaryPhone: true,
            primaryEmail: true,
            status: true,
          },
        },
      },
    });

    if (!cart) {
      throw new NotFoundException('Cart not found');
    }

    return {
      id: cart.id,
      customer: {
        id: cart.customer.id,
        name: fullName(cart.customer),
        phone: cart.customer.primaryPhone,
        email: cart.customer.primaryEmail,
        status: cart.customer.status,
      },
      items: cart.items.map((i) => ({
        id: i.id,
        productHandle: i.productHandle,
        variantId: i.variantId,
        title: i.title,
        variantTitle: i.variantTitle,
        imageUrl: i.imageUrl,
        quantity: i.quantity,
        /** ⚠️ Add karti vakhte no bhaav — atyaar no nahi */
        unitPrice: {
          amount: i.priceAmount,
          currencyCode: i.priceCurrency,
        },
        addedAt: i.createdAt.toISOString(),
      })),
      itemCount: cart.items.reduce((sum, i) => sum + i.quantity, 0),
      estimatedValue: this.estimateValue(cart.items),
      discountCode: cart.discountCode,
      idleHours: this.idleHours(cart.updatedAt),
      updatedAt: cart.updatedAt.toISOString(),
      createdAt: cart.createdAt.toISOString(),
    };
  }

  // ---------------------------------------------------------------------------

  private buildWhere(query: ListCartsDto): Prisma.CartWhereInput {
    // Khaali cart panel ma batavvano koi matlab nathi — e to fakt ek row chhe
    const where: Prisma.CartWhereInput = { items: { some: {} } };

    if (query.idleHours) {
      where.updatedAt = {
        lt: new Date(Date.now() - query.idleHours * 60 * 60 * 1000),
      };
    }

    const search = query.search?.trim();
    if (search) {
      where.customer = {
        OR: [
          { primaryPhone: { contains: search } },
          { primaryEmail: { contains: search, mode: 'insensitive' } },
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    return where;
  }

  private buildOrderBy(sort: ListCartsDto['sort']): Prisma.CartOrderByWithRelationInput {
    switch (sort) {
      case 'oldest':
        return { updatedAt: 'asc' };
      case 'items':
        return { items: { _count: 'desc' } };
      case 'updated':
      default:
        return { updatedAt: 'desc' };
    }
  }

  /**
   * Paisa integer minor units ma ganiye chhiye — float ma 20 lines no
   * saravalo karo etle bhool dekhaava mande chhe (juo money.util).
   */
  private estimateValue(items: CartItemRow[]) {
    if (items.length === 0) return null;

    const currency = items[0].priceCurrency;
    const minor = items.reduce(
      (sum, i) => sum + toMinor(i.priceAmount, i.priceCurrency) * i.quantity,
      0,
    );

    return { amount: fromMinor(minor, currency), currencyCode: currency };
  }

  private idleHours(updatedAt: Date): number {
    return Math.floor((Date.now() - updatedAt.getTime()) / (60 * 60 * 1000));
  }
}
