-- Tombstone live income_allocations in the same transaction as a parent soft-delete.
-- Safe to re-run. Does not schedule purge and does not change foreign keys.
--
-- Hard DELETE of a goal or an income record removes its allocations. The
-- 2026-09-26 foreign-key audit records income_allocations as cascading from
-- both parents (lib/founder/userActions.test.ts). QA at 6ac83062 confirmed a
-- goal DELETE cascaded. The income DELETE route also removed allocations
-- before the parent (e408ada), which is what that cascade does.
-- Soft-delete must do the same, or allocated money stays live under a deleted
-- goal and purge can never remove the parent. A new row is not created: the
-- allocation keeps its id and gains a tombstone, so a pull sees the delete.
-- Clearing deleted_at stays forbidden, so the child is not revived.

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
    IF FOUND AND v_income_user IS DISTINCT FROM NEW.user_id THEN
      RAISE EXCEPTION 'Income record not found or unauthorized.';
    END IF;
    -- A missing income row is allowed only while tombstoning this allocation.
    -- Goal soft-delete cascades that update, and the backfill already accepts
    -- an income id whose row is gone.
    IF NOT FOUND AND NOT (
      TG_OP = 'UPDATE'
      AND NEW.deleted_at IS NOT NULL
      AND NEW.income_record_id IS NOT DISTINCT FROM OLD.income_record_id
    ) THEN
      RAISE EXCEPTION 'Income record not found or unauthorized.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.income_allocations_enforce_owner() IS
  'BEFORE INSERT OR UPDATE. user_id must match the goal owner. Inserts onto a soft-deleted goal are rejected. The income record, when set, must belong to the same user. Tombstoning an allocation whose income row is already gone is allowed.';

CREATE OR REPLACE FUNCTION public.cascade_soft_delete_allocations()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' OR OLD.deleted_at IS NOT NULL OR NEW.deleted_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'goals' THEN
    UPDATE public.income_allocations
    SET deleted_at = now()
    WHERE goal_id = NEW.id
      AND deleted_at IS NULL;
  ELSIF TG_TABLE_NAME = 'income_records' THEN
    UPDATE public.income_allocations
    SET deleted_at = now()
    WHERE income_record_id = NEW.id
      AND deleted_at IS NULL;
  ELSE
    RAISE EXCEPTION 'cascade_soft_delete_allocations is not valid on %', TG_TABLE_NAME;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.cascade_soft_delete_allocations() IS
  'AFTER UPDATE on goals and income_records. When the parent first becomes deleted, tombstone its live allocations in the same transaction. Already-deleted allocations keep their deleted_at.';

DROP TRIGGER IF EXISTS goals_cascade_soft_delete_allocations ON public.goals;
CREATE TRIGGER goals_cascade_soft_delete_allocations
  AFTER UPDATE OF deleted_at ON public.goals
  FOR EACH ROW
  EXECUTE FUNCTION public.cascade_soft_delete_allocations();

DROP TRIGGER IF EXISTS income_records_cascade_soft_delete_allocations ON public.income_records;
CREATE TRIGGER income_records_cascade_soft_delete_allocations
  AFTER UPDATE OF deleted_at ON public.income_records
  FOR EACH ROW
  EXECUTE FUNCTION public.cascade_soft_delete_allocations();

-- Children first, then a parent only when no allocation row remains. That
-- removes a parent and its tombstoned allocations together once they are all
-- past 90 days, and it does not hard-delete a newer allocation tombstone
-- through ON DELETE CASCADE or fail on ON DELETE RESTRICT.
COMMENT ON FUNCTION public.purge_soft_deleted_synced_rows() IS
  'Hard-deletes synced tombstones older than 90 days. Allocation tombstones go first, then income_records and goals with no remaining allocation rows, so the parent foreign key neither errors nor drops a newer tombstone. Not scheduled. Run as service_role: SELECT public.purge_soft_deleted_synced_rows();';
