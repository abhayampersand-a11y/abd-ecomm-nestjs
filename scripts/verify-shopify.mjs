#!/usr/bin/env node
/**
 * Shopify connection + queries verify kare chhe.
 *
 *   npm run shopify:verify
 *
 * Kem jaruri chhe: GraphQL queries ma field na naam khota hoy to Shopify
 * spashta error aape chhe — pan e error tyare j dekhaay jyare koi API call
 * kare. Aa script badhu ek j vaar ma check kari le chhe, jethi app chalu
 * karya pehla khabar padi jaay.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// -- .env vaanchо (dotenv dependency vagar) --------------------------------
const env = {};
for (const line of readFileSync(join(root, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
}

const SHOP = env.SHOPIFY_STORE_DOMAIN;
const VERSION = env.SHOPIFY_API_VERSION;
const CLIENT_ID = env.SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = env.SHOPIFY_CLIENT_SECRET;

const c = {
  ok: (s) => `\x1b[32m${s}\x1b[0m`,
  bad: (s) => `\x1b[31m${s}\x1b[0m`,
  warn: (s) => `\x1b[33m${s}\x1b[0m`,
  dim: (s) => `\x1b[90m${s}\x1b[0m`,
};

if (!SHOP || !CLIENT_ID || !CLIENT_SECRET) {
  console.error(c.bad('\n  .env adhuru chhe.\n'));
  console.error('  Aa tran joiye:');
  console.error(`    SHOPIFY_STORE_DOMAIN   ${SHOP ? c.ok('✓') : c.bad('✗ khali')}`);
  console.error(`    SHOPIFY_CLIENT_ID      ${CLIENT_ID ? c.ok('✓') : c.bad('✗ khali')}`);
  console.error(`    SHOPIFY_CLIENT_SECRET  ${CLIENT_SECRET ? c.ok('✓') : c.bad('✗ khali')}`);
  console.error(c.dim('\n  Dev Dashboard → abd-mobile-api → Settings\n'));
  process.exit(1);
}

console.log(`\n  Store    ${SHOP}`);
console.log(`  Version  ${VERSION}\n`);

// -- 1. Token --------------------------------------------------------------
process.stdout.write('  1. Access token levo... ');

const tokenRes = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  }),
});

if (!tokenRes.ok) {
  console.log(c.bad('FAIL'));
  const body = await tokenRes.text();

  // Shopify aa errors HTML page tarike aape chhe, JSON ma nahi — etle
  // title mathi j saacho karan kaadhi laiye chhiye.
  if (/app_not_installed/.test(body)) {
    console.log(c.bad('\n     app_not_installed'));
    console.log('\n     App banelu chhe pan store par INSTALL nathi thai.');
    console.log('     Fix: Dev Dashboard → app nu naam (daabi baaju upar) →');
    console.log(`          Home page nichhe scroll → "Install app" → ${SHOP.replace('.myshopify.com', '')} → Install\n`);
  } else if (/invalid_client|unauthorized_client/.test(body)) {
    console.log(c.bad('\n     invalid_client'));
    console.log('\n     Client ID ke Secret khoto chhe.');
    console.log('     Fix: Dev Dashboard → app → Settings ma thi fari copy karo\n');
  } else {
    console.log(c.bad(`\n     HTTP ${tokenRes.status}`));
    console.log(`     ${body.slice(0, 400)}\n`);
    console.log('     Sambhavit karano:');
    console.log('       - Client ID / Secret khota chhe');
    console.log('       - App store par install nathi thai');
    console.log('       - Store domain khoto chhe\n');
  }
  process.exit(1);
}

const { access_token: TOKEN, scope, expires_in } = await tokenRes.json();
console.log(c.ok('OK'));
console.log(c.dim(`     ${Math.round(expires_in / 3600)} kalak valid`));
console.log(c.dim(`     scopes: ${scope}\n`));

// -- helper ----------------------------------------------------------------
async function gql(label, query, variables) {
  process.stdout.write(`  ${label}... `);

  const res = await fetch(`https://${SHOP}/admin/api/${VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query, variables }),
  });

  const body = await res.json();

  if (body.errors?.length) {
    console.log(c.bad('FAIL'));
    for (const e of body.errors) {
      console.log(c.bad(`     ${e.message}`));
    }
    console.log(
      c.dim('\n     Fix: src/shopify/queries/product.queries.ts ma e field sudharo.'),
    );
    console.log(
      c.dim(`     Field shodhva: https://shopify.dev/docs/api/admin-graphql/${VERSION}/queries/products\n`),
    );
    return null;
  }

  const cost = body.extensions?.cost;
  console.log(c.ok('OK'));
  if (cost) {
    const t = cost.throttleStatus;
    console.log(
      c.dim(
        `     cost ${cost.actualQueryCost} · bucket ${t.currentlyAvailable}/${t.maximumAvailable} · restore ${t.restoreRate}/s`,
      ),
    );
  }
  return body.data;
}

// -- 2. Shop reachable -----------------------------------------------------
const shopData = await gql(
  '2. Shop connection',
  '{ shop { name myshopifyDomain currencyCode plan { displayName } } }',
);
if (!shopData) process.exit(1);
console.log(
  c.dim(
    `     ${shopData.shop.name} · ${shopData.shop.currencyCode} · ${shopData.shop.plan.displayName}\n`,
  ),
);

// -- 3. Products list query (aapdi asli query) -----------------------------
const listQuery = `
  query ProductsList($first: Int!, $query: String, $sortKey: ProductSortKeys, $reverse: Boolean) {
    products(first: $first, query: $query, sortKey: $sortKey, reverse: $reverse) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id handle title vendor productType tags status
        totalInventory tracksInventory updatedAt
        priceRangeV2 {
          minVariantPrice { amount currencyCode }
          maxVariantPrice { amount currencyCode }
        }
        compareAtPriceRange { maxVariantCompareAtPrice { amount currencyCode } }
        featuredMedia { ... on MediaImage { alt image { url width height } } }
      }
    }
  }`;

const listData = await gql('3. Products list query', listQuery, {
  first: 3,
  query: 'status:ACTIVE',
  sortKey: 'CREATED_AT',
  reverse: true,
});
if (!listData) process.exit(1);

const products = listData.products.nodes;
console.log(c.dim(`     ${products.length} product(s) malya`));
for (const p of products) {
  const price = p.priceRangeV2.minVariantPrice;
  console.log(
    c.dim(`       · ${p.handle}  ${price.currencyCode} ${price.amount}  "${p.title}"`),
  );
}
console.log();

if (products.length === 0) {
  console.log(c.warn('  ⚠ Store ma ek pan ACTIVE product nathi — detail query skip.\n'));
  process.exit(0);
}

// -- 4. Product detail query -----------------------------------------------
const detailQuery = `
  query ProductDetail($handle: String!) {
    productByIdentifier(identifier: { handle: $handle }) {
      id handle title description status
      media(first: 5) { nodes { ... on MediaImage { alt image { url width height } } } }
      variants(first: 100) {
        nodes {
          id title sku availableForSale inventoryQuantity
          price compareAtPrice
          selectedOptions { name value }
        }
      }
    }
  }`;

const handle = products[0].handle;
const detailData = await gql(`4. Product detail query (${handle})`, detailQuery, {
  handle,
});
if (!detailData) process.exit(1);

const detail = detailData.productByIdentifier;
if (!detail) {
  console.log(c.bad(`     productByIdentifier e null aapyu — handle lookup kaam nathi karto\n`));
  process.exit(1);
}
console.log(
  c.dim(
    `     ${detail.variants.nodes.length} variant(s) · ${detail.media.nodes.length} image(s)\n`,
  ),
);

// -- 5. Orders scope -------------------------------------------------------
const ordersData = await gql(
  '5. Orders access',
  '{ orders(first: 1, sortKey: CREATED_AT, reverse: true) { nodes { id name createdAt } } }',
);

if (ordersData) {
  const o = ordersData.orders.nodes[0];
  console.log(c.dim(`     ${o ? `chhello order: ${o.name} (${o.createdAt.slice(0, 10)})` : 'koi order nathi'}`));
  console.log(
    c.warn(
      '     ⚠ read_all_orders scope vagar fakt chhella 60 divas na orders male chhe.',
    ),
  );
  console.log(
    c.dim('       Aakhi history mate Shopify pase thi e scope approve karaavvo pade.\n'),
  );
}

// -- 6. Collections list query ---------------------------------------------
const collectionsQuery = `
  query CollectionsList($first: Int!, $sortKey: CollectionSortKeys, $reverse: Boolean) {
    collections(first: $first, sortKey: $sortKey, reverse: $reverse) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id handle title updatedAt
        productsCount { count }
        image { url altText width height }
      }
    }
  }`;

const collectionsData = await gql('6. Collections list query', collectionsQuery, {
  first: 5,
  sortKey: 'TITLE',
  reverse: false,
});
if (!collectionsData) process.exit(1);

const collections = collectionsData.collections.nodes;
console.log(c.dim(`     ${collections.length} collection(s) malya`));
for (const col of collections) {
  console.log(
    c.dim(
      `       · ${col.handle}  ${col.productsCount?.count ?? '?'} products  "${col.title}"`,
    ),
  );
}
console.log();

if (collections.length === 0) {
  console.log(c.warn('  ⚠ Store ma ek pan collection nathi — baki na checks skip.\n'));
  process.exit(0);
}

// Jena ma kharekhar products hoy evu collection pasand kariye — khali
// collection thi products query "pass" to thaay pan kai verify na thaay.
const col = collections.find((x) => (x.productsCount?.count ?? 0) > 0) ?? collections[0];

// -- 7. Collection detail query --------------------------------------------
const colDetailQuery = `
  query CollectionDetail($handle: String!) {
    collectionByIdentifier(identifier: { handle: $handle }) {
      id handle title updatedAt description
      productsCount { count }
      image { url altText width height }
    }
  }`;

const colDetailData = await gql(
  `7. Collection detail query (${col.handle})`,
  colDetailQuery,
  { handle: col.handle },
);
if (!colDetailData) process.exit(1);

if (!colDetailData.collectionByIdentifier) {
  console.log(
    c.bad('     collectionByIdentifier e null aapyu — handle lookup kaam nathi karto\n'),
  );
  process.exit(1);
}
console.log();

// -- 8. Collection products query ------------------------------------------
const colProductsQuery = `
  query CollectionProducts($handle: String!, $first: Int!, $sortKey: ProductCollectionSortKeys, $reverse: Boolean) {
    collectionByIdentifier(identifier: { handle: $handle }) {
      id
      products(first: $first, after: null, sortKey: $sortKey, reverse: $reverse) {
        pageInfo { hasNextPage endCursor }
        nodes { handle title status }
      }
    }
  }`;

const colProductsData = await gql(
  `8. Collection products query (${col.handle})`,
  colProductsQuery,
  { handle: col.handle, first: 5, sortKey: 'COLLECTION_DEFAULT', reverse: false },
);
if (!colProductsData) process.exit(1);

const colProducts = colProductsData.collectionByIdentifier?.products.nodes ?? [];
const inactive = colProducts.filter((p) => p.status !== 'ACTIVE').length;

console.log(c.dim(`     ${colProducts.length} product(s) malya`));
for (const p of colProducts) {
  console.log(c.dim(`       · ${p.handle} [${p.status}]`));
}
if (inactive > 0) {
  console.log(
    c.dim(
      `     ${inactive} draft/archived — repository ma filter thai jashe ` +
        '(Collection.products par query arg nathi)',
    ),
  );
}
console.log();

console.log(c.ok('  ✓ Badhu barabar chhe. `npm run start:dev` chalavo.\n'));
