import { describe, expect, it } from 'vitest'
import { goalProgressAmount } from './goalTotal'

describe('goal progress', () => {
  it('uses saved_amount when the goal has no allocation rows', () => {
    expect(goalProgressAmount(1250, [])).toBe(1250)
    expect(goalProgressAmount('10.50', [])).toBe(10.5)
  })

  it('sums live allocations and does not add saved_amount', () => {
    expect(goalProgressAmount(999, [
      { amount: 10, deleted_at: null },
      { amount: '2.25', deleted_at: null },
    ])).toBe(12.25)
  })

  it('falls back to saved_amount when every allocation is a tombstone', () => {
    expect(goalProgressAmount(40, [
      { amount: 10, deleted_at: '2026-10-01T00:00:00.000Z' },
    ])).toBe(40)
  })
})
