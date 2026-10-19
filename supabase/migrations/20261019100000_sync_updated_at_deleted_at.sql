-- Offline sync prep: server-owned updated_at and soft-delete tombstones.
-- Additive. Does not schedule a job and does not change expenses / income_records RLS.
--
-- saved_amount is intentionally left as stored. No write path in this repo adds
-- allocation amounts into it (creates set 0). Displayed progress stays the sum of
-- live income_allocations, with the dashboard falling back to saved_amount only
-- when a goal has no live allocation rows. Do not add the two together until a
-- read-only check shows no goal has saved_amount <> 0 next to allocations.

COMMENT ON COLUMN public.goals.saved_amount IS
  'Legacy baseline written as 0 by the app. Not updated when income_allocations change. Not a computed total.';

CREATE OR REPLACE FUNCTION public.sync_row_timestamps()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Delete beats edit: a tombstone cannot be cleared or rewritten by a later update.
  IF TG_OP = 'UPDATE' AND OLD.deleted_at IS NOT NULL THEN
    NEW.deleted_at := OLD.deleted_at;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_row_timestamps() IS
  'BEFORE INSERT OR UPDATE on synced tables. The server sets updated_at. Once deleted_at is set, an update cannot clear it.';

-- expenses
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE public.expenses ALTER COLUMN updated_at SET DEFAULT now();
UPDATE public.expenses SET updated_at = COALESCE(created_at, now()) WHERE updated_at IS NULL;
ALTER TABLE public.expenses ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
COMMENT ON COLUMN public.expenses.updated_at IS 'Set by sync_row_timestamps on insert and update. Clients cannot choose this value.';
COMMENT ON COLUMN public.expenses.deleted_at IS 'Soft-delete tombstone. Null means live. Retained 90 days, then purge_soft_deleted_synced_rows().';

-- income_records
ALTER TABLE public.income_records ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE public.income_records ALTER COLUMN updated_at SET DEFAULT now();
UPDATE public.income_records SET updated_at = COALESCE(created_at, now()) WHERE updated_at IS NULL;
ALTER TABLE public.income_records ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE public.income_records ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
COMMENT ON COLUMN public.income_records.updated_at IS 'Set by sync_row_timestamps on insert and update. Clients cannot choose this value.';
COMMENT ON COLUMN public.income_records.deleted_at IS 'Soft-delete tombstone. Null means live. Retained 90 days, then purge_soft_deleted_synced_rows().';

-- goals
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE public.goals ALTER COLUMN updated_at SET DEFAULT now();
UPDATE public.goals SET updated_at = COALESCE(created_at, now()) WHERE updated_at IS NULL;
ALTER TABLE public.goals ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
COMMENT ON COLUMN public.goals.updated_at IS 'Set by sync_row_timestamps on insert and update. Clients cannot choose this value.';
COMMENT ON COLUMN public.goals.deleted_at IS 'Soft-delete tombstone. Null means live. Retained 90 days, then purge_soft_deleted_synced_rows().';

-- income_allocations (no created_at in current writers)
ALTER TABLE public.income_allocations ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE public.income_allocations ALTER COLUMN updated_at SET DEFAULT now();
UPDATE public.income_allocations SET updated_at = now() WHERE updated_at IS NULL;
ALTER TABLE public.income_allocations ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE public.income_allocations ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
COMMENT ON COLUMN public.income_allocations.updated_at IS 'Set by sync_row_timestamps on insert and update. Clients cannot choose this value.';
COMMENT ON COLUMN public.income_allocations.deleted_at IS 'Soft-delete tombstone. Null means live. Retained 90 days, then purge_soft_deleted_synced_rows().';

-- budget_overrides
ALTER TABLE public.budget_overrides ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE public.budget_overrides ALTER COLUMN updated_at SET DEFAULT now();
UPDATE public.budget_overrides SET updated_at = COALESCE(created_at, now()) WHERE updated_at IS NULL;
ALTER TABLE public.budget_overrides ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE public.budget_overrides ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
COMMENT ON COLUMN public.budget_overrides.updated_at IS 'Set by sync_row_timestamps on insert and update. Clients cannot choose this value.';
COMMENT ON COLUMN public.budget_overrides.deleted_at IS 'Soft-delete tombstone. Null means live. Retained 90 days, then purge_soft_deleted_synced_rows().';

-- budget_plans already has updated_at and a BEFORE UPDATE trigger. Extend it to
-- INSERT OR UPDATE and keep a tombstone from being cleared. Backfill runs after
-- the old trigger is dropped so a null updated_at can keep created_at.
DROP TRIGGER IF EXISTS budget_plans_updated_at ON public.budget_plans;
ALTER TABLE public.budget_plans ALTER COLUMN updated_at SET DEFAULT now();
UPDATE public.budget_plans SET updated_at = COALESCE(created_at, now()) WHERE updated_at IS NULL;
ALTER TABLE public.budget_plans ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE public.budget_plans ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
COMMENT ON COLUMN public.budget_plans.updated_at IS 'Set by sync_row_timestamps on insert and update. Clients cannot choose this value.';
COMMENT ON COLUMN public.budget_plans.deleted_at IS 'Soft-delete tombstone. Null means live. Retained 90 days, then purge_soft_deleted_synced_rows().';

-- financial_accounts already has updated_at NOT NULL DEFAULT now() and no trigger.
ALTER TABLE public.financial_accounts ALTER COLUMN updated_at SET DEFAULT now();
UPDATE public.financial_accounts SET updated_at = COALESCE(created_at, now()) WHERE updated_at IS NULL;
ALTER TABLE public.financial_accounts ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE public.financial_accounts ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
COMMENT ON COLUMN public.financial_accounts.updated_at IS 'Set by sync_row_timestamps on insert and update. Clients cannot choose this value.';
COMMENT ON COLUMN public.financial_accounts.deleted_at IS 'Soft-delete tombstone. Null means live. Retained 90 days, then purge_soft_deleted_synced_rows().';

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'expenses',
    'income_records',
    'goals',
    'income_allocations',
    'budget_overrides',
    'budget_plans',
    'financial_accounts'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_sync_row', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.sync_row_timestamps()',
      t || '_sync_row',
      t
    );
  END LOOP;
END $$;

-- Sync pull is WHERE user_id = ? AND updated_at > ?. Equality column first.
-- Includes tombstones. income_allocations is indexed after user_id is added.
CREATE INDEX IF NOT EXISTS idx_expenses_user_updated_at ON public.expenses (user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_income_records_user_updated_at ON public.income_records (user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_goals_user_updated_at ON public.goals (user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_budget_overrides_user_updated_at ON public.budget_overrides (user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_budget_plans_user_updated_at ON public.budget_plans (user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_financial_accounts_user_updated_at ON public.financial_accounts (user_id, updated_at);

-- Not scheduled. Call from a trusted job with the service role:
--   SELECT public.purge_soft_deleted_synced_rows();
-- Children are removed first. A parent with a remaining allocation row is kept
-- so a foreign key cannot drop a newer tombstone early.
CREATE OR REPLACE FUNCTION public.purge_soft_deleted_synced_rows()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff timestamptz := now() - interval '90 days';
  v_allocations bigint;
  v_expenses bigint;
  v_income bigint;
  v_goals bigint;
  v_overrides bigint;
  v_plans bigint;
  v_accounts bigint;
BEGIN
  DELETE FROM public.income_allocations
  WHERE deleted_at IS NOT NULL AND deleted_at < v_cutoff;
  GET DIAGNOSTICS v_allocations = ROW_COUNT;

  DELETE FROM public.expenses
  WHERE deleted_at IS NOT NULL AND deleted_at < v_cutoff;
  GET DIAGNOSTICS v_expenses = ROW_COUNT;

  DELETE FROM public.income_records AS ir
  WHERE ir.deleted_at IS NOT NULL
    AND ir.deleted_at < v_cutoff
    AND NOT EXISTS (
      SELECT 1 FROM public.income_allocations AS a
      WHERE a.income_record_id = ir.id
    );
  GET DIAGNOSTICS v_income = ROW_COUNT;

  DELETE FROM public.goals AS g
  WHERE g.deleted_at IS NOT NULL
    AND g.deleted_at < v_cutoff
    AND NOT EXISTS (
      SELECT 1 FROM public.income_allocations AS a
      WHERE a.goal_id = g.id
    );
  GET DIAGNOSTICS v_goals = ROW_COUNT;

  DELETE FROM public.budget_overrides
  WHERE deleted_at IS NOT NULL AND deleted_at < v_cutoff;
  GET DIAGNOSTICS v_overrides = ROW_COUNT;

  DELETE FROM public.budget_plans
  WHERE deleted_at IS NOT NULL AND deleted_at < v_cutoff;
  GET DIAGNOSTICS v_plans = ROW_COUNT;

  DELETE FROM public.financial_accounts
  WHERE deleted_at IS NOT NULL AND deleted_at < v_cutoff;
  GET DIAGNOSTICS v_accounts = ROW_COUNT;

  RETURN jsonb_build_object(
    'cutoff', v_cutoff,
    'income_allocations', v_allocations,
    'expenses', v_expenses,
    'income_records', v_income,
    'goals', v_goals,
    'budget_overrides', v_overrides,
    'budget_plans', v_plans,
    'financial_accounts', v_accounts
  );
END;
$$;

COMMENT ON FUNCTION public.purge_soft_deleted_synced_rows() IS
  'Hard-deletes synced tombstones older than 90 days. Not scheduled. Run as service_role: SELECT public.purge_soft_deleted_synced_rows();';

REVOKE ALL ON FUNCTION public.purge_soft_deleted_synced_rows() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_soft_deleted_synced_rows() TO service_role;
