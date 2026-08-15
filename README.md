# abd-ecomm-nestjs

Shopify par chalti website ni upar aapno potano API layer. Mobile app **fakt aa
API** ne call kare chhe — Shopify ne direct kyarey nahi.

**Phase 1 (atyare):** Products/orders Shopify mathi live (proxy mode).
Auth + identity **aapdo potano**, Postgres ma.

**Phase 2 (pachhi):** Shopify no data Postgres ma import (Bulk Operations API),
pachhi read source Shopify thi Postgres par flip.

---

## Kem auth day-1 thi aapdo chhe

Baaki badhu pachhi badli shakay — **auth nahi**. Shopify customer na password
hashes kyarey nathi aapatu. Etle jo login Shopify par depend hoy, to migration
vakhte **badha users ne forced password reset** karvo pade.

Solution: password migrate karvano prayatn j nathi karyo. **OTP-first login**
chhe, ane `passwordHash` nullable chhe (ghana users ne kyarey password hase j nahi).

---

## Setup

```bash
npm install
docker compose up -d          # Postgres :5434, Redis :6380
cp .env.example .env          # pachhi secrets badlo
npx prisma migrate dev
npm run start:dev             # http://localhost:3001/api/v1
```

> **Ports:** aa machine par 5432 (native Postgres), 6379 (bija project no redis)
> ane 3000 already vaparaay chhe, etle 5434 / 6380 / 3001 vaparya chhe.

Dev ma `OTP_PROVIDER=console` chhe — **OTP terminal ma print thay chhe**, SMS
gateway ni jarur nathi. `OTP_EXPOSE_IN_RESPONSE=true` hoy to API response ma pan
`devCode` aave chhe (production ma aa app boot j nahi thava de).

---

## API

Badha routes `/api/v1` prefix sathe.

### Login / Signup — ek j flow

| Method | Route | Auth | Kaam |
|---|---|---|---|
| POST | `/auth/otp/request` | — | Phone ya email par OTP mokle |
| POST | `/auth/otp/verify` | — | OTP verify → tokens. Navo user hoy to ahiya j bane |
| POST | `/auth/token/refresh` | — | Access token renew (rotation sathe) |
| POST | `/auth/logout` | ✅ | Aa device no logout |
| POST | `/auth/logout-all` | ✅ | Badha devices |
| GET | `/auth/me` | ✅ | Profile + badha verified identifiers |
| PATCH | `/auth/me` | ✅ | Registration screen — firstName, lastName, email |

> **`PATCH /auth/me` no email verified NATHI.** E `contactEmail` ma jaay chhe,
> `primaryEmail` ma nahi — profile ma `emailVerified: false` j rahese. Aa vagar
> koi bija no email type karine ena account sudhi pahonchi shakat. Juna orders
> mate user e ene identity-linking thi verify karvo padse.

```bash
# 1. OTP maango — phone ke email, ek j field
curl -X POST localhost:3001/api/v1/auth/otp/request \
  -H 'content-type: application/json' \
  -d '{"identifier":"9876543210"}'

# { "sent": true, "sentTo": "+91******3210", "expiresAt": "...",
#   "resendAfterSeconds": 60, "devCode": "483920" }

# 2. Verify
curl -X POST localhost:3001/api/v1/auth/otp/verify \
  -H 'content-type: application/json' \
  -d '{"identifier":"9876543210","code":"483920","deviceId":"pixel-8"}'

# { "isNewUser": true, "linkedShopifyRecords": 0,
#   "customer": { "id": "...", "phone": "+919876543210", ... },
#   "tokens": { "accessToken": "...", "refreshToken": "...", "expiresIn": 900 } }
```

### "Juna orders nathi dekhata?" — identity linking

| Method | Route | Auth | Kaam |
|---|---|---|---|
| POST | `/auth/identities/request-otp` | ✅ | Bijo email/phone add karva OTP |
| POST | `/auth/identities/verify` | ✅ | Verify + e identifier na Shopify records link |

User e phone thi login karyu, pan website par na juna orders guest checkout ma
**alag email** thi hata. E email ahiya verify kare etle e orders ena account
sathe jodai jaay chhe.

### Addresses

| Method | Route | Auth | Kaam |
|---|---|---|---|
| GET | `/addresses` | ✅ | List (default sauthi upar) |
| POST | `/addresses` | ✅ | Ummervo (dedupe sathe) |
| PATCH | `/addresses/:id` | ✅ | Partial update |
| DELETE | `/addresses/:id` | ✅ | Kaadhvo |
| POST | `/addresses/:id/default` | ✅ | Default banaavvo |
| POST | `/addresses/import-from-orders` | ✅ | Juna orders mathi import |

Addresses **aapda Postgres ma** chhe, Shopify ma nahi — etle migration vakhte
sathe aavse.

**Dedupe:** ek j address 15 juna orders ma hoy to pan ek j vaar save thay chhe.
Fingerprint case/spacing/punctuation kaadhi ne banave chhe, etle
`"A-101, Shanti Nagar"` ane `"a 101 shanti nagar"` ek j ganay chhe.

**"Fetch my shipping addresses based on past order"** checkbox → app e login
**pachhi** `/addresses/import-from-orders` call karvanu, `otp/verify` ma nahi.
Kem: Shopify dhimu ke down hoy to pan login atkavo na joiye.

> ⚠️ **Aa feature `read_all_orders` vagar khali j aavse.** Shopify default ma
> fakt chhella 60 divas na orders aape chhe. Response nu
> `limitedToRecentOrders: true` aa j batave chhe.

### Products

| Method | Route | Auth | Kaam |
|---|---|---|---|
| GET | `/products` | — | Listing: search, filter, cursor pagination |
| GET | `/products/:id` | — | Detail (`:id` = handle/slug) |

```bash
curl "localhost:3001/api/v1/products?limit=20&sort=newest&tag=silk"
curl "localhost:3001/api/v1/products/blue-cotton-saree"
```

Query params: `limit` (1–50), `cursor`, `search`, `type`, `vendor`, `tag`,
`sort` (`newest` · `oldest` · `title` · `updated` · `relevance`).

> **Price sort kem nathi?** Shopify na Admin API ma products connection par
> price no sort key j nathi. Phase 2 ma data Postgres ma aavse tyare
> `price_asc`/`price_desc` ummerashe — fakt `DbProductRepository` ma, mobile
> app ma ek line pan badlava vagar.

---

## Shopify setup

1 January 2026 thi **legacy custom apps band** chhe, etle Admin ma "Develop
apps → Create an app" nathi. Dev Dashboard vaparvu pade chhe — ane tya static
`shpat_` token pan nathi malto.

**App banaavvi:** [Dev Dashboard](https://dev.shopify.com/dashboard) → Create app
→ Start from Dev Dashboard → **Versions** tab ma scopes bharо → Release →
**Home** → Install app → **Settings** ma Client ID + Secret.

`.env` ma:
```bash
SHOPIFY_STORE_DOMAIN="paithanic.myshopify.com"   # https:// ke trailing / vagar
SHOPIFY_CLIENT_ID="..."
SHOPIFY_CLIENT_SECRET="..."
```

**Pachhi verify karo:**
```bash
npm run shopify:verify
```

Aa script token le chhe, badhi GraphQL queries chalave chhe, ane koi field
khoto hoy to **exact naam sathe** kahi de chhe. App chalu karya pehla aa
chalavvu — nahi to bhool tyare khabar padse jyare mobile app call karshe.

**Token 24 kalak ma expire thay chhe** — `ShopifyTokenService` apne-aap
sambhale chhe (memory + Redis cache, single-flight, expire thata 5 min pehla
refresh). Tamare kai karvanu nathi.

---

## Shopify customer sync — ane Paithanic ni ek khaas haqiqat

`SHOPIFY_CREATE_CUSTOMER_ON_SIGNUP=true` hoy to app ma signup thay etle Shopify
ma pan customer bane chhe (`mobile-app` tag sathe), jethi team ne admin ma
dekhaay ane website par pan e j vyakti tarike ole khaay.

### ⚠️ Store ni haqiqat je aa flow nakki kare chhe

**Paithanic na juna customers pase fakt EMAIL chhe — phone nathi.** (Store na
10 recent customers check karya: dar ek ma `phone: null`.)

Aapdo app **phone** thi login kare chhe. Etle juno grahak app ma aave tyare
phone thi Shopify ma **kai j nathi malto** — ane e edge case nathi, aa j
**default case** chhe.

Etle flow aa rite chale chhe:

```
1. Juno grahak app ma phone thi login kare
      → Shopify ma phone thi kai na male (ena record ma phone chhe j nahi)
      → aapne phone-only record banaviye  ← atyare aa duplicate chhe

2. E potano email verify kare  ← AA STEP J BADHU JODE CHHE
      → Shopify ma eno JUNO record male (15 orders sathe)
      → juno record primary bane
      → juna record par phone set thay (have thi phone thi pan malse)
      → aapne banaavelo khali record DELETE thay
      → website login pan chalu (Shopify email par code mokle chhe)
```

Aa `IdentityService.reconcileAfterEmailVerified()` ma chhe.

**Kram bahu important chhe:** orphan **pehla** delete, **pachhi** phone set.
Shopify ma phone unique chhe — ulto kram karo to `"Phone has already been
taken"` aave chhe ane juno record kayamı phone vagar rahi jaay chhe.
(Aa bug pakadaayo hato, test #5 ma.)

### Etle app ma email verification jaruri chhe

Aa store mate email verify karvu **optional nathi** — juna grahak ne enu
history, addresses ane website login apaavvano **ekmatra** raasto e j chhe.
App ma aa step ne aagal laavvo:

> *"Juna orders joVA chho? Tamaro email verify karo"*

### Website login

| App user | Website par login? |
|---|---|
| Fakt phone verify karyu | ❌ nahi — Shopify email par code mokle chhe |
| Email pan verify karyu | ✅ haa |

**Multipass** (aapda system thi Shopify ma SSO) aa problem no asli ukel chhe,
pan e **fakt Shopify Plus** par male chhe — Paithanic `Basic` plan par chhe.

---

## Security — je jaan-bujhi ne aa rite chhe

| | Kem |
|---|---|
| **Enumeration proof** | `/auth/otp/request` no response hammesha ek j — number registered chhe ke nahi e kyarey nathi kehtu. Nahi to script chalavi ne customer list kadhi shakay |
| **OTP hashed** | DB ma HMAC-SHA256(code + identifier + purpose, pepper). Plain code kyarey store nathi thato. Identifier sathe bandhelo chhe, etle ek no code bija par na chale |
| **3-layer rate limit** | Cooldown (60s) + per-identifier/hour + per-IP/hour. SMS bombing thi gateway balance bachave chhe |
| **Attempt cap** | 5 khota attempts pachhi OTP marii jaay chhe |
| **Timing-safe compare** | `crypto.timingSafeEqual` — timing thi code guess na thai shake |
| **Refresh rotation + reuse detection** | Har refresh e navo token. Juno token fari vaparaay = chori no signal → **aakhi family revoke** |
| **Refresh hashed at rest** | DB leak thay to pan session hijack na thai shake |
| **Verified-only matching** | Order linking FAKT `customer_identities` na verified values par. Un-verified email par match karso to **bija na orders leak thashe** |
| **Identity theft block** | Bija e verify karelo email claim na thai shake |

---

## Migration ne sacha rakhva mate na rules

### 1. Shopify na shapes mobile app sudhi na pahonchava
`src/common/dto/product.dto.ts` ane `src/auth/dto/auth-response.dto.ts` —
aa j mobile app no contract chhe. `gid://shopify/...`, `edges[].node`,
`priceRangeV2` — aa kyarey response ma na aave.

Product no public identifier eno **handle** chhe, Shopify no numeric id nahi.
Kem: handle aapdo potano data chhe ane Phase 2 ma `products` table ma e j
unique column tarike aavse — etle app ni saachvelī links ane deep links
migration pachhi pan chalti rahese.

### 2. Data source swap ek j jagya e
`ProductRepository` interface (`src/products/product.repository.ts`).
Phase 2 ma `DbProductRepository` lakhо, `products.module.ts` na factory ma
case ummero, `.env` ma `PRODUCT_SOURCE=db` karo. `ProductsService`,
controller ane mobile app — tran ma thi ek pan nathi badlavanu.

### 3. Provider swap ek j jagya e
`OtpSender` interface (`src/auth/otp/otp-sender.interface.ts`). MSG91 joiye
tyare: e sender class lakho, `auth.module.ts` na factory ma case add karo,
`.env` ma `OTP_PROVIDER` badlo. `OtpService` ne khabar pan nahi pade.

### 4. Login identity kyarey Shopify ni nahi
`Customer.id` (aapdu UUID) j identity chhe. Shopify na IDs `ShopifyCustomerLink`
ma **link** tarike chhe — ek vyakti na ghana Shopify records hoi shake.

### 5. Shopify sathe vaat fakt `src/shopify/` mathi
Bija koi module e `fetch()` thi Shopify ne call na karvu. Migration vakhte aa
ek folder kaadhi naakhvanu chhe — e tyare j sahelu rahese jyare enu kaam
ahiya j simit hoy.

---

## Data model

```
Customer                 aapdi login identity (Shopify thi swatantra)
  └─ CustomerIdentity    VERIFIED phone/email — order matching aa par j thay
  └─ ShopifyCustomerLink ek vyakti = ghana Shopify customer records
  └─ Address             aapda DB ma; juna orders mathi import thai shake
  └─ RefreshToken        hashed, rotating, family sathe
  └─ DeviceToken         push notifications

OtpCode                  hashed, one-time, attempt-capped
```

**`primaryPhone` / `primaryEmail` vs `contactEmail`** — aa farak security no
paayo chhe:

| Field | Kya thi aave | Login lookup ma vaparaay? |
|---|---|---|
| `primaryPhone` / `primaryEmail` | **Verified** OTP, ke Shopify import | ✅ haa |
| `contactEmail` | User e registration screen ma type karyu | ❌ **kyarey nahi** |

Un-verified value `primaryEmail` ma naakhso to koi bija no email type karine
ena account sudhi pahonchi shakse.

`CustomerStatus`: `IMPORTED` (Shopify mathi aavyo, haju verify nathi thayo —
**login allowed nathi**) → `ACTIVE` (OTP verify thayo) · `MERGED` (duplicate,
bija record ma merge) · `BLOCKED`

---

## Have pachhi (order matters)

1. **`read_all_orders` scope Shopify pase thi aaje request karo.** Default ma app
   ne fakt **chhella 60 divas** na orders male chhe. Approval ma time lage chhe —
   Phase 2 ma khabar padshe to weeks atki jashe. Same rite **protected customer
   data** access pan check kari lo.
2. Collections (category browsing) — products jevo j pattern
3. Cart Postgres ma (aapno potano — checkout time e Storefront API thi
   `checkoutUrl` levu ane app ma kholvu)
4. Orders read + `ShopifyCustomerLink` thi filter
5. Real OTP sender (MSG91)
6. **Phase 2**: Bulk Operations API import → `shopify_customers` mirror →
   `IdentityService.linkShopifyRecords()` nu body bharvu (call sites already
   ready chhe) → `DbProductRepository` → `PRODUCT_SOURCE=db`

---

## Scripts

```bash
npm run shopify:verify   # Shopify connection + queries check
npm run start:dev        # watch mode
npm run db:up            # docker compose up -d
npx prisma studio        # DB GUI
npx prisma migrate dev   # navi migration
npx tsc --noEmit -p tsconfig.build.json   # type check
```
