import { describe, expect, it } from 'vitest'
import { suggestedSavingsAllocation } from './suggestedSavingsAllocation'

describe('suggestedSavingsAllocation', () => {
  it('uses savings_percent × income total', () => {
    expect(suggestedSavingsAllocation(25000, 20)).toBe(5000)
  })

  it('caps the suggestion at the income total', () => {
    expect(suggestedSavingsAllocation(1000, 150)).toBe(1000)
  })

  it('returns null when there is no positive preference or income', () => {
    expect(suggestedSavingsAllocation(25000, 0)).toBeNull()
    expect(suggestedSavingsAllocation(25000, null)).toBeNull()
    expect(suggestedSavingsAllocation(25000, undefined)).toBeNull()
    expect(suggestedSavingsAllocation(0, 20)).toBeNull()
    expect(suggestedSavingsAllocation(Number.NaN, 20)).toBeNull()
  })

  it('rounds to cents', () => {
    expect(suggestedSavingsAllocation(100, 33.333)).toBe(33.33)
  })
})
