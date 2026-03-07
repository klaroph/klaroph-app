# clarity_premium Plan — Full Audit for Soft Launch

**Goal:** Determine whether `clarity_premium` is dormant, operational, or a subscription risk. Ensure zero ambiguity for premium tier at launch.

---

## 1. All code references to `clarity_premium`

### Application code (source)

| File | Usage |
|------|--------|
| **lib/resolveUserPlan.ts** | `const isProPlan = planName === 'pro' \|\| planName === 'clarity_premium'` — treats both as premium; return value is always `plan_name: 'pro'` or `'free'`. |
| **app/api/paymongo/create-checkout/route.ts** | `metadata.plan = 'clarity_premium'` — sent to PayMongo with checkout session (product label). |
| **app/api/paymongo/webhook/route.ts** | `handleCheckoutPaid`: `.or('name.eq.pro,name.eq.clarity_premium').limit(1).single()` to resolve premium plan and assign `plan_id`. `handleSubscriptionActivated`: same query. |
| **app/dashboard/upgrade-success/page.tsx** | `features?.plan_name === 'pro' \|\| features?.plan_name === 'clarity_premium'` — defensive check before redirect (features from `/api/features` are always `'pro'` or `'free'`). |

### API / features

- **app/api/features/route.ts** — Does **not** reference `clarity_premium`. Uses `resolveUserPlan` and sets `planLabel = plan.plan_name === 'pro' ? 'pro' : 'free'`, so response is always `plan_name: 'pro'` or `'free'`.
- **app/api/paymongo/subscription/route.ts** — Does **not** reference `clarity_premium` by string. Returns `plan_name: plans.name` from DB, so if a user’s subscription has `plan_id` → `plans.name = 'clarity_premium'`, the API returns `plan_name: 'clarity_premium'`. **Only place in app that can expose raw DB plan name.**

### Database and RPCs

| File | Usage |
|------|--------|
| **supabase/migrations/20250227000000_clarity_premium_grace_plan_type.sql** | Seeds `clarity_premium` plan row. In `get_user_features`: maps `effective_plan_name = 'pro'` → `'clarity_premium'` for return value (display). |
| **supabase/migrations/20250230100000_get_user_features_active_period.sql** | Same: when plan is `pro`, returns `plan_name := 'clarity_premium'`. When plan is already `clarity_premium`, returns as-is. |
| **supabase/scripts/fix_get_user_features_execute.sql** | Same mapping: `IF plan_name_text = 'pro' THEN plan_name_text := 'clarity_premium'`. |
| **supabase/migrations/20260308000000_plans_has_budgeting.sql** | Seeds `clarity_premium` with same capabilities as `pro` (including `has_budgeting = true`). |

### Other

- **SUBSCRIPTION_SCHEMA_AUDIT.md** — Documents legacy columns; mentions RPCs that reference plans (including clarity_premium).
- **.next/** — Build output; reflects source above.

---

## 2. Where `clarity_premium` is still active

### Assigned automatically?

- **New users:** No. `handle_new_user()` in migrations only does `SELECT id FROM plans WHERE name = 'free'` and assigns that. No path assigns `clarity_premium` on signup.
- **After payment:** Yes. In **handleCheckoutPaid** and **handleSubscriptionActivated**, the webhook runs:
  - `from('plans').select('id').or('name.eq.pro,name.eq.clarity_premium').limit(1).single()`
  - The row returned is **not** specified (no `ORDER BY`), so with both `pro` and `clarity_premium` in `plans`, either can be returned. The assigned `plan_id` is that row’s `id`, so **new paying users can get either `pro` or `clarity_premium`** depending on DB order.

### Accepted as premium in entitlement checks?

- **Yes.** In **lib/resolveUserPlan.ts**, `isProPlan = planName === 'pro' || planName === 'clarity_premium'`. Both get the same entitlements (max_goals, export, analytics, full_budgeting_entitled, etc.). Returned `plan_name` is always `'pro'` for premium.

### Plan comparison logic?

- **resolveUserPlan:** Compares `row?.name` to `'pro'` and `'clarity_premium'` only to decide premium; no other branching on name.
- **app/api/features/route.ts:** Uses `plan.plan_name === 'pro'` (already normalized) for analytics cutoff, isPro, etc. No direct comparison to `clarity_premium` in app.

### Treated differently from `pro`?

- **In app/API:** No. Once resolved, both are `plan_name: 'pro'` and get identical behavior.
- **In DB/RPC:** RPCs **rename** `pro` → `clarity_premium` in the returned `plan_name`. So in the (unused) RPC path, “pro” is shown as “clarity_premium”. The actual `clarity_premium` row is returned as `plan_name: 'clarity_premium'`.
- **GET /api/paymongo/subscription:** Returns `plans.name` as-is, so a user with `clarity_premium` plan sees `plan_name: 'clarity_premium'` there. Any UI that uses this endpoint would show that string.

---

## 3. Risk level

| Risk | Level | Notes |
|------|--------|------|
| **Dormant reference only** | No | Checkout metadata and webhook lookups actively use `clarity_premium`; RPCs return it. |
| **Hidden operational dependency** | Yes | Webhook can assign **either** `pro` or `clarity_premium`; which one is non-deterministic. Entitlements are correct either way, but two “premium” plan names exist in DB and in one API response. |
| **Launch risk** | Low if kept consistent | No entitlement bug. Risk is **ambiguity**: two premium plan rows and two possible `plan_name` values (pro vs clarity_premium) for the same product. Support/billing or future code that branches on `plans.name` could behave inconsistently. |

**Summary:** `clarity_premium` is **operational**, not dormant. It is **not** a hidden security or entitlement bug, but it **does** create two valid “premium” states (pro vs clarity_premium) and non-deterministic assignment on payment.

---

## 4. Subscription truth

- **Valid launch plans (conceptually):** Free and one premium tier (Pro / “Clarity Premium” as product name).
- **In DB:** Three plan **names** exist: `free`, `pro`, `clarity_premium`. Both `pro` and `clarity_premium` have the same capabilities (max_goals 20, has_export, has_analytics, has_budgeting, etc.).
- **Can `clarity_premium` be assigned by the backend?**  
  **Yes.** Only path is the PayMongo webhook (`handleCheckoutPaid`, `handleSubscriptionActivated`), which does **not** use checkout metadata.plan. It always runs the same query: “any plan with name `pro` or `clarity_premium`.” So:
  - Every successful checkout can result in either `pro` or `clarity_premium` being assigned.
  - There is no path that assigns **only** `pro` or **only** `clarity_premium` without changing the webhook.

---

## 5. Exact files and logic paths where `clarity_premium` still matters

1. **lib/resolveUserPlan.ts**  
   - Line ~71: `isProPlan = planName === 'pro' || planName === 'clarity_premium'`.  
   - Effect: Both names get full premium; no other branch.

2. **app/api/paymongo/create-checkout/route.ts**  
   - Line ~59–60: `metadata.plan = 'clarity_premium'`.  
   - Effect: PayMongo checkout metadata and product naming; not used by webhook to choose plan.

3. **app/api/paymongo/webhook/route.ts**  
   - handleCheckoutPaid (~197–202): Lookup `plans` with `name.eq.pro` or `name.eq.clarity_premium`, `limit(1).single()`, then assign that `plan_id` to subscription.  
   - handleSubscriptionActivated (~253): Same lookup and assignment.  
   - Effect: **Only place that assigns premium plan_id;** can assign either pro or clarity_premium.

4. **app/api/paymongo/subscription/route.ts**  
   - Line ~37: `plan_name: plans?.name ?? 'free'`.  
   - Effect: Only app API that returns raw `plans.name`; subscribers with `clarity_premium` see `plan_name: 'clarity_premium'`.

5. **app/dashboard/upgrade-success/page.tsx**  
   - Line ~21: `features?.plan_name === 'pro' || features?.plan_name === 'clarity_premium'`.  
   - Effect: Success detection. Today features come from `/api/features` (always `'pro'` or `'free'`), so `clarity_premium` is defensive only.

6. **supabase/migrations/20250227000000_clarity_premium_grace_plan_type.sql**  
   - Seeds `clarity_premium`; `get_user_features` maps `pro` → `clarity_premium` in returned `plan_name`.

7. **supabase/migrations/20250230100000_get_user_features_active_period.sql**  
   - Same mapping in `get_user_features`. App does not call this RPC; features come from `/api/features`.

8. **supabase/scripts/fix_get_user_features_execute.sql**  
   - Same RPC mapping. Used only if run manually in SQL editor.

9. **supabase/migrations/20260308000000_plans_has_budgeting.sql**  
   - Seeds `clarity_premium` with same flags as `pro` (including `has_budgeting`).

---

## 6. Safe recommendation

**Option A — Alias `clarity_premium` fully to `pro` (recommended for launch)**  
- **Single premium plan row:** Use only `pro` in the app and webhook; treat “Clarity Premium” as the product name, not a separate plan name in DB.
- **Changes:**
  1. **Webhook:** Resolve premium plan by **single** name, e.g. `.eq('name','pro').single()`, in both `handleCheckoutPaid` and `handleSubscriptionActivated`. No `.or('name.eq.clarity_premium')`.
  2. **create-checkout:** Keep `metadata.plan = 'clarity_premium'` for PayMongo/product naming, or switch to `'pro'` for consistency; entitlement logic does not depend on it.
  3. **resolveUserPlan:** Keep `planName === 'pro' || planName === 'clarity_premium'` so existing subscribers with `plan_id` → `clarity_premium` still get full access (no DB migration of existing rows required).
  4. **RPCs:** Leave as-is for now (they still return `plan_name`; app does not rely on them). Optionally in a later phase stop mapping `pro` → `clarity_premium` and return `pro` only.
  5. **DB:** Keep the `clarity_premium` row for existing subscribers; do **not** delete. New subscriptions always get `pro` plan_id.
- **Result:** New paying users always get `pro`. Existing `clarity_premium` subscribers keep full access. One clear “premium” plan for new flows; no ambiguity.

**Option B — Keep `clarity_premium` dormant safely**  
- Make assignment deterministic: in the webhook, **prefer one name** (e.g. always choose `pro` when both exist). For example, `.eq('name','pro').single()` and only if that fails (e.g. no `pro` row) fall back to `clarity_premium`. Then new users always get `pro`; `clarity_premium` stays for legacy/display only.
- **Result:** Same as A for new users; clarity_premium only assigned if `pro` is missing.

**Option C — Remove `clarity_premium` after cleanup**  
- Only after all subscribers are migrated to `pro` (or you no longer need the row): remove the `clarity_premium` row, remove it from webhook and create-checkout, and from RPCs. Not recommended before or at soft launch.

**Recommended for soft launch:** **Option A.** One premium plan (`pro`) for all new subscriptions; keep `clarity_premium` in DB and in `resolveUserPlan` for backward compatibility; webhook assigns only `pro`.

---

## 7. Checklist for implementing Option A

- [ ] **app/api/paymongo/webhook/route.ts** — In `handleCheckoutPaid` and `handleSubscriptionActivated`, replace `.or('name.eq.pro,name.eq.clarity_premium').limit(1).single()` with `.eq('name','pro').single()` (and handle “plan not found” if needed).
- [ ] **lib/resolveUserPlan.ts** — Leave `isProPlan = planName === 'pro' || planName === 'clarity_premium'` (no change).
- [ ] **app/api/paymongo/create-checkout/route.ts** — Optional: keep or change `metadata.plan` to `'pro'`; no impact on entitlements.
- [ ] **app/dashboard/upgrade-success/page.tsx** — Keep both checks for `pro` and `clarity_premium` (defensive; supports existing subscribers).
- [ ] **DB:** Do not remove the `clarity_premium` row; existing subscriptions keep working.
- [ ] **RPCs:** No change required for launch; can align with “pro only” display in a later phase.

After this, **only `pro` is assigned on payment;** `clarity_premium` remains valid for existing users and for resolveUserPlan, with zero ambiguity for new premium subscriptions at launch.
