-- Delete child rows whose user_id is not in profiles (e.g. after deleting dummy users from auth/profiles).
-- Run in Supabase Dashboard → SQL Editor, or: psql $DATABASE_URL -f supabase/scripts/delete_orphan_user_children.sql
-- Optional: wrap in BEGIN; ... COMMIT; or use ROLLBACK to preview.

-- 1) income_allocations (references income_records, goals) — delete where parent belongs to orphan user
DELETE FROM public.income_allocations
WHERE income_record_id IN (SELECT id FROM public.income_records WHERE user_id NOT IN (SELECT id FROM public.profiles))
   OR goal_id IN (SELECT id FROM public.goals WHERE user_id NOT IN (SELECT id FROM public.profiles));

-- 2) expenses
DELETE FROM public.expenses
WHERE user_id NOT IN (SELECT id FROM public.profiles);

-- 3) income_records
DELETE FROM public.income_records
WHERE user_id NOT IN (SELECT id FROM public.profiles);

-- 4) goals
DELETE FROM public.goals
WHERE user_id NOT IN (SELECT id FROM public.profiles);

-- 5) budget_overrides
DELETE FROM public.budget_overrides
WHERE user_id NOT IN (SELECT id FROM public.profiles);

-- 6) budget_plans
DELETE FROM public.budget_plans
WHERE user_id NOT IN (SELECT id FROM public.profiles);

-- 7) subscriptions
DELETE FROM public.subscriptions
WHERE user_id NOT IN (SELECT id FROM public.profiles);

-- 8) support_requests
DELETE FROM public.support_requests
WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM public.profiles);

-- Optional: premium_confirmation_emails (if table exists and has user_id)
-- DELETE FROM public.premium_confirmation_emails
-- WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM public.profiles);
