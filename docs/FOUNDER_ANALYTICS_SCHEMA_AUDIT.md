# Founder Analytics – Schema Audit (Practical)

Audit of your Supabase schema against the founder analytics SQL. Only changes that **meaningfully improve metric accuracy** are recommended; no enterprise overengineering.

---

## 1. expenses table

### created_at

- **Current analytics limitation:**  
  DAU/WAU/MAU use **expense `date`** as the activity timestamp. So a user who **enters** an expense today but sets **date** to last week is counted as active **last week**, not today. Backfills (imports with past dates) also count on the expense date, not the day they were added.  
  **first_value_moment** uses `MIN(expenses.date)` as “first expense moment,” so it measures “time from signup to first expense **date**,” not “time to first **entry**.”  
  **seven_day_retention_activity** uses expense `date` in the 7-day window, so again “activity” is tied to the recorded date, not when the user actually did something.

- **Why it matters:**  
  **created_at** is the only way to know **when the user actually created** the row. That gives you:
  - Correct **activity day** for DAU/WAU/MAU (and retention): “user did something on day D.”
  - True **first_value_moment**: “average time from signup to first expense **entry**,” not just first expense date.

- **Schema change needed:** Add `created_at timestamptz NOT NULL DEFAULT now()`.

- **SQL migration:**

```sql
-- Add created_at to expenses (founder analytics: activity day + first_value_moment)
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
COMMENT ON COLUMN expenses.created_at IS 'When the expense was created; used for DAU/WAU/MAU and first_value_moment.';
```

- **Urgency:** **useful soon**  
  Metrics work today using `date`; adding `created_at` improves accuracy (especially after imports/backfills) and makes first_value_moment correct. Do it when you’re ready to update the analytics queries to use `created_at` for activity and first expense.

---

### updated_at

- **Current analytics limitation:**  
  None of your current founder metrics use “last time this expense was updated.” DAU/WAU/MAU and retention are defined as “user **created** (or had dated) something on that day,” not “user edited something.”

- **Why it matters (or doesn’t):**  
  **updated_at** is useful for support/audit (“when did they last change this?”) and for a possible future metric like “users who edited an expense in the last 7 days.” It does **not** change the accuracy of your existing metrics.

- **Schema change needed:** Optional. Not required for the current founder analytics set.

- **SQL migration:** Skip for now. If you add it later:

```sql
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
-- plus trigger to set updated_at on UPDATE (same pattern as profiles).
```

- **Urgency:** **later stage**  
  Add only when you need audit trail or “last edited”–style metrics.

---

## 2. income_records table

### created_at

- **Current analytics limitation:**  
  Same as expenses: DAU/WAU/MAU and **seven_day_retention_activity** use **income `date`** as the activity timestamp. So activity is attributed to the income’s date, not the day the user entered it. You don’t have a “first income” metric yet, but if you add one, it would currently be “first income **date**,” not “first income **entry**.”

- **Why it matters:**  
  **created_at** gives you the real **activity day** (when the user added the row) for DAU/WAU/MAU and retention, and would allow an accurate “first income moment” if you add that metric later.

- **Schema change needed:** Add `created_at timestamptz NOT NULL DEFAULT now()`.

- **SQL migration:**

```sql
-- Add created_at to income_records (founder analytics: activity day)
ALTER TABLE income_records ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
COMMENT ON COLUMN income_records.created_at IS 'When the income record was created; used for DAU/WAU/MAU and retention.';
```

- **Urgency:** **useful soon**  
  Same as expenses: current metrics work with `date`; `created_at` improves correctness, especially with backfills/imports.

---

### updated_at

- **Current analytics limitation:**  
  No founder metric uses “last updated” for income.

- **Why it matters:**  
  Only for audit or future “last edited” metrics. Not needed for current accuracy.

- **Schema change needed:** None for current analytics.

- **SQL migration:** None.

- **Urgency:** **later stage**

---

## 3. budget_plans table

### updated_at for “real” active budget tracking

- **Current analytics limitation:**  
  **active_budget_users** is “users with at least one budget_plan whose **created_at** is in the last 90 days.” So:
  - User who created a budget 6 months ago and **still edits it every week** → **excluded** (created_at &gt; 90 days ago).
  - User who created a budget yesterday and **never touches it again** → **included**.

  So “active” is really “created recently,” not “touched recently.”

- **Why it matters:**  
  **updated_at** (or equivalent “last touched” timestamp) lets you define “active budget user” as “has at least one budget row **updated or created** in the last N days,” which matches “actually using budgets” better.

- **Schema change needed:** Add `updated_at timestamptz DEFAULT now()` and a trigger to set it on UPDATE. Then in analytics, use `GREATEST(created_at, updated_at)` (or `COALESCE(updated_at, created_at)`) for the 90-day recency window.

- **SQL migration:**

```sql
-- budget_plans: updated_at for active_budget_users recency (touched, not just created)
ALTER TABLE budget_plans ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE OR REPLACE FUNCTION budget_plans_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS budget_plans_updated_at ON budget_plans;
CREATE TRIGGER budget_plans_updated_at
  BEFORE UPDATE ON budget_plans
  FOR EACH ROW EXECUTE FUNCTION budget_plans_set_updated_at();

COMMENT ON COLUMN budget_plans.updated_at IS 'Set on update; use with created_at for active_budget_users recency (e.g. GREATEST(created_at, updated_at)).';
```

- **Urgency:** **useful soon**  
  One metric (active_budget_users) becomes more accurate; no new tables. Do when you’re ready to change that query to use `GREATEST(created_at, updated_at)` (or backfill `updated_at = created_at` for existing rows first).

---

## 4. subscriptions table

### Current schema vs founder needs

- **Active Pro tracking:**  
  Already fully supported: `status = 'active'`, `current_period_end > now()`, and `plan_id` → `plans.name IN ('pro','clarity_premium')`. Your pro_users and free_to_pro_conversion queries are correct.

- **Renewals:**  
  You have one row per user (`UNIQUE(user_id)`). When a subscription renews (e.g. PayMongo), you typically update `current_period_start` and `current_period_end`. There is no **updated_at** or **subscription_history** table, so you cannot directly “count renewals in the last 30 days” from subscriptions alone. You could infer from **payment_events** if renewal success events are stored there with a stable event_type.

- **Churn visibility:**  
  Snapshot churn is supported: users with `status IN ('canceled','expired')` and `current_period_end < now()` are churned. You don’t need extra columns for “how many are churned right now.” Time-series churn (e.g. “churned last month”) would need history or event logs; that’s beyond founder-grade for now.

- **Schema change needed:** None for current metrics. Optional later: **updated_at** on subscriptions if you want “last time this subscription row was changed” (e.g. for “renewals in last N days” approximated by “rows updated in last N days”), but that’s inference, not a true renewal count.

- **SQL migration:** None now.

- **Urgency:** **later stage** for renewal/churn-over-time; **no change** for active pro and current churn snapshot.

---

## 5. profiles table

### last_active_at

- **Current setup:**  
  Activity for DAU/WAU/MAU and retention comes from **domain tables**: expenses, income_records, goals, budget_plans, budget_overrides (by `date` or `created_at`). That’s already implemented and works.

- **What last_active_at would add:**  
  - One place to read “last time user was active” → simpler/faster DAU/WAU/MAU queries (one table scan).  
  - Ability to count “opened app” even when the user didn’t create or edit anything (e.g. only viewed dashboard).

- **Why skip for now:**  
  You already have working, accurate-enough activity from domain data. Adding **last_active_at** means touching **every** meaningful request (middleware/API) to update it, and maintaining that contract. For founder-grade metrics, the current union of five tables is sufficient and doesn’t require a new column or write path.

- **Schema change needed:** None for current analytics.

- **SQL migration:** None.

- **Urgency:** **later stage**  
  Revisit when you want (a) simpler/faster activity queries, or (b) “opened app” without domain events. Not necessary for metric accuracy today.

---

## 6. event table (user_activity_events)

- **Current setup:**  
  DAU/WAU/MAU and retention use a **union of expenses, income_records, goals, budget_plans, budget_overrides**. No event table.

- **What an event table would add:**  
  One table for all activity; easy to add new event types (e.g. “opened_settings”); one query for DAU/WAU/MAU and retention; foundation for funnels and feature usage later.

- **Why delay:**  
  Adding **user_activity_events** means: new table, RLS, writing an event on every relevant action in the app, and (if you backfill) one-off backfills. Your current queries already work and are correct for founder use. The 5-table union is a bit heavier but acceptable at current scale. Event tables shine when you need event-level analytics (funnels, feature adoption) or when the union query becomes a performance issue.

- **Schema change needed:** None for now.

- **SQL migration:** None now. Use the “Recommended next analytics table” in FOUNDER_DASHBOARD_ANALYTICS_SQL.md when you decide to add it.

- **Urgency:** **later stage**  
  Add when you need event-level analytics or when the union of five tables is too slow. Not required for current metric accuracy.

---

## Summary: what to do now vs later

| Table / column | Change | Urgency |
|----------------|--------|--------|
| **expenses.created_at** | Add column; then switch activity + first_value_moment to use it | **useful soon** |
| expenses.updated_at | Skip | later stage |
| **income_records.created_at** | Add column; then switch activity/retention to use it | **useful soon** |
| income_records.updated_at | Skip | later stage |
| **budget_plans.updated_at** | Add column + trigger; then active_budget_users use GREATEST(created_at, updated_at) | **useful soon** |
| subscriptions | No change for active pro / churn snapshot | — |
| profiles.last_active_at | Skip for now | later stage |
| user_activity_events | Skip for now | later stage |

**Suggested order:**  
1. Add **expenses.created_at** and **income_records.created_at** (one migration).  
2. Update founder analytics SQL to use **created_at** for expenses/income in DAU/WAU/MAU, first_value_moment, and retention_activity.  
3. Add **budget_plans.updated_at** + trigger; backfill existing rows with `updated_at = created_at`; update active_budget_users to use recency on `GREATEST(created_at, updated_at)`.

No urgent schema change is required for the metrics to function; the “useful soon” items improve accuracy and one metric (active_budget_users) without overengineering.
