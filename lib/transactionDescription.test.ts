import { describe, expect, it } from 'vitest'
import { isAmbiguousDescription, normalizeDescription } from './transactionDescription'

describe('normalizeDescription', () => {
  it('lowercases, strips punctuation and collapses whitespace', () => {
    expect(normalizeDescription('  Paid   Meralco Bill!! ')).toBe('paid meralco bill')
    expect(normalizeDescription('Sari-Sari store')).toBe('sari sari store')
    expect(normalizeDescription('₱1,500 — Jollibee')).toBe('1 500 jollibee')
  })
})

describe('isAmbiguousDescription', () => {
  it.each(['GCash 1500', 'Cash 500', 'Transfer 2000', 'Payment 1000', 'SM 1500', 'Grab 500', 'paid via gcash', '1500'])(
    '%s is ambiguous',
    (text) => {
      expect(isAmbiguousDescription(text)).toBe(true)
    }
  )

  it.each(['dentist cleaning', 'paid meralco through gcash', 'birthday dinner with family'])('%s is specific', (text) => {
    expect(isAmbiguousDescription(text)).toBe(false)
  })
})