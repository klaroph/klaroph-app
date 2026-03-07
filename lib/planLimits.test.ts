import { describe, it, expect } from 'vitest'
import { PLAN_LIMITS } from './planLimits'

describe('PLAN_LIMITS', () => {
  it('free plan has maxGoals 2', () => {
    expect(PLAN_LIMITS.free.maxGoals).toBe(2)
  })

  it('pro plan has maxGoals 20', () => {
    expect(PLAN_LIMITS.pro.maxGoals).toBe(20)
  })
})
