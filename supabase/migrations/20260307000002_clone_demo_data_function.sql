-- Production-grade function: clone demo user child data to a target user.
-- Source user: dedfed9c-449f-4e99-a054-a7d55cc11863
-- Idempotent: cleans target data first, then clones (rerun = same result).

SET search_path = public;

CREATE OR REPLACE FUNCTION clone_demo_data(target_user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  source_user constant uuid := 'dedfed9c-449f-4e99-a054-a7d55cc11863';
  r record;
  new_id uuid;
BEGIN
  -- 1) Validate: target exists in profiles
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = target_user) THEN
    RAISE EXCEPTION 'clone_demo_data: target user % does not exist in profiles.', target_user;
  END IF;

  -- 2) Validate: source and target cannot be same
  IF target_user = source_user THEN
    RAISE EXCEPTION 'clone_demo_data: source and target user cannot be the same.';
  END IF;

  -- 3) Validate: source exists (demo user must exist)
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = source_user) THEN
    RAISE EXCEPTION 'clone_demo_data: source demo user % does not exist in profiles.', source_user;
  END IF;

  -- 4) Clean target child data in correct dependency order
  DELETE FROM public.income_allocations
  WHERE income_record_id IN (SELECT id FROM public.income_records WHERE user_id = target_user);

  DELETE FROM public.income_records
  WHERE user_id = target_user;

  DELETE FROM public.goals
  WHERE user_id = target_user;

  DELETE FROM public.expenses
  WHERE user_id = target_user;

  DELETE FROM public.financial_accounts
  WHERE user_id = target_user;

  DELETE FROM public.budget_plans
  WHERE user_id = target_user;

  DELETE FROM public.budget_overrides
  WHERE user_id = target_user;

  -- 5) Clone goals and build old_id -> new_id map (temp table dropped at commit)
  CREATE TEMP TABLE _goal_map (
    old_id uuid PRIMARY KEY,
    new_id uuid NOT NULL
  ) ON COMMIT DROP;

  FOR r IN
    SELECT id, name, target_amount, saved_amount, pinned_at
    FROM public.goals
    WHERE user_id = source_user
  LOOP
    INSERT INTO public.goals (id, user_id, name, target_amount, saved_amount, created_at, pinned_at)
    VALUES (gen_random_uuid(), target_user, r.name, r.target_amount, r.saved_amount, now(), r.pinned_at)
    RETURNING id INTO new_id;
    INSERT INTO _goal_map (old_id, new_id) VALUES (r.id, new_id);
  END LOOP;

  -- 6) Clone income_records and build old_id -> new_id map
  CREATE TEMP TABLE _income_record_map (
    old_id uuid PRIMARY KEY,
    new_id uuid NOT NULL
  ) ON COMMIT DROP;

  FOR r IN
    SELECT id, total_amount, disposable_amount, date, income_source
    FROM public.income_records
    WHERE user_id = source_user
  LOOP
    INSERT INTO public.income_records (id, user_id, total_amount, disposable_amount, date, income_source, created_at)
    VALUES (gen_random_uuid(), target_user, r.total_amount, r.disposable_amount, r.date, r.income_source, now())
    RETURNING id INTO new_id;
    INSERT INTO _income_record_map (old_id, new_id) VALUES (r.id, new_id);
  END LOOP;

  -- 7) Clone income_allocations using mapped IDs
  INSERT INTO public.income_allocations (income_record_id, goal_id, amount)
  SELECT ir_map.new_id, g_map.new_id, a.amount
  FROM public.income_allocations a
  JOIN public.income_records ir ON ir.id = a.income_record_id AND ir.user_id = source_user
  JOIN public.goals g ON g.id = a.goal_id AND g.user_id = source_user
  JOIN _income_record_map ir_map ON ir_map.old_id = a.income_record_id
  JOIN _goal_map g_map ON g_map.old_id = a.goal_id;

  -- 8) Clone expenses (user_id, category, type, amount, date, description, created_at; id defaults)
  INSERT INTO public.expenses (user_id, category, type, amount, date, description, created_at)
  SELECT target_user, e.category, e.type, e.amount, e.date, e.description, now()
  FROM public.expenses e
  WHERE e.user_id = source_user;

  -- 9) Clone budget_plans (id, user_id, category, amount, created_at, updated_at, note)
  INSERT INTO public.budget_plans (id, user_id, category, amount, created_at, updated_at, note)
  SELECT gen_random_uuid(), target_user, bp.category, bp.amount, now(), now(), bp.note
  FROM public.budget_plans bp
  WHERE bp.user_id = source_user;

  -- 10) Clone budget_overrides (id, user_id, category, amount, month, created_at, note)
  INSERT INTO public.budget_overrides (id, user_id, category, amount, month, created_at, note)
  SELECT gen_random_uuid(), target_user, bo.category, bo.amount, bo.month, now(), bo.note
  FROM public.budget_overrides bo
  WHERE bo.user_id = source_user;

  -- 11) Clone financial_accounts
  INSERT INTO public.financial_accounts (
    id,
    user_id,
    type,
    subtype,
    institution_name,
    custom_name,
    amount,
    notes,
    created_at,
    updated_at
  )
  SELECT gen_random_uuid(), target_user, fa.type, fa.subtype, fa.institution_name, fa.custom_name, fa.amount, fa.notes, now(), now()
  FROM public.financial_accounts fa
  WHERE fa.user_id = source_user;

  RAISE NOTICE 'Demo clone complete';
END;
$$;

COMMENT ON FUNCTION clone_demo_data(uuid) IS
  'Clones demo user (dedfed9c-449f-4e99-a054-a7d55cc11863) child data to target_user. Cleans target first; idempotent.';

GRANT EXECUTE ON FUNCTION clone_demo_data(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION clone_demo_data(uuid) TO service_role;
