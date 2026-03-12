# Migration 20260316000000_founder_analytics_schema.sql – Production safety review

## Verdict: **Changes needed before production**

Two issues must be fixed before running on production; one improvement recommended.

---

## 1. expenses.created_at

| Check | Status | Notes |
|-------|--------|------|
| **Safe defaults** | ❌ Problem | `NOT NULL DEFAULT now()` with a **volatile** default (`now()`) causes PostgreSQL to **rewrite the entire table** and hold an **ACCESS EXCLUSIVE** lock so it can write a value into every existing row. On large tables this can mean long blocking of all reads/writes. |
| **Existing row backfill** | N/A | Backfill is done by the rewrite (every row gets `now()` at ALTER time). Semantically wrong for old rows (they all get “migration time” as created_at). |
| **Trigger** | N/A | No trigger on expenses. |
| **Index** | Optional | No index on `created_at`. For DAU/WAU/MAU filters by `created_at` you may want `CREATE INDEX idx_expenses_created_at ON expenses(created_at)` (or `(user_id, created_at)`) later. Not required for correctness. |
| **RLS** | ✅ OK | Policies are on `user_id`. New column is not used in any policy. No RLS side effects. |
| **Lock-heavy** | ❌ Yes | Full table rewrite under ACCESS EXCLUSIVE for any non-empty table. |

**Required change:** Add the column in a non-rewrite way, then backfill, then set NOT NULL:

1. `ADD COLUMN created_at timestamptz` (no default) → metadata-only, no rewrite.
2. `ALTER COLUMN created_at SET DEFAULT now()` → default for new rows only.
3. Backfill existing rows (see migration fix below). Use `date::timestamptz` as proxy where possible so analytics are meaningful.
4. `ALTER COLUMN created_at SET NOT NULL` after backfill.

---

## 2. income_records.created_at

| Check | Status | Notes |
|-------|--------|------|
| **Safe defaults** | ❌ Same as expenses | `NOT NULL DEFAULT now()` is volatile → full table rewrite + ACCESS EXCLUSIVE lock. |
| **Existing row backfill** | Same | Should backfill with a sensible value (e.g. `date::timestamptz`), then set NOT NULL. |
| **Trigger** | N/A | No trigger. |
| **Index** | Optional | Consider `idx_income_records_created_at` (or `(user_id, created_at)`) for analytics. |
| **RLS** | ✅ OK | No policy references the new column. |
| **Lock-heavy** | ❌ Yes | Same as expenses. |

**Required change:** Same pattern as expenses: add nullable, set default, backfill with `date::timestamptz`, then set NOT NULL.

---

## 3. budget_plans.updated_at

| Check | Status | Notes |
|-------|--------|------|
| **Safe defaults** | ⚠️ Prefer safer pattern | `DEFAULT now()` is volatile. Adding the column with default can cause a full table rewrite on some versions. Safer: add nullable, set default, then backfill. |
| **Existing row backfill** | ❌ Bug | `UPDATE budget_plans SET updated_at = created_at WHERE updated_at IS NULL` does nothing if the column was added with `DEFAULT now()`: existing rows are already filled (or will be after a rewrite), so none are NULL. You need an **unconditional** backfill: `UPDATE budget_plans SET updated_at = created_at` so that existing rows get “last touch = creation” until they are edited. |
| **Update trigger** | ✅ OK | `BEFORE UPDATE FOR EACH ROW` sets `NEW.updated_at = now()`. Correct. Function has no side effects and does not need SECURITY DEFINER. |
| **Index** | Optional | For `active_budget_users` filtering by `GREATEST(created_at, updated_at)` or similar, an index on `created_at` (or both) can help; not required for correctness. |
| **RLS** | ✅ OK | No policy uses `updated_at`. No RLS side effects. |
| **Lock-heavy** | ⚠️ | Single UPDATE over full table; on `budget_plans` (small: one row per user per category) this is usually acceptable. Avoid if you have huge budget_plans volume. |

**Required change:**  
- Use the same safe add/default/backfill pattern for `updated_at` (add nullable, set default, then backfill).  
- Backfill must be unconditional: `UPDATE budget_plans SET updated_at = created_at` (no `WHERE updated_at IS NULL`).

---

## Summary

| Item | Safe as-is? | Change required |
|------|-------------|------------------|
| expenses.created_at | No | Add column nullable + SET DEFAULT + backfill with `date::timestamptz` + SET NOT NULL (no volatile default on ADD COLUMN). |
| income_records.created_at | No | Same as expenses. |
| budget_plans.updated_at | No | Add column nullable + SET DEFAULT; backfill with `UPDATE budget_plans SET updated_at = created_at` (no WHERE); then trigger. |
| Trigger logic | Yes | No change. |
| Indexes | Optional | Add indexes on `created_at` / `updated_at` later if tables grow and analytics slow down. |
| RLS | Yes | No change. |

---

## Rollback concerns

- **Rollback** is not in the migration file. To revert you would need to:
  1. Drop trigger `budget_plans_updated_at` and function `budget_plans_set_updated_at()`.
  2. Drop columns `expenses.created_at`, `income_records.created_at`, `budget_plans.updated_at`.

- **Application and analytics:** After deploy, founder analytics (and any app code) may depend on these columns. Plan a short rollback window or a follow-up migration to revert if needed; document the rollback steps (e.g. in a RUNBOOK or this doc).

- **Idempotency:** Use of `ADD COLUMN IF NOT EXISTS` and `DROP TRIGGER IF EXISTS` is good; re-running the migration after a partial failure may leave backfill or NOT NULL to be redone. Prefer running once, or make the backfill/NOT NULL steps conditional (e.g. only run UPDATE where created_at IS NULL / only SET NOT NULL if not already NOT NULL).

---

## Recommended next step

Apply the **corrected migration** (see below) so that:

1. **expenses** and **income_records**: no full table rewrite; backfill uses `date::timestamptz` for existing rows so analytics are meaningful.
2. **budget_plans**: no rewrite; backfill unconditionally sets `updated_at = created_at` for existing rows; trigger handles future updates.

After applying, you can add indexes on `created_at` / `updated_at` in a separate migration if needed for performance.
