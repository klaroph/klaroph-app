# Payment Lifecycle Audit — KlaroPH Soft Launch

**Goal:** Payment system must survive real user transactions safely during soft launch.

---

## 1. Checkout

| Check | Status | Notes |
|-------|--------|------|
| metadata.plan | ✅ | Uses only `'pro'` (create-checkout/route.ts). |
| metadata.user_id | ✅ | Set to `String(user.id)`; required for webhook to assign subscription. |
| metadata.plan_type | ✅ | `'monthly'` or `'annual'`; used for period_end calculation. |
| Correct user_id | ✅ | From `supabase.auth.getUser()`; no PII in logs beyond user_id. |

**Flow:** User already-active check → body.plan_type → create session with metadata → return checkout_url. Logs: `[Checkout] Creating session user_id=... plan=pro plan_type=...`, `[Checkout] Success session_id=... user_id=...`.

---

## 2. Webhook idempotency

| Check | Status | Notes |
|-------|--------|------|
| Duplicate processing | ✅ | **Insert-first:** webhook inserts into `payment_events` (event_id UNIQUE) before running any handler. Second request with same event_id gets 23505 → returns `already_processed`; handler runs only once per event. |
| Payment success once | ✅ | `checkout_session.payment.paid` handler runs only after successful insert; repeat PayMongo deliveries skip handler. |

**Schema:** `payment_events.event_id` UNIQUE (20250226000000_paymongo_subscription_columns.sql). No separate “processed” flag; the row itself is the claim.

---

## 3. Subscription assignment

| Check | Status | Notes |
|-------|--------|------|
| Pro only | ✅ | handleCheckoutPaid and handleSubscriptionActivated use `.eq('name','pro').single()`; no clarity_premium. |
| Exactly one active per user | ✅ | `subscriptions` has UNIQUE(user_id); upsert uses `onConflict: 'user_id'`. One row per user. |

**Handlers:**  
- **checkout_session.payment.paid:** Resolves user from metadata (or fetch session), looks up plan `pro`, upserts subscription (user_id, plan_id, status=active, period_end, etc.).  
- **subscription.activated:** Updates by paymongo_customer_id; sets plan_id to pro, status active.  
Logs: `[Webhook] Payment success: subscription assigned user_id=... plan=pro ...`, `[Webhook] Subscription activated subscription_id=... plan=pro`.

---

## 4. Expiry logic

| Check | Status | Notes |
|-------|--------|------|
| Expired → free | ✅ | `resolveSubscriptionState()` (subscriptionState.ts) treats `status === 'active' && current_period_end <= now` as EXPIRED; also status in (`expired`, `cancelled`, `canceled`, past_due past grace). `resolveUserPlan()` returns FREE_PLAN when state is EXPIRED or NONE. No cron required; downgrade is implicit on next features/API call. |

**Optional:** A cron could set `status = 'expired'` when `current_period_end < now()` for clarity in DB; not required for correct entitlement behavior.

---

## 5. Cancellation logic

| Check | Status | Notes |
|-------|--------|------|
| Cancel → keep pro until period end | ✅ | handleSubscriptionUpdated: on `cancelled` / `incomplete_cancelled` only sets `auto_renew = false`; does **not** set status. Row keeps status `active`. |
| Downgrade after expiry | ✅ | When `current_period_end` passes, resolveSubscriptionState returns EXPIRED; user gets free entitlements. |

Log: `[Webhook] Subscription cancelled (access until period end) subscription_id=...`.

---

## 6. Subscription table integrity

| Check | Status | Notes |
|-------|--------|------|
| Duplicate active rows | ✅ | Impossible: UNIQUE(user_id) on subscriptions. Only one row per user. |
| Deterministic resolution | ✅ | resolveSubscriptionState does `.eq('user_id', userId).order('current_period_end', { ascending: false }).limit(1).maybeSingle()`. With one row per user, result is deterministic. |

---

## 7. Upgrade success UX

| Check | Status | Notes |
|-------|--------|------|
| Premium unlocks after payment | ✅ | User lands on /dashboard/upgrade-success; page polls GET /api/features every 2s (max 10). When plan_name is `pro` or `clarity_premium`, it sets confirmed, refresh(), replace to /dashboard. Features come from resolveUserPlan → pro; webhook sets subscription before user usually polls. |

**Recommendation:** Ensure webhook completes before user hits success page (PayMongo typically sends webhook quickly). Polling covers small delays.

---

## 8. Downgrade behavior

| Check | Status | Notes |
|-------|--------|------|
| Premium-created data visible | ✅ | Goals, expenses, income, budget rows are not deleted; RLS allows select by auth.uid(). User continues to see existing data. |
| Creation/editing restrictions | ✅ | After expiry: resolveUserPlan returns FREE_PLAN. Goals: creation blocked at 2 (goals/route.ts). Budget: getBudgetEditingAllowed false (30-day or pro). Export: 403 when !export_enabled. Charts: basic only (chart-types). |

---

## 9. Logging (safe, no PII/card data)

| Location | Log |
|----------|-----|
| **Checkout** | Creating session user_id=, plan=pro, plan_type=; Success session_id=, user_id= |
| **Webhook** | Idempotent skip event_id=, type=; Processing event_id=, type=; Handler error event_id=, type= |
| **handleCheckoutPaid** | Payment success: subscription assigned user_id=, plan=pro, plan_type=, period_end=; failures: metadata missing, plan not found, subscription assignment failed |
| **handleSubscriptionActivated** | Subscription activated subscription_id=, plan=pro; failures: plan not found, update failed |
| **handleSubscriptionUpdated** | Subscription cancelled (access until period end); Subscription updated subscription_id=, updates= |
| **handleSubscriptionProblem** | Grace period started subscription_id=; Subscription marked past_due subscription_id=, grace=; update failed |
| **handleInvoicePaid** | Subscription renewed via invoice subscription_id=; update failed |
| **handleInvoiceFailed** | Invoice payment failed subscription_id=; Grace period started; update failed |

All logs use identifiers (user_id, session_id, subscription_id, event_id) only; no email, card numbers, or full payloads in logs.

---

## 10. File reference

| Area | File(s) |
|------|---------|
| Checkout | app/api/paymongo/create-checkout/route.ts |
| Webhook | app/api/paymongo/webhook/route.ts |
| Subscription state | lib/subscriptionState.ts |
| Plan resolution | lib/resolveUserPlan.ts |
| Upgrade success | app/dashboard/upgrade-success/page.tsx |
| Schema | supabase/migrations/20250225000000_klaroph_plans_subscriptions_profiles.sql, 20250226000000_paymongo_subscription_columns.sql |

---

## Summary

- **Checkout:** metadata uses `plan: 'pro'`, user_id and plan_type correct; safe logs added.
- **Idempotency:** Insert into `payment_events` first; duplicate events skipped; payment success applied once.
- **Assignment:** Pro only; one subscription per user (UNIQUE user_id + upsert).
- **Expiry:** Treated as EXPIRED when period end passed or status expired/canceled; user gets free.
- **Cancellation:** Only auto_renew turned off; status stays active until period end; then resolution treats as expired.
- **Integrity:** No duplicate active rows; single row per user; deterministic resolution.
- **Upgrade UX:** Polling on upgrade-success until features show pro then redirect.
- **Downgrade:** Existing data visible; creation/editing gated by plan.
- **Logging:** Safe, consistent logs for success and failure paths across checkout and webhook.

Payment lifecycle is audited and hardened for soft launch.
