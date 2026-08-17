import type {
  CollectionDto,
  CollectionSummaryDto,
} from '../../common/dto/collection.dto';
import type { ImageDto } from '../../common/dto/product.dto';
import type {
  RawCollectionCard,
  RawCollectionDetail,
  RawCollectionImage,
} from '../queries/collection.queries';

/**
 * ⚠️ AA PAN DIVAAL CHHE — product.mapper.ts jevi j.
 *
 * Shopify no collection andar aave chhe, aapdo `CollectionDto` bahar jaay chhe.
 * Phase 2 ma Postgres source banse tyare ek navo mapper (db → same DTO)
 * lakhvano, ane mobile app ne khabar pan nahi pade.
 */

/**
 * Collection nu image `Image` type chhe (product nu `MediaImage` chhe), etle
 * ahiya `altText` chhe ane tya `alt`. Aa j kaarne product.mapper no `image()`
 * ahiya fari nathi vaparaato.
 */
function image(raw: RawCollectionImage | null | undefined): ImageDto | null {
  if (!raw?.url) return null;
  return {
    url: raw.url,
    // Shopify khali alt mate "" aape chhe — product mapper jevo j niyam:
    // "alt nathi" ane "alt khali chhe" app mate ek j vaat chhe.
    alt: raw.altText?.trim() ? raw.altText : null,
    width: raw.width,
    height: raw.height,
  };
}

export function toCollectionSummaryDto(
  raw: RawCollectionCard,
): CollectionSummaryDto {
  return {
    id: raw.handle,
    title: raw.title,
    image: image(raw.image),
    productCount: raw.productsCount?.count ?? null,
    updatedAt: raw.updatedAt,
  };
}

export function toCollectionDto(raw: RawCollectionDetail): CollectionDto {
  return {
    ...toCollectionSummaryDto(raw),
    description: raw.description ?? '',
  };
}
