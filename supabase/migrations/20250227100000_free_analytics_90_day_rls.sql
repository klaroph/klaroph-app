-- Free plan: analytics limited to last 90 days (by transaction date).
-- No data deletion; RLS restricts SELECT for free users to date >= (current_date - 90 days).

-- 1) Helper: true if user's effective plan is free (no Clarity Premium / pro)
CREATE OR REPLACE FUNCTION public.is_free_analytics_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT (p.name = 'free')
     FROM subscriptions s
     JOIN plans p ON p.id = s.plan_id
     WHERE s.user_id = p_user_id
       AND s.status IN ('active', 'past_due', 'free')
       AND (s.status != 'past_due' OR s.grace_period_until IS NULL OR now() < s.grace_period_until)
     LIMIT 1),
    true
  );
$$;

-- 2) income_records: enable RLS and restrict free users to last 90 days (by date column)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'income_records') THEN
    ALTER TABLE income_records ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "income_records_select_90d_free" ON income_records;
    CREATE POLICY "income_records_select_90d_free" ON income_records
      FOR SELECT
      USING (
        auth.uid() = user_id
        AND (
          NOT public.is_free_analytics_user(auth.uid())
          OR (date >= (current_date - interval '90 days')::date)
        )
      );
    -- Allow insert/update/delete own rows (no date limit for writing)
    DROP POLICY IF EXISTS "income_records_insert_own" ON income_records;
    CREATE POLICY "income_records_insert_own" ON income_records FOR INSERT WITH CHECK (auth.uid() = user_id);
    DROP POLICY IF EXISTS "income_records_update_own" ON income_records;
    CREATE POLICY "income_records_update_own" ON income_records FOR UPDATE USING (auth.uid() = user_id);
    DROP POLICY IF EXISTS "income_records_delete_own" ON income_records;
    CREATE POLICY "income_records_delete_own" ON income_records FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- 3) expenses: same
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'expenses') THEN
    ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "expenses_select_90d_free" ON expenses;
    CREATE POLICY "expenses_select_90d_free" ON expenses
      FOR SELECT
      USING (
        auth.uid() = user_id
        AND (
          NOT public.is_free_analytics_user(auth.uid())
          OR (date >= (current_date - interval '90 days')::date)
        )
      );
    DROP POLICY IF EXISTS "expenses_insert_own" ON expenses;
    CREATE POLICY "expenses_insert_own" ON expenses FOR INSERT WITH CHECK (auth.uid() = user_id);
    DROP POLICY IF EXISTS "expenses_update_own" ON expenses;
    CREATE POLICY "expenses_update_own" ON expenses FOR UPDATE USING (auth.uid() = user_id);
    DROP POLICY IF EXISTS "expenses_delete_own" ON expenses;
    CREATE POLICY "expenses_delete_own" ON expenses FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.is_free_analytics_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_free_analytics_user(uuid) TO service_role;
