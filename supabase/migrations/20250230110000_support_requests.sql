-- Support requests: users can submit concerns; stored in Supabase (no email).
-- Idempotent: safe to run when table/policies already exist.
create table if not exists support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  email text,
  subject text,
  message text not null,
  status text default 'open',
  created_at timestamptz default now()
);

alter table support_requests enable row level security;

-- Users can insert only their own requests.
drop policy if exists "Users can insert own support_requests" on support_requests;
create policy "Users can insert own support_requests"
  on support_requests for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Users can select only their own requests.
drop policy if exists "Users can select own support_requests" on support_requests;
create policy "Users can select own support_requests"
  on support_requests for select
  to authenticated
  using (auth.uid() = user_id);

-- Service role can do everything (for admin/backoffice).
drop policy if exists "Service role full access support_requests" on support_requests;
create policy "Service role full access support_requests"
  on support_requests for all
  to service_role
  using (true)
  with check (true);
