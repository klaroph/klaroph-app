-- Refund one consumed import when the confirm insert fails in the same request.
-- service_role only. Authenticated clients must not be able to call this and walk
-- import_count back to 0. The route passes the signed-in user id because the
-- service-role client has no auth.uid(). Locks that profile row and decrements
-- import_count by 1, not below 0. Uses the same transaction-local flag as
-- consume_import_quota so the protect trigger allows the write.

drop function if exists public.refund_import_quota();

create or replace function public.refund_import_quota(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_user_id is null then
    raise exception 'User id is required.';
  end if;

  select p.import_count
    into v_count
  from public.profiles p
  where p.id = p_user_id
  for update;

  if not found then
    raise exception 'Profile not found.';
  end if;

  perform set_config('klaroph.allow_import_count_write', '1', true);
  update public.profiles
  set import_count = greatest(import_count - 1, 0)
  where id = p_user_id
  returning import_count into v_count;
  perform set_config('klaroph.allow_import_count_write', '', true);

  return v_count;
end;
$$;

comment on function public.refund_import_quota(uuid) is
  'Decrements profiles.import_count by 1 for p_user_id, not below 0. service_role only. Used when an import insert fails after consume_import_quota.';

revoke all on function public.refund_import_quota(uuid) from public;
revoke all on function public.refund_import_quota(uuid) from anon;
revoke all on function public.refund_import_quota(uuid) from authenticated;
grant execute on function public.refund_import_quota(uuid) to service_role;
