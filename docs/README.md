# Integration docs

Who does what, and which endpoint to call where.

| Document | For |
|---|---|
| [Mobile app integration](./mobile-app-integration.md) | Flutter / React Native team — screen by screen |
| [Admin panel integration](./admin-panel-integration.md) | Web panel team — screen by screen |
| [Figma changes needed](./figma-changes.md) | Design — what the API now expects that the current designs do not cover |

The API reference itself (what every endpoint does and why) lives in the
[root README](../README.md). These documents do not repeat it; they answer a
different question — **on this screen, which calls fire, in what order, and
what does the UI do with each answer.**

## Ground rules for every integration

**Base URL** — `https://<host>/api/v1`. Every path in these documents is
relative to that.

**Two token families, never mixed.** The mobile app uses `accessToken` from
`/auth/otp/verify`. The admin panel uses its own token from
`/admin/auth/login`. They are signed with different secrets and validated by
differently named strategies: a customer token gets 401 on every `/admin`
route and vice versa. This is not a convention to be careful about — it is
enforced, and the server refuses to boot if the two secrets are set to the
same value.

**Pagination differs on purpose.**

| Data source | Style | Why |
|---|---|---|
| Products, collections, orders | Cursor (`nextCursor`) | It comes from Shopify, which has no page numbers |
| Everything in our Postgres | Offset (`page` / `limit` / `total` / `totalPages`) | The admin panel needs "Page 4 of 37" |

Never convert one into the other in the client. If a screen shows page
numbers over Shopify data, that screen is designed against the wrong source.

**Money is always a decimal string with a currency code**, never a float:

```json
{ "amount": "1299.00", "currencyCode": "INR" }
```

Parse it as a decimal, not a `double`. Adding twenty of these as floats is
how a cart total ends up at `₹0.30000000000000004`.

**Identifiers the client sees are handles, not database ids.**
`productId` is a Shopify handle (`blue-cotton-saree`), `orderId` is the order
name without `#` (`PBG1036`) — the same one printed on the customer's receipt.
Numeric Shopify ids never reach the client.
