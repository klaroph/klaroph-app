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
-- The cutoff is public.free_history_cutoff(): Manila's calendar date minus 90 days.
-- expenses_select_90d_free and income_records_select_90d_free use that helper.
-- Their other rule is unchanged: the row belongs to auth.uid(), and a paid user
-- can read every date.
--
-- income_record_owned_by is the only SECURITY DEFINER lookup used by
-- income_allocations_enforce_owner. It answers whether one income id belongs
-- to one user, so a Free user can still edit an allocation when the parent
-- income is hidden by the 90-day SELECT policy. The trigger function itself
-- stays SECURITY INVOKER.
--
-- enforce_free_history_lock runs BEFORE INSERT and BEFORE UPDATE OF date.
-- A Free user's date older than the cutoff raises HISTORY_LOCKED.
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

CREATE OR REPLACE FUNCTION public.free_history_cutoff()
RETURNS date
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT ((now() AT TIME ZONE 'Asia/Manila')::date - 90);
$$;

COMMENT ON FUNCTION public.free_history_cutoff() IS
  'First expense or income date a Free user can still read. Asia/Manila calendar date minus 90 days. A row dated this day is visible.';

REVOKE ALL ON FUNCTION public.free_history_cutoff() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.free_history_cutoff() FROM anon;
GRANT EXECUTE ON FUNCTION public.free_history_cutoff() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.income_record_owned_by(p_income_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.income_records
    WHERE id = p_income_id
      AND user_id = p_user_id
  );
$$;

COMMENT ON FUNCTION public.income_record_owned_by(uuid, uuid) IS
  'True when this income id belongs to this user. SECURITY DEFINER so the allocation owner trigger can see a parent the 90-day SELECT policy hides. Returns no other columns.';

REVOKE ALL ON FUNCTION public.income_record_owned_by(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.income_record_owned_by(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.income_record_owned_by(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.income_allocations_enforce_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_goal_user uuid;
  v_goal_deleted timestamptz;
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

  IF NEW.income_record_id IS NOT NULL
     AND NOT public.income_record_owned_by(NEW.income_record_id, NEW.user_id)
     AND NOT (
       TG_OP = 'UPDATE'
       AND NEW.deleted_at IS NOT NULL
       AND NEW.income_record_id IS NOT DISTINCT FROM OLD.income_record_id
     ) THEN
    RAISE EXCEPTION 'Income record not found or unauthorized.';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.income_allocations_enforce_owner() IS
  'BEFORE INSERT OR UPDATE. user_id must match the goal owner. Inserts onto a soft-deleted goal are rejected. The income record, when set, must belong to the same user, including when the 90-day policy hides it. Tombstoning an allocation whose income row is already gone is allowed. This function is not SECURITY DEFINER.';

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

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.income_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "expenses_select_90d_free" ON public.expenses;
CREATE POLICY "expenses_select_90d_free"
  ON public.expenses
  FOR SELECT
  USING (
    auth.uid() = user_id
    AND (
      NOT public.is_free_analytics_user(auth.uid())
      OR (date >= public.free_history_cutoff())
    )
  );

DROP POLICY IF EXISTS "income_records_select_90d_free" ON public.income_records;
CREATE POLICY "income_records_select_90d_free"
  ON public.income_records
  FOR SELECT
  USING (
    auth.uid() = user_id
    AND (
      NOT public.is_free_analytics_user(auth.uid())
      OR (date >= public.free_history_cutoff())
    )
  );

CREATE OR REPLACE FUNCTION public.enforce_free_history_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.date IS NOT NULL
     AND NEW.date < public.free_history_cutoff()
     AND public.is_free_analytics_user(NEW.user_id) THEN
    RAISE EXCEPTION 'HISTORY_LOCKED: Entries older than 90 days are read-only on Free. Upgrade to edit them.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_free_history_lock() IS
  'BEFORE INSERT and BEFORE UPDATE OF date on expenses and income_records. Free users cannot write a date older than public.free_history_cutoff(). Deletes and deleted_at-only updates do not fire this trigger.';

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
