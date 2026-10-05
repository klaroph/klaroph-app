-- privilege_not_revoked is not a PostgreSQL condition name, so the protect trigger
-- can fail with "unrecognized exception condition" instead of rejecting the write.
-- Recreate the function with the same body and SQLSTATE 42501 (insufficient_privilege).

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
      using errcode = '42501';
  end if;
  return new;
end;
$$;
