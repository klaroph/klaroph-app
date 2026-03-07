-- Allow budget_overrides.amount = 0 (explicit "no budget" for a category in a month)
alter table budget_overrides
  drop constraint if exists budget_overrides_amount_check;

alter table budget_overrides
  add constraint budget_overrides_amount_check check (amount >= 0);
