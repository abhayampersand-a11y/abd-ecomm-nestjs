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
        message: 'Atyare service uplabdh nathi. Thodi vaar pachhi try karo.',
        error: 'Service Unavailable',
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}

export class ShopifyConfigException extends Error {
  constructor(missing: string) {
    super(
      `Shopify config adhuru chhe: ${missing}. ` +
        `.env ma SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID ane ` +
        `SHOPIFY_CLIENT_SECRET bharo (Dev Dashboard → app → Settings).`,
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
