import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema';
import { ShopifyTokenService } from './shopify-token.service';
import { ShopifyGraphqlError, ShopifyUnavailableException } from './shopify.errors';

interface ThrottleStatus {
  maximumAvailable: number;
  currentlyAvailable: number;
  restoreRate: number;
}

interface GraphqlResponse<T> {
  data?: T;
  errors?: Array<{
    message: string;
    extensions?: { code?: string; documentation?: string };
  }>;
  extensions?: {
    cost?: {
      requestedQueryCost: number;
      actualQueryCost: number;
      throttleStatus: ThrottleStatus;
    };
  };
}

/**
 * GraphQL Admin API client.
 *
 * Shopify no rate limit request-count nahi pan **cost**-based chhe: dar query
 * no cost calculate thay chhe ane ek leaky bucket mathi points katay chhe.
 * Etle "10 requests/sec" evu vichaarvu khotu chhe — EK bhaari nested query pan
 * bucket khaali kari shake.
 *
 * Aa client e badhu sambhale chhe:
 *   - THROTTLED thay to bucket bharaay tetli j vaar rah jue chhe (andhadhundh
 *     backoff nahi — Shopify e j kahyu hoy e restoreRate vaparine ganatri)
 *   - 401 aave to token invalidate kari ne ek vaar fari try kare chhe
 *   - 5xx par exponential backoff
 */
@Injectable()
export class ShopifyGraphqlClient {
  private readonly logger = new Logger(ShopifyGraphqlClient.name);
  private static readonly MAX_RETRIES = 3;

  constructor(
    private readonly tokens: ShopifyTokenService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private get endpoint(): string {
    const domain = this.config.get('SHOPIFY_STORE_DOMAIN', { infer: true });
    const version = this.config.get('SHOPIFY_API_VERSION', { infer: true });
    return `https://${domain}/admin/api/${version}/graphql.json`;
  }

  async request<T>(
    query: string,
    variables: Record<string, unknown> = {},
    opName = 'query',
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= ShopifyGraphqlClient.MAX_RETRIES; attempt++) {
      try {
        return await this.attempt<T>(query, variables, opName, attempt);
      } catch (err) {
        lastError = err;

        const delay = this.retryDelayFor(err, attempt);
        if (delay === null) break;

        this.logger.warn(
          `Shopify ${opName} retry ${attempt + 1}/${ShopifyGraphqlClient.MAX_RETRIES} ` +
            `after ${delay}ms — ${(err as Error).message}`,
        );
        await sleep(delay);
      }
    }

    this.logger.error(
      `Shopify ${opName} failed: ${(lastError as Error)?.message}`,
      (lastError as Error)?.stack,
    );
    throw new ShopifyUnavailableException(String((lastError as Error)?.message));
  }

  // -------------------------------------------------------------------------

  private async attempt<T>(
    query: string,
    variables: Record<string, unknown>,
    opName: string,
    attempt: number,
  ): Promise<T> {
    const token = await this.tokens.getToken();

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(15_000),
    });

    // Token reject thayo — cache saaf kari ne ek vaar fari.
    if (res.status === 401) {
      await this.tokens.invalidate();
      throw new RetryableError('Unauthorized — token refreshed, retrying', 0);
    }

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after') ?? 2);
      throw new RetryableError('Rate limited (HTTP 429)', retryAfter * 1000);
    }

    if (res.status >= 500) {
      throw new RetryableError(
        `Shopify server error (${res.status})`,
        backoffMs(attempt),
      );
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new ShopifyGraphqlError(
        `HTTP ${res.status}: ${body.slice(0, 300)}`,
        String(res.status),
        body,
      );
    }

    const payload = (await res.json()) as GraphqlResponse<T>;

    this.logCost(opName, payload);

    if (payload.errors?.length) {
      const throttled = payload.errors.find(
        (e) => e.extensions?.code === 'THROTTLED',
      );

      if (throttled) {
        throw new RetryableError(
          'THROTTLED — cost bucket khaali',
          this.waitForBucket(payload.extensions?.cost?.throttleStatus, attempt),
        );
      }

      const first = payload.errors[0];
      throw new ShopifyGraphqlError(
        first.message,
        first.extensions?.code,
        payload.errors,
      );
    }

    if (!payload.data) {
      throw new ShopifyGraphqlError('Shopify e khali response aapyo', undefined, payload);
    }

    return payload.data;
  }

  /**
   * Bucket ma kharekhar ketlo vakhat lagse e Shopify na potana restoreRate
   * thi ganiye chhiye — andhadhundh "2 second rah juo" karta bahu better.
   */
  private waitForBucket(status: ThrottleStatus | undefined, attempt: number): number {
    if (!status || status.restoreRate <= 0) return backoffMs(attempt);

    const needed = Math.max(status.maximumAvailable * 0.5 - status.currentlyAvailable, 0);
    const seconds = needed / status.restoreRate;

    // Ochha ma ochhu 500ms, vadhare ma vadhare 10s
    return Math.min(Math.max(Math.ceil(seconds * 1000), 500), 10_000);
  }

  private retryDelayFor(err: unknown, attempt: number): number | null {
    if (attempt >= ShopifyGraphqlClient.MAX_RETRIES) return null;
    if (err instanceof RetryableError) return err.delayMs;

    // Network / timeout — aa pan retry karva jevu chhe
    if (err instanceof Error && /fetch failed|timeout|aborted|ECONN/i.test(err.message)) {
      return backoffMs(attempt);
    }

    // GraphQL ni asli bhool (khoto field, khoto scope) — retry karvano
    // koi matlab nathi, e j error fari aavse.
    return null;
  }

  private logCost(opName: string, payload: GraphqlResponse<unknown>): void {
    const cost = payload.extensions?.cost;
    if (!cost) return;

    const { currentlyAvailable, maximumAvailable } = cost.throttleStatus;

    // Bucket 20% thi nichhe jaay to warn — cache thodo lambo karvo pade
    // ke query halki karvi pade evo signal chhe.
    if (currentlyAvailable < maximumAvailable * 0.2) {
      this.logger.warn(
        `Shopify cost bucket low: ${currentlyAvailable}/${maximumAvailable} ` +
          `(${opName} cost ${cost.actualQueryCost})`,
      );
    } else {
      this.logger.debug(
        `${opName} cost ${cost.actualQueryCost} — bucket ${currentlyAvailable}/${maximumAvailable}`,
      );
    }
  }
}

class RetryableError extends Error {
  constructor(message: string, readonly delayMs: number) {
    super(message);
    this.name = 'RetryableError';
  }
}

function backoffMs(attempt: number): number {
  // 500ms, 1s, 2s + jitter (badha instances ek sathe retry na kare)
  return 500 * 2 ** attempt + Math.floor(Math.random() * 250);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
