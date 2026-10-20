import { readFileSync } from 'fs'
import { join } from 'path'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'

function readText(file: string): string {
  return readFileSync(join(process.cwd(), file), 'utf8').replace(/\r\n/g, '\n')
}

const migration = readText('supabase/migrations/20261019000003_lifetime_pro_entitlement.sql')
const historyLock = readText('supabase/migrations/20261020035957_free_history_lock.sql')
const check = readText('supabase/scripts/lifetime_pro_entitlement_check.sql')
const refund = readText('supabase/scripts/revoke_pro_after_refund.sql')
const grant = readText('supabase/migrations/20261019000002_grant_lifetime_to_verified_payers.sql')
const report = readText('supabase/scripts/one_time_pro_payer_report.sql')

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function filledRefundScript(input: {
  userId: string
  paymentId: string
  reason: string
  operator: string
}): string {
  return refund
    .replace(
      "v_user_id uuid := '00000000-0000-0000-0000-000000000000';",
      `v_user_id uuid := '${input.userId}';`
    )
    .replace("v_payment_id text := 'pay_replace_me';", `v_payment_id text := '${input.paymentId}';`)
    .replace("v_reason text := 'replace with the refund reason';", `v_reason text := '${input.reason}';`)
    .replace("v_operator text := 'replace with the operator name';", `v_operator text := '${input.operator}';`)
}

/** INSERT from the refund script, with the four operator values filled in. */
function refundInsertSql(paymentId: string, reason: string, operator: string): string {
  const start = refund.indexOf('INSERT INTO public.payment_events')
  const end = refund.indexOf(';', start)
  if (start < 0 || end < 0) throw new Error('refund script insert missing')
  return refund
    .slice(start, end + 1)
    .replaceAll('v_payment_id', sqlLiteral(paymentId))
    .replaceAll('v_reason', sqlLiteral(reason))
    .replaceAll('v_operator', sqlLiteral(operator))
}

/** Payer query from migration B, stopped before the grant write. */
function migrationBPayerSql(sql: string): string {
  const start = sql.indexOf('WITH raw_paid AS (')
  const end = sql.indexOf('pro_plan AS (')
  if (start < 0 || end < start) throw new Error('migration B payer query missing')
  const body = sql.slice(start, end).trim().replace(/,\s*$/, '')
  return `${body}\nSELECT user_id FROM payers`
}

/** Detail rows from the payer report, before the category summary. */
function reportDetailSql(sql: string): string {
  const start = sql.indexOf('WITH raw_paid AS (')
  const marker = 'ORDER BY category, user_id;'
  const end = sql.indexOf(marker)
  if (start < 0 || end < start) throw new Error('payer report detail query missing')
  return sql.slice(start, end + marker.length)
}

/**
 * Live checkout_session.payment.paid shape: user_id is on the nested payment
 * and payment intent, not on the session attributes.
 */
function checkoutPaidPayload(userId: string, paymentId: string) {
  return {
    data: {
      id: `evt_${paymentId}`,
      type: 'event',
      attributes: {
        type: 'checkout_session.payment.paid',
        livemode: true,
        data: {
          id: `cs_${paymentId}`,
          type: 'checkout_session',
          attributes: {
            payment_intent: {
              id: `pi_${paymentId}`,
              type: 'payment_intent',
              attributes: {
                amount: 99900,
                currency: 'PHP',
                status: 'succeeded',
                metadata: { user_id: userId, plan: 'pro' },
              },
            },
            payments: [
              {
                id: paymentId,
                type: 'payment',
                attributes: {
                  amount: 99900,
                  currency: 'PHP',
                  status: 'paid',
                  metadata: { user_id: userId, plan: 'pro' },
                },
              },
            ],
          },
        },
      },
    },
  }
}

describe('lifetime Pro database checks', () => {
  it('treats is_lifetime as Pro ahead of plan, status, and period end', () => {
    expect(historyLock).toContain('CREATE OR REPLACE FUNCTION public.is_free_analytics_user(p_user_id uuid)')
    expect(historyLock).toContain('COALESCE(s.is_lifetime, false)')
    expect(historyLock).toContain('ORDER BY s.current_period_end DESC NULLS LAST')
    expect(historyLock).toContain("lower(btrim(s.status)) = 'past_due'")
    expect(historyLock).toContain('AND now() < s.grace_period_until')
    expect(historyLock).toContain("lower(btrim(p.name)) IN ('pro', 'clarity_premium')")
    expect(historyLock).toContain('HISTORY_LOCKED')
    expect(historyLock).toContain('DROP POLICY IF EXISTS "Users can manage own expenses" ON public.expenses;')
    expect(historyLock).toContain('DROP POLICY IF EXISTS "Users can manage own income" ON public.income_records;')
    expect(historyLock).toContain('BEFORE UPDATE OF date ON public.expenses')
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.enforce_goal_plan_limit()')
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.consume_import_quota()')
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.get_user_features(p_user_id uuid)')
    expect(migration).toContain('SECURITY DEFINER')
    expect(migration).toContain('SET search_path = public')
    expect(migration).toContain('SET search_path = public, auth')
    expect(migration).toContain('COALESCE(s.is_lifetime, false)')
    expect(migration).toContain("s.is_lifetime IS TRUE")
    expect(migration).toContain(
      "s.is_lifetime = true OR (s.status = 'active' AND s.current_period_end > now() AND p.name IN ('pro', 'clarity_premium'))"
    )
    expect(migration).toContain('REVOKE EXECUTE ON FUNCTION public.get_user_features(uuid) FROM authenticated')
    expect(migration).not.toContain('GRANT EXECUTE ON FUNCTION public.get_user_features(uuid) TO authenticated')
    expect(check).toContain('plan is free')
    expect(check).toContain('expired or canceled')
    expect(check).toContain('current_period_end is in the past')
  })
})

describe('manual refund exclusion', () => {
  it('drops a payer from migration B after the refund script writes their payment id', async () => {
    const refundedUser = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
    const keptUser = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
    const refundedPayment = 'pay_refunded'
    const keptPayment = 'pay_kept'
    const db = new PGlite()

    try {
      await db.exec(`
        CREATE SCHEMA IF NOT EXISTS auth;
        CREATE TABLE auth.users (id uuid PRIMARY KEY);
        CREATE TABLE public.profiles (
          id uuid PRIMARY KEY,
          user_type text
        );
        CREATE TABLE public.payment_events (
          event_id text PRIMARY KEY,
          event_type text NOT NULL,
          payload jsonb NOT NULL,
          processed_at timestamptz NOT NULL DEFAULT now()
        );
      `)

      for (const userId of [refundedUser, keptUser]) {
        await db.query('INSERT INTO auth.users (id) VALUES ($1::uuid)', [userId])
        await db.query(
          `INSERT INTO public.profiles (id, user_type) VALUES ($1::uuid, 'user')`,
          [userId]
        )
      }
      await insertPaid(db, refundedUser, refundedPayment)
      await insertPaid(db, keptUser, keptPayment)

      const before = await payerIds(db)
      expect(before).toEqual([refundedUser, keptUser].sort())

      await db.exec(refundInsertSql(refundedPayment, 'duplicate charge', 'jerald'))

      const written = await db.query<{
        event_type: string
        at_data_id: string | null
      }>(`
        SELECT event_type,
               payload #>> '{data,attributes,data,id}' AS at_data_id
        FROM public.payment_events
        WHERE event_id = 'manual.refund:' || $1
      `, [refundedPayment])
      expect(written.rows).toEqual([
        { event_type: 'manual.refund', at_data_id: refundedPayment },
      ])

      const after = await payerIds(db)
      expect(after).toEqual([keptUser])
    } finally {
      await db.close()
    }
  })

  it('aborts when that payment id is not on a paid event for the metadata user_id', async () => {
    const target = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
    const owner = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
    const freePlan = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3'
    const db = new PGlite()

    try {
      await db.exec(`
        CREATE TABLE public.plans (id uuid PRIMARY KEY, name text NOT NULL);
        CREATE TABLE public.subscriptions (
          user_id uuid PRIMARY KEY,
          plan_id uuid,
          status text,
          is_lifetime boolean
        );
        CREATE TABLE public.payment_events (
          event_id text PRIMARY KEY,
          event_type text NOT NULL,
          payload jsonb NOT NULL,
          processed_at timestamptz NOT NULL DEFAULT now()
        );
      `)
      await db.query(`INSERT INTO public.plans (id, name) VALUES ($1::uuid, 'free')`, [freePlan])
      await db.query(
        `INSERT INTO public.subscriptions (user_id, plan_id, status, is_lifetime)
         VALUES ($1::uuid, $2::uuid, 'active', true)`,
        [target, freePlan]
      )
      await insertPaid(db, owner, 'pay_shared')

      await expect(
        db.exec(
          filledRefundScript({
            userId: target,
            paymentId: 'pay_shared',
            reason: 'duplicate',
            operator: 'jerald',
          })
        )
      ).rejects.toThrow(/not found in payment_events/)
      await db.exec('ROLLBACK')

      const sub = await db.query<{ is_lifetime: boolean; status: string }>(
        'SELECT is_lifetime, status FROM public.subscriptions WHERE user_id = $1::uuid',
        [target]
      )
      expect(sub.rows).toEqual([{ is_lifetime: true, status: 'active' }])
      const refunds = await db.query(
        `SELECT event_id FROM public.payment_events WHERE event_type = 'manual.refund'`
      )
      expect(refunds.rows).toHaveLength(0)
    } finally {
      await db.close()
    }
  })

  it('selects, lists, and refunds a checkout payer whose user id is only on the payment and payment intent', async () => {
    const userId = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd4'
    const paymentId = 'pay_checkout'
    const freePlan = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3'
    const payload = checkoutPaidPayload(userId, paymentId)
    const sessionAttributes = payload.data.attributes.data.attributes as {
      metadata?: { user_id?: string }
      payments: { id: string; attributes: { metadata: { user_id: string } } }[]
      payment_intent: { attributes: { metadata: { user_id: string } } }
    }
    expect(sessionAttributes.metadata).toBeUndefined()
    expect(sessionAttributes.payments[0].id).toBe(paymentId)
    expect(sessionAttributes.payments[0].attributes.metadata.user_id).toBe(userId)
    expect(sessionAttributes.payment_intent.attributes.metadata.user_id).toBe(userId)

    const db = new PGlite()
    try {
      await db.exec(`
        CREATE SCHEMA IF NOT EXISTS auth;
        CREATE TABLE auth.users (id uuid PRIMARY KEY);
        CREATE TABLE public.profiles (id uuid PRIMARY KEY, user_type text);
        CREATE TABLE public.plans (id uuid PRIMARY KEY, name text NOT NULL);
        CREATE TABLE public.subscriptions (
          user_id uuid PRIMARY KEY,
          plan_id uuid,
          status text,
          is_lifetime boolean
        );
        CREATE TABLE public.payment_events (
          event_id text PRIMARY KEY,
          event_type text NOT NULL,
          payload jsonb NOT NULL,
          processed_at timestamptz NOT NULL DEFAULT now()
        );
      `)
      await db.query('INSERT INTO auth.users (id) VALUES ($1::uuid)', [userId])
      await db.query(
        `INSERT INTO public.profiles (id, user_type) VALUES ($1::uuid, 'user')`,
        [userId]
      )
      await db.query(
        `INSERT INTO public.payment_events (event_id, event_type, payload)
         VALUES ($1, 'checkout_session.payment.paid', $2::jsonb)`,
        [`evt_${paymentId}`, payload]
      )

      expect(await payerIds(db)).toEqual([userId])

      const detail = reportDetailSql(report).replace(/;\s*$/, '')
      const listed = await db.query<{ user_id: string; category: string; payment_count: number }>(
        `SELECT user_id, category, payment_count FROM (${detail}) detail`
      )
      expect(listed.rows).toEqual([
        { user_id: userId, category: 'paying customer', payment_count: 1 },
      ])

      await db.query(`INSERT INTO public.plans (id, name) VALUES ($1::uuid, 'free')`, [freePlan])
      await db.query(
        `INSERT INTO public.subscriptions (user_id, plan_id, status, is_lifetime)
         VALUES ($1::uuid, $2::uuid, 'active', true)`,
        [userId, freePlan]
      )
      await db.exec(
        filledRefundScript({
          userId,
          paymentId,
          reason: 'duplicate',
          operator: 'jerald',
        })
      )

      const sub = await db.query<{ is_lifetime: boolean; status: string; plan_id: string }>(
        `SELECT is_lifetime, status, plan_id::text AS plan_id
         FROM public.subscriptions WHERE user_id = $1::uuid`,
        [userId]
      )
      expect(sub.rows).toEqual([{ is_lifetime: false, status: 'canceled', plan_id: freePlan }])
      const refundRow = await db.query<{ event_id: string }>(
        `SELECT event_id FROM public.payment_events WHERE event_type = 'manual.refund'`
      )
      expect(refundRow.rows).toEqual([{ event_id: `manual.refund:${paymentId}` }])
    } finally {
      await db.close()
    }
  })
})

async function insertPaid(db: PGlite, userId: string, paymentId: string): Promise<void> {
  await db.query(
    `INSERT INTO public.payment_events (event_id, event_type, payload)
     VALUES ($1, 'payment.paid', $2::jsonb)`,
    [
      `evt_${paymentId}`,
      {
        data: {
          attributes: {
            data: {
              id: paymentId,
              attributes: {
                amount: 99900,
                currency: 'PHP',
                status: 'paid',
                metadata: { user_id: userId },
              },
            },
          },
        },
      },
    ]
  )
}

async function payerIds(db: PGlite): Promise<string[]> {
  const result = await db.query<{ user_id: string }>(migrationBPayerSql(grant))
  return result.rows.map((row) => row.user_id).sort()
}
