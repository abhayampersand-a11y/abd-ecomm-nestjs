/**
 * Shopify na GraphQL ids `gid://shopify/Customer/8823` swaroop na hoy chhe.
 * Aapne DB ma fakt numeric bhaag saachviye chhiye (juna REST ids sathe pan
 * e j male chhe), etle dar boundary par converts karvu pade.
 */

/** `gid://shopify/Customer/8823` → `8823` */
export function idFromGid(gid: string): string {
  return gid.split('/').pop() ?? gid;
}

/** `8823` → `gid://shopify/Customer/8823` (pehla thi gid hoy to jem chhe tem) */
export function gidFor(type: string, id: string): string {
  return id.startsWith('gid://') ? id : `gid://shopify/${type}/${id}`;
}
