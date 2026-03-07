-- Seed dummy income and expense transactions for testing.
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- Replace the user_id below if needed.

DO $$
DECLARE
  uid uuid := '6b1eebee-3711-41c5-9b7e-c661fc6ae472';
  i int;
  d date;
  amt numeric;
  src text;
  cat text;
  typ text;
  inc_sources text[] := ARRAY['Salary', 'Salary', 'Salary', 'Bonus / 13th Month', 'Freelance / Online Work', 'Salary', 'Gift / Refund'];
  exp_cats text[] := ARRAY['Rent / Mortgage', 'Utilities', 'Groceries', 'Transportation', 'Dining Out', 'Shopping', 'Entertainment', 'Health', 'Education', 'Subscriptions', 'Family Support', 'Loan Payment'];
  exp_types text[] := ARRAY['needs', 'needs', 'needs', 'needs', 'wants', 'wants', 'wants', 'needs', 'needs', 'wants', 'needs', 'needs'];
BEGIN
  -- Dummy income: 3 months of salary + a few extras (spread over last 90 days)
  FOR i IN 1..12 LOOP
    d := (current_date - (i * 7))::date;  -- roughly every 7 days going back
    src := inc_sources[1 + (i % array_length(inc_sources, 1))];
    amt := 25000 + (random() * 15000)::numeric(10,2);
    INSERT INTO public.income_records (user_id, total_amount, disposable_amount, date, income_source)
    VALUES (uid, amt, amt * 0.7, d, src);
  END LOOP;

  -- Dummy expenses: mix of needs and wants over same period
  FOR i IN 1..40 LOOP
    d := (current_date - (i * 2))::date;
    cat := exp_cats[1 + (i % array_length(exp_cats, 1))];
    typ := exp_types[1 + (i % array_length(exp_types, 1))];
    amt := (500 + random() * 4500)::numeric(10,2);
    INSERT INTO public.expenses (user_id, category, type, amount, date, description)
    VALUES (
      uid,
      cat,
      typ,
      amt,
      d,
      CASE WHEN i % 4 = 0 THEN 'Dummy test entry ' || i ELSE NULL END
    );
  END LOOP;

  RAISE NOTICE 'Seeded dummy income and expenses for user %', uid;
END $$;
