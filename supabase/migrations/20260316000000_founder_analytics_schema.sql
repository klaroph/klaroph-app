-- Founder analytics: schema changes for metric accuracy (see docs/FOUNDER_ANALYTICS_SCHEMA_AUDIT.md)
-- Production-safe: no full table rewrite; backfill without long ACCESS EXCLUSIVE lock.

-- 1) expenses.created_at (DAU/WAU/MAU activity day + first_value_moment)
-- Add nullable, set default for new rows, backfill existing, then set NOT NULL (avoids table rewrite).
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE expenses ALTER COLUMN created_at SET DEFAULT now();
UPDATE expenses SET created_at = (date AT TIME ZONE 'UTC') WHERE created_at IS NULL;
ALTER TABLE expenses ALTER COLUMN created_at SET NOT NULL;
COMMENT ON COLUMN expenses.created_at IS 'When the expense was created; used for DAU/WAU/MAU and first_value_moment.';

-- 2) income_records.created_at (DAU/WAU/MAU + retention activity day)
ALTER TABLE income_records ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE income_records ALTER COLUMN created_at SET DEFAULT now();
UPDATE income_records SET created_at = (date AT TIME ZONE 'UTC') WHERE created_at IS NULL;
ALTER TABLE income_records ALTER COLUMN created_at SET NOT NULL;
COMMENT ON COLUMN income_records.created_at IS 'When the income record was created; used for DAU/WAU/MAU and retention.';

-- 3) budget_plans.updated_at (active_budget_users = touched recently, not just created recently)
-- Add nullable, set default, backfill all existing rows (unconditional), then add trigger.
ALTER TABLE budget_plans ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE budget_plans ALTER COLUMN updated_at SET DEFAULT now();
UPDATE budget_plans SET updated_at = created_at;
COMMENT ON COLUMN budget_plans.updated_at IS 'Set on update; use with created_at for active_budget_users (e.g. GREATEST(created_at, updated_at)).';

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
