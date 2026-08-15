import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';
import { RedisService } from '../redis/redis.service';
import { ShopifyConfigException } from './shopify.errors';

interface TokenResponse {
  access_token: string;
  scope: string;
  /** Hammesha 86399 (24 kalak) */
  expires_in: number;
}

/**
 * Shopify na naya Dev Dashboard apps ma static `shpat_` token nathi malto.
 * Client ID + Secret thi `client_credentials` grant karvo pade chhe, ane je
 * token male e **24 kalak** ma expire thay chhe.
 *
 * Aa service e vaat ne baaki na code thi chhupavi de chhe — koi pan jagya e
 * `getToken()` call karo, valid token male j.
 *
 * Tran layer cache:
 *   1. In-memory  — sauthi fast, dar request e Redis hit na thay
 *   2. Redis      — app restart ke multiple instances vachche share thay
 *   3. Single-flight — 50 requests ek sathe aave to Shopify ne 50 nahi,
 *                      EK j call jaay chhe
 */
@Injectable()
export class ShopifyTokenService {
  private readonly logger = new Logger(ShopifyTokenService.name);

  /** Expire thata aatla second pehla j navo token lai laiye */
  private static readonly REFRESH_MARGIN_SECONDS = 300;

  private memoryCache: { token: string; expiresAtMs: number } | null = null;
  private inflight: Promise<string> | null = null;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly redis: RedisService,
  ) {}

  get shopDomain(): string {
    return this.config.get('SHOPIFY_STORE_DOMAIN', { infer: true });
  }

  /** Config bharayelu chhe ke nahi — health check ane boot warning mate */
  isConfigured(): boolean {
    return Boolean(
      this.shopDomain &&
        this.config.get('SHOPIFY_CLIENT_ID', { infer: true }) &&
        this.config.get('SHOPIFY_CLIENT_SECRET', { infer: true }),
    );
  }

  async getToken(): Promise<string> {
    const now = Date.now();

    if (this.memoryCache && this.memoryCache.expiresAtMs > now) {
      return this.memoryCache.token;
    }

    // Ek j vakhte ek j fetch — baaki badha e j promise par rah jue chhe.
    if (this.inflight) return this.inflight;

    this.inflight = this.loadToken().finally(() => {
      this.inflight = null;
    });

    return this.inflight;
  }

  /**
   * Token reject thayo (401) — cache saaf karo jethi next call navo lave.
   * Aa tyare thay chhe jyare app na scopes badlaay ke token revoke thay.
   */
  async invalidate(): Promise<void> {
    this.memoryCache = null;
    await this.redis.del(this.redisKey);
    this.logger.warn('Shopify access token invalidated');
  }

  // -------------------------------------------------------------------------

  private get redisKey(): string {
    return `shopify:admin-token:${this.shopDomain}`;
  }

  private async loadToken(): Promise<string> {
    const cached = await this.redis.client.get(this.redisKey);
    if (cached) {
      const ttl = await this.redis.ttl(this.redisKey);
      this.memoryCache = { token: cached, expiresAtMs: Date.now() + ttl * 1000 };
      return cached;
    }

    return this.fetchFreshToken();
  }

  private async fetchFreshToken(): Promise<string> {
    const domain = this.shopDomain;
    const clientId = this.config.get('SHOPIFY_CLIENT_ID', { infer: true });
    const clientSecret = this.config.get('SHOPIFY_CLIENT_SECRET', { infer: true });

    if (!domain) throw new ShopifyConfigException('SHOPIFY_STORE_DOMAIN');
    if (!clientId) throw new ShopifyConfigException('SHOPIFY_CLIENT_ID');
    if (!clientSecret) throw new ShopifyConfigException('SHOPIFY_CLIENT_SECRET');

    const res = await fetch(`https://${domain}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(
        `Shopify token request failed (${res.status}). ` +
          `Client ID/Secret ane store domain check karo. ${body.slice(0, 300)}`,
      );
    }

    const data = (await res.json()) as TokenResponse;

    // Shopify na expires_in karta vehela expire kariye, jethi kyarey
    // "expire thai gayelo" token sathe request na jaay.
    const ttl = Math.max(
      data.expires_in - ShopifyTokenService.REFRESH_MARGIN_SECONDS,
      60,
    );

    await this.redis.client.set(this.redisKey, data.access_token, 'EX', ttl);
    this.memoryCache = {
      token: data.access_token,
      expiresAtMs: Date.now() + ttl * 1000,
    };

    this.logger.log(
      `Shopify access token refreshed (valid ${Math.round(ttl / 60)} min, ` +
        `scopes: ${data.scope})`,
    );

    return data.access_token;
  }
}
