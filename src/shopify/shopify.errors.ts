import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Shopify ni andar ni bhool mobile app sudhi as-is na jaay.
 * App ne hammesha aapdo saaf error male chhe; Shopify no original detail
 * fakt logs ma jaay chhe.
 */
export class ShopifyUnavailableException extends HttpException {
  constructor(readonly detail: string) {
    super(
      {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        message: 'Service is currently unavailable. Please try again shortly.',
        error: 'Service Unavailable',
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}

export class ShopifyConfigException extends Error {
  constructor(missing: string) {
    super(
      `Shopify config is incomplete: ${missing}. ` +
        `Set SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID and ` +
        `SHOPIFY_CLIENT_SECRET in .env (Dev Dashboard → app → Settings).`,
    );
    this.name = 'ShopifyConfigException';
  }
}

/** Internal — GraphQL layer ni bhool. Controller sudhi nathi pahonchti. */
export class ShopifyGraphqlError extends Error {
  constructor(
    message: string,
    readonly code: string | undefined,
    readonly raw: unknown,
  ) {
    super(message);
    this.name = 'ShopifyGraphqlError';
  }
}
