-- Free history stays in the table. The 90-day SELECT policies hide it.
-- A FOR ALL policy named "Users can manage own expenses" or
-- "Users can manage own income" is OR-ed with those SELECT policies and
-- shows every row the user owns. Drop them. The per-command *_own policies stay.
-- Update policies gain WITH CHECK so a row cannot be reassigned to another user.
--
-- is_free_analytics_user reads one subscriptions row:
--   ORDER BY current_period_end DESC NULLS LAST LIMIT 1
--   LEFT JOIN plans
-- Lifetime is checked first. Those rows store current_period_end = now(),
-- which is not after now(), so a period check would mark them Free.
-- Expiry comes from current_period_end, not from status.
-- past_due counts as paid for reads only inside the app grace window
-- (status past_due, grace_period_until set, now() < grace_period_until)
-- and only on pro or clarity_premium, matching resolveUserPlan.
-- No subscriptions row means Free.
--
-- enforce_free_history_lock runs BEFORE INSERT and BEFORE UPDATE OF date.
-- A Free user's date older than the SELECT cutoff raises HISTORY_LOCKED.
-- DELETE, and updates that do not set date (soft-delete of deleted_at,
-- auth.users ON DELETE CASCADE, account wipe), do not fire it.
-- Service-role inserts are not exempt, so onboarding and other privileged
-- writes of an old date are rejected too.

DROP POLICY IF EXISTS "Users can manage own expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can manage own income" ON public.income_records;

DROP POLICY IF EXISTS "expenses_update_own" ON public.expenses;
CREATE POLICY "expenses_update_own"
  ON public.expenses
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "income_records_update_own" ON public.income_records;
CREATE POLICY "income_records_update_own"
  ON public.income_records
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.is_free_analytics_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT NOT (
        COALESCE(s.is_lifetime, false)
        OR (
          lower(btrim(s.status)) = 'active'
          AND s.current_period_end > now()
          AND lower(btrim(p.name)) IN ('pro', 'clarity_premium')
        )
        OR (
          lower(btrim(s.status)) = 'past_due'
          AND s.grace_period_until IS NOT NULL
          AND now() < s.grace_period_until
          AND lower(btrim(p.name)) IN ('pro', 'clarity_premium')
        )
      )
      FROM public.subscriptions s
      LEFT JOIN public.plans p ON p.id = s.plan_id
      WHERE s.user_id = p_user_id
      ORDER BY s.current_period_end DESC NULLS LAST
      LIMIT 1
    ),
    true
  );
$$;

COMMENT ON FUNCTION public.is_free_analytics_user(uuid) IS
  'True when analytics history is the free 90-day window. Lifetime is checked on the latest subscriptions row before current_period_end. past_due inside grace on pro or clarity_premium is paid. No row is Free.';

GRANT EXECUTE ON FUNCTION public.is_free_analytics_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_free_analytics_user(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_free_history_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.date IS NOT NULL
     AND NEW.date < (current_date - interval '90 days')::date
     AND public.is_free_analytics_user(NEW.user_id) THEN
    RAISE EXCEPTION 'HISTORY_LOCKED: entries older than 90 days are read-only on the Free plan'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_free_history_lock() IS
  'BEFORE INSERT and BEFORE UPDATE OF date on expenses and income_records. Free users cannot write a date older than the 90-day SELECT cutoff. Deletes and deleted_at-only updates do not fire this trigger.';

REVOKE ALL ON FUNCTION public.enforce_free_history_lock() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_free_history_lock() FROM anon;
GRANT EXECUTE ON FUNCTION public.enforce_free_history_lock() TO authenticated, service_role;

DROP TRIGGER IF EXISTS expenses_history_locked_insert ON public.expenses;
CREATE TRIGGER expenses_history_locked_insert
  BEFORE INSERT ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_free_history_lock();

DROP TRIGGER IF EXISTS expenses_history_locked_date ON public.expenses;
CREATE TRIGGER expenses_history_locked_date
  BEFORE UPDATE OF date ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_free_history_lock();

DROP TRIGGER IF EXISTS income_records_history_locked_insert ON public.income_records;
CREATE TRIGGER income_records_history_locked_insert
  BEFORE INSERT ON public.income_records
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_free_history_lock();

DROP TRIGGER IF EXISTS income_records_history_locked_date ON public.income_records;
CREATE TRIGGER income_records_history_locked_date
  BEFORE UPDATE OF date ON public.income_records
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_free_history_lock();
