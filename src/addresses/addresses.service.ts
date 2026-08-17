import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Address } from '@prisma/client';
import { IdentityService } from '../auth/identity.service';
import { normalizeIdentifier } from '../common/utils/identifier.util';
import type { Env } from '../config/env.schema';
import { PrismaService } from '../prisma/prisma.service';
import { ShopifyAddressService } from '../shopify/shopify-address.service';
import { ShopifyCustomerService } from '../shopify/shopify-customer.service';
import {
  addressFingerprint,
  fromMailingAddress,
  fromShopifyAddress,
  toAddressDto,
  toMailingAddressInput,
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

export interface SyncResult {
  /** Shopify na customer address book mathi navā aavya */
  fromAddressBook: number;
  /** Juna orders na shipping addresses mathi navā aavya */
  fromPastOrders: number;
  /** Kul unique addresses juya (pehla thi hoy e sathe) */
  found: number;
  limitedToRecentOrders: boolean;
}

@Injectable()
export class AddressesService {
  private readonly logger = new Logger(AddressesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shopifyCustomers: ShopifyCustomerService,
    private readonly shopifyAddresses: ShopifyAddressService,
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

    // Pehlo address hoy to apne-aap default — user ne ek vadhu tap na karvo pade
    const count = await this.prisma.address.count({ where: { customerId } });
    const shouldBeDefault = Boolean(dto.isDefault) || count === 1;

    if (shouldBeDefault) {
      await this.markDefaultLocally(customerId, address.id);
    }

    // Shopify push CHHELLE — default nakki thaya pachhi, jethi ek j call ma
    // `setAsDefault` pan sathe jaay ane bijo round-trip na karvo pade.
    await this.pushToShopify(customerId, address, shouldBeDefault);

    return toAddressDto({ ...address, isDefault: shouldBeDefault });
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
      await this.markDefaultLocally(customerId, id);
    }

    await this.pushToShopify(customerId, updated, Boolean(dto.isDefault));

    return toAddressDto({
      ...updated,
      isDefault: dto.isDefault ? true : updated.isDefault,
    });
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

    // Shopify ma pan kaadho. Aa fail thay to pan local delete ubhu rahe chhe —
    // user e delete dabaavyu chhe, ene "fail" kehvu khotu chhe. Shopify ma
    // rahi gayelo address next sync e pacho aavi jashe, ane e j saacho
    // trade-off chhe: gum thavu e karta duplicate saaro.
    if (existing.shopifyAddressId) {
      const shopifyCustomerId = await this.shopifyCustomerIdFor(customerId);
      if (shopifyCustomerId) {
        await this.shopifyAddresses.deleteAddress(
          shopifyCustomerId,
          existing.shopifyAddressId,
        );
      }
    }

    return { success: true };
  }

  async setDefault(customerId: string, id: string): Promise<{ success: true }> {
    const address = await this.mustOwn(customerId, id);

    await this.markDefaultLocally(customerId, id);

    if (address.shopifyAddressId) {
      const shopifyCustomerId = await this.shopifyCustomerIdFor(customerId);
      if (shopifyCustomerId) {
        await this.shopifyAddresses.setDefaultAddress(
          shopifyCustomerId,
          address.shopifyAddressId,
        );
      }
    }

    return { success: true };
  }

  /**
   * Shopify parthi badhu khenchi lo — address book ANE juna orders, banne.
   *
   * Aa e endpoint chhe je user email verify kare tyare chalvu joiye: ena
   * juna Shopify records jodai gaya hoy chhe, ane have ena addresses ahiya
   * aave chhe.
   */
  async syncFromShopify(customerId: string): Promise<SyncResult> {
    const fromAddressBook = await this.importFromAddressBook(customerId);
    const orders = await this.importFromPastOrders(customerId);

    const total = await this.prisma.address.count({ where: { customerId } });

    return {
      fromAddressBook,
      fromPastOrders: orders.imported,
      found: total,
      limitedToRecentOrders: orders.limitedToRecentOrders,
    };
  }

  /**
   * Shopify na CUSTOMER ADDRESS BOOK mathi import.
   *
   * Aa `importFromPastOrders` thi alag chhe: tya fakt e addresses male chhe
   * jena par kharekhar order thayo hoy. Ahiya user e website par potana
   * account ma je save karyu hoy e badhu male chhe — bhale ene tya thi
   * kyarey order na karyo hoy.
   *
   * @returns ketla navā addresses ummerаya
   */
  async importFromAddressBook(customerId: string): Promise<number> {
    const shopifyCustomerIds = await this.linkedShopifyCustomerIds(customerId);
    if (shopifyCustomerIds.length === 0) return 0;

    let imported = 0;

    for (const shopifyCustomerId of shopifyCustomerIds) {
      const book = await this.shopifyAddresses.fetchAddressBook(shopifyCustomerId);

      for (const raw of book.addresses) {
        const parsed = fromMailingAddress(raw);
        if (!parsed) continue;

        const { shopifyAddressId, ...input } = parsed;
        const fingerprint = addressFingerprint(input);

        const existing = await this.prisma.address.findUnique({
          where: { customerId_fingerprint: { customerId, fingerprint } },
        });

        try {
          if (!existing) {
            await this.prisma.address.create({
              data: {
                ...this.toRow(input),
                customerId,
                fingerprint,
                shopifyAddressId,
                syncedAt: new Date(),
                isDefault: book.defaultAddressId === shopifyAddressId,
              },
            });
            imported += 1;
          } else if (!existing.shopifyAddressId) {
            // Aa address aapdi pase pehla thi hato (user e app ma ummeryo
            // hato, ke order mathi aavyo hato) pan Shopify sathe jodayelo
            // nahoto. Have jodi daiye — nahi to next update e aapne Shopify
            // ma DUPLICATE banaavi daishu.
            await this.prisma.address.update({
              where: { id: existing.id },
              data: { shopifyAddressId, syncedAt: new Date() },
            });
          }
        } catch (err) {
          // Sauthi sambhavit: `shopifyAddressId` unique constraint — e j
          // Shopify address bija local customer sathe jodayelo chhe. Aa
          // data ni gadbad chhe, pan aakho import atkaavvano matlab nathi.
          this.logger.warn(
            `Address book entry ${shopifyAddressId} skip karyo ` +
              `(customer=${customerId}): ${(err as Error).message}`,
          );
        }
      }
    }

    if (imported > 0) {
      this.logger.log(
        `Address book import: ${imported} navā address customer ${customerId} mate`,
      );
    }

    return imported;
  }

  /**
   * "Fetch my shipping addresses based on past order" — aa e checkbox nu kaam.
   *
   * ⚠️ FAKT verified identifiers vaparaay chhe. Un-verified email par
   * chalavso to bija na ghar na address aa user ne mali jashe.
   */
  async importFromPastOrders(customerId: string): Promise<ImportResult> {
    const shopifyCustomerIds = await this.linkedShopifyCustomerIds(customerId);

    if (shopifyCustomerIds.length === 0) {
      return { imported: 0, found: 0, limitedToRecentOrders: true };
    }

    const orders =
      await this.shopifyCustomers.findOrderAddresses(shopifyCustomerIds);

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

    await this.ensureSomeDefault(customerId);

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
  // Shopify sync — badhu best-effort, kyarey throw nahi
  // -------------------------------------------------------------------------

  /**
   * Local address ne Shopify ma create ke update kare chhe.
   *
   * NEVER-THROW: user e "Save" dabaavyu chhe ane enu address aapdi DB ma
   * save thai j gayu chhe. Shopify down hoy to `syncedAt` null rahese ane
   * next sync e pacho try thashe — pan user ne error na dekhaadvi.
   *
   * @returns Shopify address id jo sync thayo, nahi to `null`
   */
  private async pushToShopify(
    customerId: string,
    address: Address,
    setAsDefault: boolean,
  ): Promise<string | null> {
    const shopifyCustomerId = await this.shopifyCustomerIdFor(customerId);
    if (!shopifyCustomerId) return address.shopifyAddressId;

    const input = toMailingAddressInput(address);

    if (!input) {
      // Country code na oળkhaayo. Andazo lagaadi ne khoto country mokalvo
      // e address kharaab karva jevu chhe — etle skip, ane `syncedAt` null
      // rakhiye jethi khabar rahe ke aa push baaki chhe.
      this.logger.warn(
        `Address ${address.id} Shopify ma na mokalyo — "${address.country}" no ` +
          `ISO country code na malyo. countryCode explicitly mokalo.`,
      );
      return address.shopifyAddressId;
    }

    if (address.shopifyAddressId) {
      const ok = await this.shopifyAddresses.updateAddress(
        shopifyCustomerId,
        address.shopifyAddressId,
        input,
        setAsDefault,
      );

      if (ok) {
        await this.markSynced(address.id, address.shopifyAddressId);
      }
      return address.shopifyAddressId;
    }

    const newId = await this.shopifyAddresses.createAddress(
      shopifyCustomerId,
      input,
      setAsDefault,
    );

    if (newId) {
      await this.markSynced(address.id, newId);
    }

    return newId;
  }

  private async markSynced(
    addressId: string,
    shopifyAddressId: string,
  ): Promise<void> {
    try {
      await this.prisma.address.update({
        where: { id: addressId },
        data: { shopifyAddressId, syncedAt: new Date() },
      });
    } catch (err) {
      this.logger.warn(
        `Address ${addressId} par shopifyAddressId set na thayo: ` +
          `${(err as Error).message}`,
      );
    }
  }

  /**
   * Aa customer na BADHA linked Shopify records.
   *
   * Links na hoy to ek vaar bharvani koshish kariye chhiye — user e pachhi
   * thi bijo email verify karyo hoy ane links tyare na banya hoy.
   */
  private async linkedShopifyCustomerIds(customerId: string): Promise<string[]> {
    const identities = await this.prisma.customerIdentity.findMany({
      where: { customerId },
      select: { type: true, value: true },
    });

    const country = this.config.get('DEFAULT_COUNTRY_CODE', { infer: true });

    for (const identity of identities) {
      try {
        await this.identity.linkShopifyRecords(
          customerId,
          normalizeIdentifier(identity.value, country),
        );
      } catch (err) {
        this.logger.warn(
          `Shopify link refresh failed for ${customerId}: ${(err as Error).message}`,
        );
      }
    }

    const links = await this.prisma.shopifyCustomerLink.findMany({
      where: { customerId },
      select: { shopifyCustomerId: true },
    });

    return links.map((l) => l.shopifyCustomerId);
  }

  /** Write mate FAKT primary record vaparvo — nahi to duplicate records ma vahenchai jaay */
  private async shopifyCustomerIdFor(customerId: string): Promise<string | null> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { shopifyCustomerId: true },
    });

    return customer?.shopifyCustomerId ?? null;
  }

  // -------------------------------------------------------------------------

  private async markDefaultLocally(
    customerId: string,
    id: string,
  ): Promise<void> {
    // Ek j transaction ma — vachche crash thay to be default ke ek pan
    // default nahi evi halat na thay.
    await this.prisma.$transaction([
      this.prisma.address.updateMany({
        where: { customerId, isDefault: true },
        data: { isDefault: false },
      }),
      this.prisma.address.update({ where: { id }, data: { isDefault: true } }),
    ]);
  }

  private async ensureSomeDefault(customerId: string): Promise<void> {
    const hasDefault = await this.prisma.address.findFirst({
      where: { customerId, isDefault: true },
      select: { id: true },
    });
    if (hasDefault) return;

    const newest = await this.prisma.address.findFirst({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
    });
    if (newest) await this.setDefault(customerId, newest.id);
  }

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
