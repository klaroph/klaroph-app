-- Read-only headcount for the one-time Pro grant. Run this before migration
-- 20261019000002. It does not update anything.
--
-- Same payment rules as that migration: a successful PayMongo payment is a
-- payment.paid or checkout_session.payment.paid row in public.payment_events
-- (the table the webhook writes). user_id is
-- payload #>> '{data,attributes,data,attributes,metadata,user_id}', the path
-- the founder dock already reads. Refunded payments are left out. A payment
-- counts as refunded when its payload says so, or when another stored event
-- whose type contains "refund" names the same payment id.
--
-- Categories (one row per user_id, no email):
--   paying customer
--   tester, not a paying customer   (profiles.user_type = tester; not granted)
--   already lifetime                 (includes the existing tester lifetime row)
--   excluded: deleted account        (no auth.users or profiles row)
--
-- Testers are not granted. Already-lifetime rows stay as they are.

WITH raw_paid AS (
  SELECT
    e.event_id,
    e.event_type,
    e.processed_at,
    btrim(e.payload #>> '{data,attributes,data,attributes,metadata,user_id}') AS user_id,
    CASE
      WHEN e.event_type = 'payment.paid' THEN e.payload #>> '{data,attributes,data,id}'
      ELSE COALESCE(
        e.payload #>> '{data,attributes,data,attributes,payments,0,id}',
        e.payload #>> '{data,attributes,data,id}'
      )
    END AS payment_id,
    CASE
      WHEN e.event_type = 'payment.paid' THEN e.payload #>> '{data,attributes,data,attributes,amount}'
      ELSE COALESCE(
        e.payload #>> '{data,attributes,data,attributes,payments,0,attributes,amount}',
        e.payload #>> '{data,attributes,data,attributes,amount}'
      )
    END AS amount_text,
    CASE
      WHEN e.event_type = 'payment.paid' THEN e.payload #>> '{data,attributes,data,attributes,currency}'
      ELSE COALESCE(
        e.payload #>> '{data,attributes,data,attributes,payments,0,attributes,currency}',
        e.payload #>> '{data,attributes,data,attributes,currency}'
      )
    END AS currency,
    CASE
      WHEN e.event_type = 'payment.paid' THEN e.payload #>> '{data,attributes,data,attributes,status}'
      ELSE COALESCE(
        e.payload #>> '{data,attributes,data,attributes,payments,0,attributes,status}',
        e.payload #>> '{data,attributes,data,attributes,status}'
      )
    END AS payment_status,
    CASE
      WHEN e.event_type = 'payment.paid' THEN e.payload #>> '{data,attributes,data,attributes,amount_refunded}'
      ELSE COALESCE(
        e.payload #>> '{data,attributes,data,attributes,payments,0,attributes,amount_refunded}',
        e.payload #>> '{data,attributes,data,attributes,amount_refunded}'
      )
    END AS amount_refunded_text,
    CASE
      WHEN e.event_type = 'payment.paid' THEN e.payload #> '{data,attributes,data,attributes,refunds}'
      ELSE COALESCE(
        e.payload #> '{data,attributes,data,attributes,payments,0,attributes,refunds}',
        e.payload #> '{data,attributes,data,attributes,refunds}'
      )
    END AS refunds
  FROM public.payment_events e
  WHERE e.event_type IN ('payment.paid', 'checkout_session.payment.paid')
),
parsed AS (
  SELECT
    event_id,
    event_type,
    processed_at,
    user_id,
    NULLIF(btrim(payment_id), '') AS payment_id,
    CASE WHEN amount_text ~ '^[0-9]+$' THEN amount_text::bigint ELSE NULL END AS amount_centavos,
    CASE WHEN amount_refunded_text ~ '^[0-9]+$' THEN amount_refunded_text::bigint ELSE 0 END AS amount_refunded,
    upper(btrim(currency)) AS currency,
    lower(btrim(payment_status)) AS payment_status,
    refunds
  FROM raw_paid
),
refunded_payment_ids AS (
  SELECT DISTINCT NULLIF(btrim(payment_id), '') AS payment_id
  FROM (
    SELECT payload #>> '{data,attributes,data,id}' AS payment_id
    FROM public.payment_events
    WHERE event_type ILIKE '%refund%'
    UNION ALL
    SELECT payload #>> '{data,attributes,data,attributes,payment_id}'
    FROM public.payment_events
    WHERE event_type ILIKE '%refund%'
    UNION ALL
    SELECT payload #>> '{data,attributes,data,attributes,payment,id}'
    FROM public.payment_events
    WHERE event_type ILIKE '%refund%'
  ) ids
),
successful AS (
  SELECT *
  FROM parsed p
  WHERE p.user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND p.amount_centavos IS NOT NULL
    AND p.amount_centavos > 0
    AND (p.currency IS NULL OR p.currency = '' OR p.currency = 'PHP')
    AND COALESCE(p.payment_status, '') NOT IN ('refunded', 'partially_refunded')
    AND COALESCE(p.amount_refunded, 0) = 0
    AND (
      p.refunds IS NULL
      OR jsonb_typeof(p.refunds) <> 'array'
      OR jsonb_array_length(p.refunds) = 0
    )
    AND (
      p.payment_id IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM refunded_payment_ids r WHERE r.payment_id = p.payment_id
      )
    )
),
deduped AS (
  SELECT DISTINCT ON (COALESCE(payment_id, event_id))
    user_id,
    amount_centavos,
    processed_at
  FROM successful
  ORDER BY COALESCE(payment_id, event_id),
           CASE WHEN event_type = 'payment.paid' THEN 0 ELSE 1 END,
           processed_at DESC
),
paid_by_user AS (
  SELECT
    user_id,
    SUM(amount_centavos) AS total_centavos,
    COUNT(*)::int AS payment_count,
    MAX(processed_at) AS last_paid_at
  FROM deduped
  GROUP BY user_id
),
candidates AS (
  SELECT user_id FROM paid_by_user
  UNION
  SELECT s.user_id::text
  FROM public.subscriptions s
  WHERE s.is_lifetime = true
),
classified AS (
  SELECT
    c.user_id,
    ROUND(COALESCE(pay.total_centavos, 0) / 100.0, 2) AS total_paid,
    COALESCE(pay.payment_count, 0) AS payment_count,
    pay.last_paid_at,
    COALESCE(pl.name, 'none') AS current_plan,
    CASE
      WHEN u.id IS NULL OR pr.id IS NULL THEN 'excluded: deleted account'
      WHEN s.is_lifetime IS TRUE THEN 'already lifetime'
      WHEN pr.user_type = 'tester' THEN 'tester, not a paying customer'
      ELSE 'paying customer'
    END AS category
  FROM candidates c
  LEFT JOIN paid_by_user pay ON pay.user_id = c.user_id
  LEFT JOIN auth.users u ON u.id = c.user_id::uuid
  LEFT JOIN public.profiles pr ON pr.id = c.user_id::uuid
  LEFT JOIN public.subscriptions s ON s.user_id = c.user_id::uuid
  LEFT JOIN public.plans pl ON pl.id = s.plan_id
)
SELECT user_id, total_paid, payment_count, last_paid_at, current_plan, category
FROM classified
ORDER BY category, user_id;

WITH raw_paid AS (
  SELECT
    e.event_id,
    e.event_type,
    e.processed_at,
    btrim(e.payload #>> '{data,attributes,data,attributes,metadata,user_id}') AS user_id,
    CASE
      WHEN e.event_type = 'payment.paid' THEN e.payload #>> '{data,attributes,data,id}'
      ELSE COALESCE(
        e.payload #>> '{data,attributes,data,attributes,payments,0,id}',
        e.payload #>> '{data,attributes,data,id}'
      )
    END AS payment_id,
    CASE
      WHEN e.event_type = 'payment.paid' THEN e.payload #>> '{data,attributes,data,attributes,amount}'
      ELSE COALESCE(
        e.payload #>> '{data,attributes,data,attributes,payments,0,attributes,amount}',
        e.payload #>> '{data,attributes,data,attributes,amount}'
      )
    END AS amount_text,
    CASE
      WHEN e.event_type = 'payment.paid' THEN e.payload #>> '{data,attributes,data,attributes,currency}'
      ELSE COALESCE(
        e.payload #>> '{data,attributes,data,attributes,payments,0,attributes,currency}',
        e.payload #>> '{data,attributes,data,attributes,currency}'
      )
    END AS currency,
    CASE
      WHEN e.event_type = 'payment.paid' THEN e.payload #>> '{data,attributes,data,attributes,status}'
      ELSE COALESCE(
        e.payload #>> '{data,attributes,data,attributes,payments,0,attributes,status}',
        e.payload #>> '{data,attributes,data,attributes,status}'
      )
    END AS payment_status,
    CASE
      WHEN e.event_type = 'payment.paid' THEN e.payload #>> '{data,attributes,data,attributes,amount_refunded}'
      ELSE COALESCE(
        e.payload #>> '{data,attributes,data,attributes,payments,0,attributes,amount_refunded}',
        e.payload #>> '{data,attributes,data,attributes,amount_refunded}'
      )
    END AS amount_refunded_text,
    CASE
      WHEN e.event_type = 'payment.paid' THEN e.payload #> '{data,attributes,data,attributes,refunds}'
      ELSE COALESCE(
        e.payload #> '{data,attributes,data,attributes,payments,0,attributes,refunds}',
        e.payload #> '{data,attributes,data,attributes,refunds}'
      )
    END AS refunds
  FROM public.payment_events e
  WHERE e.event_type IN ('payment.paid', 'checkout_session.payment.paid')
),
parsed AS (
  SELECT
    event_id,
    event_type,
    processed_at,
    user_id,
    NULLIF(btrim(payment_id), '') AS payment_id,
    CASE WHEN amount_text ~ '^[0-9]+$' THEN amount_text::bigint ELSE NULL END AS amount_centavos,
    CASE WHEN amount_refunded_text ~ '^[0-9]+$' THEN amount_refunded_text::bigint ELSE 0 END AS amount_refunded,
    upper(btrim(currency)) AS currency,
    lower(btrim(payment_status)) AS payment_status,
    refunds
  FROM raw_paid
),
refunded_payment_ids AS (
  SELECT DISTINCT NULLIF(btrim(payment_id), '') AS payment_id
  FROM (
    SELECT payload #>> '{data,attributes,data,id}' AS payment_id
    FROM public.payment_events
    WHERE event_type ILIKE '%refund%'
    UNION ALL
    SELECT payload #>> '{data,attributes,data,attributes,payment_id}'
    FROM public.payment_events
    WHERE event_type ILIKE '%refund%'
    UNION ALL
    SELECT payload #>> '{data,attributes,data,attributes,payment,id}'
    FROM public.payment_events
    WHERE event_type ILIKE '%refund%'
  ) ids
),
successful AS (
  SELECT *
  FROM parsed p
  WHERE p.user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND p.amount_centavos IS NOT NULL
    AND p.amount_centavos > 0
    AND (p.currency IS NULL OR p.currency = '' OR p.currency = 'PHP')
    AND COALESCE(p.payment_status, '') NOT IN ('refunded', 'partially_refunded')
    AND COALESCE(p.amount_refunded, 0) = 0
    AND (
      p.refunds IS NULL
      OR jsonb_typeof(p.refunds) <> 'array'
      OR jsonb_array_length(p.refunds) = 0
    )
    AND (
      p.payment_id IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM refunded_payment_ids r WHERE r.payment_id = p.payment_id
      )
    )
),
deduped AS (
  SELECT DISTINCT ON (COALESCE(payment_id, event_id))
    user_id,
    amount_centavos,
    processed_at
  FROM successful
  ORDER BY COALESCE(payment_id, event_id),
           CASE WHEN event_type = 'payment.paid' THEN 0 ELSE 1 END,
           processed_at DESC
),
paid_by_user AS (
  SELECT user_id
  FROM deduped
  GROUP BY user_id
),
candidates AS (
  SELECT user_id FROM paid_by_user
  UNION
  SELECT s.user_id::text
  FROM public.subscriptions s
  WHERE s.is_lifetime = true
),
classified AS (
  SELECT
    c.user_id,
    CASE
      WHEN u.id IS NULL OR pr.id IS NULL THEN 'excluded: deleted account'
      WHEN s.is_lifetime IS TRUE THEN 'already lifetime'
      WHEN pr.user_type = 'tester' THEN 'tester, not a paying customer'
      ELSE 'paying customer'
    END AS category
  FROM candidates c
  LEFT JOIN auth.users u ON u.id = c.user_id::uuid
  LEFT JOIN public.profiles pr ON pr.id = c.user_id::uuid
  LEFT JOIN public.subscriptions s ON s.user_id = c.user_id::uuid
)
SELECT category, COUNT(*)::int AS users
FROM classified
GROUP BY category
ORDER BY category;
