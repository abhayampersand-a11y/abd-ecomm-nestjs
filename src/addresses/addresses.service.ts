import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { IdentityService } from '../auth/identity.service';
import { normalizeIdentifier } from '../common/utils/identifier.util';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';
import { PrismaService } from '../prisma/prisma.service';
import { ShopifyCustomerService } from '../shopify/shopify-customer.service';
import {
  addressFingerprint,
  fromShopifyAddress,
  toAddressDto,
  type AddressDto,
  type AddressInput,
} from './address.mapper';
import type { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';

export interface ImportResult {
  imported: number;
  /** Ketla addresses juya (duplicates sathe) */
  found: number;
  /**
   * `read_all_orders` scope vagar fakt 60 divas na orders male chhe.
   * App aa flag joi ne user ne samjaavi shake ke kem kai na malyu.
   */
  limitedToRecentOrders: boolean;
}

@Injectable()
export class AddressesService {
  private readonly logger = new Logger(AddressesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shopifyCustomers: ShopifyCustomerService,
    private readonly identity: IdentityService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async list(customerId: string): Promise<AddressDto[]> {
    const addresses = await this.prisma.address.findMany({
      where: { customerId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    return addresses.map(toAddressDto);
  }

  async create(customerId: string, dto: CreateAddressDto): Promise<AddressDto> {
    const fingerprint = addressFingerprint(dto);

    // Same address fari ummerto hoy to navo na banaavo — ene j update karo.
    const address = await this.prisma.address.upsert({
      where: { customerId_fingerprint: { customerId, fingerprint } },
      create: { ...this.toRow(dto), customerId, fingerprint },
      update: this.toRow(dto),
    });

    if (dto.isDefault) {
      await this.setDefault(customerId, address.id);
      return toAddressDto({ ...address, isDefault: true });
    }

    // Pehlo address hoy to apne-aap default — user ne ek vadhu tap na karvo pade
    const count = await this.prisma.address.count({ where: { customerId } });
    if (count === 1) {
      await this.setDefault(customerId, address.id);
      return toAddressDto({ ...address, isDefault: true });
    }

    return toAddressDto(address);
  }

  async update(
    customerId: string,
    id: string,
    dto: UpdateAddressDto,
  ): Promise<AddressDto> {
    const existing = await this.mustOwn(customerId, id);

    const merged: AddressInput = {
      firstName: dto.firstName ?? existing.firstName,
      lastName: dto.lastName ?? existing.lastName,
      phone: dto.phone ?? existing.phone,
      line1: dto.line1 ?? existing.line1,
      line2: dto.line2 ?? existing.line2,
      city: dto.city ?? existing.city,
      province: dto.province ?? existing.province,
      provinceCode: dto.provinceCode ?? existing.provinceCode,
      zip: dto.zip ?? existing.zip,
      country: dto.country ?? existing.country,
      countryCode: dto.countryCode ?? existing.countryCode,
    };

    const updated = await this.prisma.address.update({
      where: { id },
      data: { ...this.toRow(merged), fingerprint: addressFingerprint(merged) },
    });

    if (dto.isDefault) {
      await this.setDefault(customerId, id);
      return toAddressDto({ ...updated, isDefault: true });
    }

    return toAddressDto(updated);
  }

  async remove(customerId: string, id: string): Promise<{ success: true }> {
    const existing = await this.mustOwn(customerId, id);
    await this.prisma.address.delete({ where: { id } });

    // Default kaadhi naakhyo — bijo koi ek ne default banaavo, nahi to
    // checkout par "koi address selected nathi" evi halat thay.
    if (existing.isDefault) {
      const next = await this.prisma.address.findFirst({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
      });
      if (next) await this.setDefault(customerId, next.id);
    }

    return { success: true };
  }

  async setDefault(customerId: string, id: string): Promise<{ success: true }> {
    await this.mustOwn(customerId, id);

    // Ek j transaction ma — vachche crash thay to be default ke ek pan
    // default nahi evi halat na thay.
    await this.prisma.$transaction([
      this.prisma.address.updateMany({
        where: { customerId, isDefault: true },
        data: { isDefault: false },
      }),
      this.prisma.address.update({ where: { id }, data: { isDefault: true } }),
    ]);

    return { success: true };
  }

  /**
   * "Fetch my shipping addresses based on past order" — aa e checkbox nu kaam.
   *
   * ⚠️ FAKT verified identifiers vaparaay chhe. Un-verified email par
   * chalavso to bija na ghar na address aa user ne mali jashe.
   */
  async importFromPastOrders(customerId: string): Promise<ImportResult> {
    const identities = await this.prisma.customerIdentity.findMany({
      where: { customerId },
      select: { type: true, value: true },
    });

    const country = this.config.get('DEFAULT_COUNTRY_CODE', { infer: true });

    // Links pehla thi na hoy (daa.t. user e pachhi thi email verify karyo)
    // to ahiya bhari daiye.
    for (const identity of identities) {
      await this.identity.linkShopifyRecords(
        customerId,
        normalizeIdentifier(identity.value, country),
      );
    }

    const links = await this.prisma.shopifyCustomerLink.findMany({
      where: { customerId },
      select: { shopifyCustomerId: true },
    });

    if (links.length === 0) {
      return { imported: 0, found: 0, limitedToRecentOrders: true };
    }

    const orders = await this.shopifyCustomers.findOrderAddresses(
      links.map((l) => l.shopifyCustomerId),
    );

    // Fingerprint thi dedupe — ek j address 15 orders ma hoy to ek j vaar
    const byFingerprint = new Map<
      string,
      { input: AddressInput; orderName: string }
    >();

    for (const order of orders) {
      const input = fromShopifyAddress(order.shippingAddress);
      if (!input) continue;

      const fp = addressFingerprint(input);
      // Sauthi navo order pehla aave chhe (sortKey CREATED_AT reverse),
      // etle pehli entry j sauthi taaji chhe — ene rakhiye.
      if (!byFingerprint.has(fp)) {
        byFingerprint.set(fp, { input, orderName: order.name });
      }
    }

    const { count } = await this.prisma.address.createMany({
      data: [...byFingerprint.entries()].map(([fingerprint, v]) => ({
        ...this.toRow(v.input),
        customerId,
        fingerprint,
        importedFromOrder: v.orderName,
      })),
      // User e pehla thi ummerelo hoy to ene na chhedo
      skipDuplicates: true,
    });

    // Ek pan default na hoy to sauthi taajo default banaavo
    const hasDefault = await this.prisma.address.findFirst({
      where: { customerId, isDefault: true },
      select: { id: true },
    });
    if (!hasDefault) {
      const newest = await this.prisma.address.findFirst({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
      });
      if (newest) await this.setDefault(customerId, newest.id);
    }

    this.logger.log(
      `Address import for customer ${customerId}: ` +
        `${orders.length} order(s) → ${byFingerprint.size} unique → ${count} new`,
    );

    return {
      imported: count,
      found: byFingerprint.size,
      limitedToRecentOrders: true,
    };
  }

  // -------------------------------------------------------------------------

  private async mustOwn(customerId: string, id: string) {
    const address = await this.prisma.address.findFirst({
      where: { id, customerId },
    });

    // "Bija no address chhe" ane "chhe j nahi" — banne mate 404.
    // Nahi to id try kari ne khabar padi jaay ke kayo address exist kare chhe.
    if (!address) throw new NotFoundException('Address not found');
    return address;
  }

  private toRow(input: AddressInput) {
    return {
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
      phone: input.phone ?? null,
      line1: input.line1,
      line2: input.line2 ?? null,
      city: input.city,
      province: input.province ?? null,
      provinceCode: input.provinceCode ?? null,
      zip: input.zip,
      country: input.country,
      countryCode: input.countryCode ?? null,
    };
  }
}
