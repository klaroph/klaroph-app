import { describe, expect, it } from 'vitest'
import { accountPlanFromSubscription, FREE_PLAN_CAP, goalAdoptionBlockMessage, type PlanConfig, type SubscriptionSnapshot } from './planLimits'

describe('goal adoption cap', () => {
  it('allows a combined total equal to the plan and blocks one past it', () => {
    expect(goalAdoptionBlockMessage({ plan: FREE_PLAN_CAP, localGoals: 1, serverGoals: 1 })).toBeNull()
    expect(goalAdoptionBlockMessage({ plan: FREE_PLAN_CAP, localGoals: 2, serverGoals: 0 })).toBeNull()
    expect(goalAdoptionBlockMessage({ plan: FREE_PLAN_CAP, localGoals: 2, serverGoals: 1 })).toBe(
      'Free allows 2 goals; you have 2 here and 1 in your account. Remove some to continue.',
    )
  })

  it('uses the resolved plan name and cap', () => {
    expect(goalAdoptionBlockMessage({
      plan: { name: 'Pro', maxGoals: 20 },
      localGoals: 3,
      serverGoals: 18,
    })).toBe('Pro allows 20 goals; you have 3 here and 18 in your account. Remove some to continue.')
  })
})

const NOW = new Date('2026-10-19T00:00:00.000Z')

const PLANS: PlanConfig[] = [
  { id: 'plan-free', name: 'free', maxGoals: 2, hasBudgeting: false },
  { id: 'plan-pro', name: 'pro', maxGoals: 20, hasBudgeting: true },
  { id: 'plan-clarity', name: 'clarity_premium', maxGoals: 20, hasBudgeting: true },
]

function subscription(overrides: Partial<SubscriptionSnapshot>): SubscriptionSnapshot {
  return {
    status: 'active',
    planId: 'plan-pro',
    currentPeriodEnd: '2027-01-01T00:00:00.000Z',
    gracePeriodUntil: null,
    isLifetime: false,
    ...overrides,
  }
}

describe('subscription goal cap', () => {
  it('uses the linked pro or clarity_premium max_goals during an active period', () => {
    expect(accountPlanFromSubscription(subscription({}), PLANS, NOW)).toEqual({
      plan: { name: 'Pro', maxGoals: 20 },
      fullBudgeting: true,
    })
    expect(accountPlanFromSubscription(subscription({ planId: 'plan-clarity' }), PLANS, NOW).plan).toEqual({
      name: 'Pro',
      maxGoals: 20,
    })
    const custom: PlanConfig[] = [
      { id: 'plan-pro', name: 'pro', maxGoals: 20, hasBudgeting: true },
      { id: 'plan-custom', name: 'pro', maxGoals: 15, hasBudgeting: true },
    ]
    expect(accountPlanFromSubscription(subscription({ planId: 'plan-custom' }), custom, NOW).plan.maxGoals).toBe(15)
  })

  it('uses the pro plan max for lifetime, including a free plan_id and a null max_goals', () => {
    expect(accountPlanFromSubscription(subscription({
      status: 'canceled',
      planId: 'plan-free',
      currentPeriodEnd: '2020-01-01T00:00:00.000Z',
      isLifetime: true,
    }), PLANS, NOW)).toEqual({
      plan: { name: 'Pro', maxGoals: 20 },
      fullBudgeting: true,
    })
    const nullMax: PlanConfig[] = [
      { id: 'plan-pro', name: 'pro', maxGoals: null, hasBudgeting: true },
    ]
    expect(accountPlanFromSubscription(subscription({ isLifetime: true }), nullMax, NOW).plan.maxGoals).toBe(20)
    expect(accountPlanFromSubscription(subscription({ isLifetime: true, planId: 'plan-free' }), [], NOW)).toEqual({
      plan: { name: 'Pro', maxGoals: 20 },
      fullBudgeting: true,
    })
  })

  it('keeps the free cap of 2 when there is no row, the period has ended, or the plan is free', () => {
    expect(accountPlanFromSubscription(null, PLANS, NOW)).toEqual({ plan: FREE_PLAN_CAP, fullBudgeting: false })
    expect(accountPlanFromSubscription(subscription({
      currentPeriodEnd: '2020-01-01T00:00:00.000Z',
    }), PLANS, NOW)).toEqual({ plan: FREE_PLAN_CAP, fullBudgeting: false })
    expect(accountPlanFromSubscription(subscription({ planId: 'plan-free' }), PLANS, NOW)).toEqual({
      plan: FREE_PLAN_CAP,
      fullBudgeting: false,
    })
  })

  it('keeps the free goal cap during grace and still allows full budgeting', () => {
    expect(accountPlanFromSubscription(subscription({
      status: 'past_due',
      currentPeriodEnd: '2020-01-01T00:00:00.000Z',
      gracePeriodUntil: '2026-10-22T00:00:00.000Z',
    }), PLANS, NOW)).toEqual({
      plan: FREE_PLAN_CAP,
      fullBudgeting: true,
    })
    expect(accountPlanFromSubscription(subscription({
      status: 'past_due',
      gracePeriodUntil: '2026-10-01T00:00:00.000Z',
    }), PLANS, NOW).fullBudgeting).toBe(false)
  })
})
