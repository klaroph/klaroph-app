-- One-time Pro, part B. Idempotent grant of is_lifetime for verified payers.
--
-- Run supabase/scripts/one_time_pro_payer_report.sql first and review the
-- headcount. Then apply migration A, then this file:
--   supabase db query -f supabase/migrations/20261019000002_grant_lifetime_to_verified_payers.sql
--   supabase migration repair --status applied 20261019000002
-- Do not db push.
--
-- A verified payer has at least one successful, non-refunded PayMongo payment
-- in public.payment_events (payment.paid or checkout_session.payment.paid).
-- user_id is payload #>> '{data,attributes,data,attributes,metadata,user_id}'.
-- Deleted accounts (no auth.users or profiles row) are skipped. Testers
-- (profiles.user_type = tester) are skipped, including the existing tester
-- lifetime row. Rows that are already lifetime are left set.
--
-- subscriptions.plan_type allows only free, monthly, or annual. A payer with
-- no subscription row is inserted on the pro plan with plan_type annual so the
-- check constraint holds. Access is is_lifetime, not that column.

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
    user_id
  FROM successful
  ORDER BY COALESCE(payment_id, event_id),
           CASE WHEN event_type = 'payment.paid' THEN 0 ELSE 1 END,
           processed_at DESC
),
payers AS (
  SELECT d.user_id
  FROM deduped d
  JOIN auth.users u ON u.id = d.user_id::uuid
  JOIN public.profiles pr ON pr.id = d.user_id::uuid
  WHERE pr.user_type IS DISTINCT FROM 'tester'
  GROUP BY d.user_id
),
updated AS (
  UPDATE public.subscriptions s
  SET is_lifetime = true
  FROM payers
  WHERE s.user_id = payers.user_id::uuid
    AND s.is_lifetime IS DISTINCT FROM true
  RETURNING s.user_id
)
INSERT INTO public.subscriptions (
  user_id,
  plan_id,
  status,
  plan_type,
  payment_provider,
  current_period_start,
  current_period_end,
  auto_renew,
  is_lifetime
)
SELECT
  payers.user_id::uuid,
  pro.id,
  'active',
  'annual',
  'paymongo',
  now(),
  now(),
  false,
  true
FROM payers
JOIN public.plans pro ON pro.name = 'pro'
WHERE NOT EXISTS (
  SELECT 1 FROM public.subscriptions s WHERE s.user_id = payers.user_id::uuid
)
AND NOT EXISTS (
  SELECT 1 FROM updated u WHERE u.user_id = payers.user_id::uuid
);
