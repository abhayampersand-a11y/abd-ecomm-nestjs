import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpPurpose } from '@prisma/client';
import { AddressesService } from '../addresses/addresses.service';
import type { Env } from '../config/env.schema';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeIdentifier } from '../common/utils/identifier.util';
import {
  toCustomerProfileDto,
  type CustomerProfileDto,
  type LoginResultDto,
  type OtpRequestedDto,
} from './dto/auth-response.dto';
import { IdentityService } from './identity.service';
import { OtpService } from './otp/otp.service';
import { TokenService, type SessionContext, type TokenPair } from './token.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
    private readonly identity: IdentityService,
    private readonly config: ConfigService<Env, true>,
    /**
     * ⚠️ Circular dependency chhe: AddressesModule ne JwtAuthGuard ane
     * IdentityService mate AuthModule joiye chhe, ane AuthModule ne identity
     * verify pachhi addresses khenchva mate AddressesService joiye chhe.
     *
     * `forwardRef` vagar Nest boot vakhte "Nest can't resolve dependencies"
     * thi fail thashe. Banne baaju forwardRef hovu jaruri chhe — fakt ek
     * baaju mukso to pan e j error aavse.
     */
    @Inject(forwardRef(() => AddressesService))
    private readonly addresses: AddressesService,
  ) {}

  private get defaultCountry(): string {
    return this.config.get('DEFAULT_COUNTRY_CODE', { infer: true });
  }

  // -------------------------------------------------------------------------
  // Login / signup — ek j flow
  // -------------------------------------------------------------------------

  /**
   * ⚠️ Aa method e KYAREY nathi kehtu ke number registered chhe ke nahi.
   * Response hammesha ek j: "OTP mokali didho".
   *
   * Nahi to koi script chalavi ne khabar padi jaay ke kaya numbers tamara
   * customers chhe — je customer list no leak chhe.
   */
  async requestLoginOtp(rawIdentifier: string, ip?: string): Promise<OtpRequestedDto> {
    const identifier = normalizeIdentifier(rawIdentifier, this.defaultCountry);

    const issued = await this.otp.issue({
      identifier,
      purpose: OtpPurpose.LOGIN,
      ip,
    });

    return {
      sent: true,
      sentTo: identifier.masked,
      expiresAt: issued.expiresAt.toISOString(),
      resendAfterSeconds: issued.resendAfterSeconds,
      devCode: issued.devCode,
    };
  }

  /**
   * OTP verify => login. Signup alag endpoint nathi:
   * user navo hoy to ahiya j bane chhe, juno (Shopify no) hoy to ahiya j
   * eno existing record ACTIVE thai jaay chhe — enu badhu history sathe.
   */
  async verifyLoginOtp(
    rawIdentifier: string,
    code: string,
    ctx: SessionContext,
  ): Promise<LoginResultDto> {
    const identifier = normalizeIdentifier(rawIdentifier, this.defaultCountry);

    await this.otp.verify({ identifier, purpose: OtpPurpose.LOGIN, code });

    const { customerId, isNewUser } = await this.prisma.$transaction(async (tx) => {
      const { customer, isNewUser } = await this.identity.resolveOrCreateForLogin(
        tx,
        identifier,
      );

      await this.identity.claimVerifiedIdentity(tx, customer.id, identifier, {
        isPrimary: true,
      });

      await this.identity.activateAndBackfill(tx, customer, identifier, {
        touchLogin: true,
      });

      return { customerId: customer.id, isNewUser };
    });

    // Shopify lookup transaction ni BAHAR — network call chhe, ane e DB
    // transaction ne khulli rakhe to connection pool khaali thai jaay.
    //
    // Ane aa fail thay to pan login fail NA thavu joiye: user ne andar
    // aavva devu, links pachhi `/addresses/import-from-orders` thi bharai jashe.
    const linkedCount = await this.linkShopifySafely(customerId, identifier);

    // Tokens pan transaction ni bahar — token create thay ane transaction
    // rollback thay to client pase aavo token rahi jaay je DB ma j nathi.
    const tokens = await this.tokens.issuePair(customerId, ctx);

    this.logger.log(
      `Login OK — customer=${customerId} new=${isNewUser} via=${identifier.type}`,
    );

    return {
      isNewUser,
      linkedShopifyRecords: linkedCount,
      customer: await this.getProfile(customerId),
      tokens,
    };
  }

  // -------------------------------------------------------------------------
  // Session management
  // -------------------------------------------------------------------------

  async refresh(refreshToken: string, ctx: SessionContext): Promise<TokenPair> {
    return this.tokens.rotate(refreshToken, ctx);
  }

  async logout(refreshToken?: string): Promise<{ success: true }> {
    if (refreshToken) {
      await this.tokens.revoke(refreshToken);
    }
    return { success: true };
  }

  async logoutEverywhere(customerId: string): Promise<{ sessionsRevoked: number }> {
    const count = await this.tokens.revokeAllForCustomer(customerId);
    return { sessionsRevoked: count };
  }

  // -------------------------------------------------------------------------
  // Profile
  // -------------------------------------------------------------------------

  /**
   * Shopify sathe sync: juna records jode chhe, ane
   * `SHOPIFY_CREATE_CUSTOMER_ON_SIGNUP=true` hoy to na hoy tyare banaavi pan
   * de chhe (jethi app no user Shopify admin ma ane website par pan dekhaay).
   *
   * Aa NEVER-THROW chhe: Shopify down hoy, rate limit lage, ke scope na hoy —
   * to pan user no login atkavo na joiye. Baaki nu kaam pachhi na login e ke
   * `/addresses/import-from-orders` e thai jashe.
   */
  private async linkShopifySafely(
    customerId: string,
    identifier: ReturnType<typeof normalizeIdentifier>,
  ): Promise<number> {
    try {
      const { linkedCount } = await this.identity.linkShopifyRecords(
        customerId,
        identifier,
      );

      if (this.config.get('SHOPIFY_CREATE_CUSTOMER_ON_SIGNUP', { infer: true })) {
        const { created } = await this.identity.ensureShopifyCustomer(
          customerId,
          identifier,
        );
        if (created) {
          this.logger.log(
            `Shopify customer created for ${customerId} (app signup)`,
          );
        }
      }

      return linkedCount;
    } catch (err) {
      this.logger.warn(
        `Shopify sync failed for customer ${customerId} (login chalu rahyu): ` +
          `${(err as Error).message}`,
      );
      return 0;
    }
  }

  /** Shopify reconcile — fail thay to pan email verification safal j ganay */
  private async reconcileShopifySafely(
    customerId: string,
    email: ReturnType<typeof normalizeIdentifier>,
  ): Promise<void> {
    try {
      await this.identity.reconcileAfterEmailVerified(customerId, email);
    } catch (err) {
      this.logger.warn(
        `Shopify reconcile failed for ${customerId}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Registration screen (first name, last name, email).
   *
   * ⚠️ Ahiya no email `contactEmail` ma jaay chhe, `primaryEmail` ma NAHI —
   * karan ke e verified nathi. Fakt contact mate chhe.
   *
   * Juna orders match karva mate user e e email `/auth/identities/verify`
   * thi verify karvo padse. Tya sudhi `emailVerified: false` aavse, ane app
   * "verify your email to see older orders" batavi shake.
   */
  async updateProfile(
    customerId: string,
    data: {
      firstName?: string;
      lastName?: string;
      email?: string;
      gender?: string;
    },
  ): Promise<CustomerProfileDto> {
    await this.prisma.customer.update({
      where: { id: customerId },
      data: {
        ...(data.firstName !== undefined && { firstName: data.firstName }),
        ...(data.lastName !== undefined && { lastName: data.lastName }),
        ...(data.gender !== undefined && { gender: data.gender }),
        ...(data.email !== undefined && {
          contactEmail: data.email.trim().toLowerCase(),
        }),
      },
    });

    return this.getProfile(customerId);
  }

  async getProfile(customerId: string): Promise<CustomerProfileDto> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: { identities: { orderBy: { verifiedAt: 'asc' } } },
    });

    if (!customer) {
      throw new UnauthorizedException('Account not found');
    }

    return toCustomerProfileDto(customer);
  }

  // -------------------------------------------------------------------------
  // Identity linking — "juna orders jodo" flow
  // -------------------------------------------------------------------------

  /**
   * Logged-in user potano BIJO email/phone add karva mange chhe.
   *
   * Use case: user e phone OTP thi login karyu, pan website par na juna orders
   * guest checkout ma alag email thi hata. E email verify thay etle e orders
   * enа account ma dekhaava mandse.
   */
  async requestIdentityOtp(
    customerId: string,
    rawIdentifier: string,
    ip?: string,
  ): Promise<OtpRequestedDto> {
    const identifier = normalizeIdentifier(rawIdentifier, this.defaultCountry);

    // Bija koi e aa identifier pehla thi verify kari lidhu hoy to ahiya j
    // atkаvi daiye — user ne OTP mokalya pachhi fail karva karta better UX.
    const taken = await this.prisma.customerIdentity.findUnique({
      where: { type_value: { type: identifier.type, value: identifier.value } },
      select: { customerId: true },
    });

    if (taken && taken.customerId !== customerId) {
      // Ahiya "bija account no chhe" kehvu safe chhe: user already logged-in
      // chhe ane ene khabar padvi joiye ke aa kem add nathi thai shakto.
      throw new UnauthorizedException(
        'This email/phone is already linked to another account',
      );
    }

    const issued = await this.otp.issue({
      identifier,
      purpose: OtpPurpose.LINK_IDENTITY,
      customerId,
      ip,
    });

    return {
      sent: true,
      sentTo: identifier.masked,
      expiresAt: issued.expiresAt.toISOString(),
      resendAfterSeconds: issued.resendAfterSeconds,
      devCode: issued.devCode,
    };
  }

  /**
   * Identity verify + link. Aa safal thay etle j — ane tya sudhi nahi —
   * aa identifier na Shopify records jodaay chhe.
   */
  async verifyIdentity(
    customerId: string,
    rawIdentifier: string,
    code: string,
  ): Promise<{
    linkedShopifyRecords: number;
    importedAddresses: number;
    customer: CustomerProfileDto;
  }> {
    const identifier = normalizeIdentifier(rawIdentifier, this.defaultCountry);

    const { customerId: otpOwner } = await this.otp.verify({
      identifier,
      purpose: OtpPurpose.LINK_IDENTITY,
      code,
    });

    // OTP je user mate banyo hato e j user aavyo chhe ne? Aa check vagar
    // A e potano OTP levo ane B na token sathe verify karvu — e chali jaat.
    if (otpOwner !== customerId) {
      throw new UnauthorizedException('OTP is incorrect or has expired');
    }

    await this.prisma.$transaction(async (tx) => {
      await this.identity.claimVerifiedIdentity(tx, customerId, identifier);

      const customer = await tx.customer.findUniqueOrThrow({
        where: { id: customerId },
      });
      await this.identity.activateAndBackfill(tx, customer, identifier);
    });

    const linkedCount = await this.linkShopifySafely(customerId, identifier);

    // Email verify thayo — have Shopify sathe hisaab barabar karvano.
    //
    // Paithanic na juna customers pase FAKT EMAIL chhe, phone nathi. Etle
    // aa step j e jagya chhe jya juno grahak potana asli record (ane potana
    // 15 orders) sathe pacho jodaay chhe. Sathe website login pan chalu thay
    // chhe, karan ke Shopify email par j code mokle chhe.
    if (identifier.type === 'EMAIL') {
      await this.reconcileShopifySafely(customerId, identifier);
    }

    // Have addresses khenchi laiye — juna Shopify records have jodai gaya
    // chhe, etle aa j saacho kshan chhe. User "Verify" dabaavi ne rah jue
    // chhe, ane ene ek j vaar ma badhu male e j saari UX chhe.
    const importedAddresses = await this.importAddressesSafely(customerId);

    this.logger.log(
      `Identity linked — customer=${customerId} type=${identifier.type} ` +
        `shopifyRecordsLinked=${linkedCount} addressesImported=${importedAddresses}`,
    );

    return {
      linkedShopifyRecords: linkedCount,
      importedAddresses,
      customer: await this.getProfile(customerId),
    };
  }

  /**
   * Shopify parthi addresses khenchvu — address book ane juna orders, banne.
   *
   * NEVER-THROW: aa fail thay to pan email verification safal j chhe. User
   * pachhi `/addresses/sync` thi fari try kari shake chhe.
   */
  private async importAddressesSafely(customerId: string): Promise<number> {
    try {
      const result = await this.addresses.syncFromShopify(customerId);
      return result.fromAddressBook + result.fromPastOrders;
    } catch (err) {
      this.logger.warn(
        `Address sync failed for ${customerId} (verification chalu rahi): ` +
          `${(err as Error).message}`,
      );
      return 0;
    }
  }
}
