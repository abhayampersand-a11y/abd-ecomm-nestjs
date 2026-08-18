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

/**
 * Aa vagar app chale chhe — pan ek chokkas halat ma Shopify ma duplicate
 * customer kayami rahi jaay chhe: user phone thi signup kare, APP MA THI
 * ORDER KARE, ane PACHHI potano email verify kare. Tyare aapne banaavelo
 * record delete nathi thai shakto (ena par order chhe), etle merge j raasto
 * chhe — ane merge ne aa be scopes joiye chhe.
 *
 * ⚠️ Aa `write_customers` ma AAVI JATA NATHI. Alag thi maangva pade chhe.
 */
const MERGE = ['read_customer_merge', 'write_customer_merge'];
console.log('');

let missing = false;
for (const need of CRITICAL) {
  const has = granted.includes(need);
  console.log(`  ${has ? '✅' : '❌'} ${need}`);
  if (!has) missing = true;
}

const missingMerge = MERGE.filter((s) => !granted.includes(s));
for (const need of MERGE) {
  console.log(`  ${granted.includes(need) ? '✅' : '⚠️ '} ${need}`);
}

if (missing) {
  console.log(
    '\n`read_all_orders` nathi — Shopify fakt CHHELLA 60 DIVAS na orders aapse.\n' +
      'Dev Dashboard → Versions → Create version → scopes ma umero → Release,\n' +
      'pachhi Overview → Installs → Install app (navi permission approve karva).\n',
  );
  process.exit(1);
}

if (missingMerge.length) {
  console.log(
    `\n${missingMerge.join(' ane ')} nathi — app chale chhe, pan customer\n` +
      'MERGE nahi thai shake. Aeni asar: user phone thi signup kare, app ma thi\n' +
      'order kare, ane pachhi email verify kare — to Shopify ma e vyakti na BE\n' +
      'records kayami rahi jashe (app ma order history to puri j dekhaashe).\n' +
      'Log ma "merge preview failed" dekhaay to karan aa j chhe.\n\n' +
      'Umerva mate: Dev Dashboard → Versions → Create version → scopes → Release,\n' +
      'pachhi Overview → Installs → Install app (navi permission approve karva).\n',
  );
}

console.log('\nBadhu barabar.\n');
