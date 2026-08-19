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

  // ---------------------------------------------------------------------------
  // Admin panel — EK j admin user chhe, roles nathi.
  //
  // Etle credentials DB ma nahi pan env ma j chhe: koi admin-users table, koi
  // seed script, koi "forgot password" flow — kai j nahi. Password badalvo hoy
  // to navo hash banaavi ne deploy karvano:  npm run admin:hash
  // ---------------------------------------------------------------------------

  /** Khaali rakho to aakhu /admin/* band rahe chhe (fail-closed). */
  ADMIN_EMAIL: z.string().optional().default(''),

  /** Argon2id hash. Banaavva mate: npm run admin:hash */
  ADMIN_PASSWORD_HASH: z.string().optional().default(''),

  /**
   * FAKT local development mate — plain password, hash vagar.
   * Production ma aa set karso to app boot j nahi thay (juo validateEnv).
   */
  ADMIN_PASSWORD: z.string().optional().default(''),

  /**
   * ⚠️ JWT_ACCESS_SECRET thi ALAG j hovo joiye.
   *
   * Ek j secret raakhso to grahak no access token admin routes par pan chaali
   * jashe — vachche fakt payload no `typ` field ubho rahe chhe, ane ek din
   * koi e check bhuli jashe.
   */
  JWT_ADMIN_SECRET: z.string().optional().default(''),

  /** Admin session ni lambai. Refresh token nathi — pachhi fari login. */
  JWT_ADMIN_TTL: z.coerce.number().int().positive().default(28800),

  /** Aatla khota password pachhi e IP par thi login lock thai jaay chhe. */
  // ---------------------------------------------------------------------------
  // App content (CMS) ane push notifications
  // ---------------------------------------------------------------------------

  /**
   * Home layout, banners, pages, FAQ — app na dar launch e vanchay chhe ane
   * mahine ek vaar badlaay chhe. Etle TTL lambo rakhi shakay; admin kai badle
   * etle cache turat jate saaf thai jaay chhe.
   */
  CONTENT_CACHE_TTL: z.coerce.number().int().positive().default(600),

  /**
   * console = terminal ma print (dev). fcm = Firebase Cloud Messaging.
   *
   * OTP_PROVIDER jevo j dhancho: navo provider joiye tyare ek sender class
   * lakhvo ane ahiya case ummerivo — NotificationsService ne khabar pan
   * nahi pade.
   */
  PUSH_PROVIDER: z.enum(['console', 'fcm']).default('console'),

  /** Firebase service account nu JSON (aakhu, ek line ma) — PUSH_PROVIDER=fcm mate */
  FCM_SERVICE_ACCOUNT_JSON: z.string().optional().default(''),

  /**
   * Ek vaar ma ketla devices ne mokalvu.
   *
   * FCM ni potani had 500 ni chhe. Aa thi motto batch karso to provider j
   * na paadse — ane 40,000 ne ek sathe mokalvani koshish karso to memory
   * ma 40,000 messages ubha rahese.
   */
  PUSH_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(100),

  ADMIN_MAX_LOGIN_ATTEMPTS: z.coerce.number().int().positive().default(10),
  ADMIN_LOGIN_LOCK_SECONDS: z.coerce.number().int().positive().default(900),

  DEFAULT_COUNTRY_CODE: z.string().length(2).default('IN'),

  // "abcd.myshopify.com" — protocol ke trailing slash vagar
  SHOPIFY_STORE_DOMAIN: z.string().optional().default(''),
  SHOPIFY_API_VERSION: z.string().optional().default('2026-07'),

  // Dev Dashboard app credentials. Static shpat_ token no jamano gayo —
  // aa be thi client_credentials grant kari ne 24-kalak vaalo token levo pade.
  SHOPIFY_CLIENT_ID: z.string().optional().default(''),
  SHOPIFY_CLIENT_SECRET: z.string().optional().default(''),

  /**
   * Storefront API token — cart ane checkout mate.
   *
   * ⚠️ Aa upar na Admin credentials thi TADDAN ALAG chhe. Admin API store
   * chalavva mate chhe (products, orders vaanchvа); Storefront API grahak na
   * cart ane checkout mate. Endpoint alag, header alag, token alag.
   *
   * `storefrontAccessTokenCreate` mutation thi bane chhe (Admin API thi),
   * ane e expire nathi thato — etle `.env` ma sidho mukay chhe.
   */
  SHOPIFY_STOREFRONT_TOKEN: z.string().optional().default(''),

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

  /**
   * Orders no cache TTL ટૂંકો j rakhvo.
   *
   * Order nu status badlaay chhe — "Unfulfilled" mathi "Fulfilled", tracking
   * number aave. Grahak parcel ni raah joto hoy tyare vaar vaar kholshe, ane
   * 5 minute juno status batavso to e vichaarse ke app kaam nathi karti.
   *
   * Cache atyare fakt Shopify na cost-based rate limit mate chhe (order
   * queries nested lineItems sathe bhaari chhe), speed mate nahi.
   */
  ORDER_LIST_CACHE_TTL: z.coerce.number().int().positive().default(60),
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

  assertAdminConfigIsSane(parsed.data);

  return parsed.data;
}

/**
 * Admin panel adhuru configure thayelu na rahi jaay.
 *
 * Sauthi kharaab halat e chhe jya ADMIN_EMAIL to set hoy pan secret nabdo hoy
 * — tyare panel kholelu chhe ane koi ne khabar pan nathi. Etle niyam saado
 * chhe: kaa to badhu barabar, kaa to admin aakhu band. Vachche kai nahi.
 */
function assertAdminConfigIsSane(env: Env): void {
  if (!env.ADMIN_EMAIL) return;

  const problems: string[] = [];

  if (env.JWT_ADMIN_SECRET.length < 32) {
    problems.push(
      'JWT_ADMIN_SECRET must be at least 32 characters long when ADMIN_EMAIL is set',
    );
  }

  if (env.JWT_ADMIN_SECRET && env.JWT_ADMIN_SECRET === env.JWT_ACCESS_SECRET) {
    problems.push(
      'JWT_ADMIN_SECRET must be different from JWT_ACCESS_SECRET — ' +
        'sharing one secret lets a customer token reach the admin endpoints',
    );
  }

  if (!env.ADMIN_PASSWORD_HASH && !env.ADMIN_PASSWORD) {
    problems.push(
      'ADMIN_PASSWORD_HASH is required when ADMIN_EMAIL is set ' +
        '(generate it with: npm run admin:hash)',
    );
  }

  if (env.NODE_ENV === 'production' && env.ADMIN_PASSWORD) {
    problems.push(
      'ADMIN_PASSWORD (plain text) cannot be used in production — ' +
        'use ADMIN_PASSWORD_HASH instead',
    );
  }

  if (problems.length) {
    const details = problems.map((p) => `  - ${p}`).join('\n');
    throw new Error(`Invalid admin configuration:\n${details}`);
  }
}
