import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';
import { ShopifyConfigException, ShopifyGraphqlError } from './shopify.errors';

interface GraphqlResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

/**
 * Storefront API client — cart ane checkout mate.
 *
 * ⚠️ AA ADMIN CLIENT THI ALAG KEM CHHE, e samajvu jaruri chhe:
 *
 *   Admin API      → /admin/api/{v}/graphql.json
 *                    header: X-Shopify-Access-Token
 *                    token 24 kalak ma expire thay chhe (client_credentials)
 *                    kaam: store chalavvu — products, orders vaanchvа
 *
 *   Storefront API → /api/{v}/graphql.json
 *                    header: X-Shopify-Storefront-Access-Token
 *                    token expire NATHI thato — .env ma sidho chhe
 *                    kaam: grahak no cart ane checkout
 *
 * Etle ahiya `ShopifyTokenService` ni jarur j nathi — na cache, na refresh,
 * na single-flight. Aa client jaan-bujhi ne aatlo saado chhe.
 */
@Injectable()
export class ShopifyStorefrontClient {
  private readonly logger = new Logger(ShopifyStorefrontClient.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  isConfigured(): boolean {
    return Boolean(this.config.get('SHOPIFY_STOREFRONT_TOKEN', { infer: true }));
  }

  private get endpoint(): string {
    const domain = this.config.get('SHOPIFY_STORE_DOMAIN', { infer: true });
    const version = this.config.get('SHOPIFY_API_VERSION', { infer: true });
    return `https://${domain}/api/${version}/graphql.json`;
  }

  async request<T>(
    query: string,
    variables: Record<string, unknown> = {},
    opName = 'query',
  ): Promise<T> {
    const token = this.config.get('SHOPIFY_STOREFRONT_TOKEN', { infer: true });
    if (!token) throw new ShopifyConfigException('SHOPIFY_STOREFRONT_TOKEN');

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Shopify-Storefront-Access-Token': token,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new ShopifyGraphqlError(
        `Storefront ${opName} failed (${res.status})`,
        String(res.status),
        body.slice(0, 300),
      );
    }

    const json = (await res.json()) as GraphqlResponse<T>;

    if (json.errors?.length) {
      const messages = json.errors.map((e) => e.message).join('; ');
      this.logger.error(`Storefront ${opName}: ${messages}`);
      throw new ShopifyGraphqlError(
        `Storefront ${opName}: ${messages}`,
        undefined,
        json.errors,
      );
    }

    if (!json.data) {
      throw new ShopifyGraphqlError(
        `Storefront ${opName} returned no data`,
        undefined,
        json,
      );
    }

    return json.data;
  }
}
