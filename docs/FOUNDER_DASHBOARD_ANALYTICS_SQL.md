# Founder Dashboard Analytics SQL (Production-Safe)

Based on the **actual** KlaroPH Supabase schema (profiles, plans, subscriptions, goals, budget_plans, budget_overrides, expenses, income_records, auth.users). One query per metric; timezone-safe and index-friendly.

---

## Founder dashboard API (single endpoint)

**GET /api/founder-dashboard** returns all metrics in one response. It calls the Postgres function `get_founder_metrics()` (one RPC, no 13 separate queries). Uses **service_role** only; do not call from the browser.

- **Auth (optional):** Set `FOUNDER_DASHBOARD_SECRET` in env; then send `Authorization: Bearer <secret>`. If unset, the route allows the request (for local dev).
- **Response:** JSON with `total_users`, `new_users_today`, `dau`, `wau`, `mau`, `total_expenses`, `active_budget_users`, `pro_users`, `free_to_pro_conversion`, `seven_day_retention`, `auth_audit`, `first_value_moment`, `seven_day_retention_activity`.
- **Migration:** `20260317000000_get_founder_metrics_function.sql` creates the function; run it before using the API.

---

## 1. total_users

**Definition:** Total registered users (auth + app user table). Using `public.profiles` as source of truth (1:1 with auth after trigger).

```sql
-- 1. total_users
SELECT COUNT(*)::int AS total_users
FROM public.profiles;
```

**Logic:** Count all rows in `profiles`. Every auth user gets a profile via `handle_new_user` trigger.

**Performance:** Full table count. Fine for small/medium user bases; for very large tables consider a cached count or `COUNT(*)` with an index on `profiles(id)` (PK already covers this).

**Indexes:** None required (PK scan). Optional: maintain a small stats table updated by trigger if counts get heavy.

---

## 2. new_users_today

**Definition:** Users created today (UTC).

```sql
-- 2. new_users_today
SELECT COUNT(*)::int AS new_users_today
FROM public.profiles
WHERE (created_at AT TIME ZONE 'UTC')::date = (now() AT TIME ZONE 'UTC')::date;
```

**Logic:** Count profiles where `created_at` (stored as timestamptz) falls on today's date in UTC.

**Performance:** Index on `created_at` makes this a range scan on today.

**Indexes (if missing):**
```sql
CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON public.profiles (created_at);
```

---

## 3. dau (Daily Active Users)

**Definition:** Unique users with **app activity** today (UTC). Activity = created an expense, income, goal, or budget on that day (or edited a budget). Uses existing tables only; no auth or event table.

```sql
-- 3. dau (app-activity based; expenses/income use created_at)
WITH today_utc AS (
  SELECT (now() AT TIME ZONE 'UTC')::date AS d
),
activity AS (
  SELECT user_id FROM public.expenses e, today_utc t WHERE (e.created_at AT TIME ZONE 'UTC')::date = t.d
  UNION
  SELECT user_id FROM public.income_records i, today_utc t WHERE (i.created_at AT TIME ZONE 'UTC')::date = t.d
  UNION
  SELECT user_id FROM public.goals g, today_utc t WHERE (g.created_at AT TIME ZONE 'UTC')::date = t.d
  UNION
  SELECT user_id FROM public.budget_plans bp, today_utc t WHERE (bp.created_at AT TIME ZONE 'UTC')::date = t.d
  UNION
  SELECT user_id FROM public.budget_overrides bo, today_utc t WHERE (bo.created_at AT TIME ZONE 'UTC')::date = t.d
)
SELECT COUNT(DISTINCT user_id)::int AS dau FROM activity;
```

**What changed:** Expenses and income now use `created_at` instead of `date` for activity day.

**Why more accurate:** Activity = “user did something on this calendar day.” `created_at` is when the row was inserted; `date` is the expense/income date and can differ (e.g. backdated entry). Using `created_at` aligns DAU with actual usage.

**Historical rows:** Rows backfilled in the migration have `created_at = (date AT TIME ZONE 'UTC')`, so for those rows “activity day” is still the expense/income date, not the true insert day. New and future rows are accurate.

**Performance:** Five index-friendly lookups. Consider `idx_expenses_created_at`, `idx_income_records_created_at` if tables grow; existing `(user_id, date)` indexes still help app queries.

---

## 4. wau (Weekly Active Users)

**Definition:** Unique users with app activity in the last 7 days (UTC).

```sql
-- 4. wau (app-activity based; expenses/income use created_at)
WITH window_end AS (
  SELECT (now() AT TIME ZONE 'UTC')::date + interval '1 day' AS end_utc,
         (now() AT TIME ZONE 'UTC')::date - interval '7 days' AS start_utc
),
activity AS (
  SELECT user_id FROM public.expenses e, window_end w
  WHERE e.created_at >= w.start_utc AND e.created_at < w.end_utc
  UNION
  SELECT user_id FROM public.income_records i, window_end w
  WHERE i.created_at >= w.start_utc AND i.created_at < w.end_utc
  UNION
  SELECT user_id FROM public.goals g, window_end w
  WHERE g.created_at >= w.start_utc AND g.created_at < w.end_utc
  UNION
  SELECT user_id FROM public.budget_plans bp, window_end w
  WHERE bp.created_at >= w.start_utc AND bp.created_at < w.end_utc
  UNION
  SELECT user_id FROM public.budget_overrides bo, window_end w
  WHERE bo.created_at >= w.start_utc AND bo.created_at < w.end_utc
)
SELECT COUNT(DISTINCT user_id)::int AS wau FROM activity;
```

**What changed:** Expenses and income now use `created_at` in the 7-day window instead of `date`.

**Why more accurate:** Same as DAU: activity window reflects when the user actually created the record, not the expense/income date.

**Historical rows:** Backfilled rows have `created_at = (date AT TIME ZONE 'UTC')`; for those, the window is still tied to the record date. New rows are accurate.

**Performance:** Range scans on created_at/date; index-friendly. Same index notes as DAU.

---

## 5. mau (Monthly Active Users)

**Definition:** Unique users with app activity in the last 30 days (UTC).

```sql
-- 5. mau (app-activity based; expenses/income use created_at)
WITH window_end AS (
  SELECT (now() AT TIME ZONE 'UTC')::date + interval '1 day' AS end_utc,
         (now() AT TIME ZONE 'UTC')::date - interval '30 days' AS start_utc
),
activity AS (
  SELECT user_id FROM public.expenses e, window_end w
  WHERE e.created_at >= w.start_utc AND e.created_at < w.end_utc
  UNION
  SELECT user_id FROM public.income_records i, window_end w
  WHERE i.created_at >= w.start_utc AND i.created_at < w.end_utc
  UNION
  SELECT user_id FROM public.goals g, window_end w
  WHERE g.created_at >= w.start_utc AND g.created_at < w.end_utc
  UNION
  SELECT user_id FROM public.budget_plans bp, window_end w
  WHERE bp.created_at >= w.start_utc AND bp.created_at < w.end_utc
  UNION
  SELECT user_id FROM public.budget_overrides bo, window_end w
  WHERE bo.created_at >= w.start_utc AND bo.created_at < w.end_utc
)
SELECT COUNT(DISTINCT user_id)::int AS mau FROM activity;
```

**What changed:** Expenses and income use `created_at` in the 30-day window instead of `date`.

**Why more accurate:** Same as DAU/WAU: activity = when the user created the record.

**Historical rows:** Backfilled rows remain approximate (created_at = record date). New rows accurate.

**Performance:** Range scans; same index notes as DAU/WAU.

---

## 6. total_expenses

**Definition:** Total number of expense records across all users.

```sql
-- 6. total_expenses
SELECT COUNT(*)::int AS total_expenses
FROM public.expenses;
```

**Logic:** Simple count of all rows in `expenses`. RLS does not apply when run with service_role or from a backend that bypasses RLS for analytics.

**Performance:** Full table count. For very large tables, consider a materialized or cached count.

**Indexes:** Existing `idx_expenses_user_date` helps per-user queries; no extra index required for this global count.

---

## 7. active_budget_users

**Definition:** Users who have at least one **recently touched** budget plan: created or updated within the last 90 days. Excludes abandoned budgets (created long ago and never edited).

```sql
-- 7. active_budget_users (created or updated in last 90 days)
SELECT COUNT(DISTINCT user_id)::int AS active_budget_users
FROM public.budget_plans
WHERE GREATEST(created_at, updated_at) >= (now() AT TIME ZONE 'UTC') - interval '90 days';
```

**What changed:** Recency now uses `GREATEST(created_at, updated_at)` instead of `created_at` only.

**Why more accurate:** A user who created a budget 6 months ago but still edits it is “active”; a user who created one yesterday and never touches it is still counted. The trigger keeps `updated_at` current on every update.

**Historical rows:** Backfilled rows have `updated_at = created_at`, so behavior matches the previous “created in last 90 days” for old data. New edits refresh `updated_at`.

**Performance:** Index on `created_at` or `updated_at` helps; consider both if the table grows.

---

## 8. pro_users

**Definition:** Distinct users with an active Pro subscription right now (status = 'active', period not ended, plan = pro or clarity_premium).

```sql
-- 8. pro_users (distinct users; safe if schema ever allows multiple subscription rows per user)
SELECT COUNT(DISTINCT s.user_id)::int AS pro_users
FROM public.subscriptions s
JOIN public.plans p ON p.id = s.plan_id
WHERE s.status = 'active'
  AND s.current_period_end > now()
  AND p.name IN ('pro', 'clarity_premium');
```

**Logic:** Explicitly `COUNT(DISTINCT s.user_id)` so the metric stays correct if the schema later allows multiple subscription rows per user. Today `subscriptions` has UNIQUE(user_id), so count equals number of rows.

**Performance:** Index on `(user_id, current_period_end DESC)` (e.g. `idx_subscriptions_user_period`) helps; optional `idx_subscriptions_status_period (status, current_period_end) WHERE status = 'active'`.

---

## 9. free_to_pro_conversion

**Definition:** Percentage of all users who are currently on a Pro plan (active subscription with plan pro or clarity_premium).

```sql
-- 9. free_to_pro_conversion
SELECT ROUND(
  100.0 * (SELECT COUNT(DISTINCT s.user_id)
           FROM public.subscriptions s
           JOIN public.plans p ON p.id = s.plan_id
           WHERE s.status = 'active'
             AND s.current_period_end > now()
             AND p.name IN ('pro', 'clarity_premium'))
  / NULLIF((SELECT COUNT(*) FROM public.profiles), 0),
  2
) AS free_to_pro_conversion;
```

**Logic:** Numerator = same as **pro_users**; denominator = **total_users**. Uses `NULLIF` to avoid division by zero. Result is a percentage (0-100). Note: current Pro share only; "ever converted" would require subscription history.

---

## 10. seven_day_retention

**Definition:** Of users who signed up in the last 14 days, the percentage who returned within 7 days of signup (using `auth.users.last_sign_in_at` as return).

```sql
-- 10. seven_day_retention (login-based)
WITH cohort AS (
  SELECT p.id AS user_id, p.created_at AS signup_at
  FROM public.profiles p
  WHERE p.created_at >= (now() AT TIME ZONE 'UTC')::date - interval '14 days'
),
returned AS (
  SELECT c.user_id
  FROM cohort c
  JOIN auth.users u ON u.id = c.user_id
  WHERE u.last_sign_in_at IS NOT NULL
    AND u.last_sign_in_at > c.signup_at
    AND u.last_sign_in_at <= c.signup_at + interval '7 days'
)
SELECT ROUND(
  100.0 * (SELECT COUNT(*) FROM returned) / NULLIF((SELECT COUNT(*) FROM cohort), 0),
  2
) AS seven_day_retention;
```

**Logic:** Cohort = signups in last 14 days. Returned = same users with `last_sign_in_at` after signup and within 7 days. For an app-activity-based alternative without auth, use metric 13.

---

## 11. Audit: auth.users vs profiles count mismatch

**Definition:** Compare counts of `auth.users` and `public.profiles` to detect trigger or sync gaps (e.g. profile not created for an auth user).

```sql
-- 11. Audit: auth vs profiles mismatch
SELECT
  (SELECT COUNT(*)::int FROM auth.users) AS auth_users_count,
  (SELECT COUNT(*)::int FROM public.profiles) AS profiles_count,
  (SELECT COUNT(*)::int FROM auth.users) - (SELECT COUNT(*)::int FROM public.profiles) AS auth_minus_profiles,
  (SELECT COUNT(*)::int FROM auth.users u WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)) AS auth_without_profile;
```

**Logic:** First two columns are raw counts; `auth_minus_profiles` should be 0 when the `handle_new_user` trigger runs for every insert. `auth_without_profile` is the number of auth users with no profile row (investigate these).

**Performance:** Two full table counts plus one anti-join; run occasionally, not per request.

---

## 12. first_value_moment (signup to first expense)

**Definition:** Average time from signup to first expense **entry** (when the user created the first expense row).

```sql
-- 12. first_value_moment (avg signup to first expense entry; uses created_at)
WITH first_expense AS (
  SELECT user_id, MIN(created_at) AS first_ts
  FROM public.expenses
  GROUP BY user_id
)
SELECT
  ROUND(AVG(EXTRACT(epoch FROM (fe.first_ts - p.created_at)) / 86400)::numeric, 2) AS avg_days_to_first_expense,
  ROUND(AVG(EXTRACT(epoch FROM (fe.first_ts - p.created_at)) / 3600)::numeric, 2) AS avg_hours_to_first_expense
FROM first_expense fe
JOIN public.profiles p ON p.id = fe.user_id;
```

**What changed:** First expense moment is now `MIN(expenses.created_at)` instead of `MIN(expenses.date)`.

**Why more accurate:** Measures “time from signup to first expense **entry**,” not “time to first expense **date**.” Handles backdated entries and gives a real time delta (hours/minutes), not just days.

**Historical rows:** Backfilled rows have `created_at = (date AT TIME ZONE 'UTC')`, so for them the metric is still “time to first expense date (midnight UTC).” New rows are true entry time.

**Performance:** One aggregate on `expenses` (user_id, created_at); index on `(user_id, created_at)` or `created_at` helps.

---

## 13. seven_day_retention_activity (no event table)

**Definition:** Of users who signed up in the last 14 days, the share who had **any app activity** within 7 days of signup (expense, income, goal, or budget created in that window).

```sql
-- 13. seven_day_retention_activity (app-activity based; expenses/income use created_at)
WITH cohort AS (
  SELECT p.id AS user_id, p.created_at AS signup_at
  FROM public.profiles p
  WHERE p.created_at >= (now() AT TIME ZONE 'UTC')::date - interval '14 days'
),
activity_in_window AS (
  SELECT c.user_id
  FROM cohort c
  WHERE EXISTS (SELECT 1 FROM public.expenses e WHERE e.user_id = c.user_id AND e.created_at > c.signup_at AND e.created_at <= c.signup_at + interval '7 days')
     OR EXISTS (SELECT 1 FROM public.income_records i WHERE i.user_id = c.user_id AND i.created_at > c.signup_at AND i.created_at <= c.signup_at + interval '7 days')
     OR EXISTS (SELECT 1 FROM public.goals g WHERE g.user_id = c.user_id AND g.created_at > c.signup_at AND g.created_at <= c.signup_at + interval '7 days')
     OR EXISTS (SELECT 1 FROM public.budget_plans bp WHERE bp.user_id = c.user_id AND bp.created_at > c.signup_at AND bp.created_at <= c.signup_at + interval '7 days')
     OR EXISTS (SELECT 1 FROM public.budget_overrides bo WHERE bo.user_id = c.user_id AND bo.created_at > c.signup_at AND bo.created_at <= c.signup_at + interval '7 days')
)
SELECT ROUND(
  100.0 * (SELECT COUNT(*) FROM activity_in_window) / NULLIF((SELECT COUNT(*) FROM cohort), 0),
  2
) AS seven_day_retention_activity;
```

**What changed:** Expenses and income now use `created_at` in (signup_at, signup_at+7 days] instead of `date`.

**Why more accurate:** “Returned” = user created an expense/income (or goal/budget) within 7 days of signup. Using `created_at` matches actual activity time; `date` could be backdated and misclassify users.

**Historical rows:** Backfilled expense/income rows have `created_at = (date AT TIME ZONE 'UTC')`, so for them the window is still the record date. New rows are accurate.

**Performance:** Up to five EXISTS per cohort user; indexes on (user_id, created_at) for expenses/income help.

---

## Schema gaps detected

| Gap | Impact | Mitigation |
|-----|--------|------------|
| No dedicated activity table | Activity = union of five tables; no single “session” or “page view” metric. | Optional: add `public.user_activity_events` (see below) for event-level analytics. |
| Auth vs profiles | Mismatch possible if trigger fails. | Run audit query #11 regularly. |

**Current schema:** expenses and income_records have `created_at`; budget_plans has `updated_at` with trigger. DAU/WAU/MAU, first_value_moment, retention_activity, and active_budget_users use these columns. Historical rows backfilled in migration 20260316000000 remain approximate (created_at/updated_at derived from date or created_at).

---

## Recommended next analytics table (KlaroPH)

A single **app-activity** table gives accurate DAU/WAU/MAU, retention, and first-value moments without scanning multiple domains.

**Suggested table: `public.user_activity_events`**

```sql
CREATE TABLE public.user_activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_user_activity_events_user_created
  ON public.user_activity_events (user_id, created_at DESC);
```

**Use:** DAU/WAU/MAU = `COUNT(DISTINCT user_id) WHERE created_at IN [window]`. Retention = cohort by signup; returned = at least one row with `created_at` in (signup, signup+7 days]. first_value_moment = per user `MIN(created_at)` where `event_type = 'expense_create'`; average with `profiles.created_at`. **Backfill:** Not required. **RLS:** Read by service_role/dashboard; insert from app via service role or SECURITY DEFINER.

---

## Summary of recommended indexes

| Table / use | Index | Purpose |
|-------------|--------|--------|
| `profiles` | `idx_profiles_created_at (created_at)` | new_users_today, seven_day_retention cohort |
| `expenses` | `idx_expenses_created_at (created_at)` or `(user_id, created_at)` (optional) | DAU/WAU/MAU, first_value_moment |
| `income_records` | `idx_income_records_created_at (created_at)` or `(user_id, created_at)` (optional) | DAU/WAU/MAU, retention_activity |
| `budget_plans` | `idx_budget_plans_created_at (created_at)`; optional `updated_at` | active_budget_users (GREATEST(created_at, updated_at)) |
| `subscriptions` | `idx_subscriptions_status_period (status, current_period_end) WHERE status = 'active'` | pro_users, free_to_pro_conversion (optional) |
| `goals` / `budget_*` | `created_at` (if missing, add) | DAU/WAU/MAU app-activity |

Existing indexes (from your migrations) that already help: `idx_expenses_user_date`, `idx_income_records_user_date`, `idx_subscriptions_user_period`.

All queries use only existing columns and tables; no columns were invented. Run with a role that can read `public` and `auth.users` (e.g. service_role or a SECURITY DEFINER function that selects into a dashboard view).
