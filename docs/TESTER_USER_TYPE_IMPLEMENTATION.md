# Tester user_type Implementation

Secure server-side tester pricing for KlaroPH. Only selected internal accounts (DB `profiles.user_type = 'tester'`) get ₱5 pricing; all pricing is determined server-side from the database.

## Migration

- **File:** `supabase/migrations/20260313000000_profiles_user_type.sql`
- Adds `profiles.user_type` text NOT NULL DEFAULT `'user'`.
- Allowed values: `user`, `tester` (CHECK constraint).
- Trigger `profiles_user_type_protect`: blocks changes to `user_type` when the request has an authenticated user (e.g. client). Only backend using service_role (no user context) can set/update `user_type`.

## Server-side pricing insertion point

Pricing is applied in **exactly two call sites**, both of which create the PayMongo payment amount:

1. **`app/api/paymongo/create-qrph/route.ts`**  
   - After auth and after handling “existing payment intent” (reuse QR), before creating a new Payment Intent.  
   - Calls `getSubscriptionPricing(user.id)` then uses `pricing.monthlyCentavos` / `pricing.annualCentavos` for `createPaymentIntent({ amount: amountCentavos, ... })`.

2. **`app/api/paymongo/create-checkout/route.ts`**  
   - After auth and plan_type from body, before `createCheckoutSession`.  
   - Calls `getSubscriptionPricing(user.id)` then uses the returned amounts for the checkout line item.

The **single source of truth** for “how much to charge” is **`lib/getSubscriptionPricing.ts`**:

- Accepts only `userId` (no request body, no `user_type` from client).
- Fetches `profiles.user_type` from the DB via `supabaseAdmin`.
- Returns `{ monthlyCentavos, annualCentavos }`: tester → 500, 500; otherwise → env `CLARITY_PREMIUM_*` or production fallbacks.

So the “insertion point” is: **any place that sets the PayMongo amount** uses `getSubscriptionPricing(user.id)` and does not use any client-supplied value for pricing.

## Files touched

| File | Change |
|------|--------|
| `supabase/migrations/20260313000000_profiles_user_type.sql` | **New.** Add `user_type` column, CHECK, trigger. |
| `lib/getSubscriptionPricing.ts` | **New.** Server-only helper: fetch profile by userId, return centavos by user_type. |
| `app/api/paymongo/create-qrph/route.ts` | Use `getSubscriptionPricing(user.id)` for new Payment Intent amount; remove env-based constants. |
| `app/api/paymongo/create-checkout/route.ts` | Use `getSubscriptionPricing(user.id)` for checkout line item amount; remove env-based constants. |
| `app/api/profile/route.ts` | **No change.** GET `PROFILE_SELECT` and PATCH allowlist already omit `user_type`. |
| `docs/TESTER_USER_TYPE_IMPLEMENTATION.md` | **New.** This doc. |

## Confirmation: frontend cannot spoof tester pricing

- **Pricing is never read from the client.**  
  - Request body is used only for `plan_type` (monthly vs annual) and optional `payment_intent_id`.  
  - `user_type` is never accepted from the request body or any frontend input.

- **Amount is always derived from the DB.**  
  - Both create-qrph and create-checkout call `getSubscriptionPricing(user.id)`.  
  - That function loads `profiles.user_type` from the database (via `supabaseAdmin`) for the authenticated `user.id`.  
  - So the amount sent to PayMongo is determined solely by the stored profile row.

- **Profile updates cannot set `user_type`.**  
  - `PATCH /api/profile` only allows a fixed allowlist of fields; `user_type` is not in it.  
  - FirstTimeFlow and other client-side profile updates do not send `user_type`.  
  - DB trigger blocks direct Supabase client updates that try to change `user_type` when the session has an authenticated user.

- **Setting a user to tester** is done only by backend (e.g. one-off script or admin flow) using the service_role client to update `profiles.user_type` to `'tester'` for the chosen internal account(s).

## Existing behavior unchanged

- QR generation, webhook flow, subscription activation, and email confirmations are unchanged; only the **amount** passed when creating the PayMongo payment/checkout is now driven by `getSubscriptionPricing(user.id)`.
