-- Enforce plan max_goals at the goals insert, including direct client inserts that skip POST /api/goals.
-- Advisory lock serializes every insert for that user, including accounts with no subscriptions row.
-- The subscriptions FOR UPDATE lock stays so two creates that share a row still queue on it.
-- SECURITY DEFINER is required: SELECT ... FOR UPDATE also applies UPDATE row policies, and the
-- only UPDATE policy on subscriptions is for service_role. An invoker lock would match zero rows.
-- Reads subscriptions/plans as the owner; does not grant those tables to anon.

create or replace function public.enforce_goal_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub record;
  v_status text;
  v_plan_name text;
  v_plan_max int;
  v_max_goals int := 2;
begin
  -- Serialize this user even when they have no subscriptions row (FOR UPDATE would match nothing).
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));

  -- A signed-in user inserting another user's id cannot pass RLS. Do not lock that row.
  -- service_role (auth.uid() null), including onboarding, is still enforced below.
  if auth.uid() is not null and auth.uid() is distinct from new.user_id then
    return new;
  end if;

  select
    s.status,
    s.plan_id,
    s.current_period_end,
    s.grace_period_until,
    s.is_lifetime
  into v_sub
  from public.subscriptions s
  where s.user_id = new.user_id
  order by s.current_period_end desc
  limit 1
  for update;

  if found then
    v_status := lower(v_sub.status);

    -- Same grace rule as normalizeSubscriptionFromRow: past_due and still inside grace.
    if v_status = 'past_due'
       and v_sub.grace_period_until is not null
       and now() < v_sub.grace_period_until then
      raise exception 'GOAL_CREATION_GRACE: goal creation is blocked while the subscription is past due and still in grace'
        using errcode = 'P0001';
    end if;

    -- Active prepaid period, or lifetime, and a premium plan — same as resolveUserPlan.
    -- Anything else (missing row, free, expired, canceled) keeps the free default of 2.
    if v_status = 'active'
       and v_sub.plan_id is not null
       and (
         coalesce(v_sub.is_lifetime, false)
         or (v_sub.current_period_end is not null and v_sub.current_period_end > now())
       ) then
      select lower(trim(p.name)), p.max_goals
        into v_plan_name, v_plan_max
      from public.plans p
      where p.id = v_sub.plan_id;

      if found and v_plan_name in ('pro', 'clarity_premium') then
        v_max_goals := coalesce(v_plan_max, 20);
      end if;
    end if;
  end if;

  if (
    select count(*)
    from public.goals g
    where g.user_id = new.user_id
  ) >= v_max_goals then
    raise exception 'GOAL_LIMIT_REACHED: goal count is already at the plan max_goals'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

comment on function public.enforce_goal_plan_limit() is
  'BEFORE INSERT on goals. Locks the user subscriptions row, blocks grace, and enforces plans.max_goals (free default 2).';

revoke all on function public.enforce_goal_plan_limit() from public, anon;
grant execute on function public.enforce_goal_plan_limit() to authenticated, service_role;

drop trigger if exists goals_enforce_plan_limit on public.goals;
create trigger goals_enforce_plan_limit
  before insert on public.goals
  for each row
  execute function public.enforce_goal_plan_limit();
