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

**Aa app ma KYARE puchhvu e code jetlu j agatya nu chhe** — onboarding ma
puchho to Shopify no duplicate bane j nahi; order pachhi puchho to merge par
aavvu pade chhe. Juo [App ma identity linking KYARE puchhvu](#app-ma-identity-linking-kyare-puchhvu).

Response:

```jsonc
{
  "linkedShopifyRecords": 2,   // ketla juna Shopify records jodaaya
  "importedAddresses": 3,      // ketla addresses aavya
  "customer": { /* CustomerProfileDto */ }
}
```

Aa be aankdа user ne batavva jevi chhe — *"5 juna orders ane 2 addresses
malya"* — nahi to ene khabar j nathi padti ke kai thayu.

`409 Conflict` aave to eno matlab: **bija koi app account e aa email/phone
pehla thi verify karelo chhe.** Aa jate resolve nathi thai shakto — user ne
support taraf mokalvo.

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

### Orders

| Method | Route | Auth | Kaam |
|---|---|---|---|
| GET | `/orders` | ✅ | Potana orders, navo pehla, cursor pagination |
| GET | `/orders/:id` | ✅ | Detail (`:id` = order name `#` vagar) |

```bash
curl -H "Authorization: Bearer $TOKEN" "localhost:3001/api/v1/orders?limit=20"
curl -H "Authorization: Bearer $TOKEN" "localhost:3001/api/v1/orders/PBG1036"
```

`:id` e order nu naam chhe (`PBG1036`) — e j je grahak ni rasid par chhape
chhe. Products ma handle vaparyo, ahiya order name: Shopify na numeric ids
server ni bahar kyarey nathi jata.

> **Security — aa module ma be layer chhe.** `customerId` hammesha token
> mathi j aave chhe, ane orders fakt e `shopifyCustomerId` na j male chhe je
> **verified** identifier parthi jodaya hoy (`ShopifyCustomerLink`). Query ma
> `customer_id:` filter to chhe j, pan `ShopifyOrderService` javaab aavya
> pachhi **fari** check kare chhe — karan ke Shopify no search fuzzy chhe
> (e j paath `ShopifyCustomerService.actuallyMatches()` ma pan chhe).
>
> Bija no order maangso to `404 Order not found` male chhe, `403` nahi —
> "aa order chhe pan tamaro nathi" evu kehvu pan ek leak chhe.

> **⚠️ `read_all_orders` vagar fakt 60 divas na orders male chhe.** Navi
> jagya e deploy karo tyare `npm run shopify:scopes` sauthi pehla chalavvu.

### Cart

| Method | Route | Auth | Kaam |
|---|---|---|---|
| GET | `/cart` | ✅ | Aakho cart |
| POST | `/cart/items` | ✅ | Add to cart |
| PATCH | `/cart/items/:id` | ✅ | Quantity badalvu |
| DELETE | `/cart/items/:id` | ✅ | Line kaadhvi |
| DELETE | `/cart` | ✅ | Cart khali karvo |
| POST | `/cart/discount` | ✅ | Voucher lagaadvo |
| DELETE | `/cart/discount` | ✅ | Voucher kaadhvo |

Cart **aapdo potano chhe** — Postgres ma, Shopify ma nahi. Kem: Shopify no cart
Storefront API ni session par ubho chhe; aapno DB ma hoy to user app fari
install kare ke bija phone par login kare, cart tya no tya rahe chhe.

Dar method **aakho cart** pacho aape chhe (fakt badlayeli line nahi), jethi app
ne subtotal ane badge mate biji call na karvi pade.

> **⚠️ `subtotal` e final rakam NATHI.** Fakt lines no saravalo chhe. Shipping,
> tax ane discount **Shopify checkout** ganse. App ma ene "Subtotal" j kehvu,
> "Total" kyarey nahi — nahi to grahak ne checkout ma biji rakam dekhaay ane
> bharoso tooti jaay.
>
> E j kaarane `POST /cart/discount` code ne **fakt saachve chhe**, valid chhe ke
> nahi e nathi joto. Shopify na discount niyamo (min amount, aa collection j,
> tarikh) ahiya fari lakhso to ek din mel nahi khaay.

### Checkout

| Method | Route | Auth | Kaam |
|---|---|---|---|
| POST | `/checkout` | ✅ | Cart → Shopify → `checkoutUrl` |

```json
{ "checkoutUrl": "https://paithanic.com/cart/c/…", "cartToken": "gid://…", "itemCount": 2 }
```

App e `checkoutUrl` **Checkout Sheet Kit** ma kholvu — browser ma nahi, nahi to
grahak app ni bahar nikli jaay chhe ane pacho nathi aavto. Sheet ma UPI, card,
netbanking ane COD — badhu Shopify sambhale chhe, ane **order Shopify ma j bane
chhe** (etle admin ane website banne ma dekhaay chhe).

Aa **Storefront API** vaapre chhe — `SHOPIFY_STOREFRONT_TOKEN`, je Admin
credentials thi **taddan alag** chhe (alag endpoint, alag header, ane aa token
expire nathi thato).

> **⚠️ `buyerIdentity` j aa aakha endpoint no jeev chhe.**
>
> E vagar order **guest order** tarike banse — `order.customer` null hase — ane
> `GET /orders` ene **kyarey nahi batave** (e `customer_id:` par filter kare chhe).
> Etle grahak na paisa jaay, order Shopify ma hoy, ane app ma "no orders yet"
> dekhaay.
>
> Ahiya **fakt verified** value j jaay chhe (`primaryEmail` / `primaryPhone`) —
> `contactEmail` kyarey nahi, nahi to grahak bija no email type kare ane eno
> order bija na account ma chadi jaay.

### Wishlist ane recently viewed

| Method | Route | Auth | Kaam |
|---|---|---|---|
| GET | `/wishlist` | ✅ | Wishlist (product summaries) |
| POST | `/wishlist/:productId` | ✅ | Ummervu (`productId` = handle) |
| DELETE | `/wishlist/:productId` | ✅ | Kaadhvu |
| GET | `/recently-viewed` | ✅ | Chhella 20 |
| POST | `/recently-viewed/:productId` | ✅ | Product page khulyu — 204 |

Shopify ma aa concept **j nathi** (na wishlist, na browsing history), etle aa
Phase 2 ma pan aapda DB ma j rahese.

Aapne fakt `productHandle` saachviye chhiye, aakhu product nahi — bhaav ane
stock badlaata rahe chhe, ane wishlist ma juno bhaav batavvo grahak sathe
anyaay chhe.

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

**Scopes:**

| Scope | Kem |
|---|---|
| `read_all_orders` | **Aa vagar Shopify fakt chhella 60 divas na orders aape chhe.** Juna grahak nu history j nahi male. |
| `read_orders`, `read_products`, `read_inventory` | catalog ane order history |
| `write_customers` | customer create/update (naam, email, phone) |
| `write_draft_orders` | checkout |
| `read_customer_merge` + `write_customer_merge` | duplicate customer records ne bhega karva. ⚠️ Aa `write_customers` ma **AAVI JATA NATHI** — alag thi maangva pade chhe. |

Chhella be vagar app chale chhe, pan ek chokkas halat ma Shopify ma duplicate
customer kayami rahi jaay chhe — juo [Reconcile](#reconcile--be-rasta-ane-kayo-laagu-pade-e-ek-j-vaat-par-aadhaar-rakhe).

```bash
npm run shopify:scopes   # Shopify e KHAREKHAR kaya scopes aapya e batave
```

Aa `npm run shopify:verify` karta alag chhe: Dev Dashboard ma scope umeri ne
release karo to pan Shopify e chup-chaap kaadhi shake chhe (approval na hoy
tyare). Tyare koi error nathi aavto — scope just gaayab hoy chhe.

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

Aakhu customer base scan karyu (742 records, Feb 2023 – Aug 2026):

| | count | % |
|---|---|---|
| `customer.phone` chhe | 643 | 86.7% |
| `customer.email` chhe | 102 | 13.7% |

Pan **je grahako e kharekhar order karyo chhe** (106) e alag chitra aape chhe:

| | count |
|---|---|
| fakt email (phone nathi) | 62 |
| fakt phone (email nathi) | 43 |
| **banne** | **1** |

**Aa "1" j aakhi architecture nu karan chhe.** Ek pan channel ekalo puro nathi:
fakt email par match karo to 43 buyers gum, fakt phone par karo to 62 gum.
Etle `CustomerIdentity` + `ShopifyCustomerLink` — ek vyakti na ghana
verified identifiers ane ghana Shopify records.

Aapdo app **phone** thi login kare chhe (base no 86.7% phone par chhe, ane
India ma e j swabhavik chhe). Pan juno *buyer* motabhage email-only hoy chhe —
etle ena mate phone thi Shopify ma **kai j nathi malto**, ane aapne ena mate
navo record banaviye chhiye. E duplicate ne pachhi sudhaarvo pade chhe.

### Reconcile — be rasta, ane kayo laagu pade e ek j vaat par aadhaar rakhe

```
1. Juno grahak app ma phone thi login kare
      → Shopify ma phone thi kai na male (ena record ma phone chhe j nahi)
      → aapne phone-only record "A" banaviye  ← atyare aa duplicate chhe

2. E potano email verify kare  ← AA STEP J BADHU JODE CHHE
      → Shopify ma eno JUNO record "B" male (15 orders sathe)
      → B primary bane, links ma A ane B banne rahe
      → ane pachhi A nu su karvu? Aa "A par order chhe ke nahi" par aadhaar rakhe:

         A par order NATHI  →  customerDelete       (saaf, sasto)
         A par order CHHE   →  customerMerge        (Shopify ma bhega kare)
```

Aa `IdentityService.reconcileAfterEmailVerified()` ma chhe.

**Kram bahu important chhe:** orphan **pehla** jato rahe, **pachhi** phone set
thay. Shopify ma phone unique chhe — ulto kram karo to `"Phone has already
been taken"` aave chhe ane juno record kayamı phone vagar rahi jaay chhe.
(Aa bug pakadaayo hato, test #5 ma.)

Merge ma aa `overrideFields.customerIdOfPhoneNumberToKeep` thi handle thay
chhe — phone A parthi B par pahonchi jaay chhe, alag call vagar.

**Merge async chhe.** Shopify turat `resultingCustomerId` aape chhe pan kaam
background job ma thay chhe. Etle:

- `resultingCustomerId` par j bharoso rakhvo — "moto record bachse" evu
  **maani levu nahi**, Shopify jate nakki kare chhe
- merge pachhi turat e record vaanchso to juno data dekhai shake

**Badha records merge nathi thai shakta.** Active subscription, gift card,
store credit, pending data request — aavu kai hoy to Shopify na paade chhe.
Etle `customerMergePreview` pehla chale chhe, ane block thay to record
`warn` sathe rahi jaay chhe (manual review). Data kyarey gum nathi thato:
banne records links ma rahe chhe, etle app ma order history to puri j dekhaay
chhe — nuksan fakt Shopify admin ni baaju no duplicate chhe.

### App ma identity linking KYARE puchhvu

Aa store mate email verify karvu **optional nathi** — juna grahak ne enu
history, addresses ane website login apaavvano **ekmatra** raasto e j chhe.

Pan *kyare* puchho chho e etlu j agatya nu chhe. **Order pehla puchho to
delete no saaf raasto male chhe; order pachhi puchho to merge par aavvu pade
chhe — ane merge block thai shake chhe.**

| Kshan | Kem |
|---|---|
| **1. Onboarding (registration screen)** | Sauthi svachh. Haju ek pan order nathi, etle orphan delete thai jaay ane duplicate bane j nahi. Aa **default** raasto hovo joiye. |
| **2. Orders screen no banner** | `emailVerified: false` hoy tyare. *"Juna orders nathi dekhata? Email verify karo."* |
| **3. Checkout pehla** | **Chhelli svachh kshan.** Fakt phone verified hoy to email maango — **order bane e pehla**. |
| **4. Profile → manage email/phone** | Hammesha rakho, pan fakt aana par bharoso na rakho — motabhaag na users tya jataa j nathi. |

**Kyare nahi:** background ma chup-chaap kyarey nahi — e OTP mokle chhe, etle
hammesha user-initiated hovu joiye. `PATCH /auth/me` ma email aapya pachhi
aapo-aap OTP na mokalo; user ne "Verify" dabaavva do.

**App ne kevi rite khabar pade ke puchhvu ke nahi** — `GET /auth/me` parthi,
navu field kai joiytu nathi:

| `email` | `emailVerified` | App su batave |
|---|---|---|
| `null` | `false` | *"Add your email to see your past orders"* |
| set | `false` | *"Verify \<email\> to see your past orders"* (prefill karo) |
| set | `true` | kai nahi — thai gayu |

⚠️ `PATCH /auth/me` no email **fakt `contactEmail`** ma jaay chhe — verified
nathi, etle order matching ma kyarey nathi vaparato ane Shopify par pan nathi
jato. Ene `/auth/identities/verify` thi verify karo tyare j e `primaryEmail`
bane chhe ane badhu jodaay chhe.

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

## Deploy

⚠️ **Migration jate NATHI chalti.** Aa repo ma Dockerfile ke CI config nathi,
`start:prod` fakt `node dist/main` chhe, ane `PrismaService` fakt `$connect()`
kare chhe. Etle deploy na dar step ma migration **jate** chalavvi padse:

```bash
npm ci
npm run build
npm run prisma:deploy        # ⚠️ prisma:migrate NAHI — e `migrate dev` chhe
npm run start:prod
```

**Migration chukаi jaay to shu thay:** app boot thai jashe ane logs saaf hashe —
Prisma schema check nathi karto. Error tyare aavse jyare grahak endpoint hit
kare (`table "carts" does not exist`). Etle deploy safal dekhaay ane bhaangelu
hoy — sauthi kharaab combination.

**Dar deploy pehla env check karo:**

| Key | Kem |
|---|---|
| `SHOPIFY_STOREFRONT_TOKEN` | Aa vagar app boot thashe pan **checkout fail thashe**. Store-specific chhe — biju store, bijo token. |
| `OTP_EXPOSE_IN_RESPONSE` | Production ma `false`. `true` hoy to app **boot j nahi thay** (guard chhe) — e jaan-bujhi ne chhe. |
| `DATABASE_URL` `REDIS_URL` `JWT_ACCESS_SECRET` `OTP_PEPPER` | Aa chaar ma default nathi — na hoy to boot fail. |

Baaki na 28 env keys ma default chhe.

---

## Have pachhi (order matters)

1. ~~`read_all_orders` scope~~ ✅ **thai gayu** — approval joityu j nahi
   (potana store ni app hati). `npm run shopify:scopes` thi verify thay chhe.
2. ~~Collections (category browsing)~~ ✅
3. ~~Orders read + `ShopifyCustomerLink` thi filter~~ ✅ — juo `src/orders/`
4. Cart Postgres ma (aapno potano — checkout time e Storefront API thi
   `checkoutUrl` levu ane app ma kholvu)
5. Real OTP sender (MSG91)
6. **Phase 2**: Bulk Operations API import → `shopify_customers` mirror →
   `IdentityService.linkShopifyRecords()` nu body bharvu (call sites already
   ready chhe) → `DbProductRepository` → `PRODUCT_SOURCE=db`

---

## Scripts

```bash
npm run shopify:scopes   # Shopify e KHAREKHAR aapela scopes (read_all_orders?)
npm run shopify:verify   # Shopify connection + queries check
npm run prisma:deploy    # PRODUCTION ni migration (migrate deploy)
npm run start:dev        # watch mode
npm run db:up            # docker compose up -d
npx prisma studio        # DB GUI
npx prisma migrate dev   # navi migration
npx tsc --noEmit -p tsconfig.build.json   # type check
```
