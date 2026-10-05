-- Lock one income row, enforce remaining-funds cap, insert allocation, sync disposable.
-- Bound to auth.uid(); no user-id argument. Does not reuse update_income_with_allocations.
create or replace function public.allocate_income_to_goal(
  p_income_id uuid,
  p_goal_id uuid,
  p_amount numeric
)
returns table (
  allocation_id uuid,
  amount numeric,
  disposable_amount numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_total numeric;
  v_allocated numeric;
  v_alloc_id uuid;
  v_disposable numeric;
  v_found boolean;
begin
  if v_uid is null then
    raise exception 'Unauthorized';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter an amount greater than zero.';
  end if;

  select exists(
    select 1 from goals g where g.id = p_goal_id and g.user_id = v_uid
  ) into v_found;
  if not v_found then
    raise exception 'Invalid goal in allocations.';
  end if;

  select ir.total_amount into v_total
  from income_records ir
  where ir.id = p_income_id and ir.user_id = v_uid
  for update;
  if not found then
    raise exception 'Income record not found or unauthorized.';
  end if;

  select coalesce(sum(a.amount), 0) into v_allocated
  from income_allocations a
  where a.income_record_id = p_income_id;

  if v_allocated + p_amount > v_total then
    raise exception 'Amount cannot exceed remaining funds on this income.';
  end if;

  insert into income_allocations (income_record_id, goal_id, amount)
  values (p_income_id, p_goal_id, p_amount)
  returning income_allocations.id into v_alloc_id;

  v_disposable := greatest(0, v_total - (v_allocated + p_amount));
  update income_records
  set disposable_amount = v_disposable
  where id = p_income_id and user_id = v_uid;

  return query select v_alloc_id, p_amount, v_disposable;
end;
$$;

revoke all on function public.allocate_income_to_goal(uuid, uuid, numeric) from public, anon;
grant execute on function public.allocate_income_to_goal(uuid, uuid, numeric) to authenticated;
