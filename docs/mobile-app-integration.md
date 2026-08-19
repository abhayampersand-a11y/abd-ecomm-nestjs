# Mobile app integration

Screen by screen: which endpoints fire, in what order, and what the UI does
with each answer.

> **About the screen numbers.** Where a number appears below (screen 09, 10,
> 11, 13, 14, 24, 26, 36) it is taken from a comment in the source code, so it
> is reliable. Screens with no number are the ones the code never names —
> match them to the Figma file yourself and add the number here.
>
> **Screen 05 is gone.** It was the registration form; the API no longer has
> an endpoint behind it. See [Figma changes needed](./figma-changes.md).

---

## 1. Launch

Runs before anything is drawn.

| Order | Call | Auth | Notes |
|---|---|---|---|
| 1 | `GET /content/home` | — | Start it immediately. It needs no token, so it runs in parallel with the session check. |
| 2 | `POST /auth/token/refresh` | — | Only if a refresh token is stored. Body: `{ "refreshToken", "deviceId" }`. |
| 3 | `POST /notifications/device-token` | ✅ | Only after step 2 succeeds **and** push permission is already granted. |

**Why home loads without a token:** a brand-new user sees the home screen
before they ever log in. If the app waits for a session, the first thing a new
install shows is an empty screen — and that is where most of them leave.

**Handling step 2:**

| Result | Do |
|---|---|
| 200 | Store the new token pair. **The old refresh token is now dead** — rotation is on. |
| 401 | Clear stored tokens, treat as logged out. Do not retry: a reused refresh token is read as theft and kills the whole device family. |

---

## 2. Login / signup — one flow

There is no separate signup, and **no registration form**. A new account is
created inside `/auth/otp/verify`, and the user goes straight into the app.

> **Screen 05 no longer exists.** The old first-name / last-name / email step
> was removed. Two things replace it:
>
> - **Name** arrives on its own, from the first delivery address the user
>   saves. The server copies it across (only if the customer has no name yet).
> - **Email** is never collected unverified. It reaches the account only
>   through OTP verification — see 10.3.
>
> `isNewUser: true` therefore no longer means "show a form". It is only
> useful for things like a welcome toast.

### 2.1 Enter phone or email

One input field, not two. `POST /auth/otp/request`

```json
{ "identifier": "9876543210" }
```

`9876543210`, `+91 98765 43210` and `user@gmail.com` are all valid in the same
field — the server works out which it is and normalises it. A phone number
without a country code gets `DEFAULT_COUNTRY_CODE` (IN).

| Response key | UI |
|---|---|
| `sent` | Always `true`. **Never branch on it.** It is identical whether or not the account exists, so that nobody can discover which numbers are registered. |
| `sentTo` | `"+91******3210"` — show this, do not echo the raw input back. |
| `resendAfterSeconds` | Start the resend countdown from this. |
| `devCode` | Development only. Prefill the OTP box with it if present; never show it in a release build. |

**429** carries `retryAfter` in seconds — show a real countdown, not "try
again later".

### 2.2 Enter the code

`POST /auth/otp/verify` with `{ "identifier", "code", "deviceId" }`

| Response key | UI |
|---|---|
| `tokens` | Store `accessToken` + `refreshToken`. |
| `isNewUser` | Go home either way — there is no registration form. Use it for a welcome message at most. |
| `linkedShopifyRecords` | Greater than 0 means old Shopify orders were just attached to this account. Worth a toast: "We found your previous orders." |

**401** here always says the same thing whether the code was wrong or expired.
Do not try to tell the two apart in the UI — the server deliberately does not.

### 2.3 After verify — go home

Nothing to call. Do not show a form.

The profile edit (`PATCH /auth/me`) still exists, but it lives on the profile
screen (36) and takes `firstName`, `lastName`, `gender` only. See 10.1.

---

## 3. Home

`GET /content/home` — the whole screen in one call.

**The layout is server-driven.** The app must not hard-code the order of
sections. Render `sections[]` in the order received and switch on `type`:

| `type` | Render from | Also |
|---|---|---|
| `BANNER_CAROUSEL` | `banners[]` | Tap → `linkType` / `linkValue` |
| `COLLECTION_ROW` | `products[]` | `reference` is the collection handle for a "View all" button |
| `PRODUCT_GRID` | `products[]` | Already in the curated order — do not re-sort |
| `CATEGORY_GRID` | `collections[]` | |

> ⚠️ **An unknown `type` must be skipped silently.** This single rule is what
> lets the server add a new section type without breaking older app versions.
> If the app crashes or errors on an unknown type, every new section type
> becomes a forced app update.

A section whose content could not be loaded is dropped by the server before it
reaches you, so `sections[]` never contains a broken one. If `sections[]` comes
back empty, show the designed empty state — not a spinner.

Banner taps:

| `linkType` | `linkValue` | Action |
|---|---|---|
| `NONE` | `null` | Not tappable |
| `PRODUCT` | handle | Open product detail |
| `COLLECTION` | handle | Open category listing |
| `URL` | full URL | Open in-app browser |

---

## 4. Browse

### 4.1 Categories

`GET /collections?limit=20&cursor=&sort=title`

`items[].id` is the collection **handle** — pass it straight to the next call.

### 4.2 Category listing

`GET /collections/:id/products?limit=20&cursor=&sort=manual`

Sort options here include `price_asc` / `price_desc`, because Shopify supports
price sorting on a collection's products connection.

### 4.3 Search / all products

`GET /products?search=saree&limit=20&cursor=&sort=newest`

> Price sorting is **not** available on this endpoint. Shopify's Admin API has
> no price sort key for the products connection. Hide the price sort control on
> the all-products screen, or the app will offer something that cannot work.
> Sorting inside the current page only would be worse — it looks right and is
> wrong.

Both endpoints return `{ items, nextCursor, hasNextPage }`. Infinite scroll:
send `nextCursor` back as `cursor`, stop when `hasNextPage` is false.

---

## 5. Product detail (screen 09)

| Order | Call | Auth | Notes |
|---|---|---|---|
| 1 | `GET /products/:id` | — | `:id` is the handle |
| 2 | `POST /recently-viewed/:productId` | ✅ | Fire and forget, returns 204. Skip it when logged out. |
| 3 | `POST /wishlist/:productId` · `DELETE` | ✅ | Heart button |
| 4 | `POST /cart/items` | ✅ | "ADD TO CART" |

Add to cart body:

```json
{ "productId": "blue-cotton-saree", "variantId": "45678901234567", "quantity": 1 }
```

`variantId` must come from the `variants[]` of the same product response. The
server verifies the product and the variant actually exist before writing —
which is why a stale variant fails here, at the tap, instead of silently at
checkout.

**Response is the full cart**, not just the added line. Update the cart badge
from `itemCount` in the same response; do not fire a separate `GET /cart`.

The wishlist heart is idempotent: adding twice is not an error, so the button
never needs to guard against a double tap.

---

## 6. Cart (screen 10)

| Call | Trigger |
|---|---|
| `GET /cart` | Screen open |
| `PATCH /cart/items/:id` | +/− buttons — `{ "quantity": 3 }` |
| `DELETE /cart/items/:id` | Remove line |
| `DELETE /cart` | Clear cart |
| `POST /cart/discount` | Voucher (screen 13) — `{ "code": "DIWALI20" }` |
| `DELETE /cart/discount` | Remove voucher |

Every one of these returns the **whole cart**, so the screen re-renders from
one source and never drifts.

> ⚠️ **Label `subtotal` as "Subtotal", never "Total".**
>
> It is the sum of the lines and nothing else. Shipping, tax and the discount
> are calculated by Shopify checkout, and that is the real number. Call this
> "Total" on the cart screen and the customer sees one amount here and a
> different one at checkout — which is exactly where trust breaks.

The voucher code is **stored, not validated**. `POST /cart/discount` accepting
the code says nothing about whether it works; only checkout decides. Do not
show a discounted total on this screen.

---

## 7. Checkout (screens 11 / 14)

| Order | Call | Notes |
|---|---|---|
| 1 | `GET /addresses` | Show saved addresses |
| 2 | `POST /checkout` | No body — the cart comes from the token |

Response: `{ "checkoutUrl": "https://..." }`

> **Open it in the Shopify Checkout Sheet Kit, not in a browser.** An external
> browser takes the customer out of the app, and they do not come back.

Payment completion is signalled by the sheet's own completion callback. There
is no server endpoint to poll for it — the authoritative signal will be the
`orders/create` webhook, which is not built yet. Do not write a polling loop
against `/orders` to detect a fresh order; it will be slow, wrong, and it
burns Shopify's rate-limit budget.

---

## 8. Orders

| Call | Notes |
|---|---|
| `GET /orders?limit=20&cursor=` | Newest first, cursor pagination |
| `GET /orders/:id` | `:id` is the order **name without `#`** — `PBG1036` |

This returns orders from **all** the Shopify customer records linked to this
person, so guest checkouts made years ago appear too — but only for
identifiers the user has actually verified.

**When the list is empty but the customer insists they have orders**, that is
the identity-linking case (section 10.3), not a bug. The designed prompt for
it should appear on this screen.

A 404 from `/orders/:id` means "not found *or* not yours" — the server does
not distinguish, so that order numbers cannot be probed. Show one "Order not
found" state.

---

## 9. Wishlist and recently viewed (screens 24, 26)

| Call | Notes |
|---|---|
| `GET /wishlist` | Product summaries, resolved live |
| `POST /wishlist/:productId` · `DELETE` | |
| `GET /recently-viewed` | Last 20 |

Both return **live** product data, not a snapshot. Prices and stock are
current every time the screen opens — a wishlist showing last month's price is
unfair to the customer and the server refuses to do it.

Recently viewed is capped at 20 by the server; the app does not trim.

---

## 10. Profile (screen 36)

### 10.1 Profile

`GET /auth/me` → `PATCH /auth/me`

`PATCH /auth/me` accepts `firstName`, `lastName`, `gender` — **no email**.

| Field | Notes |
|---|---|
| `phone` | Read-only in the app — see below |
| `emailVerified` / `phoneVerified` | Drives the "verify to see older orders" prompt |
| `gender` | Free string, not an enum. **The app decides the options.** Changing them needs no server change. |
| `verifiedIdentifiers[]` | Every verified email/phone on this account |
| `firstName` / `lastName` | Often null early on — see *Where the name comes from* |

> **Phone and verified email cannot be changed by `PATCH /auth/me`.** They only
> ever hold OTP-verified values. To change them the user verifies a new
> identifier (10.3).

#### There is no `email` field on this response

The profile payload carries **no top-level `email` key**, and `PATCH /auth/me`
does not accept one. To display an email address, read it out of
`verifiedIdentifiers`:

```js
const email = profile.verifiedIdentifiers.find(i => i.type === 'EMAIL')?.value ?? null;
```

That value is always a **verified** address, because no other kind is stored.

**The UI has two email states, not three:**

| `emailVerified` | Profile row |
|---|---|
| `false` | "Add email" — tapping it starts the flow in 10.3 |
| `true` | The verified address, read-only |

There is no greyed-out "typed but unverified" state, and the input in 10.3
always opens **empty**. Nothing is lost by that — the app never held an
address to prefill it with.

This applies to **every** endpoint that returns a profile — `GET /auth/me`,
`PATCH /auth/me`, the `customer` object inside `POST /auth/otp/verify`, and
the `customer` object inside `POST /auth/identities/verify`. They share one
shape, so there is one thing to build, not four.

#### Where the name comes from

`firstName` / `lastName` can be null for a long time, and the profile screen
must render that. Three things fill them in, whichever happens first:

1. The first delivery address the user saves (automatic, server-side)
2. This screen, if the user edits it by hand
3. A linked Shopify record, when an email gets verified

The server only ever writes into a **null** name — it will not overwrite what
the user typed.


### 10.2 Addresses

| Call | Notes |
|---|---|
| `GET /addresses` | |
| `POST /addresses` · `PATCH /addresses/:id` · `DELETE /addresses/:id` | |
| `POST /addresses/:id/default` | |
| `POST /addresses/import-from-orders` | "Fetch my addresses from past orders" checkbox |
| `POST /addresses/sync` | Pull from Shopify address book **and** past orders |

Saving an address never fails because Shopify was down — it is written to our
database first and pushed to Shopify afterwards, best-effort. So do not show a
sync error to the customer; the retry is the server's problem.

### 10.3 "I can't see my old orders" — identity linking

The customer logged in with their phone, but their old website orders were
placed under a different email.

| Order | Call |
|---|---|
| 1 | `POST /auth/identities/request-otp` — `{ "identifier": "old-email@gmail.com" }` |
| 2 | `POST /auth/identities/verify` — `{ "identifier", "code" }` |

On success, the old Shopify records are linked and `GET /orders` fills in.
**409** means that email is already verified on another account — show it as
"already linked to another account", not as a generic failure.

### 10.4 Logout

| Order | Call | Notes |
|---|---|---|
| 1 | `DELETE /notifications/device-token` | `{ "token": "<fcm token>" }` |
| 2 | `POST /auth/logout` | `{ "refreshToken" }` |
| 3 | — | Clear local tokens |

> **Step 1 is not optional.** Skip it and the next person to log in on that
> phone keeps receiving the previous customer's notifications.

`POST /auth/logout-all` is the "log out of all devices" control.

---

## 11. Push notifications

### 11.1 Registering the token

`POST /notifications/device-token`

```json
{ "platform": "ANDROID", "token": "<fcm token>", "deviceId": "pixel-8" }
```

**Call this on every launch**, not just the first. FCM and APNs rotate tokens
on their own, and a stale token fails silently — nothing is delivered and no
error is raised anywhere. Re-sending the current token every launch is the only
reliable fix.

`platform` is `IOS` · `ANDROID` · `WEB`.

### 11.2 Handling a tap

Notifications carry a `deepLink` string that the **app** parses:

| `deepLink` | Open |
|---|---|
| `product:blue-cotton-saree` | Product detail |
| `collection:sarees` | Category listing |
| `order:PBG1036` | Order detail |
| `url:https://...` | In-app browser |
| `null` | Home |

The server deliberately does not validate this string. An unrecognised prefix
must fall back to home rather than crash — a wrong deep link is a small
problem, a crash from a marketing campaign is a large one.

---

## 12. Static content

| Screen | Call |
|---|---|
| Settings list of policies | `GET /content/pages` |
| About / Terms / Privacy / Return policy | `GET /content/pages/:slug` |
| FAQ | `GET /content/faqs` |
| Offers / available coupons | `GET /content/coupons` |

`body` is Markdown or HTML — the app decides which it renders. Agree on one
with whoever writes the content and stay with it.

FAQs carry an optional `category` for grouping.

> ⚠️ **Coupon codes on `/content/coupons` are not guaranteed valid.** This is a
> display list. Applying one still goes through `POST /cart/discount`, and only
> Shopify checkout decides whether it works.

All four are public — no token needed.

---

## 13. Creator program

| Screen | Call | Notes |
|---|---|---|
| Entry point | `GET /influencer/application` | `null` → show "Become a creator" |
| Apply | `POST /influencer/apply` | `{ socialHandle, socialPlatform, followerCount, panNumber }` |
| Status | `GET /influencer/application` | |
| Creator profile | `GET /influencer/me` | 404 until approved |

All three use the ordinary customer token. **A creator is not a separate
account** — it is the same customer with one extra capability.

States to design from `GET /influencer/application`:

| `status` | UI |
|---|---|
| `null` (no row) | "Become a creator" |
| `PENDING` | "Under review" |
| `REJECTED` | Show `rejectionReason` **and** `canReapplyAt` |
| `APPROVED` | Open the creator section |

`canReapplyAt` is the rejection date + 30 days. Until then, `POST
/influencer/apply` returns 400 with the number of days left — show that as a
disabled button with the date, not as an error after the fact.

---

## 14. Errors and states that every screen shares

| Status | Meaning | App behaviour |
|---|---|---|
| 401 on any call | Access token expired | Refresh once, replay the call. If refresh also 401s → log out. |
| 403 "This account has been blocked" | Admin blocked the customer | Log out and show the blocked state. Retrying will not help. |
| 429 | Rate limited | `retryAfter` (seconds) is in the body for OTP endpoints. Show a countdown. |
| 404 on order/product | Not found *or* not yours | One "not found" state. Do not distinguish. |
| 5xx on `/content/*` | Content service failed | Fall back to the last cached payload if you have one. Home should never be a blank screen. |

**Never queue more than one refresh.** Two concurrent refreshes with the same
token look like token theft to the server, and it revokes the whole device
family — logging the user out for real.
