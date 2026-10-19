import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20261019000002_grant_lifetime_to_verified_payers.sql'),
  'utf8'
)
const report = readFileSync(
  join(process.cwd(), 'supabase/scripts/one_time_pro_payer_report.sql'),
  'utf8'
)

describe('verified payer grant', () => {
  it('sets lifetime, the pro plan, and active on a free, expired, or canceled row', () => {
    expect(migration).toContain("WHERE name IN ('pro', 'clarity_premium')")
    expect(migration).toContain("WHEN name = 'pro' THEN 0")
    expect(migration).toContain('ON CONFLICT (user_id) DO UPDATE')
    expect(migration).toContain('is_lifetime = true')
    expect(migration).toContain('plan_id = EXCLUDED.plan_id')
    expect(migration).toContain("status = 'active'")
    expect(migration).toContain('plan free,    status active')
    expect(migration).toContain('plan free,    status expired')
    expect(migration).toContain('plan free,    status canceled')
    expect(migration).toContain('plan pro,     status expired')
    expect(migration).toContain('plan pro,     status canceled')
    expect(migration).toContain("pr.user_type IS DISTINCT FROM 'tester'")
    expect(migration).toContain('JOIN auth.users')
    expect(migration).toContain('JOIN public.profiles')
  })

  it('inserts a subscriptions row when the payer has none', () => {
    expect(migration).toContain('INSERT INTO public.subscriptions')
    expect(migration).toContain("'annual'")
    expect(migration).toContain('false,\n  true')
  })
})

describe('payer report', () => {
  it('lists current plan and status before the grant', () => {
    expect(report).toContain('current_plan')
    expect(report).toContain('current_status')
    expect(report).toContain("COALESCE(s.status, 'none') AS current_status")
    expect(report).toContain('free, expired, or canceled')
  })
})
