-- Atomic replace of a user's spending plan: delete + insert in one transaction,
-- so a failed insert (e.g. duplicate category) leaves the old plan in place.
-- Bound to auth.uid(); runs as the caller so existing RLS on budget_plans applies.
create or replace function public.replace_budget_plan(p_items jsonb)
returns setof public.budget_plans
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Unauthorized';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Send at least one category with amount greater than 0.';
  end if;

  delete from public.budget_plans where user_id = v_uid;

  return query
  insert into public.budget_plans (user_id, category, amount, note)
  select v_uid, trim(e->>'category'), (e->>'amount')::numeric, nullif(trim(e->>'note'), '')
  from jsonb_array_elements(p_items) e
  returning *;
end;
$$;

revoke all on function public.replace_budget_plan(jsonb) from public, anon;
grant execute on function public.replace_budget_plan(jsonb) to authenticated;
