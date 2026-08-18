/**
 * Shopify e AAPELA scopes batave chhe — je maangya e nahi, je kharekhar malya e.
 *
 * Aa farak agatya no chhe: Dev Dashboard ma scope umerine release karo to pan
 * Shopify e chup-chaap kaadhi shake chhe (approval na hoy tyare). Tyare koi
 * error nathi aavto — scope just gaayab hoy chhe. Aa script e j pakde chhe.
 *
 * ⚠️ Redis cache ne BYPASS kare chhe — sidho Shopify ne puchhe chhe. Etle
 * scope badlya pachhi turat chalavi shakay, cache saaf karya vagar.
 *
 *   npm run shopify:scopes
 */
import { readFileSync } from 'node:fs';

const env = {};
for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}

const domain = env.SHOPIFY_STORE_DOMAIN;
if (!domain || !env.SHOPIFY_CLIENT_ID || !env.SHOPIFY_CLIENT_SECRET) {
  console.error('.env ma SHOPIFY_STORE_DOMAIN / CLIENT_ID / CLIENT_SECRET joiye');
  process.exit(1);
}

const res = await fetch(`https://${domain}/admin/oauth/access_token`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: env.SHOPIFY_CLIENT_ID,
    client_secret: env.SHOPIFY_CLIENT_SECRET,
  }),
});

if (!res.ok) {
  console.error(`Token request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  process.exit(1);
}

// ⚠️ Token KYAREY print na karvo — fakt scopes
const { scope } = await res.json();
const granted = scope.split(',').map((s) => s.trim()).sort();

console.log(`\n${domain} — Shopify e aapela scopes:\n`);
for (const s of granted) console.log(`  ${s}`);

/** Aa vagar orders fakt 60 divas na male chhe */
const CRITICAL = ['read_all_orders'];
console.log('');

let missing = false;
for (const need of CRITICAL) {
  const has = granted.includes(need);
  console.log(`  ${has ? '✅' : '❌'} ${need}`);
  if (!has) missing = true;
}

if (missing) {
  console.log(
    '\n`read_all_orders` nathi — Shopify fakt CHHELLA 60 DIVAS na orders aapse.\n' +
      'Dev Dashboard → Versions → Create version → scopes ma umero → Release,\n' +
      'pachhi Overview → Installs → Install app (navi permission approve karva).\n',
  );
  process.exit(1);
}

console.log('\nBadhu barabar.\n');
