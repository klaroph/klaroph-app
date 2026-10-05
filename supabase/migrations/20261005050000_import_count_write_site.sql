-- Stop authenticated clients from writing profiles.import_count.
-- profiles_update_own allows any column update; quota was only checked in the confirm routes.
-- consume_import_quota() is the only signed-in writer: it locks the caller's row,
-- applies the same premium rule as enforce_goal_plan_limit, then increments.

create or replace function public.profiles_block_import_count_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Mirror profiles_block_user_type_change: a signed-in client cannot change this column.
  -- consume_import_quota() is security definer but still runs with the caller's JWT,
  -- so auth.uid() is set during its update. It sets a transaction-local flag around
  -- that single write. PostgREST clients cannot set the flag themselves.
  if old.import_count is distinct from new.import_count
     and auth.uid() is not null
     and coalesce(current_setting('klaroph.allow_import_count_write', true), '') is distinct from '1' then
    raise exception 'import_count is not updatable by client'
      using errcode = 'privilege_not_revoked';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_import_count_protect on public.profiles;
create trigger profiles_import_count_protect
  before update on public.profiles
  for each row
  execute function public.profiles_block_import_count_change();

create or replace function public.consume_import_quota()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sub record;
  v_status text;
  v_plan_name text;
  v_is_pro boolean := false;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'Unauthorized';
  end if;

  select p.import_count
    into v_count
  from public.profiles p
  where p.id = v_uid
  for update;

  if not found then
    raise exception 'Profile not found.';
  end if;

  -- Same premium rule as enforce_goal_plan_limit / normalizeSubscriptionFromRow:
  -- plan name pro or clarity_premium, with an active period or lifetime access.
  -- Grace, expired, canceled, free, and missing rows are not Pro.
  select
    s.status,
    s.plan_id,
    s.current_period_end,
    s.is_lifetime
  into v_sub
  from public.subscriptions s
  where s.user_id = v_uid
  order by s.current_period_end desc
  limit 1;

  if found then
    v_status := lower(v_sub.status);

    if v_status = 'active'
       and v_sub.plan_id is not null
       and (
         coalesce(v_sub.is_lifetime, false)
         or (v_sub.current_period_end is not null and v_sub.current_period_end > now())
       ) then
      select lower(trim(p.name))
        into v_plan_name
      from public.plans p
      where p.id = v_sub.plan_id;

      if found and v_plan_name in ('pro', 'clarity_premium') then
        v_is_pro := true;
      end if;
    end if;
  end if;

  if not v_is_pro and coalesce(v_count, 0) >= 2 then
    raise exception 'IMPORT_QUOTA_EXCEEDED: free import quota is already used'
      using errcode = 'P0001';
  end if;

  perform set_config('klaroph.allow_import_count_write', '1', true);
  update public.profiles
  set import_count = import_count + 1
  where id = v_uid
  returning import_count into v_count;
  perform set_config('klaroph.allow_import_count_write', '', true);

  return v_count;
end;
$$;

comment on function public.consume_import_quota() is
  'Increments profiles.import_count for auth.uid(). Free plan stops at 2; Pro (active period or lifetime) is unlimited.';

revoke all on function public.consume_import_quota() from public, anon;
grant execute on function public.consume_import_quota() to authenticated, service_role;

-- Ride-along: public is already revoked; create_income already excludes anon.
revoke all on function public.update_income_with_allocations(uuid, uuid, numeric, date, text, jsonb) from anon;
