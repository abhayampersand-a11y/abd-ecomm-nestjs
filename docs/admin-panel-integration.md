# Admin panel integration

The panel is a **new surface** — there is no existing screen set for it. Each
section below is one screen, with the calls it needs.

**Base URL** `/api/v1` · **Auth** `Authorization: Bearer <adminToken>` on every
call except login.

> There is **one** admin user. No roles, no permissions matrix, no user
> management screen, no "invite a teammate", no "forgot password". The
> credentials are environment variables. Do not design screens for any of
> those — none of them have an endpoint, on purpose.

---

## 0. Login

`POST /admin/auth/login` → `{ email, password }`

| Response | UI |
|---|---|
| `accessToken` | Store it. **8 hours, no refresh token.** After that, log in again. |
| `expiresIn` | 28800 by default — the panel can warn before expiry |

| Error | Message to show |
|---|---|
| 401 | "Email or password is incorrect" — the server sends the same message for a wrong email and a wrong password, so do not try to be more specific. |
| 429 | Locked out. 10 failed attempts locks that IP for 15 minutes. Show the wait. |
| 503 | The admin panel is switched off (`ADMIN_EMAIL` is empty). This is a deployment problem, not a login problem — say so. |

`GET /admin/auth/me` on panel boot: 200 means the session is alive, 401 means
go to login. `POST /admin/auth/logout` really does invalidate the token
server-side, so it is safe to rely on.

---

## 1. Dashboard

`GET /admin/dashboard/summary` — every counter in one call
`GET /admin/dashboard/signups?days=30` — chart
`GET /admin/dashboard/top-products?limit=10` — three lists

> ⚠️ **There are no revenue or order-count numbers, deliberately.** Orders live
> in Shopify. Do not design a revenue tile here — it would either be blank or,
> worse, disagree with Shopify admin. Put a "Open Shopify admin" link where a
> revenue tile would go.

Tiles worth building, and what each one means:

| Tile | Source | Reads as |
|---|---|---|
| Total / active customers | `customers.total` / `.active` | |
| New today / 7d / 30d | `customers.newLast24h` etc. | Growth |
| Imported | `customers.imported` | Came from Shopify, **cannot log in yet** |
| Blocked | `customers.blocked` | |
| Active sessions | `sessions.active` | Logged-in devices right now |
| Push reach | `sessions.pushDevices` | How many devices a campaign can hit |
| Carts with items | `carts.withItems` | |
| Abandoned > 24h | `carts.abandonedOver24h` | Links to the abandoned list |
| Estimated cart value | `carts.estimatedValue[]` | **Array, one per currency.** Label it "estimated" |
| OTP issued / consumed (24h) | `otpLast24h` | |

`signups.series[]` already has zero-count days filled in, so the chart needs no
gap handling.

`top-products` returns **handles and counts only** — titles and images are in
Shopify. Either show the handle, or link out.

---

## 2. Customers — list

`GET /admin/customers?search=&status=&sort=newest&linkedToShopify=&page=1&limit=25`

**One search box.** It matches phone, email, first/last name, our UUID and
Shopify customer id. Do not build separate fields per type.

| Control | Values |
|---|---|
| Sort | `newest` (default) · `oldest` · `lastLogin` · `name` |
| Status filter | `ACTIVE` · `IMPORTED` · `MERGED` · `BLOCKED` |
| Shopify filter | `linkedToShopify=true` / `false` |

Status needs a legend in the UI, because two of the four are not obvious:

| Status | Means |
|---|---|
| `ACTIVE` | Normal |
| `IMPORTED` | Came from a Shopify import, has never verified an OTP — **cannot log in** |
| `MERGED` | A duplicate that was merged away. `mergedIntoId` points at the real record |
| `BLOCKED` | Blocked by an admin |

Response is `{ items, page, limit, total, totalPages }` — offset pagination, so
page numbers are safe here.

**One email column, and it is always verified.**

| Field | Meaning |
|---|---|
| `email` | `primaryEmail` — **verified**. Order matching runs on this. |

There used to be a second column, `contactEmail`, holding whatever the user
typed on a registration screen. Both the column and the screen are gone. An
unverified email can no longer exist anywhere in the system, so the panel has
nothing ambiguous left to display.

**What this means at the support desk:** if a customer's `email` is null, you
cannot fill it in for them — see *Editing* below. Ask them to verify it from
the app.

`GET /admin/customers/export?status=ACTIVE` returns CSV with the same filters,
capped at 50,000 rows.

---

## 3. Customers — detail

`GET /admin/customers/:id` gives the whole page in one call: profile,
`identities[]`, `shopifyLinks[]`, `devices[]`, a cart snapshot,
`activeSessions`, and both sides of any merge.

Tabs and their calls:

| Tab | Call |
|---|---|
| Overview | (already in the detail response) |
| Orders | `GET /admin/customers/:id/orders?limit=20&cursor=` |
| Addresses | `GET /admin/customers/:id/addresses` |
| Cart | `GET /admin/customers/:id/cart` |
| Wishlist | `GET /admin/customers/:id/wishlist` |
| Recently viewed | `GET /admin/customers/:id/recently-viewed` |
| Sessions | `GET /admin/customers/:id/sessions` |
| History | `GET /admin/audit-logs?entityType=customer&entityId=:id` |

> **The Orders tab is the only cursor-paginated list in the panel** — it comes
> from Shopify. Use a "Load more" button there, not page numbers.

### Editing

`PATCH /admin/customers/:id` — `firstName`, `lastName`, `gender`.
Send `""` to clear a field.

> ⚠️ **There is no email field, for anyone.** An admin cannot record a
> customer's email on their behalf. That would put an unverified address back
> on the account through a side door, which is precisely what removing
> `contactEmail` was meant to prevent. The customer verifies it themselves
> over OTP from the app.

> ⚠️ **Phone and verified email must be rendered read-only, with no edit
> affordance at all.** They are not in the update DTO and the server rejects
> them. They only ever hold OTP-verified values, because order matching runs on
> them — an editable field there would let one save attach any account to
> someone else's phone number.

### Actions

| Action | Call | Notes |
|---|---|---|
| Block | `POST /admin/customers/:id/block` | Body `{ "reason": "..." }`. Reason is optional but **the confirm dialog should require it** — it is the only record of why. |
| Unblock | `POST /admin/customers/:id/unblock` | |
| Log out everywhere | `POST /admin/customers/:id/logout-all` | |
| Revoke one session | `DELETE /admin/customers/:id/sessions/:sessionId` | |

Block also revokes every session — say so in the confirm dialog, because that
is the part with a visible effect on the customer.

400 responses here are business rules, not validation noise. Show the message
as-is: "already blocked", "merged into another account — block that one".

---

## 4. Merge duplicates

`POST /admin/customers/merge` — `{ sourceCustomerId, targetCustomerId, dryRun }`

**This screen must be two steps.** A merge cannot be undone.

| Step | Call | Screen |
|---|---|---|
| 1 | `dryRun: true` | Show what will move: identities, Shopify links, addresses, wishlist, recently viewed, devices, cart items, and how many sessions get revoked |
| 2 | `dryRun: false` | Only after the admin confirms the preview |

The response of step 2 also reports `skippedDuplicates` — things the target
already had, which were dropped instead of moved. Show that; it explains why
the numbers differ from the preview.

Wording for the screen: the source record is **not deleted**. It becomes
`MERGED` and points at the target. Login with the old phone number still works
and lands on the target account. Do not label the button "Delete duplicate".

---

## 5. Security & support

The daily support desk. Three screens.

### 5.1 OTP logs

`GET /admin/security/otp-logs?identifier=&status=&purpose=&ip=&page=1`

The answer to "I never got my OTP". `identifier` is a partial match, so
`43210` finds `+919876543210`.

| Column | Notes |
|---|---|
| `status` | `pending` · `consumed` · `expired`. **`consumed` covers both a successful verify and "attempts ran out"** — label it "used or exhausted", not "verified". |
| `attempts` / `maxAttempts` | |
| `requestIp` | |

> ⚠️ **There is no column for the code**, and there never will be. The code and
> even its hash are deliberately absent from the response. Do not add a
> "reveal code" control to this screen — an admin who can read codes is an
> admin who can enter accounts.

### 5.2 OTP health

`GET /admin/security/otp-stats?days=7`

The number to feature is **`neverUsed`**: codes issued that nobody used. When
it climbs, SMS delivery is broken. `usageRate` is the same thing as a
percentage. `topRequesters` shows one number with 40 requests — a test device,
or someone being harassed.

### 5.3 Reset rate limits

`POST /admin/security/otp/reset-limits` — `{ "identifier" }` and/or `{ "ip" }`

> This clears the counters so the customer can press Resend themselves. **It
> does not send an OTP and does not show a code.** The button label should say
> so, otherwise support will keep asking for a "send code" button that will
> never exist.

### 5.4 Sessions and devices

`GET /admin/security/sessions?page=1` — every logged-in device, with its
customer attached.
`GET /admin/security/devices` — push reach by platform.

---

## 6. Carts

`GET /admin/carts?sort=updated&search=&idleHours=&page=1`
`GET /admin/carts/abandoned?idleHours=24`
`GET /admin/carts/:id`

> ⚠️ **Every amount on these screens is an estimate**, and the label must say
> so. A cart line stores the price from when it was added; shipping, tax and
> discounts are not included. "Estimated cart value" — never "revenue".

> ⚠️ **The abandoned list includes people who have already ordered.** Orders
> are in Shopify, so there is no way to filter them out here. Put this warning
> on the screen, and put a link to the customer's Orders tab next to every row,
> so nobody messages a customer who already paid.

---

## 7. Content (CMS)

Five sub-screens. All of them clear the app's content cache automatically on
save, so the app sees changes immediately — the UI can say "Live now" after a
successful save.

**Two different "on" flags**, and the panel must show the second one:

| Field | Meaning |
|---|---|
| `isActive` | The admin toggle |
| `isLive` | Computed: `isActive` **and** inside the `startsAt`/`endsAt` window |

Show `isLive` as the status badge. Without it, a scheduled banner reads as
"active" while the app is not showing it, and the admin assumes something is
broken.

### 7.1 Banners

`GET · POST /admin/content/banners` · `PATCH · DELETE /:id`
`POST /admin/content/banners/reorder` — `{ "ids": [...] }`

| Field | Notes |
|---|---|
| `imageUrl` | **We do not host images.** The form takes a URL — from Shopify Files, Cloudinary or S3. There is no upload endpoint. |
| `linkType` | `NONE` · `PRODUCT` · `COLLECTION` · `URL` — the `linkValue` field's label and validation should change with it |
| `placement` | Free string (`home`, `cart`, `category`). Offer a dropdown of known values **plus** free entry: a new placement must not need a deployment. |
| `startsAt` / `endsAt` | Optional. This is how sale banners switch themselves on and off. |

Reorder is a **single call after a drag-drop finishes** — the array order
becomes position 0, 1, 2. Do not send one PATCH per row; a failure halfway
through leaves the list half-sorted.

### 7.2 Home layout

`GET · POST /admin/content/home-sections` · `PATCH · DELETE /:id` ·
`POST /admin/content/home-sections/reorder`

This screen **is** the app's home screen. The form changes by `type`:

| `type` | Required field | Form control |
|---|---|---|
| `BANNER_CAROUSEL` | `reference` = a banner placement | Dropdown of placements |
| `COLLECTION_ROW` | `reference` = collection handle | Text (validated by Shopify only at render time) |
| `PRODUCT_GRID` | `productHandles[]` | Ordered list — **the order is the display order** |
| `CATEGORY_GRID` | — | |

The server rejects `COLLECTION_ROW` with no reference and `PRODUCT_GRID` with
no handles, so mirror that in the form.

> The collection handle is **not** checked against Shopify on save (that would
> mean a round trip on every keystroke-to-save). A wrong handle makes that one
> section disappear from the app. Warn in helper text: "must match the handle
> in Shopify exactly".

`itemLimit` caps at 50, but keep the default at 10 in the UI. The home screen
is not a catalogue.

### 7.3 Pages, 7.4 FAQs, 7.5 Coupons

| Screen | Calls |
|---|---|
| Pages | `GET · POST /admin/content/pages` · `GET · PATCH · DELETE /:id` |
| FAQs | `GET · POST /admin/content/faqs` · `PATCH · DELETE /:id` · `POST /admin/content/faqs/reorder` |
| Coupons | `GET · POST /admin/content/coupons` · `PATCH · DELETE /:id` |

Pages: `slug` is lowercase-and-hyphens and is what the app requests
(`/content/pages/terms`). `isPublished` defaults to **false**, so a draft is
never visible — the editor needs a clear Draft/Published state.

> ⚠️ **The coupon form does not create a discount.** The code must already
> exist in Shopify; this list only controls what the app displays. Put that
> sentence in the form. If the code does not exist in Shopify, the customer
> sees "invalid code" at checkout — turning away someone who was ready to pay.

---

## 8. Push notifications

The flow is deliberately three separate steps, and the screen should follow it:

| Step | Call | Screen |
|---|---|---|
| 1 | `POST /admin/notifications/estimate` | Show the reach **before** anything is created |
| 2 | `POST /admin/notifications` | Save as draft, or schedule |
| 3 | `POST /admin/notifications/:id/send` | Separate, confirmed action |

### Composer

| Field | Notes |
|---|---|
| `title` | Max 100. Android's tray shows ~40-50 — **the composer should preview the truncation**; the API will not truncate for you |
| `body` | Max 500 |
| `deepLink` | `product:<handle>` · `collection:<handle>` · `order:<name>` · `url:<full url>`. Not validated by the server — offer a picker rather than a free text field |
| `imageUrl` | Absolute URL, same as banners |
| `audience` | `ALL` · `SEGMENT` · `CUSTOMER` |
| `segment` | Required when `SEGMENT` |
| `customerId` | Required when `CUSTOMER` |
| `scheduledAt` | Future ISO 8601 → status becomes `SCHEDULED`. Omit → `DRAFT` |

Segments (fixed list, not free text):

| Segment | Who |
|---|---|
| `ALL_USERS` | Everyone with a push token |
| `ABANDONED_CART` | Cart has items, untouched 24h |
| `HAS_WISHLIST` | At least one wishlist item |
| `INACTIVE_30D` | No login in 30 days, or never |
| `NEW_LAST_7D` | Joined in the last week |

**Run the estimate whenever the audience or segment changes** and show it next
to the Send button. Both "40,000 devices" and "4 devices" should make an admin
stop and check.

### Sending

`POST /admin/notifications/:id/send` — **immediate and irreversible.** Needs a
confirm dialog showing the estimated reach.

Statuses: `DRAFT` → `SCHEDULED` → `SENDING` → `SENT`, plus `FAILED` and
`CANCELLED`. Only `DRAFT` and `SCHEDULED` can be edited or cancelled; anything
else returns 400 with its current status. A `SENT` campaign cannot be deleted —
it is history.

### Results

`GET /admin/notifications/:id` gives `totalTargets`, `sentCount`,
`failedCount`, and `failures[]`.

> `failures[]` is **only failures**. Successful deliveries are not stored
> row-by-row — a 40,000-user broadcast would write 40,000 rows nobody reads.
> The success number is `sentCount`. Label the list "Delivery problems", not
> "Delivery log", or it reads as if 39,995 records went missing.

Tokens in `failures[]` are masked (`***last8`).

### Scheduling — a deployment note, not a screen

`POST /admin/notifications/dispatch-due` sends everything whose `scheduledAt`
has passed. **This project has no scheduler**; an external cron must hit that
endpoint (every 5 minutes is fine). Until that cron exists, scheduled
campaigns sit in `SCHEDULED` forever. If the panel offers scheduling, confirm
the cron is running first.

### Templates

`GET · POST /admin/notifications/templates` · `PATCH · DELETE /:id` —
reusable `title`/`body`/`deepLink`. `name` is unique and is what the composer's
dropdown shows.

---

## 9. Creator applications

`GET /admin/influencer-applications?status=PENDING&sort=newest&search=&page=1`
`GET /admin/influencer-applications/pending-count` — sidebar badge
`GET /admin/influencer-applications/:id`
`POST /admin/influencer-applications/:id/approve`
`POST /admin/influencer-applications/:id/reject` — `{ "reason": "..." }`

Default the status filter to `PENDING` so opening the screen shows outstanding
work only.

| Sort | Use |
|---|---|
| `newest` (default) | Normal queue |
| `oldest` | When the queue has fallen behind — whoever has waited longest gets answered first |
| `followers` | Triage only |

> `followerCount` is **self-reported and never verified**. Sorting by it
> surfaces the biggest claims, not the most genuine ones. The column needs a
> "self-reported" marker.

The point of the row is `profileUrl` — a ready-to-click link to the real social
account. Make it the primary action; the decision is made by looking at the
actual profile.

> ⚠️ **`panMasked` is `ABC****34F` and the full PAN is never sent to the
> panel.** There is no endpoint that returns it. Do not design a reveal
> control. An admin screen sits open in an office where anyone can read it; the
> full value is pulled from the database at payout time.

Reject requires a reason, minimum 10 characters — **it is shown to the
applicant**, and the 30-day re-apply clock starts at that moment. Say both
things in the dialog.

Errors: 409 means someone else (or another tab) already decided this one.
Refresh the row rather than showing a generic failure.

---

## 10. Creators

`GET /admin/influencers?status=ACTIVE&search=&page=1`
`POST /admin/influencers/:id/suspend` — `{ "reason": "..." }`
`POST /admin/influencers/:id/unsuspend`

Suspension reason is required, minimum 10 characters, same as rejection.

Wording for the suspend dialog: old reels drop out of the feed and no new
earning accrues, **but the wallet balance stays** — that is money already
earned, not a penalty.

---

## 11. Audit log

`GET /admin/audit-logs?entityType=&entityId=&action=&since=&page=1`
`GET /admin/audit-logs/actions` — populates the filter dropdown

This is the screen that answers "why was this customer blocked?" and "who
changed the home layout?". It is most useful **embedded as a History tab** on
the customer, banner and campaign detail screens — filter by `entityType` and
`entityId` — rather than only as a standalone page.

`before` and `after` contain only the fields that changed, so a diff view is
small and readable.

---

## 12. System

`GET /admin/system/status` · `GET /admin/system/address-sync?page=1` ·
`POST /admin/system/cache/flush`

The numbers that matter are in `backlog`: `addressesPendingShopifySync`,
`expiredOtpRows`, `expiredSessionRows`. If any of them climbs steadily,
something is stuck. Show them as a trend, not just a value.

`address-sync` rows carry a computed `likelyReason` — display it, so nobody has
to guess why an address never reached Shopify.

Cache flush takes `{ "scope": "products" | "collections" | "orders" | "all" }`.
It is the answer to "I changed the price in Shopify and the app shows the old
one".
