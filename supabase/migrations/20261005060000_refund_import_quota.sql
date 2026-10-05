-- Refund one consumed import when the confirm insert fails in the same request.
-- auth.uid() only. Locks the caller row, then decrements import_count by 1, not below 0.
-- Uses the same transaction-local flag as consume_import_quota so the protect trigger allows the write.

create or replace function public.refund_import_quota()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
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

  perform set_config('klaroph.allow_import_count_write', '1', true);
  update public.profiles
  set import_count = greatest(import_count - 1, 0)
  where id = v_uid
  returning import_count into v_count;
  perform set_config('klaroph.allow_import_count_write', '', true);

  return v_count;
end;
$$;

comment on function public.refund_import_quota() is
  'Decrements profiles.import_count by 1 for auth.uid(), not below 0. Used when an import insert fails after consume_import_quota.';

revoke all on function public.refund_import_quota() from public, anon;
grant execute on function public.refund_import_quota() to authenticated, service_role;
