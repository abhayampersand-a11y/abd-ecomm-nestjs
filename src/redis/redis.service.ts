import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { Env } from '../config/env.schema';

/**
 * Phase 1 ma Redis be kaam kare chhe:
 *   1. Rate limiting counters (OTP abuse rokvа mate)
 *   2. Shopify proxy responses no cache
 *
 * Phase 2 ma jyare Postgres source-of-truth banse, tyare (2) ni jagya DB lai lese
 * — pan (1) ahiya j rahese.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor(config: ConfigService<Env, true>) {
    this.client = new Redis(config.get('REDIS_URL', { infer: true }), {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    this.client.on('error', (err) =>
      this.logger.error(`Redis error: ${err.message}`),
    );
  }

  async onModuleInit(): Promise<void> {
    await this.client.connect();
    this.logger.log('Redis connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }

  /**
   * Fixed-window counter. Key pehli vaar bane tyare j TTL set thay chhe,
   * jethi window "sarki" na jaay (dar hit e expiry reset thay to attacker
   * kyarey window bhar bahar nahi nikde).
   *
   * @returns aa window ma atyar sudhi na hits
   */
  async incrementWithWindow(key: string, windowSeconds: number): Promise<number> {
    const results = await this.client
      .multi()
      .incr(key)
      .expire(key, windowSeconds, 'NX')
      .exec();

    const count = results?.[0]?.[1];
    return typeof count === 'number' ? count : Number(count ?? 0);
  }

  /** Baki rahelo cooldown time (seconds). 0 = cooldown nathi. */
  async ttl(key: string): Promise<number> {
    const t = await this.client.ttl(key);
    return t > 0 ? t : 0;
  }

  /** @returns true jo lock male (etle ke key pehla thi nahoti) */
  async acquireCooldown(key: string, seconds: number): Promise<boolean> {
    const res = await this.client.set(key, '1', 'EX', seconds, 'NX');
    return res === 'OK';
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length) await this.client.del(...keys);
  }

  /**
   * Cache read. Redis down hoy ke corrupt JSON hoy to `null` return kare chhe —
   * throw NATHI karto. Cache miss thay to request Shopify sudhi jashe, je
   * dhimu chhe pan chale chhe; cache ne kaarne aakhi app nichhe na padvi joiye.
   */
  async getJson<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.client.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (err) {
      this.logger.warn(`Cache read failed for ${key}: ${(err as Error).message}`);
      return null;
    }
  }

  /** Cache write. Fail thay to silently chhodi daiye — data to already malelo j chhe. */
  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (err) {
      this.logger.warn(`Cache write failed for ${key}: ${(err as Error).message}`);
    }
  }

  /** Pattern na badha keys kaadhi naakhe (SCAN thi — KEYS kyarey nahi, e blocking chhe) */
  async delByPattern(pattern: string): Promise<number> {
    let cursor = '0';
    let removed = 0;

    do {
      const [next, keys] = await this.client.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        200,
      );
      cursor = next;
      if (keys.length) {
        await this.client.del(...keys);
        removed += keys.length;
      }
    } while (cursor !== '0');

    return removed;
  }
}
