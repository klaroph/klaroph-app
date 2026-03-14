-- Optional note/reminder (max 150 chars) for budget plans and overrides. Display only; no calculation.
set search_path = public;

alter table budget_plans
  add column if not exists note text check (note is null or length(trim(note)) <= 150);
comment on column budget_plans.note is 'Optional reminder describing what the category amount represents (e.g. Dad 3000, Mama 2000). Max 150 chars.';

alter table budget_overrides
  add column if not exists note text check (note is null or length(trim(note)) <= 150);
comment on column budget_overrides.note is 'Optional reminder for this month override. Max 150 chars.';
