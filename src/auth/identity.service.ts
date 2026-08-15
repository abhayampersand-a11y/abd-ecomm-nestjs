import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Customer, CustomerStatus, Prisma } from '@prisma/client';
import type { NormalizedIdentifier } from '../common/utils/identifier.util';
import { PrismaService } from '../prisma/prisma.service';
import {
  ShopifyCustomerService,
  type ShopifyCustomerMatch,
} from '../shopify/shopify-customer.service';

type Tx = Prisma.TransactionClient;

@Injectable()
export class IdentityService {
  private readonly logger = new Logger(IdentityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shopifyCustomers: ShopifyCustomerService,
  ) {}

  /**
   * OTP verify thaya PACHHI chale chhe. Nakki kare chhe ke aa verified
   * identifier kaya Customer no chhe — ane na hoy to navo banave chhe.
   *
   * Aa j e jagya chhe jya "Shopify no juno customer" ane "app no navo user"
   * ek thai jaay chhe. Barabar na kariye to user na juna 15 orders gum thai jaay.
   */
  async resolveOrCreateForLogin(
    tx: Tx,
    identifier: NormalizedIdentifier,
  ): Promise<{ customer: Customer; isNewUser: boolean }> {
    // 1) Aa identifier pehla thi kya verified chhe? => returning user
    const identity = await tx.customerIdentity.findUnique({
      where: { type_value: { type: identifier.type, value: identifier.value } },
      include: { customer: true },
    });

    if (identity) {
      const customer = await this.resolveMergeChain(tx, identity.customer);
      this.assertLoginAllowed(customer);
      return { customer, isNewUser: false };
    }

    // 2) Verified to nathi, pan aavo record already chhe? Aa te case chhe jyare
    //    Shopify import e record banaavyo hoy (status = IMPORTED) — vyakti juni
    //    chhe, fakt ene haju app ma identity prove nathi kari. Navo record NA
    //    banaviye, nahi to enu aakhu history alag padi jashe.
    const existing = await tx.customer.findFirst({
      where:
        identifier.type === 'PHONE'
          ? { primaryPhone: identifier.value }
          : { primaryEmail: identifier.value },
    });

    if (existing) {
      const customer = await this.resolveMergeChain(tx, existing);
      this.assertLoginAllowed(customer);
      return { customer, isNewUser: false };
    }

    // 3) Sav navo user
    const created = await tx.customer.create({
      data: {
        primaryPhone: identifier.type === 'PHONE' ? identifier.value : null,
        primaryEmail: identifier.type === 'EMAIL' ? identifier.value : null,
        status: CustomerStatus.ACTIVE,
      },
    });

    return { customer: created, isNewUser: true };
  }

  /**
   * Identifier ne customer sathe VERIFIED tarike jode chhe.
   *
   * Aa table j security no paayo chhe — order matching fakt ahiya na values
   * par thay chhe. Etle ahiya fakt e j value aave je OTP thi verify thai hoy.
   */
  async claimVerifiedIdentity(
    tx: Tx,
    customerId: string,
    identifier: NormalizedIdentifier,
    opts: { isPrimary?: boolean } = {},
  ): Promise<void> {
    const existing = await tx.customerIdentity.findUnique({
      where: { type_value: { type: identifier.type, value: identifier.value } },
    });

    if (existing) {
      if (existing.customerId !== customerId) {
        // Koi biju aa email/phone pehla thi verify kari chuku chhe. Aa
        // silently steal na thai shake.
        throw new ConflictException(
          'Aa email/phone bija account sathe jodayelo chhe',
        );
      }
      return;
    }

    await tx.customerIdentity.create({
      data: {
        customerId,
        type: identifier.type,
        value: identifier.value,
        verifiedAt: new Date(),
        isPrimary: opts.isPrimary ?? false,
      },
    });
  }

  /**
   * Login/link safal thaya pachhi customer record ne up-to-date kare chhe:
   *  - IMPORTED (Shopify no juno record) => ACTIVE
   *  - primaryPhone/primaryEmail khali hoy to bhare
   */
  async activateAndBackfill(
    tx: Tx,
    customer: Customer,
    identifier: NormalizedIdentifier,
    opts: { touchLogin?: boolean } = {},
  ): Promise<Customer> {
    const data: Prisma.CustomerUpdateInput = {};

    if (customer.status === CustomerStatus.IMPORTED) {
      data.status = CustomerStatus.ACTIVE;
    }

    if (identifier.type === 'PHONE' && !customer.primaryPhone) {
      data.primaryPhone = identifier.value;
    }
    if (identifier.type === 'EMAIL' && !customer.primaryEmail) {
      data.primaryEmail = identifier.value;
    }

    if (opts.touchLogin) {
      data.lastLoginAt = new Date();
    }

    if (Object.keys(data).length === 0) return customer;

    return tx.customer.update({ where: { id: customer.id }, data });
  }

  /**
   * Verified identifier na aadhare aa vyakti na BADHA Shopify customer records
   * shodhi ne jode chhe — jethi guest checkout thi banela juna orders pan
   * ena account ma dekhaay.
   *
   * ⚠️ Aa method transaction ni BAHAR chale chhe, jaan-bujhi ne. Andar network
   * call hoy chhe (Shopify), ane Shopify dhimu hoy to DB transaction khulli
   * rahi jaay — e connection pool khaali kari naakhe.
   *
   * ⚠️ `identifier` FAKT verified hovu joiye. Un-verified email par search
   * karso to bija na Shopify records jodai jashe — ane pachhi ena orders ane
   * addresses pan dekhaava mandse.
   */
  async linkShopifyRecords(
    customerId: string,
    identifier: NormalizedIdentifier,
  ): Promise<{ linkedCount: number; shopifyCustomerIds: string[] }> {
    const matches =
      await this.shopifyCustomers.findCustomersByIdentifier(identifier);

    if (matches.length === 0) {
      return { linkedCount: 0, shopifyCustomerIds: [] };
    }

    const { count } = await this.prisma.shopifyCustomerLink.createMany({
      data: matches.map((m) => ({
        customerId,
        shopifyCustomerId: m.shopifyCustomerId,
        matchedVia: identifier.type === 'PHONE' ? 'phone' : 'email',
        matchedValue: identifier.value,
      })),
      // Aa link pehla thi hoy (user fari login karyo) to chup-chaap chhodi do
      skipDuplicates: true,
    });

    await this.setPrimaryShopifyCustomer(customerId, matches);

    if (count > 0) {
      this.logger.log(
        `Linked ${count} Shopify customer record(s) to customer ${customerId} ` +
          `via ${identifier.type.toLowerCase()}`,
      );
    }

    return {
      linkedCount: count,
      shopifyCustomerIds: matches.map((m) => m.shopifyCustomerId),
    };
  }

  /**
   * Aa vyakti Shopify ma hoy j — na hoy to banaavi de chhe.
   *
   * Kem: app ma banelo user Shopify ma pan dekhaay, jethi team ne admin ma
   * male ane website par pan e j vyakti tarike ole khaay.
   *
   * ⚠️ KRAM BAHU IMPORTANT CHHE: pehla SHODHVU, pachhi banaavvu. Sidha
   * create karso to je vyakti e vachche website par thi kharidyu hoy ena
   * DUPLICATE records banse — ane pachhi eno order history be jagya e
   * vahenchai jashe.
   *
   * ⚠️ Fakt VERIFIED identifier sathe call karvu.
   */
  async ensureShopifyCustomer(
    customerId: string,
    identifier: NormalizedIdentifier,
  ): Promise<{ shopifyCustomerId: string | null; created: boolean }> {
    // 1) Pehla thi jodayelo chhe?
    const existing = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { shopifyCustomerId: true, firstName: true, lastName: true },
    });

    if (existing?.shopifyCustomerId) {
      return { shopifyCustomerId: existing.shopifyCustomerId, created: false };
    }

    // 2) Shopify ma pehla thi chhe? (linkShopifyRecords aa karyu j hase, pan
    //    aa method jate pan call thai shake chhe, etle fari check kariye.)
    const matches =
      await this.shopifyCustomers.findCustomersByIdentifier(identifier);

    if (matches.length > 0) {
      await this.setPrimaryShopifyCustomer(customerId, matches);
      const refreshed = await this.prisma.customer.findUnique({
        where: { id: customerId },
        select: { shopifyCustomerId: true },
      });
      return {
        shopifyCustomerId: refreshed?.shopifyCustomerId ?? null,
        created: false,
      };
    }

    // 3) Kya nathi — have banaavo.
    //
    // Note: fakt phone vaalo Shopify customer banse to e admin ma dekhaashe,
    // pan e vyakti WEBSITE PAR LOGIN NAHI KARI SHAKE — Shopify na customer
    // accounts email par code mokle chhe. Email verify thay tyare
    // `attachEmail()` chale chhe ane tyare website login chalu thay chhe.
    const shopifyCustomerId = await this.shopifyCustomers.createCustomer({
      ...(identifier.type === 'PHONE'
        ? { phone: identifier.value }
        : { email: identifier.value }),
      firstName: existing?.firstName,
      lastName: existing?.lastName,
    });

    if (!shopifyCustomerId) {
      return { shopifyCustomerId: null, created: false };
    }

    await this.prisma.$transaction([
      this.prisma.customer.update({
        where: { id: customerId },
        data: { shopifyCustomerId },
      }),
      this.prisma.shopifyCustomerLink.create({
        data: {
          customerId,
          shopifyCustomerId,
          matchedVia: 'created',
          matchedValue: identifier.value,
        },
      }),
    ]);

    return { shopifyCustomerId, created: true };
  }

  /**
   * Email verify thaya pachhi Shopify sathe hisaab barabar kare chhe.
   *
   * AA METHOD KEM JARURI CHHE — Paithanic store ni haqiqat:
   * tya na badha juna customers pase **fakt email chhe, phone nathi**. Etle:
   *
   *   1. Juno grahak app ma phone thi login kare
   *   2. Phone thi Shopify ma kai j na male (ena record ma phone chhe j nahi)
   *   3. Aapne ek navo phone-only record banaviye chhiye
   *   4. Pachhi e potano email verify kare — ane TYARE eno juno record male
   *      chhe, jena par ena 15 orders chhe
   *
   * Aa method e 4-me step sambhale chhe: juno record primary bane, ena par
   * phone set thay (jethi hવે phone thi pan male), ane aapne banaavelo khali
   * record kaadhi naakhiye — nahi to store ma dar returning customer no
   * duplicate rahi jaay.
   */
  async reconcileAfterEmailVerified(
    customerId: string,
    email: NormalizedIdentifier,
  ): Promise<{ switchedToExisting: boolean; orphanDeleted: boolean }> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { shopifyCustomerId: true, primaryPhone: true },
    });

    const matches = await this.shopifyCustomers.findCustomersByIdentifier(email);
    const existing = [...matches].sort((a, b) => b.orderCount - a.orderCount)[0];

    // Aa email vaalo koi juno record j nathi — to aapdo current record j
    // saacho chhe, ena par email set kari daiye (website login chalu thay).
    if (!existing) {
      if (customer?.shopifyCustomerId) {
        await this.shopifyCustomers.updateContact(customer.shopifyCustomerId, {
          email: email.value,
        });
      }
      return { switchedToExisting: false, orphanDeleted: false };
    }

    // Juno record male gayo. E j asli chhe — ena par order history chhe.
    const orphanId =
      customer?.shopifyCustomerId &&
      customer.shopifyCustomerId !== existing.shopifyCustomerId
        ? customer.shopifyCustomerId
        : null;

    await this.prisma.customer.update({
      where: { id: customerId },
      data: { shopifyCustomerId: existing.shopifyCustomerId },
    });

    // ⚠️ KRAM: orphan PEHLA delete karvo, PACHHI phone set karvo.
    //
    // Orphan par e j phone lagelo chhe, ane Shopify ma phone unique chhe.
    // Ulto kram karso to "Phone has already been taken" aavse ane juno
    // record kayamı phone vagar rahi jashe — etle e grahak fari kyarey
    // phone thi nahi maळे ane aa aakho fero dar login e thato rahese.
    let orphanDeleted = false;
    if (orphanId) {
      const { deleted, reason } =
        await this.shopifyCustomers.deleteCustomerIfEmpty(orphanId);
      orphanDeleted = deleted;

      if (deleted) {
        await this.prisma.shopifyCustomerLink.deleteMany({
          where: { shopifyCustomerId: orphanId },
        });
      } else {
        this.logger.warn(
          `Orphan Shopify customer ${orphanId} rakhyo (${reason}) — ` +
            `manual review joishe`,
        );
      }
    }

    // Have juna record par phone set kari daiye, jethi have thi phone thi
    // pan male ane aa aakho fero fari na karvo pade.
    // (Orphan delete na thayo hoy to phone haju block chhe — tyare skip.)
    if (customer?.primaryPhone && !existing.phone && (!orphanId || orphanDeleted)) {
      await this.shopifyCustomers.updateContact(existing.shopifyCustomerId, {
        phone: customer.primaryPhone,
      });
    }

    this.logger.log(
      `Reconciled customer ${customerId} → Shopify ${existing.shopifyCustomerId} ` +
        `(${existing.orderCount} orders)${orphanDeleted ? ', orphan deleted' : ''}`,
    );

    return { switchedToExisting: true, orphanDeleted };
  }

  /**
   * Ghana Shopify records mathi ek ne "primary" banaviye chhiye — jena par
   * sauthi vadhare orders hoy e, karan ke e j eno asli account hovani
   * sambhavna sauthi vadhu chhe. Shopify ma order create karta vakhte aa j
   * vaparashe.
   */
  private async setPrimaryShopifyCustomer(
    customerId: string,
    matches: ShopifyCustomerMatch[],
  ): Promise<void> {
    const primary = [...matches].sort((a, b) => b.orderCount - a.orderCount)[0];
    if (!primary) return;

    // Aa Shopify record bija koi na account sathe to nathi jodayelo ne?
    // (`shopifyCustomerId` unique chhe — check vagar update karso to P2002.)
    const taken = await this.prisma.customer.findFirst({
      where: {
        shopifyCustomerId: primary.shopifyCustomerId,
        id: { not: customerId },
      },
      select: { id: true },
    });

    if (taken) {
      this.logger.warn(
        `Shopify customer ${primary.shopifyCustomerId} already primary for ` +
          `customer ${taken.id} — skipping for ${customerId}`,
      );
      return;
    }

    await this.prisma.customer.updateMany({
      where: { id: customerId, shopifyCustomerId: null },
      data: { shopifyCustomerId: primary.shopifyCustomerId },
    });
  }

  /**
   * Duplicate record bija ma merge thayo hoy to asli record par pahonchо.
   * (Loop guard sathe — corrupt data ma infinite loop na thay.)
   */
  private async resolveMergeChain(tx: Tx, customer: Customer): Promise<Customer> {
    let current = customer;
    let hops = 0;

    while (current.mergedIntoId && hops < 5) {
      const next = await tx.customer.findUnique({
        where: { id: current.mergedIntoId },
      });
      if (!next) break;
      current = next;
      hops += 1;
    }

    return current;
  }

  private assertLoginAllowed(customer: Customer): void {
    if (customer.status === CustomerStatus.BLOCKED) {
      throw new ForbiddenException('Aa account block thayelu chhe');
    }
  }
}
