/**
 * ⚠️ MOBILE APP NO CONTRACT — [product.dto.ts](./product.dto.ts) jevo j niyam.
 *
 * Ahiya Shopify nu kai j na aave. `gid://shopify/Collection/123`, `edges[].node`,
 * `ruleSet`, `sortOrder` — kai nahi.
 *
 * IDENTIFIERS:
 *
 *   CollectionSummaryDto.id = collection no HANDLE (slug), numeric id nahi.
 *     ProductDto.id jevu j kaaran: handle aapdo potano data chhe ane Phase 2 ma
 *     collections table ma e j unique column banse. App ni deep links ane
 *     saachvelī category navigation kaam karti rahese.
 */

import type { ImageDto } from './product.dto';

export interface CollectionSummaryDto {
  /** Handle / slug — listing, detail ane products badha ma aa j identifier */
  id: string;
  title: string;
  /**
   * Category circle / card mate. Collection ne potanu image na hoy to `null` —
   * app tyare fallback (pehla product nu image, ke placeholder) daakhvi shake.
   */
  image: ImageDto | null;
  /**
   * Aa collection ma ketla products chhe.
   *
   * ⚠️ Aa aankdo Shopify no chhe, etle ema draft/archived products pan ganay
   * chhe — jyare `/collections/:id/products` fakt ACTIVE aape chhe. Etle aa
   * ne "aashre" tarike j vaparvo, "N products" heading mate thik chhe, pan
   * pagination na hisaab mate nahi.
   */
  productCount: number | null;
  updatedAt: string;
}

export interface CollectionDto extends CollectionSummaryDto {
  /** Plain text — HTML jaan-bujhi ne nathi mokalto, app ne render karvu pade */
  description: string;
}
