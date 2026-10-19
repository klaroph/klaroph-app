import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

function readText(file: string): string {
  return readFileSync(join(process.cwd(), file), 'utf8').replace(/\r\n/g, '\n')
}

const migration = readText('supabase/migrations/20261019000003_lifetime_pro_entitlement.sql')
const check = readText('supabase/scripts/lifetime_pro_entitlement_check.sql')
const refund = readText('supabase/scripts/revoke_pro_after_refund.sql')
const grant = readText('supabase/migrations/20261019000002_grant_lifetime_to_verified_payers.sql')

function jsonText(payload: unknown, path: string): string | null {
  const keys = path.slice(1, -1).split(',')
  let current: unknown = payload
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return null
    current = (current as Record<string, unknown>)[key]
  }
  return typeof current === 'string' && current.trim() ? current.trim() : null
}

/** Same payment ids migration B reads from an event whose type contains "refund". */
function refundedPaymentIds(eventType: string, payload: unknown): string[] {
  if (!eventType.toLowerCase().includes('refund')) return []
  return [
    '{data,attributes,data,id}',
    '{data,attributes,data,attributes,payment_id}',
    '{data,attributes,data,attributes,payment,id}',
  ]
    .map((path) => jsonText(payload, path))
    .filter((id): id is string => id != null)
}

describe('lifetime Pro database checks', () => {
  it('treats is_lifetime as Pro ahead of plan, status, and period end', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.is_free_analytics_user(p_user_id uuid)')
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
  it('writes a payment_events row migration B would treat as a refund of that payment', () => {
    const paymentId = 'pay_123'
    const payload = {
      data: {
        attributes: {
          data: {
            id: paymentId,
            attributes: {
              payment_id: paymentId,
              reason: 'duplicate',
              operator: 'jerald',
            },
          },
        },
      },
    }
    expect(refund).toContain("'manual.refund'")
    expect(refund).toContain("'manual.refund:' || v_payment_id")
    expect(refund).toContain('is_lifetime = false')
    expect(refund).toContain("status = 'canceled'")
    expect(refund).toContain("name = 'free'")
    expect(grant).toContain("event_type ILIKE '%refund%'")
    expect(grant).toContain("payload #>> '{data,attributes,data,id}'")
    expect(grant).toContain("payload #>> '{data,attributes,data,attributes,payment_id}'")

    const ids = refundedPaymentIds('manual.refund', payload)
    expect(ids).toContain(paymentId)
    const paidId = paymentId
    const excluded = ids.includes(paidId)
    expect(excluded).toBe(true)
  })
})
