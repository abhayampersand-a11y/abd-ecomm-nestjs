# Figma changes needed

What the API now expects that the current designs do not cover.

This document is written **from the API side**. It lists the states the server
can actually produce, so a screen can be designed for each one. It does not
redraw anything — it says what has to exist, and what has to go.

> **About screen numbers.** Only these are reliable: **09, 10, 11, 13, 14, 24,
> 26, 36**. Each appears in a source-code comment, so the number and the
> endpoint are known to match. Every other screen below is described by name
> because the code never numbers it — fill in the number from the Figma file
> when you match them up.
>
> **Screen 05 is not in that list any more.** See section 1.

---

## 1. Delete the registration screen (05)

**Status: the API behind it is gone. The screen cannot work as designed.**

Screen 05 collected `firstName`, `lastName` and `email` immediately after OTP
verification. `PATCH /auth/me` no longer accepts an email at all, and there is
no longer any reason to interrupt a new user with a form.

**The new signup is: enter phone → enter OTP → home.** Nothing in between.

`isNewUser: true` no longer means "show a form". At most it justifies a
welcome message.

### 1.1 Where the name comes from instead

The name is not lost — it is collected somewhere the user was going to type it
anyway. When they save their **first delivery address**, the server copies
`firstName` / `lastName` onto the customer record.

It only ever fills a **blank** name, so it can never overwrite something the
user set deliberately.

**Design implication:** the profile screen must render a **nameless** account.
A new user who has not yet saved an address has `firstName: null` — no
initials, no "Hi, Abhay". Design that empty state; it is now the normal state
for a fresh account, not an edge case.

### 1.2 What happens to the fields that were on screen 05

| Field | Where it goes now |
|---|---|
| First / last name | Address form (automatic), or profile screen 36 (manual) |
| Email | Identity linking only — see section 2 |

---

## 2. Email is verified-only, everywhere

`GET /auth/me` returns **no `email` field**, and `PATCH /auth/me` accepts
none. An email reaches an account through exactly one path:

```
POST /auth/identities/request-otp  →  POST /auth/identities/verify
```

The column that used to hold an unverified address (`contactEmail`) has been
dropped from the database. Not hidden — dropped. Nothing in the system can
produce an unverified email any more, including the admin panel.

### 2.1 Any "unverified email" visual state must go

Wherever a design shows an email in a "typed but not verified yet" treatment —
greyed out, amber, with a "Verify" chip beside it — **that state is
unreachable**. There is no such value to render.

| Screen | What to change |
|---|---|
| **Profile (36)** | The email row has two states: a verified address (read-only), or an empty "Add email" row. Nothing in between. |
| **Orders — "can't see old orders" banner** | Copy cannot contain the address. See 2.2. |
| **Checkout (11 / 14)** — email prompt | Same. The field opens empty. |

### 2.2 The prompt cannot be prefilled — and that is fine

Old copy:

> Verify **abhay@example.com** to see your past orders

New copy:

> Add your email to see your past orders

The input **always opens empty**, on every screen that hosts it. Nothing is
lost by this: the app never collected an address it could have prefilled.
Under the old design the prefilled value was, by definition, an unverified one
— which is exactly what was removed.

### 2.3 The decision table

Every "should we ask for an email?" decision comes from one boolean:

| `emailVerified` | What the screen shows |
|---|---|
| `false` | "Add your email to see your past orders" — empty input |
| `true` | Nothing. Done. |

Any design built on the previous three-state table (`null` / unverified /
verified) collapses to these two.

---

## 3. Where to ask for the email — and where NOT to

This is the part most likely to be designed wrong, so it is spelled out.

### 3.1 Never gate a screen behind email verification

**Orders and Addresses must stay open to a phone-only customer.**

A customer who signed up with a phone and ordered **in the app**:

- Checkout sends their verified **phone** as the buyer identity
- The order attaches to their Shopify record
- `GET /orders` returns it

They need no email whatsoever. A design that says *"Verify your email to see
your orders"* as a **blocking** screen hides a customer's own orders from
them. Same for addresses: `POST /addresses` works fine without an email — only
**importing old** addresses needs one.

> Email unlocks **pre-app history**, nothing else. So: **prompt, never gate.**

### 3.2 The four moments, in priority order

| # | Moment | Treatment |
|---|---|---|
| 1 | **Before checkout**, if only a phone is verified | **Strong prompt, skippable.** The main one — design this properly |
| 2 | **Orders screen**, when `emailVerified: false` | Banner above the list |
| 3 | **Addresses → "import my old addresses"** | Asked inline, on demand |
| 4 | **Profile → manage email/phone** | Always available, quiet |

**Why checkout is number one.** Verifying *before* the first order lets the
server delete the empty duplicate Shopify record cleanly. Verifying *after* an
order forces a **merge** instead, and Shopify can refuse a merge
(subscriptions, gift cards, store credit) — leaving a permanent duplicate
customer. Checkout is the last clean moment, and with screen 05 gone it is
also the first natural one.

**Never in the background.** This flow sends a real OTP. It must always follow
a deliberate tap.

---

## 4. States the API produces that commonly have no design

Not new, but the ones most often missing from a Figma file. Drawn now, or
found in QA as a blank screen.

### 4.1 Rate limiting with a real countdown

OTP endpoints return **429** with `retryAfter` in **seconds**. Design a
disabled "Resend" button with a live countdown, not a generic "try again
later" toast. Applies to both login OTP and identity-linking OTP.

### 4.2 Identity linking — the 409 dead end

`POST /auth/identities/verify` returns **409** when that email is already
verified on **someone else's** account. The user cannot fix this and retrying
never works. It needs its own state — "already linked to another account",
with a route to support — not a generic error toast.

### 4.3 Blocked account

**403 "This account has been blocked"** can arrive on any authenticated call.
Full screen: the user is logged out and retrying is pointless.

### 4.4 Nameless account

Covered in 1.1, repeated here because it is easy to miss: `firstName` and
`lastName` are `null` until the user saves an address or edits their profile.
Every avatar, greeting and initials treatment needs a blank-name variant.

### 4.5 Creator program — the rejection cooldown

`GET /influencer/application` with `status: REJECTED` returns
`rejectionReason` and `canReapplyAt` (rejection + 30 days). Design a
**disabled** apply button showing the eligible date. Leave it enabled and the
user taps it, gets a 400 counting down the days, and reads an error where a
disabled state was the honest answer.

### 4.6 Orders that exist but cannot be reached

`limitedToRecentOrders` is currently **always `true`**: without Shopify's
`read_all_orders` scope only the **last 60 days** of orders come back. A
long-standing customer will verify their email, be told it worked, and still
see a short list. That needs a line of explanatory copy, or the success feels
like a failure.

### 4.7 Home must never be blank

`GET /content/home` is server-driven — the app renders `sections[]` in the
order received and must not hard-code it. So:

- Every `type` the server can send needs a component, including ones not in
  the current design
- **5xx** needs a fallback state, because this is the first thing a fresh
  install shows

---

## 5. Admin panel — one column removed

| Screen | Change |
|---|---|
| **Customer list / detail** | The `contactEmail` column is gone. One email column remains, always verified. |
| **Customer edit form** | No email field at all. An admin cannot set a customer's email — that would reintroduce an unverified address through a side door. |
| **Customer CSV export** | The `contact_email` column is gone from the file. |

Support staff can no longer look up "what the customer typed at registration",
because nothing types it any more. If a customer's email is null, the answer
is to have them verify it from the app.

---

## 6. Not affected

Listed so nobody redesigns them by mistake.

| Area | Why it is unchanged |
|---|---|
| **Login / OTP screens** | The identifier field still takes a phone **or** an email in one box. No second screen. |
| **Profile screen 36** | Still exists and still edits `firstName`, `lastName`, `gender` — just not email, and it is no longer forced on new users. |
| **Address form** | Unchanged. It already collected first and last name; that is now doing double duty. |
| **Everything after checkout** | Cart, orders, wishlist, creator program — untouched. |
