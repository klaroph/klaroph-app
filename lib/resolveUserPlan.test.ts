import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  plan: null as Record<string, unknown> | null,
}))

vi.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: state.plan, error: null }),
        }),
      }),
    }),
  },
}))

import { getBudgetEditingAllowed, getBudgetTrialDaysLeft } from '@/lib/entitlements'
import { resolveUserPlanFromSubscription } from '@/lib/resolveUserPlan'
import { normalizeSubscriptionFromRow } from '@/lib/subscriptionStateCore'

const now = new Date('2026-09-23T12:00:00.000Z')
const proPlan = {
  id: 'plan-pro',
  name: 'pro',
  max_goals: 20,
  has_export: true,
  has_analytics: true,
  has_budgeting: true,
}

beforeEach(() => {
  state.plan = proPlan
})

describe('resolveUserPlanFromSubscription', () => {
  it('treats is_lifetime as Pro when the period has ended', async () => {
    const sub = normalizeSubscriptionFromRow(
      {
        status: 'expired',
        plan_id: 'plan-pro',
        current_period_end: '2020-01-01T00:00:00.000Z',
        is_lifetime: true,
      },
      now
    )
    const plan = await resolveUserPlanFromSubscription(sub)
    expect(plan.plan_name).toBe('pro')
    expect(plan.is_grace).toBe(false)
    expect(getBudgetEditingAllowed(plan, '2020-01-01T00:00:00.000Z')).toBe(true)
    expect(getBudgetTrialDaysLeft(plan, '2020-01-01T00:00:00.000Z')).toBeNull()
  })

  it('keeps an active monthly or annual row on Pro until the period ends', async () => {
    const monthly = normalizeSubscriptionFromRow(
      {
        status: 'active',
        plan_id: 'plan-pro',
        current_period_end: '2026-10-23T12:00:00.000Z',
        is_lifetime: false,
      },
      now
    )
    expect((await resolveUserPlanFromSubscription(monthly)).plan_name).toBe('pro')

    const expired = normalizeSubscriptionFromRow(
      {
        status: 'active',
        plan_id: 'plan-pro',
        current_period_end: '2026-08-01T00:00:00.000Z',
        is_lifetime: false,
      },
      now
    )
    expect((await resolveUserPlanFromSubscription(expired)).plan_name).toBe('free')
  })
})
