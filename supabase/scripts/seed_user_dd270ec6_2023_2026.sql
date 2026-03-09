-- Seed dummy expenses and income for user dd270ec6 from Jan 2023 to Mar 2026.
-- Per month: 2 income records, 30 expenses.
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query).

DO $$
DECLARE
  uid uuid := 'dd270ec6-2aa9-48e4-a790-cf05e4037ffb';
  month_start date;
  month_end date;
  d date;
  i int;
  amt numeric;
  inc_sources text[] := ARRAY[
    'Salary', 'Bonus / 13th Month', 'Freelance / Online Work', 'Business Income',
    'Remittance / Support', 'Passive Income', 'Gift / Refund', 'Other'
  ];
  exp_cats text[] := ARRAY[
    'Rent / Mortgage', 'Utilities', 'Groceries', 'Transportation', 'Health', 'Education',
    'Loan Payment', 'Insurance', 'Family Support', 'Others (Needs)',
    'Dining Out', 'Shopping', 'Entertainment', 'Travel', 'Subscriptions', 'Hobbies',
    'Personal Upgrade', 'Others (Wants)'
  ];
  exp_types text[] := ARRAY[
    'needs', 'needs', 'needs', 'needs', 'needs', 'needs', 'needs', 'needs', 'needs', 'needs',
    'wants', 'wants', 'wants', 'wants', 'wants', 'wants', 'wants', 'wants'
  ];
  cat text;
  typ text;
  src text;
  days_in_month int;
BEGIN
  FOR month_start IN
    SELECT (gs)::date
    FROM generate_series(
      '2023-01-01'::timestamp,
      '2026-03-01'::timestamp,
      '1 month'::interval
    ) AS gs
  LOOP
    month_end := (date_trunc('month', month_start) + interval '1 month - 1 day')::date;
    days_in_month := extract(day from month_end)::int;

    -- 2 income records this month
    FOR i IN 1..2 LOOP
      d := month_start + (random() * days_in_month)::int;
      src := inc_sources[1 + (i % array_length(inc_sources, 1))];
      amt := (15000 + random() * 35000)::numeric(10, 2);
      INSERT INTO public.income_records (user_id, total_amount, disposable_amount, date, income_source)
      VALUES (uid, amt, amt * 0.75, d, src);
    END LOOP;

    -- 30 expense transactions this month
    FOR i IN 1..30 LOOP
      d := month_start + (random() * days_in_month)::int;
      cat := exp_cats[1 + (i % array_length(exp_cats, 1))];
      typ := exp_types[1 + (i % array_length(exp_types, 1))];
      amt := (100 + random() * 4900)::numeric(10, 2);
      INSERT INTO public.expenses (user_id, category, type, amount, date, description)
      VALUES (
        uid,
        cat,
        typ,
        amt,
        d,
        CASE WHEN i % 5 = 0 THEN 'Seed entry ' || to_char(month_start, 'YYYY-MM') || ' #' || i ELSE NULL END
      );
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Seeded expenses (30/month) and income (2/month) from Jan 2023 to Mar 2026 for user %', uid;
END $$;
