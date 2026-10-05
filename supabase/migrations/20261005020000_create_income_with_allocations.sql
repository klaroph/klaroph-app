-- Atomic create of an income record and its optional goal allocations.
-- Bound to auth.uid(); no user-id argument. Empty p_allocations = income only.
create or replace function public.create_income_with_allocations(
  p_total_amount numeric,
  p_date date,
  p_income_source text,
  p_allocations jsonb
)
returns table (
  id uuid,
  total_amount numeric,
  disposable_amount numeric,
  date date,
  income_source text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_income_id uuid;
  v_alloc_sum numeric := 0;
  v_goal_id uuid;
  v_amount numeric;
  v_elem jsonb;
  v_found boolean;
begin
  if v_uid is null then
    raise exception 'Unauthorized';
  end if;
  if p_total_amount is null or p_total_amount <= 0 then
    raise exception 'Invalid total_amount.';
  end if;
  if p_allocations is null or jsonb_typeof(p_allocations) is distinct from 'array' then
    raise exception 'Invalid allocations: must be a JSON array.';
  end if;

  for v_elem in select * from jsonb_array_elements(p_allocations)
  loop
    v_goal_id := (v_elem->>'goal_id')::uuid;
    v_amount := (v_elem->>'amount')::numeric;
    if v_goal_id is null or v_amount is null or v_amount <= 0 then
      continue;
    end if;
    select exists(
      select 1 from goals g where g.id = v_goal_id and g.user_id = v_uid
    ) into v_found;
    if not v_found then
      raise exception 'Invalid goal in allocations.';
    end if;
    v_alloc_sum := v_alloc_sum + v_amount;
  end loop;

  if v_alloc_sum > p_total_amount then
    raise exception 'Total allocations cannot exceed income amount.';
  end if;

  insert into income_records (user_id, total_amount, disposable_amount, date, income_source)
  values (v_uid, p_total_amount, p_total_amount - v_alloc_sum, p_date, p_income_source)
  returning income_records.id into v_income_id;

  for v_elem in select * from jsonb_array_elements(p_allocations)
  loop
    v_goal_id := (v_elem->>'goal_id')::uuid;
    v_amount := (v_elem->>'amount')::numeric;
    if v_goal_id is null or v_amount is null or v_amount <= 0 then
      continue;
    end if;
    insert into income_allocations (income_record_id, goal_id, amount)
    values (v_income_id, v_goal_id, v_amount);
  end loop;

  return query
  select ir.id, ir.total_amount, ir.disposable_amount, ir.date, ir.income_source
  from income_records ir
  where ir.id = v_income_id;
end;
$$;

revoke all on function public.create_income_with_allocations(numeric, date, text, jsonb) from public, anon;
grant execute on function public.create_income_with_allocations(numeric, date, text, jsonb) to authenticated;
