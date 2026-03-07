-- Spending Plan (default recurring) + Monthly Overrides
-- budget_plans: one row per (user_id, category), no month
-- budget_overrides: optional (user_id, category, month)

create table budget_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (length(trim(category)) > 0),
  amount numeric not null check (amount > 0),
  created_at timestamptz default now()
);

create unique index budget_plans_user_category_idx
on budget_plans(user_id, category);

alter table budget_plans enable row level security;

create policy "Users can view their budget plans"
on budget_plans for select using (auth.uid() = user_id);

create policy "Users can insert their budget plans"
on budget_plans for insert with check (auth.uid() = user_id);

create policy "Users can update their budget plans"
on budget_plans for update using (auth.uid() = user_id);

create policy "Users can delete their budget plans"
on budget_plans for delete using (auth.uid() = user_id);

create table budget_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (length(trim(category)) > 0),
  amount numeric not null check (amount > 0),
  month date not null
    check (date_trunc('month', month) = month),
  created_at timestamptz default now()
);

create unique index budget_overrides_user_category_month_idx
on budget_overrides(user_id, category, month);

alter table budget_overrides enable row level security;

create policy "Users can view their budget overrides"
on budget_overrides for select using (auth.uid() = user_id);

create policy "Users can insert their budget overrides"
on budget_overrides for insert with check (auth.uid() = user_id);

create policy "Users can update their budget overrides"
on budget_overrides for update using (auth.uid() = user_id);

create policy "Users can delete their budget overrides"
on budget_overrides for delete using (auth.uid() = user_id);
