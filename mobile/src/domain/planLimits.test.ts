import { describe, expect, it } from 'vitest'
import { FREE_PLAN_CAP, fullBudgetingFromUserFeatures, goalAdoptionBlockMessage, planCapFromUserFeatures } from './planLimits'

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

describe('get_user_features', () => {
  it('maps clarity_premium and pro onto the Pro cap from max_goals', () => {
    expect(planCapFromUserFeatures({ plan_name: 'clarity_premium', max_goals: 20 })).toEqual({
      name: 'Pro',
      maxGoals: 20,
    })
    expect(planCapFromUserFeatures({ plan_name: 'pro', max_goals: 20 })).toEqual({ name: 'Pro', maxGoals: 20 })
    expect(fullBudgetingFromUserFeatures({ plan_name: 'clarity_premium', max_goals: 20, is_grace: true })).toBe(true)
  })

  it('uses a free payload max_goals and falls back to 2', () => {
    expect(planCapFromUserFeatures({ plan_name: 'free', max_goals: 2 })).toEqual({ name: 'Free', maxGoals: 2 })
    expect(planCapFromUserFeatures({ plan_name: 'free' })).toEqual({ name: 'Free', maxGoals: 2 })
    expect(planCapFromUserFeatures(null)).toEqual({ name: 'Free', maxGoals: 2 })
    expect(planCapFromUserFeatures({ plan_name: 'nope', max_goals: '20' })).toEqual({ name: 'Free', maxGoals: 2 })
    expect(fullBudgetingFromUserFeatures({ plan_name: 'free', max_goals: 2 })).toBe(false)
  })
})
