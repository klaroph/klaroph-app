import { describe, expect, it } from 'vitest'
import { FREE_PLAN_CAP, goalAdoptionBlockMessage } from './planLimits'

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
