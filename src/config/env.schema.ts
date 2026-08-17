import { z } from 'zod';

/**
 * Ek j jagya jya badha env vars define ane validate thay chhe.
 * App boot vakhte j fail thay chhe — runtime ma "undefined secret" no risk nahi.
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  API_PREFIX: z.string().default('api/v1'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters long'),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_ISSUER: z.string().default('abd-ecomm-api'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(60),

  OTP_PROVIDER: z.enum(['console', 'msg91', 'twilio']).default('console'),
  OTP_LENGTH: z.coerce.number().int().min(4).max(8).default(6),
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(60),
  OTP_MAX_PER_IDENTIFIER_PER_HOUR: z.coerce.number().int().positive().default(5),
  OTP_MAX_PER_IP_PER_HOUR: z.coerce.number().int().positive().default(20),
  OTP_PEPPER: z
    .string()
    .min(32, 'OTP_PEPPER must be at least 32 characters long'),
  OTP_EXPOSE_IN_RESPONSE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  /**
   * Staging deploy par OTP_EXPOSE_IN_RESPONSE=true karva devu, bhale
   * NODE_ENV=production hoy.
   *
   * ⚠️ Aa on hoy tyare koi pan vyakti gme te number no OTP maangi ne code
   * response ma j mele — etle gme te account ma login thai shake. FAKT
   * evi deploy par jya khota users nathi. Real users aave e pehla kaadhi
   * naakhvu.
   */
  ALLOW_OTP_EXPOSE_IN_PROD: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  DEFAULT_COUNTRY_CODE: z.string().length(2).default('IN'),

  // "abcd.myshopify.com" — protocol ke trailing slash vagar
  SHOPIFY_STORE_DOMAIN: z.string().optional().default(''),
  SHOPIFY_API_VERSION: z.string().optional().default('2026-07'),

  // Dev Dashboard app credentials. Static shpat_ token no jamano gayo —
  // aa be thi client_credentials grant kari ne 24-kalak vaalo token levo pade.
  SHOPIFY_CLIENT_ID: z.string().optional().default(''),
  SHOPIFY_CLIENT_SECRET: z.string().optional().default(''),

  /**
   * App ma signup thay etle Shopify ma pan customer banaavvo?
   *
   * true  → app no user Shopify admin ma dekhaay, ane (email verify thay
   *         pachhi) website par pan login kari shake
   * false → Shopify ma fakt tyare bane jyare kharekhar order thay
   *
   * Dhyaan: true rakhso to je users kyarey nahi kharide e badha pan Shopify
   * na customer list ma aavse.
   */
  SHOPIFY_CREATE_CUSTOMER_ON_SIGNUP: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  // Phase 2 no switch: 'shopify' (live API) → 'db' (Postgres).
  PRODUCT_SOURCE: z.enum(['shopify', 'db']).default('shopify'),

  // Proxy mode ma cache optional nathi — Shopify no rate limit cost-based
  // chhe ane mobile app na dar scroll e API hit thay chhe.
  PRODUCT_LIST_CACHE_TTL: z.coerce.number().int().positive().default(300),
  PRODUCT_DETAIL_CACHE_TTL: z.coerce.number().int().positive().default(180),

  // Collections products karta ochha badlaay chhe (merchant mahina e ek vaar
  // navu category banaave), etle TTL lambo rakhi shakay — home page ni
  // categories row dar vakhte Shopify sudhi na jaay.
  COLLECTION_LIST_CACHE_TTL: z.coerce.number().int().positive().default(600),
  COLLECTION_DETAIL_CACHE_TTL: z.coerce.number().int().positive().default(600),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  // Production ma dev-only escape hatch band hovo j joiye — sivay ke staging
  // deploy par ALLOW_OTP_EXPOSE_IN_PROD thi jaanijoine kholvama aavyo hoy.
  if (
    parsed.data.NODE_ENV === 'production' &&
    parsed.data.OTP_EXPOSE_IN_RESPONSE &&
    !parsed.data.ALLOW_OTP_EXPOSE_IN_PROD
  ) {
    throw new Error(
      'OTP_EXPOSE_IN_RESPONSE cannot be true in production — it leaks the OTP in the API response. ' +
        'If you really need it on staging, set ALLOW_OTP_EXPOSE_IN_PROD=true.',
    );
  }

  return parsed.data;
}
