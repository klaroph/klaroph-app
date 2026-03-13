-- RPC: atomically update an income record and its goal allocations.
-- Used by PUT /api/income/[id]. Single transaction, no partial writes.

set search_path = public;

create or replace function update_income_with_allocations(
  p_income_id uuid,
  p_user_id uuid,
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
  v_row record;
  v_alloc_sum numeric := 0;
  v_goal_id uuid;
  v_amount numeric;
  v_elem jsonb;
  v_found boolean;
begin
  -- 1) Verify income record exists and belongs to user
  select ir.id into v_row
  from income_records ir
  where ir.id = p_income_id and ir.user_id = p_user_id;
  if not found then
    raise exception 'Income record not found or unauthorized.';
  end if;

  -- 2) Parse and validate allocations
  if p_allocations is null or jsonb_typeof(p_allocations) <> 'array' then
    raise exception 'Invalid allocations: must be a JSON array.';
  end if;

  for v_elem in select * from jsonb_array_elements(p_allocations)
  loop
    v_goal_id := (v_elem->>'goal_id')::uuid;
    v_amount := (v_elem->>'amount')::numeric;
    if v_goal_id is null or v_amount is null or v_amount <= 0 then
      continue;
    end if;
    -- Validate goal belongs to user
    select exists(
      select 1 from goals g where g.id = v_goal_id and g.user_id = p_user_id
    ) into v_found;
    if not v_found then
      raise exception 'Invalid goal in allocations.';
    end if;
    v_alloc_sum := v_alloc_sum + v_amount;
  end loop;

  if v_alloc_sum > p_total_amount then
    raise exception 'Total allocations cannot exceed income amount.';
  end if;

  -- 3) Update income_records
  update income_records
  set
    total_amount = p_total_amount,
    disposable_amount = p_total_amount - v_alloc_sum,
    date = p_date,
    income_source = p_income_source
  where income_records.id = p_income_id and income_records.user_id = p_user_id;

  -- 4) Delete allocations whose goal_id is not in p_allocations
  delete from income_allocations a
  where a.income_record_id = p_income_id
    and not exists (
      select 1 from jsonb_array_elements(p_allocations) elem
      where (elem->>'goal_id')::uuid = a.goal_id
    );

  -- 5) Update existing and insert missing allocation rows
  for v_elem in select * from jsonb_array_elements(p_allocations)
  loop
    v_goal_id := (v_elem->>'goal_id')::uuid;
    v_amount := (v_elem->>'amount')::numeric;
    if v_goal_id is null or v_amount is null or v_amount <= 0 then
      continue;
    end if;
    update income_allocations
    set amount = v_amount
    where income_record_id = p_income_id and goal_id = v_goal_id;
    if not found then
      insert into income_allocations (income_record_id, goal_id, amount)
      values (p_income_id, v_goal_id, v_amount);
    end if;
  end loop;

  -- 6) Return updated income record
  return query
  select
    ir.id,
    ir.total_amount,
    ir.disposable_amount,
    ir.date,
    ir.income_source
  from income_records ir
  where ir.id = p_income_id and ir.user_id = p_user_id;
end;
$$;

comment on function update_income_with_allocations(uuid, uuid, numeric, date, text, jsonb) is
  'Atomically update income record and its goal allocations. Used by PUT /api/income/[id].';

revoke all on function update_income_with_allocations(uuid, uuid, numeric, date, text, jsonb) from public;
grant execute on function update_income_with_allocations(uuid, uuid, numeric, date, text, jsonb) to authenticated;
