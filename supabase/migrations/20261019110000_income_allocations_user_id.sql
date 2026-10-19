-- income_allocations: own user_id, nullable income_record_id, RLS on auth.uid().
-- Backfill comes from the parent income record. Rows whose income row is already
-- gone take the goal owner so they stay readable by that user and nobody else.
-- A row that still has no user, or whose user does not match the goal or the
-- income record, aborts this migration.

ALTER TABLE public.income_allocations ADD COLUMN IF NOT EXISTS user_id uuid;

UPDATE public.income_allocations AS a
SET user_id = ir.user_id
FROM public.income_records AS ir
WHERE a.income_record_id = ir.id
  AND a.user_id IS NULL;

UPDATE public.income_allocations AS a
SET user_id = g.user_id
FROM public.goals AS g
WHERE a.goal_id = g.id
  AND a.user_id IS NULL;

DO $$
DECLARE
  v_missing int;
  v_goal_mismatch int;
  v_income_mismatch int;
BEGIN
  SELECT count(*) INTO v_missing
  FROM public.income_allocations
  WHERE user_id IS NULL;
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'income_allocations backfill left % rows with no user_id', v_missing;
  END IF;

  SELECT count(*) INTO v_goal_mismatch
  FROM public.income_allocations AS a
  JOIN public.goals AS g ON g.id = a.goal_id
  WHERE a.user_id IS DISTINCT FROM g.user_id;
  IF v_goal_mismatch > 0 THEN
    RAISE EXCEPTION 'income_allocations user_id does not match the goal owner for % rows', v_goal_mismatch;
  END IF;

  SELECT count(*) INTO v_income_mismatch
  FROM public.income_allocations AS a
  JOIN public.income_records AS ir ON ir.id = a.income_record_id
  WHERE a.user_id IS DISTINCT FROM ir.user_id;
  IF v_income_mismatch > 0 THEN
    RAISE EXCEPTION 'income_allocations user_id does not match the income owner for % rows', v_income_mismatch;
  END IF;
END $$;

ALTER TABLE public.income_allocations ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.income_allocations ALTER COLUMN income_record_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'income_allocations_user_id_fkey'
      AND conrelid = 'public.income_allocations'::regclass
  ) THEN
    ALTER TABLE public.income_allocations
      ADD CONSTRAINT income_allocations_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

COMMENT ON COLUMN public.income_allocations.user_id IS
  'Owner. Backfilled from income_records.user_id. Deposits with a null income_record_id are allowed.';
COMMENT ON COLUMN public.income_allocations.income_record_id IS
  'Optional. Null means a deposit to a goal that is not tied to an income record.';

CREATE INDEX IF NOT EXISTS idx_income_allocations_user_updated_at
  ON public.income_allocations (user_id, updated_at);

-- Fills user_id when a writer omits it, and rejects a goal or income record
-- that belongs to someone else. Runs for SECURITY DEFINER RPCs as well as RLS.
CREATE OR REPLACE FUNCTION public.income_allocations_enforce_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_goal_user uuid;
  v_income_user uuid;
BEGIN
  SELECT g.user_id INTO v_goal_user
  FROM public.goals AS g
  WHERE g.id = NEW.goal_id;
  IF NOT FOUND THEN
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
  'BEFORE INSERT OR UPDATE. user_id must match the goal owner, and the income record when one is set.';

DROP TRIGGER IF EXISTS income_allocations_enforce_owner ON public.income_allocations;
CREATE TRIGGER income_allocations_enforce_owner
  BEFORE INSERT OR UPDATE ON public.income_allocations
  FOR EACH ROW EXECUTE FUNCTION public.income_allocations_enforce_owner();

-- Replace the prod ALL policy that authorized through the parent income record.
-- SELECT/INSERT/UPDATE/DELETE are each auth.uid() = user_id. Insert and update
-- also require the goal to belong to that user. (select auth.uid()) is evaluated
-- once per statement. Existing 90-day policies on other tables are not touched.
ALTER TABLE public.income_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own allocations" ON public.income_allocations;
DROP POLICY IF EXISTS income_allocations_select_own ON public.income_allocations;
DROP POLICY IF EXISTS income_allocations_insert_own ON public.income_allocations;
DROP POLICY IF EXISTS income_allocations_update_own ON public.income_allocations;
DROP POLICY IF EXISTS income_allocations_delete_own ON public.income_allocations;

CREATE POLICY income_allocations_select_own
  ON public.income_allocations
  FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY income_allocations_insert_own
  ON public.income_allocations
  FOR INSERT
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND EXISTS (
      SELECT 1
      FROM public.goals AS g
      WHERE g.id = goal_id
        AND g.user_id = user_id
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
      WHERE g.id = goal_id
        AND g.user_id = user_id
    )
  );

CREATE POLICY income_allocations_delete_own
  ON public.income_allocations
  FOR DELETE
  USING ((SELECT auth.uid()) = user_id);

-- RPCs bypass RLS. They set user_id and ignore tombstones when reading.
CREATE OR REPLACE FUNCTION public.create_income_with_allocations(
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
  v_uid uuid := auth.uid();
  v_income_id uuid;
  v_alloc_sum numeric := 0;
  v_goal_id uuid;
  v_amount numeric;
  v_elem jsonb;
  v_found boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF p_total_amount IS NULL OR p_total_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid total_amount.';
  END IF;
  IF p_allocations IS NULL OR jsonb_typeof(p_allocations) IS DISTINCT FROM 'array' THEN
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
        AND g.user_id = v_uid
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

  INSERT INTO income_records (user_id, total_amount, disposable_amount, date, income_source)
  VALUES (v_uid, p_total_amount, p_total_amount - v_alloc_sum, p_date, p_income_source)
  RETURNING income_records.id INTO v_income_id;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_goal_id := (v_elem->>'goal_id')::uuid;
    v_amount := (v_elem->>'amount')::numeric;
    IF v_goal_id IS NULL OR v_amount IS NULL OR v_amount <= 0 THEN
      CONTINUE;
    END IF;
    INSERT INTO income_allocations (income_record_id, goal_id, amount, user_id)
    VALUES (v_income_id, v_goal_id, v_amount, v_uid);
  END LOOP;

  RETURN QUERY
  SELECT ir.id, ir.total_amount, ir.disposable_amount, ir.date, ir.income_source
  FROM income_records AS ir
  WHERE ir.id = v_income_id
    AND ir.deleted_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.create_income_with_allocations(numeric, date, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_income_with_allocations(numeric, date, text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.allocate_income_to_goal(
  p_income_id uuid,
  p_goal_id uuid,
  p_amount numeric
)
RETURNS TABLE (
  allocation_id uuid,
  amount numeric,
  disposable_amount numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_total numeric;
  v_allocated numeric;
  v_alloc_id uuid;
  v_disposable numeric;
  v_found boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Enter an amount greater than zero.';
  END IF;

  SELECT EXISTS(
    SELECT 1
    FROM goals AS g
    WHERE g.id = p_goal_id
      AND g.user_id = v_uid
      AND g.deleted_at IS NULL
  ) INTO v_found;
  IF NOT v_found THEN
    RAISE EXCEPTION 'Invalid goal in allocations.';
  END IF;

  SELECT ir.total_amount INTO v_total
  FROM income_records AS ir
  WHERE ir.id = p_income_id
    AND ir.user_id = v_uid
    AND ir.deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Income record not found or unauthorized.';
  END IF;

  SELECT coalesce(sum(a.amount), 0) INTO v_allocated
  FROM income_allocations AS a
  WHERE a.income_record_id = p_income_id
    AND a.deleted_at IS NULL;

  IF v_allocated + p_amount > v_total THEN
    RAISE EXCEPTION 'Amount cannot exceed remaining funds on this income.';
  END IF;

  INSERT INTO income_allocations (income_record_id, goal_id, amount, user_id)
  VALUES (p_income_id, p_goal_id, p_amount, v_uid)
  RETURNING income_allocations.id INTO v_alloc_id;

  v_disposable := greatest(0, v_total - (v_allocated + p_amount));
  UPDATE income_records
  SET disposable_amount = v_disposable
  WHERE id = p_income_id
    AND user_id = v_uid
    AND deleted_at IS NULL;

  RETURN QUERY SELECT v_alloc_id, p_amount, v_disposable;
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_income_to_goal(uuid, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.allocate_income_to_goal(uuid, uuid, numeric) TO authenticated;

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

  -- Live rows only. Tombstones stay until the 90-day purge.
  DELETE FROM income_allocations AS a
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
  'Atomically update a live income record and its live goal allocations. Used by PUT /api/income/[id].';

REVOKE ALL ON FUNCTION public.update_income_with_allocations(uuid, uuid, numeric, date, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_income_with_allocations(uuid, uuid, numeric, date, text, jsonb) TO authenticated;
