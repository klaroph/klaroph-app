-- Clone one user's child data to another user.
-- Source: dedfed9c-449f-4e99-a054-a7d55cc11863
-- Target: set target_user_id below (must exist in auth.users / profiles).
--
-- Run in Supabase Dashboard → SQL Editor, or: psql $DATABASE_URL -f supabase/scripts/clone_user_child_data.sql
-- Optional: wrap in BEGIN; ... COMMIT; or use ROLLBACK to preview.

DO $$
DECLARE
  source_user_id uuid := 'dedfed9c-449f-4e99-a054-a7d55cc11863';
  target_user_id uuid := '00000000-0000-0000-0000-000000000000'; -- REPLACE with target user id
BEGIN
  IF target_user_id = '00000000-0000-0000-0000-000000000000' THEN
    RAISE EXCEPTION 'Set target_user_id to the destination user UUID before running.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = target_user_id) THEN
    RAISE EXCEPTION 'Target user % does not exist in profiles.', target_user_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = source_user_id) THEN
    RAISE EXCEPTION 'Source user % does not exist in profiles.', source_user_id;
  END IF;

  -- 1) Clone goals and build old_id -> new_id map
  CREATE TEMP TABLE IF NOT EXISTS _goal_map (old_id uuid PRIMARY KEY, new_id uuid);
  DELETE FROM _goal_map;

  INSERT INTO _goal_map (old_id, new_id)
  SELECT g.id, ins.id
  FROM public.goals g
  CROSS JOIN LATERAL (
    INSERT INTO public.goals (id, user_id, name, target_amount, saved_amount, created_at, pinned_at)
    VALUES (gen_random_uuid(), target_user_id, g.name, g.target_amount, g.saved_amount, g.created_at, g.pinned_at)
    RETURNING id
  ) AS ins(id)
  WHERE g.user_id = source_user_id;

  -- 2) Clone income_records and build old_id -> new_id map
  CREATE TEMP TABLE IF NOT EXISTS _income_record_map (old_id uuid PRIMARY KEY, new_id uuid);
  DELETE FROM _income_record_map;

  INSERT INTO _income_record_map (old_id, new_id)
  SELECT ir.id, ins.id
  FROM public.income_records ir
  CROSS JOIN LATERAL (
    INSERT INTO public.income_records (id, user_id, total_amount, disposable_amount, date, income_source, created_at)
    VALUES (gen_random_uuid(), target_user_id, ir.total_amount, ir.disposable_amount, ir.date, ir.income_source, ir.created_at)
    RETURNING id
  ) AS ins(id)
  WHERE ir.user_id = source_user_id;

  -- 3) Clone income_allocations (using new goal and income_record ids)
  INSERT INTO public.income_allocations (income_record_id, goal_id, amount)
  SELECT ir_map.new_id, g_map.new_id, a.amount
  FROM public.income_allocations a
  JOIN public.income_records ir ON ir.id = a.income_record_id AND ir.user_id = source_user_id
  JOIN public.goals g ON g.id = a.goal_id AND g.user_id = source_user_id
  JOIN _income_record_map ir_map ON ir_map.old_id = a.income_record_id
  JOIN _goal_map g_map ON g_map.old_id = a.goal_id;

  -- 4) Clone expenses
  INSERT INTO public.expenses (user_id, category, type, amount, date, description, created_at)
  SELECT target_user_id, e.category, e.type, e.amount, e.date, e.description, e.created_at
  FROM public.expenses e
  WHERE e.user_id = source_user_id;

  -- 5) Clone budget_plans (on conflict update so target keeps same categories with cloned amounts)
  INSERT INTO public.budget_plans (id, user_id, category, amount, created_at, updated_at, note)
  SELECT gen_random_uuid(), target_user_id, bp.category, bp.amount, bp.created_at, bp.updated_at, bp.note
  FROM public.budget_plans bp
  WHERE bp.user_id = source_user_id
  ON CONFLICT (user_id, category) DO UPDATE SET
    amount = EXCLUDED.amount,
    updated_at = EXCLUDED.updated_at,
    note = COALESCE(EXCLUDED.note, budget_plans.note);

  -- 6) Clone budget_overrides
  INSERT INTO public.budget_overrides (id, user_id, category, amount, month, created_at, note)
  SELECT gen_random_uuid(), target_user_id, bo.category, bo.amount, bo.month, bo.created_at, bo.note
  FROM public.budget_overrides bo
  WHERE bo.user_id = source_user_id
  ON CONFLICT (user_id, category, month) DO UPDATE SET
    amount = EXCLUDED.amount,
    note = COALESCE(EXCLUDED.note, budget_overrides.note);

  -- 7) Clone financial_accounts
  INSERT INTO public.financial_accounts (user_id, type, subtype, institution_name, custom_name, amount, notes, created_at, updated_at)
  SELECT target_user_id, fa.type, fa.subtype, fa.institution_name, fa.custom_name, fa.amount, fa.notes, fa.created_at, fa.updated_at
  FROM public.financial_accounts fa
  WHERE fa.user_id = source_user_id;

  RAISE NOTICE 'Cloned child data from % to %.', source_user_id, target_user_id;
END $$;
