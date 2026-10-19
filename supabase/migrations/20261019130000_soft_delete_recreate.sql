-- Soft-delete writes, server-stamped deleted_at, and partial unique indexes.
-- Safe to re-run. Does not schedule purge and does not touch account-wipe cascades.
--
-- A tombstone keeps its id so a pull can see the delete. Recreating the same
-- logical row inserts a new id. Unique indexes that would block that insert
-- apply only to live rows (deleted_at IS NULL). Primary keys stay unique.
-- Rows are not revived: clearing deleted_at stays forbidden.

CREATE OR REPLACE FUNCTION public.sync_row_timestamps()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.deleted_at IS NOT NULL THEN
    NEW.deleted_at := OLD.deleted_at;
  ELSIF NEW.deleted_at IS NOT NULL THEN
    NEW.deleted_at := now();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_row_timestamps() IS
  'BEFORE INSERT OR UPDATE on synced tables. The server sets updated_at. A transition to deleted stamps deleted_at = now(). Once deleted_at is set, an update cannot clear it.';

CREATE OR REPLACE FUNCTION public.income_allocations_enforce_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_goal_user uuid;
  v_goal_deleted timestamptz;
  v_income_user uuid;
BEGIN
  SELECT g.user_id, g.deleted_at INTO v_goal_user, v_goal_deleted
  FROM public.goals AS g
  WHERE g.id = NEW.goal_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid goal in allocations.';
  END IF;

  IF v_goal_deleted IS NOT NULL
     AND NOT (TG_OP = 'UPDATE' AND NEW.deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Invalid goal in allocations.';
  END IF;

  IF NEW.user_id IS NULL THEN
    NEW.user_id := v_goal_user;
  END IF;

  IF NEW.user_id IS DISTINCT FROM v_goal_user THEN
    RAISE EXCEPTION 'Invalid goal in allocations.';
  END IF;

  IF NEW.income_record_id IS NOT NULL THEN
    SELECT ir.user_id INTO v_income_user
    FROM public.income_records AS ir
    WHERE ir.id = NEW.income_record_id;
    IF NOT FOUND OR v_income_user IS DISTINCT FROM NEW.user_id THEN
      RAISE EXCEPTION 'Income record not found or unauthorized.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.income_allocations_enforce_owner() IS
  'BEFORE INSERT OR UPDATE. user_id must match the goal owner. Inserts onto a soft-deleted goal are rejected. The income record, when set, must belong to the same user.';

DROP POLICY IF EXISTS income_allocations_insert_own ON public.income_allocations;
DROP POLICY IF EXISTS income_allocations_update_own ON public.income_allocations;

CREATE POLICY income_allocations_insert_own
  ON public.income_allocations
  FOR INSERT
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND EXISTS (
      SELECT 1
      FROM public.goals AS g
      WHERE g.id = income_allocations.goal_id
        AND g.user_id = income_allocations.user_id
    )
  );

CREATE POLICY income_allocations_update_own
  ON public.income_allocations
  FOR UPDATE
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND EXISTS (
      SELECT 1
      FROM public.goals AS g
      WHERE g.id = income_allocations.goal_id
        AND g.user_id = income_allocations.user_id
    )
  );

-- replace_budget_plan used to hard-delete every plan row. Soft-delete the live
-- rows, then insert the replacement set as new ids.
CREATE OR REPLACE FUNCTION public.replace_budget_plan(p_items jsonb)
RETURNS SETOF public.budget_plans
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Send at least one category with amount greater than 0.';
  END IF;

  UPDATE public.budget_plans
  SET deleted_at = now()
  WHERE user_id = v_uid
    AND deleted_at IS NULL;

  RETURN QUERY
  INSERT INTO public.budget_plans (user_id, category, amount, note)
  SELECT v_uid, trim(e->>'category'), (e->>'amount')::numeric, nullif(trim(e->>'note'), '')
  FROM jsonb_array_elements(p_items) e
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_budget_plan(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_budget_plan(jsonb) TO authenticated;

-- Re-assert the allocation update RPC so a database that already applied the
-- earlier body (which hard-deleted removed allocations) picks up the tombstone.
CREATE OR REPLACE FUNCTION public.update_income_with_allocations(
  p_income_id uuid,
  p_user_id uuid,
  p_total_amount numeric,
  p_date date,
  p_income_source text,
  p_allocations jsonb
)
RETURNS TABLE (
  id uuid,
  total_amount numeric,
  disposable_amount numeric,
  date date,
  income_source text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_alloc_sum numeric := 0;
  v_goal_id uuid;
  v_amount numeric;
  v_elem jsonb;
  v_found boolean;
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Income record not found or unauthorized.';
  END IF;

  SELECT ir.id INTO v_row
  FROM income_records AS ir
  WHERE ir.id = p_income_id
    AND ir.user_id = p_user_id
    AND ir.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Income record not found or unauthorized.';
  END IF;

  IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array' THEN
    RAISE EXCEPTION 'Invalid allocations: must be a JSON array.';
  END IF;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_goal_id := (v_elem->>'goal_id')::uuid;
    v_amount := (v_elem->>'amount')::numeric;
    IF v_goal_id IS NULL OR v_amount IS NULL OR v_amount <= 0 THEN
      CONTINUE;
    END IF;
    SELECT EXISTS(
      SELECT 1
      FROM goals AS g
      WHERE g.id = v_goal_id
        AND g.user_id = p_user_id
        AND g.deleted_at IS NULL
    ) INTO v_found;
    IF NOT v_found THEN
      RAISE EXCEPTION 'Invalid goal in allocations.';
    END IF;
    v_alloc_sum := v_alloc_sum + v_amount;
  END LOOP;

  IF v_alloc_sum > p_total_amount THEN
    RAISE EXCEPTION 'Total allocations cannot exceed income amount.';
  END IF;

  UPDATE income_records
  SET
    total_amount = p_total_amount,
    disposable_amount = p_total_amount - v_alloc_sum,
    date = p_date,
    income_source = p_income_source
  WHERE income_records.id = p_income_id
    AND income_records.user_id = p_user_id
    AND income_records.deleted_at IS NULL;

  UPDATE income_allocations AS a
  SET deleted_at = now()
  WHERE a.income_record_id = p_income_id
    AND a.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_allocations) AS elem
      WHERE (elem->>'goal_id')::uuid = a.goal_id
    );

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_goal_id := (v_elem->>'goal_id')::uuid;
    v_amount := (v_elem->>'amount')::numeric;
    IF v_goal_id IS NULL OR v_amount IS NULL OR v_amount <= 0 THEN
      CONTINUE;
    END IF;
    UPDATE income_allocations
    SET amount = v_amount
    WHERE income_record_id = p_income_id
      AND goal_id = v_goal_id
      AND deleted_at IS NULL;
    IF NOT FOUND THEN
      INSERT INTO income_allocations (income_record_id, goal_id, amount, user_id)
      VALUES (p_income_id, v_goal_id, v_amount, p_user_id);
    END IF;
  END LOOP;

  RETURN QUERY
  SELECT ir.id, ir.total_amount, ir.disposable_amount, ir.date, ir.income_source
  FROM income_records AS ir
  WHERE ir.id = p_income_id
    AND ir.user_id = p_user_id
    AND ir.deleted_at IS NULL;
END;
$$;

COMMENT ON FUNCTION public.update_income_with_allocations(uuid, uuid, numeric, date, text, jsonb) IS
  'Atomically update a live income record and soft-delete allocations removed from the payload. Used by PUT /api/income/[id].';

REVOKE ALL ON FUNCTION public.update_income_with_allocations(uuid, uuid, numeric, date, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_income_with_allocations(uuid, uuid, numeric, date, text, jsonb) TO authenticated;

-- Every non-primary unique index on a synced table becomes partial.
-- A unique constraint cannot take a WHERE clause, so it is replaced by an index.
DO $$
DECLARE
  r record;
  def text;
BEGIN
  FOR r IN
    SELECT
      t.relname AS table_name,
      ic.relname AS index_name,
      con.conname AS constraint_name,
      pg_get_indexdef(i.indexrelid) AS indexdef
    FROM pg_index i
    JOIN pg_class ic ON ic.oid = i.indexrelid
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    LEFT JOIN pg_constraint con
      ON con.conindid = i.indexrelid
     AND con.contype = 'u'
    WHERE n.nspname = 'public'
      AND t.relname = ANY (ARRAY[
        'expenses',
        'income_records',
        'goals',
        'income_allocations',
        'budget_overrides',
        'budget_plans',
        'financial_accounts'
      ])
      AND i.indisunique
      AND NOT i.indisprimary
      AND i.indpred IS NULL
  LOOP
    def := r.indexdef;
    IF r.constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', r.table_name, r.constraint_name);
    ELSE
      EXECUTE format('DROP INDEX IF EXISTS public.%I', r.index_name);
    END IF;
    EXECUTE def || ' WHERE deleted_at IS NULL';
  END LOOP;
END $$;
