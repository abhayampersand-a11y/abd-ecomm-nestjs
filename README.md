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

## Integration docs

`docs/` ma screen-wise integration guides chhe — kai screen par kai API,
kaya kram ma, ane response nu su karvu:

| Document | Kona mate |
|---|---|
| [Mobile app integration](./docs/mobile-app-integration.md) | App team — screen by screen |
| [Admin panel integration](./docs/admin-panel-integration.md) | Panel team — screen by screen |
| [Figma changes needed](./docs/figma-changes.md) | Design — je screens/specs khoote chhe |

Aa README **su** ane **kem** kahe chhe; e docs **kya** kahe chhe.

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
| PATCH | `/auth/me` | ✅ | Profile edit — firstName, lastName, gender |

> **`PATCH /auth/me` EMAIL NATHI leto.** Un-verified email store karvano
> concept j kaadhi nakhyo chhe. Email account par aavvano **ekmatra** raasto
> `/auth/identities/request-otp` → `/auth/identities/verify` chhe. Aa vagar
> koi bija no email type karine ena juna orders sudhi pahonchi shakat.
>
> **Signup par koi form nathi.** OTP verify pachhi user sidho app ma jaay
> chhe. Naam pehli address save thay tyare tya thi bharaay chhe.

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
> Ahiya **fakt verified** value j jaay chhe (`primaryEmail` / `primaryPhone`).
> Un-verified email system ma kyanya store j nathi thato, etle ahiya khoto
> email pahonchvano koi raasto j nathi.

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

### Creator program (influencer)

**Grahak ni baaju** — login joiye, pan influencer hovu jaruri nathi:

| Method | Route | Auth | Kaam |
|---|---|---|---|
| POST | `/influencer/apply` | ✅ | Creator banva ni request |
| GET | `/influencer/application` | ✅ | Potani request nu status (`null` = kyarey apply nathi karyu) |
| GET | `/influencer/me` | ✅ | Creator profile (approve thayo hoy to j) |

**Admin ni baaju** — `AdminJwtGuard`, alag token:

| Method | Route | Kaam |
|---|---|---|
| GET | `/admin/influencer-applications` | Review queue (search, status, sort, paging) |
| GET | `/admin/influencer-applications/pending-count` | Sidebar badge |
| GET | `/admin/influencer-applications/:id` | Detail |
| POST | `/admin/influencer-applications/:id/approve` | Gate 1 — approve |
| POST | `/admin/influencer-applications/:id/reject` | Kaaran farjiyat (10-500 chars) |

**Influencer ALAG account nathi.** E j `Customer` chhe jene ek vadharani
bhumika mali chhe — `Influencer` row `customerId` par unique chhe ane
`Customer` ni upar hangs. Etle e badhu j karta rahe chhe je pehla karto hato:
browse, cart, checkout, orders. Approve thavathi ek vibhag **khulе** chhe, kai
**chhinvaatu** nathi.

Trann vaato jaan-bujhi ne aa rite chhe:

**PAN kyarey aakho bahar nathi jato.** Admin ne pan `ABC****34F` j male chhe.
Panel ni screen office ma khulli padi hoy chhe ane koi pan pasar thato vaanchi
shake. Aakho PAN payout vakhte DB mathi jate kaadhvano.

**Approve ek j transaction ma chhe** — application update + `Influencer`
create sathe. Vachche fail thay to application "APPROVED" dekhaay pan grahak
pase creator access na hoy: e aa feature nu sauthi gundhaayelu support ticket
hot.

**Reject thaya pachhi 30 divas ni raah.** Aa vagar e j vyakti roj savare fari
apply kare ane queue e naam thi bharai jaay jene admin pehla thi joi chukyo
chhe. Response ma `canReapplyAt` aave chhe, etle app tarikh daakhvi shake.

Ek grahak ni ek j vakhte **ek j PENDING application** — ane e niyam **Postgres
na partial unique index** thi lagu thay chhe, fakt service na check thi nahi.
Aa Prisma schema thi nathi thai shakto etle migration ma hathe lakhyo chhe. Be
tap ek sathe padе tyare service no check bacha nathi karto; index kare chhe.

---

---

### App content — banners, home layout, pages, FAQ

| Method | Route | Auth | Kaam |
|---|---|---|---|
| GET | `/content/home` | — | **Aakhu home screen**, ek j call ma |
| GET | `/content/banners?placement=home` | — | Ek jagya na banners |
| GET | `/content/pages` | — | About / Terms / Privacy ni list |
| GET | `/content/pages/:slug` | — | Page nu majkur |
| GET | `/content/faqs` | — | FAQ |
| GET | `/content/coupons` | — | App ma batavvana offer codes |

Home screen nu layout **app ma hard-coded nathi** — `/content/home` no javaab
j nakki kare chhe ke kaya sections, kaya kram ma, ane ander su. Etle "aa
mahine banner upar, next mahine bestsellers upar" mate app release ni raah
jovi nathi padti; admin panel ma save karo etle turat.

```jsonc
// GET /content/home
{
  "sections": [
    { "type": "BANNER_CAROUSEL", "banners": [ /* ... */ ], "products": [], "collections": [] },
    { "type": "COLLECTION_ROW", "title": "New in", "reference": "sarees",
      "products": [ /* ProductSummaryDto */ ], "banners": [], "collections": [] }
  ]
}
```

> **App e ajaanyo `type` CHUP-CHAAP CHHODI DEVANO.** Aa ek niyam j aapne navo
> section type ummervani chhut aape chhe — juna app versions ene fakt jota
> nathi, crash nathi thata. Aa na paLaay to dar navo section type ek forced
> app update bani jaay chhe.

Ek section bhaange (collection Shopify ma delete thai gayu) to **e j section**
gum thay chhe, aakhu home nahi — grahak ne khali screen batavvi e sauthi
kharaab javaab chhe.

⚠️ `/content/coupons` na codes **valid chhe evi koi khaatri nathi**. Discount
Shopify ma bane chhe ane validate pan Shopify checkout j kare chhe; aa table
fakt "grahak ne su batavvu" nu list chhe.

---

### Push notifications — device token

| Method | Route | Auth | Kaam |
|---|---|---|---|
| POST | `/notifications/device-token` | ✅ | FCM/APNs token register/update |
| DELETE | `/notifications/device-token` | ✅ | Logout vakhte kaadhvo |

```bash
curl -X POST localhost:3001/api/v1/notifications/device-token \
  -H "authorization: Bearer $ACCESS_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"platform":"ANDROID","token":"fcm-token-here","deviceId":"pixel-8"}'
```

App e aa **dar launch e** call karvi — FCM/APNs tokens jate badlaata rahe chhe,
ane juno token vaparso to notification kyaay nahi pahonche **ane koi error pan
nahi aave**.

Token par upsert thay chhe, customer par nahi: ek j vyakti na traN devices hoi
shake, ane ek j device par be loko vaari-fari ne login kari shake. Bije kisse
`customerId` update thavo j joiye — nahi to juna user na notifications nava
user na phone par jashe.

Logout vakhte `DELETE` call karvo. Na karo to e phone par juna user na
notifications aavta rahese.

Dev ma `PUSH_PROVIDER=console` chhe — push **terminal ma print thay chhe**,
Firebase project ni jarur nathi.

---

## Admin panel

Badha routes `/api/v1/admin/*` par. **Ek j admin user chhe — roles nathi**,
etle na `admin_users` table, na signup, na "forgot password". Credentials env
ma chhe.

```bash
npm run admin:hash -- "your-strong-password"                              # hash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"  # secret
```

```dotenv
ADMIN_EMAIL="admin@yourstore.com"
ADMIN_PASSWORD_HASH="$argon2id$..."
JWT_ADMIN_SECRET="..."        # JWT_ACCESS_SECRET thi ALAG
```

`ADMIN_EMAIL` khaali rakho to **aakhu `/admin/*` band** — fail-closed. Password
badalvo etle navo hash deploy karvano.

### Kem alag secret

| | Kem |
|---|---|
| **Alag JWT secret** | Ek j secret raakho to grahak no access token admin routes par pan chaali jaay — vachche fakt payload no `typ` field ubho rahe, ane ek din koi e check bhuli jashe. `JWT_ADMIN_SECRET === JWT_ACCESS_SECRET` hoy to **app boot j nathi thato**. |
| **Alag strategy** | `'admin-jwt'` vs `'jwt'`. Guard bhulthi badlaai jaay to request 401 thai jaay chhe, chup-chaap pass nathi thati. |
| **Refresh token nathi** | Ek vyakti, browser ma bethelo, 8 kalak ni session. Rotation na aakha tantra ni ahiya kimat nathi. |
| **Login lockout** | 10 khota password pachhi e IP 15 minute band — throttler thi alag layer chhe (e request-rate rokE chhe, aa password-guessing). |
| **Logout kharekhar logout chhe** | JWT pacho na levaay, etle eno `jti` Redis ni revoke-list ma jaay chhe — token ni baaki life jetla samay mate. |

### Auth

| Method | Route | Kaam |
|---|---|---|
| POST | `/admin/auth/login` | email + password → 8 kalak no token |
| POST | `/admin/auth/logout` | Token turat nakamo |
| GET | `/admin/auth/me` | Session chalu chhe ke nahi |

### Dashboard

| Method | Route | Kaam |
|---|---|---|
| GET | `/admin/dashboard/summary` | Customers, sessions, carts, engagement, OTP health |
| GET | `/admin/dashboard/signups?days=30` | Line chart |
| GET | `/admin/dashboard/top-products` | Wishlist / views / carts mathi |

> **Ahiya orders ke revenue NATHI** — e Shopify ma chhe. Be jagya e be alag
> aankda dekhaay to koi ek par bharoso rahetо nathi. Aa panel e batave chhe je
> Shopify **nathi** janto: app na users, enu cart, wishlist, sessions, OTP.

### Customers

| Method | Route | Kaam |
|---|---|---|
| GET | `/admin/customers` | Ek j search box — phone, email, naam, uuid, Shopify id |
| GET | `/admin/customers/export` | CSV (max 50k rows) |
| POST | `/admin/customers/merge` | Duplicate merge — `dryRun: true` thi pehla juo |
| GET | `/admin/customers/:id` | Profile + identities + Shopify links + cart |
| PATCH | `/admin/customers/:id` | firstName, lastName, gender |
| POST | `/admin/customers/:id/block` · `/unblock` | Block = login band **+ badhi sessions revoke** |
| POST | `/admin/customers/:id/logout-all` | |
| GET | `/admin/customers/:id/sessions` | Chalu devices + push tokens |
| DELETE | `/admin/customers/:id/sessions/:sessionId` | Ek device kaadho |
| GET | `/admin/customers/:id/orders` | Shopify parthi live (cursor pagination) |
| GET | `/admin/customers/:id/addresses` · `/cart` · `/wishlist` · `/recently-viewed` | |

> **`primaryPhone` / `primaryEmail` admin thi NA badlaay.** E be fields ma fakt
> OTP-verified values j jaay chhe (juo [Data model](#data-model)). Admin ne edit
> karva devathi **ek PATCH thi koi pan account bija na phone par jodai jaay**.
> Kharekhar badalvu hoy to user e potana device par thi OTP verify karvo pade.

**Block** ma fakt status nathi badalto — eno access token haju 15 minute chale
chhe ane refresh token 60 divas, etle banne ahiya j band thay chhe.

**Merge** ma source record **delete kyarey nathi thato**: `MERGED` + `mergedIntoId`
thaay chhe, ane `IdentityService.resolveMergeChain()` juna raste aavelo login
pan saachi jagya e pahonchaadi de chhe.

### Security ane support

| Method | Route | Kaam |
|---|---|---|
| GET | `/admin/security/otp-logs` | "Mane OTP nathi aavto" no javaab |
| GET | `/admin/security/otp-stats?days=7` | SMS gateway ni tabiyat |
| POST | `/admin/security/otp/reset-limits` | Rate limit chhoodavo |
| GET | `/admin/security/sessions` | Atyare kaya devices logged-in |
| GET | `/admin/security/devices` | Push reach (iOS / Android / Web) |

> **`codeHash` ke OTP code ahiya thi kyarey bahar nathi aavto.**
> `reset-limits` fakt Redis na counters saaf kare chhe — OTP mokalto nathi, user
> e jaate "Resend" dabaavvu pade. Admin ne code batavvani sagvad aapo, etle ek
> din e sagvad thi j koi na account ma andar javashe.

`otp-stats` ma sauthi kaam no aankdo **`neverUsed`** chhe: code niklyo pan koi e
vaparyo nahi. E vadhe etle gateway ma kaik bagdyu chhe.

### Carts

| Method | Route | Kaam |
|---|---|---|
| GET | `/admin/carts` | Fakt bharela carts |
| GET | `/admin/carts/abandoned?idleHours=24` | Recovery list |
| GET | `/admin/carts/:id` | Line-by-line |

⚠️ Abandoned list ma **e loko pan aavse jemne kharidi lidhu chhe** — orders
aapda DB ma nathi, etle e khabar padvani rit j nathi. Message mokalta pehla
`/admin/customers/:id/orders` joi levu.

Ane ahiya ni **badhi rakam "estimated" chhe**: cart lines ma add karti vakhte no
bhaav saachvelo chhe. Asli rakam Shopify checkout ganse.

### Content (CMS)

| Method | Route | Kaam |
|---|---|---|
| GET POST PATCH DELETE | `/admin/content/banners` · `/:id` | |
| POST | `/admin/content/banners/reorder` | Drag-drop pachhi **ek j call** |
| GET POST PATCH DELETE | `/admin/content/home-sections` · `/:id` | Home layout |
| POST | `/admin/content/home-sections/reorder` | |
| GET POST PATCH DELETE | `/admin/content/pages` · `/:id` | About, Terms, Privacy |
| GET POST PATCH DELETE | `/admin/content/faqs` · `/:id` | + `/faqs/reorder` |
| GET POST PATCH DELETE | `/admin/content/coupons` · `/:id` | App ma batavvana codes |

Dar write pachhi content cache **jate saaf thay chhe** — save karo etle app ma
turat. (Bhulai jaay to admin ne 10 minute junu dekhaay ane e fari-fari save
karto rahe em samji ne ke kaik bagdyu chhe.)

`isActive` ane schedule (`startsAt` / `endsAt`) alag chhe, etle response ma
**`isLive`** pan aave chhe — "active chhe pan haju shuru nathi thayu" e panel
ma dekhaavu joiye.

Reorder ek transaction ma chhe: kaa to aakho navo kram, kaa to juno. Ek-ek
PATCH mokalso to vachche fail thay ane list adhu-padhu kramai jaay.

> **Image upload aapdi jawabdari ma nathi.** `imageUrl` ma Shopify Files /
> Cloudinary / S3 nu URL chipkaavvanu. Upload andar laavo etle storage,
> resizing, CDN ane cleanup — badhu aapnu thai jaay chhe.

### Push notifications

| Method | Route | Kaam |
|---|---|---|
| GET POST | `/admin/notifications` | Campaigns |
| POST | `/admin/notifications/estimate` | **Mokalva pehla: ketla loko sudhi jashe** |
| GET PATCH DELETE | `/admin/notifications/:id` | Detail ma delivery failures |
| POST | `/admin/notifications/:id/send` | ⚠️ Turat mokle, pachu na levaay |
| POST | `/admin/notifications/:id/cancel` | Scheduled rokvo |
| POST | `/admin/notifications/dispatch-due` | **Cron aa hit kare** |
| GET POST PATCH DELETE | `/admin/notifications/templates` · `/:id` | |

Audience: `ALL` · `SEGMENT` · `CUSTOMER`.
Segments: `ALL_USERS` · `ABANDONED_CART` · `HAS_WISHLIST` · `INACTIVE_30D` · `NEW_LAST_7D`.

Segments **enum** chhe (banner na `placement` thi ultu) karan ke dar segment ni
pachhal ek query code ma lakhelii chhe. Free string rakhiye to admin evu segment
lakhi shake je code ne oLakhaatu j nathi, ane campaign chup-chaap 0 loko sudhi
jaay.

⚠️ Dar segment ma `customer.status = ACTIVE` chhe **ane e kaadhvu nahi** —
block karelo grahak ke merge thai gayelo duplicate record, ene marketing push
mokalvi e sauthi saadi ane sauthi sharmajanak bhool chhe.

**Scheduling ma scheduler nathi.** `@nestjs/schedule` no dependency jaan-bujhi
ne nathi ummeryo (ek j vastu mate aakho package, ane dar instance ma timer =
double send). E badle bahar no cron `POST /admin/notifications/dispatch-due` hit
kare — daa.t. dar 5 minute. Be instances ek sathe hit kare to pan vaandho nahi:
claim `DRAFT|SCHEDULED → SENDING` atomic `updateMany` thi thay chhe.

**Fakt nishfal deliveries store thay chhe.** 40,000 users na broadcast ma
40,000 "sent" rows lakhvi etle ek j campaign ma table fulaai jaay, ane e rows
koi kyarey vaanchtu nathi. Safal no aankdo `sentCount` ma chhe. Provider
"aa token have kayamt mate kharaab chhe" kahe to e token DB mathi **kaadhi
naakhvaay chhe** — nahi to dar campaign e mareli entries par prayatn thato rahe.

### Creator program (influencer)

Applications ni review queue ane enu aakhu tark
[Creator program (influencer)](#creator-program-influencer) ma chhe — ahiya
fakt e j je tya nathi:

| Method | Route | Kaam |
|---|---|---|
| GET | `/admin/influencer-applications?sort=newest` | `sort`: `newest` (default) · `oldest` · `followers` |
| GET | `/admin/influencers?status=ACTIVE` | Approve thai gayela creators |
| POST | `/admin/influencers/:id/suspend` | `reason` farjiyat, min 10 akshar |
| POST | `/admin/influencers/:id/unsuspend` | |

`sort=followers` ek triage nu ojaar chhe, nirnay nu nahi: e aankdo
**applicant e pote** kahelo chhe ane kyarey verify nathi thato.

`sort=oldest` tyare vaparvu jyare queue pachhal padi gai hoy — jene sauthi
vadhu raah joi chhe ene pehla javaab malvo joiye.

**Suspend** ma `reason` farjiyat chhe, reject ni jem: mahina pachhi "aane kem
suspend karyo hato?" no javaab bija kyaay thi nathi malto. Suspend thi juna
reels feed ma thi nikdi jaay chhe ane navu earning band thay chhe — pan wallet
no baaki balance rahe chhe. E kamayela paisa chhe, saja nahi.

Approve/reject/suspend badhu **audit log ma jaay chhe**, kaaran sathe.

### Audit log

| Method | Route | Kaam |
|---|---|---|
| GET | `/admin/audit-logs?entityType=customer&entityId=<uuid>` | Ek record no aakho itihaas |
| GET | `/admin/audit-logs/actions` | Filter dropdown |

Ek j admin chhe, etle "kone karyu?" no sawaal nano chhe — **"kyare ane su
badlyu?" no sawaal moto chhe.** Grahak fariyad kare ke "mane block kem karyo"
ke "mari wishlist kya gai", tyare javaab ahiya thi male chhe.

Actor ane IP `AdminContextInterceptor` (AsyncLocalStorage) thi jate bharaay
chhe — koi service ne e parameters pass karva padta nathi. Bijo rasto e hato ke
dar method ma `actor` parameter ummervo, ane tyare navu method lakhnaar e
parameter pass karvanu bhuli jaay ane audit chup-chaap gum thai jaay.

`AdminAuditService.record()` **kyarey throw nathi karto**: audit lakhvani bhool
thi asli kaam (block, banner update) roLaavu na joiye.

### System / ops

| Method | Route | Kaam |
|---|---|---|
| GET | `/admin/system/status` | Public `/health` nu vistrut roop |
| GET | `/admin/system/address-sync` | Je addresses Shopify sudhi nathi pahonchya |
| POST | `/admin/system/cache/flush` | `products` · `collections` · `orders` · `all` |

### Navo admin route ummero tyare

1. `@UseGuards(AdminJwtGuard)` **controller par** — global guard jaan-bujhi ne
   nathi (baaki badhi app public ke customer-auth vaali chhe). Aa ek line j
   aakha customer database ne bachaave chhe.
2. Badalvanu kaam hoy to `AdminAuditService.record()` call karvo.
3. Vaanchvanu kaam existing services thi levu (`OrdersService`, `CartService`,
   `ContentService`) — query fari lakhso to be jagya e be niyamo bani jashe.

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

| Kshan | Kem | Kadakai |
|---|---|---|
| **1. Checkout pehla** | **Chhelli svachh kshan** — order bane e pehla. Fakt phone verified hoy to ahiya email maango. Aa **mukhya** jagya chhe. | Strong prompt, skippable |
| **2. Orders screen no banner** | `emailVerified: false` hoy tyare. *"Juna orders nathi dekhata? Email verify karo."* | Banner |
| **3. Addresses → "juna address lavo"** | `import-from-orders` / `sync` ne verified email joie chhe. Tya j maango. | On-demand |
| **4. Profile → manage email/phone** | Hammesha rakho, pan fakt aana par bharoso na rakho — motabhaag na users tya jataa j nathi. | Optional |

> ⚠️ **Orders ke addresses ne email pachhal BLOCK na karo.** Fakt phone
> verified hoy evo grahak app ma order kari shake chhe (`buyerIdentity`
> `primaryPhone` pan mokle chhe) ane e order `GET /orders` ma dekhaay pan
> chhe. Ene "pehla email verify karo" kahi ne atkaavso to e potana j orders
> nathi joi shakto. Email **fakt juna (app pehla na) data** mate joie chhe —
> etle banner batavo, darvaajo band na karo.

**Kyare nahi:** background ma chup-chaap kyarey nahi — e OTP mokle chhe, etle
hammesha user-initiated hovu joiye.

**App ne kevi rite khabar pade ke puchhvu ke nahi** — `GET /auth/me` na
`emailVerified` parthi, navu field kai joiytu nathi:

| `emailVerified` | App su batave |
|---|---|
| `false` | *"Add your email to see your past orders"* |
| `true` | kai nahi — thai gayu |

> ⚠️ Profile response ma `email` field **nathi**. Verified email joiye to
> `verifiedIdentifiers` ma `{ type: "EMAIL", value }` tarike male chhe.
>
> Prefill karvanu kai chhe j nahi — app kyarey email collect karti j nathi
> jya sudhi e verify na thaay. Etle input hammesha khaali khule, ane e
> **barabar** chhe: jo prefill thaay to e un-verified value hoy, ane e j
> aakhi samasya hati.

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
| **Admin no alag secret** | `JWT_ADMIN_SECRET` `JWT_ACCESS_SECRET` thi alag hovo j joiye (boot par check). Ek j secret hoy to grahak no token admin routes par chaali jaay — vachche fakt payload no `typ` ubho rahe |
| **Admin login lockout** | 10 khota password pachhi e IP 15 minute band. Throttler request-rate rokE chhe, aa password-guessing |
| **Admin logout kharekhar logout** | `jti` Redis ni revoke-list ma jaay chhe — JWT expire thavani raah nathi jovi padti |
| **PAN masked** | Creator applications ma PAN `ABC****34F` j — panel ni screen kholeli rahe chhe |
| **Push fakt ACTIVE ne** | Dar segment query ma `customer.status = ACTIVE` chhe — blocked ke merged record ne marketing push na jaay |

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
  └─ InfluencerApplication  creator banva ni request (PAN sathe)
  └─ Influencer             approve thayelo creator — customerId par UNIQUE
  └─ Notification           campaign je aa ek grahak ne mokalyu

OtpCode                  hashed, one-time, attempt-capped

App content (CMS)        Shopify ma aa kai j nathi
  Banner                 placement + position + schedule
  HomeSection            home screen no aakho layout
  Page                   About / Terms / Privacy / Return policy
  Faq
  AppCoupon              FAKT batavva mate — validate Shopify checkout kare

Notification             campaign: audience, status, counts
  └─ NotificationDelivery  FAKT nishfal deliveries (safal no aankdo counts ma)
NotificationTemplate     vaar vaar mokalvana messages

AuditLog                 admin e su badlyu — FK nathi, jethi delete/merge
                         thayela records no itihaas pan rahe
```

**`Influencer` `Customer` ne badle nathi, ena upar chhe.** `customerId`
unique chhe, etle ek grahak = ek creator, ane grahak vaala badha endpoints
ene em na em chale chhe.

**`primaryPhone` / `primaryEmail` ma FAKT verified values** — aa security no
paayo chhe:

| Field | Kya thi aave | Login lookup ma vaparaay? |
|---|---|---|
| `primaryPhone` / `primaryEmail` | **Verified** OTP, ke Shopify import | ✅ haa |

Pehla ek `contactEmail` column hato je registration screen no un-verified
email raakhto. **E kaadhi nakhyo chhe** — screen pote pan. Have system ma
un-verified email nu koi thekaanu j nathi, etle "bhoolthi verified gani
levano" jokham **structurally** khatam thai gayu chhe.

Un-verified value `primaryEmail` ma naakhso to koi bija no email type karine
ena account sudhi pahonchi shakse — etle e raasto koḍ ma kyanya chhe j nahi.

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
| `ADMIN_EMAIL` `ADMIN_PASSWORD_HASH` `JWT_ADMIN_SECRET` | Admin panel mate. `ADMIN_EMAIL` khaali = `/admin/*` **band** (fail-closed). `JWT_ADMIN_SECRET` `JWT_ACCESS_SECRET` jevo hoy, ke 32 akshar thi nano hoy, to **app boot j nahi thay**. |
| `ADMIN_PASSWORD` | Production ma set hoy to **app boot j nahi thay** — plain password fakt local dev mate. |
| `PUSH_PROVIDER` | Production ma `fcm` joiye. `console` rehe to campaigns "sent" dekhaashe pan koi na phone par kai nahi jaay. |

Baaki na 28 env keys ma default chhe.

---

## Have pachhi (order matters)

1. ~~`read_all_orders` scope~~ ✅ **thai gayu** — approval joityu j nahi
   (potana store ni app hati). `npm run shopify:scopes` thi verify thay chhe.
2. ~~Collections (category browsing)~~ ✅
3. ~~Orders read + `ShopifyCustomerLink` thi filter~~ ✅ — juo `src/orders/`
4. ~~Cart Postgres ma~~ ✅ — juo `src/cart/` ane `src/checkout/`
5. Real OTP sender (MSG91)
6. **Real push sender (FCM)** — `PUSH_PROVIDER=fcm` no case
   `src/notifications/notifications.module.ts` ma pehla thi taiyar chhe,
   fakt `FcmPushSender` lakhvano baaki chhe (`PushSender` interface).
   Tya sudhi campaigns "sent" dekhaay chhe pan kyaay jata nathi.
7. **Scheduled notifications no cron** — `POST /admin/notifications/dispatch-due`
   ne dar 5 minute hit karvanu goothvvu (Render cron job ke bahar nu koi pan).
   Aa vagar `scheduledAt` vaali campaigns SCHEDULED ma j padi rahe chhe.
6. **Creator program** — juo `docs/reels-and-coin-rewards.pdf`
   - ✅ Phase 1: application flow (`src/influencer/`, `src/admin/influencers/`)
   - Phase 2: product picker → video upload → reel review → feed
   - Phase 3: `reelId` `CartItem` par → checkout `attributes` ma →
     `orders/paid` webhook. **Aa vagar coins no koi matlab nathi** — attribution
     thai j na shake.
   - Phase 4: coin rules + wallet ledger
   - Phase 5: redemption + payout
7. **Phase 2**: Bulk Operations API import → `shopify_customers` mirror →
   `IdentityService.linkShopifyRecords()` nu body bharvu (call sites already
   ready chhe) → `DbProductRepository` → `PRODUCT_SOURCE=db`

---

## Scripts

```bash
npm run admin:hash -- "pw"  # Admin panel no password hash (argon2id)
npm run shopify:scopes   # Shopify e KHAREKHAR aapela scopes (read_all_orders?)
npm run shopify:verify   # Shopify connection + queries check
npm run prisma:deploy    # PRODUCTION ni migration (migrate deploy)
npm run start:dev        # watch mode
npm run db:up            # docker compose up -d
npx prisma studio        # DB GUI
npx prisma migrate dev   # navi migration
npx tsc --noEmit -p tsconfig.build.json   # type check
```
