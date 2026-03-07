# Plans Table Schema Audit — Active vs Legacy

**Goal:** Align subscription schema with current KlaroPH Free vs Pro product without breaking existing logic. Prepare for launch; deprecate legacy columns after soft launch.

---

## Plans table: current columns

| Column             | Type    | Active / Legacy | Used by |
|--------------------|---------|-----------------|--------|
| `id`               | uuid    | Active          | All lookups, subscriptions.plan_id |
| `name`             | text    | Active          | resolveUserPlan, webhook, RPC, handle_new_user |
| `max_goals`        | int     | **Active**      | resolveUserPlan, goals API, features API, RPC, frontend (max_goals) |
| `has_export`       | boolean | **Active**      | resolveUserPlan, export API, features API, RPC |
| `has_analytics`    | boolean | **Active**      | resolveUserPlan, features API (advanced_analytics), RPC |
| `has_budgeting`    | boolean | **Active** (added) | resolveUserPlan → entitlements (full budgeting entitlement) |
| `has_simulator`    | boolean | **Legacy**      | Plans table + RPC only. App derives from `plan_name === 'pro'` in /api/features |
| `has_scenarios`    | boolean | **Legacy**      | Plans table + RPC only. App derives from `plan_name === 'pro'` in /api/features |
| `has_smart_insights` | boolean | **Legacy**    | Plans table + RPC only. App derives from `plan_name === 'pro'` in /api/features |
| `created_at`       | timestamptz | Metadata   | Not used for entitlements |

---

## Where each column is used

### Active columns (keep; align with product)

- **max_goals**  
  - **Backend:** `lib/resolveUserPlan.ts` (select + map), `app/api/goals/route.ts` (creation limit), `app/api/features/route.ts` (response).  
  - **Frontend:** `app/dashboard/page.tsx`, `app/dashboard/goals/page.tsx` (via features.max_goals).  
  - **DB:** All `get_user_features`-style RPCs (migrations, fix script).

- **has_export**  
  - **Backend:** `lib/resolveUserPlan.ts` (select + map as `export_enabled`), `app/api/analytics/export/route.ts` (403 when disabled), `app/api/features/route.ts`.  
  - **DB:** RPCs return it.

- **has_analytics**  
  - **Backend:** `lib/resolveUserPlan.ts` (select + map as `advanced_analytics`), `app/api/features/route.ts` (has_analytics, analyticsCutoffDate for free).  
  - **DB:** RPCs return it.

- **has_budgeting** (new)  
  - **Backend:** `lib/resolveUserPlan.ts` (select + map as `full_budgeting_entitled`), `lib/entitlements.ts` (getBudgetEditingAllowed: Pro or 30-day free trial).  
  - **Product:** “Monthly Budgeting” — Pro always; Free only first 30 days (time rule in app; plan column = “plan includes full budgeting”).

### Legacy columns (do not remove yet; deprecate after soft launch)

- **has_simulator, has_scenarios, has_smart_insights**  
  - **DB:** Present in `plans` table and in all `get_user_features` RPC definitions (migrations, `fix_get_user_features_execute.sql`).  
  - **App:** Not read from DB by the main path. `app/api/features/route.ts` **derives** them as `plan.plan_name === 'pro'` and returns them so the frontend type `UserFeatures` remains satisfied.  
  - **Frontend:** No component uses these three for gating; they exist only in `types/features.ts` and the /api/features response.  
  - **Conclusion:** Safe to mark legacy. Remove from RPC and app response only after a deprecation pass (see below).

---

## Single source of truth

- **API routes:** Use `resolveUserPlan(userId)` from `lib/resolveUserPlan.ts` (reads `plans` only for subscribed plan: `max_goals`, `has_export`, `has_analytics`, `has_budgeting`). No direct RPC call to `get_user_features` in app code.
- **Frontend:** Uses `GET /api/features` (which uses `resolveUserPlan` + `getBudgetEditingAllowed`). Do not hardcode plan logic in the frontend.
- **Budget editing:** `has_budget_editing` = `getBudgetEditingAllowed(plan, userCreatedAt)` (Pro or Free within 30 days). Plan’s `has_budgeting` means “plan includes full budgeting”; 30-day rule stays in app.

---

## Deprecation plan (after soft launch)

1. **Phase 1 (done at launch)**  
   - Add `has_budgeting` to `plans`.  
   - Use `has_budgeting` in `resolveUserPlan` and entitlements.  
   - Keep `has_simulator`, `has_scenarios`, `has_smart_insights` in table and RPC; keep returning them from /api/features so nothing breaks.

2. **Phase 2 (post–soft launch)**  
   - Remove `has_simulator`, `has_scenarios`, `has_smart_insights` from `get_user_features` RPC(s) and return object.  
   - Remove from `types/features.ts` and from `/api/features` response.  
   - Optionally drop columns from `plans` (or leave as unused for a later cleanup).

3. **Naming**  
   - Backend feature flags and plan columns already align with product (max_goals, export, analytics, budgeting). Legacy names (simulator, scenarios, smart_insights) can be dropped when the columns are deprecated.

---

## Files to touch for this audit

- **Schema:** `supabase/migrations/20250225000000_klaroph_plans_subscriptions_profiles.sql` (original); new migration adds `has_budgeting`.  
- **RPCs:** `supabase/migrations/20250230100000_get_user_features_active_period.sql`, `20250227000000_clarity_premium_grace_plan_type.sql`, `supabase/scripts/fix_get_user_features_execute.sql` — still reference legacy columns; do not change until Phase 2.  
- **App:** `lib/resolveUserPlan.ts` (active columns + has_budgeting), `lib/entitlements.ts` (use full_budgeting_entitled), `app/api/features/route.ts` (derives legacy flags; add nothing new for legacy).
