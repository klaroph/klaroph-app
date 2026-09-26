import { describe, expect, it } from 'vitest'
import { formatCurrency, formatPeso, formatSignedPeso, formatWholePeso } from './format'
import { formatPlanPeso } from './planPricing'

const TWO_DP = { minimumFractionDigits: 2, maximumFractionDigits: 2 }

describe('formatSignedPeso', () => {
  it('wraps negative amounts in parentheses outside the peso sign', () => {
    expect(formatSignedPeso(-1250, '1,250.00')).toBe('(₱1,250.00)')
  })

  it('leaves positive and zero amounts unchanged', () => {
    expect(formatSignedPeso(1250, '1,250.00')).toBe('₱1,250.00')
    expect(formatSignedPeso(0, '0')).toBe('₱0')
  })

  it('does not show (₱0) when a small negative rounds to zero', () => {
    expect(formatSignedPeso(-0.4, '0')).toBe('₱0')
  })
})

describe('formatPeso', () => {
  it('formats negative amounts accounting-style with the caller precision', () => {
    expect(formatPeso(-1250, 'en-PH', TWO_DP)).toBe('(₱1,250.00)')
    expect(formatPeso(-500, 'en-PH')).toBe('(₱500)')
  })

  it('keeps positive and zero amounts as before', () => {
    expect(formatPeso(1250, 'en-PH', TWO_DP)).toBe('₱1,250.00')
    expect(formatPeso(500, 'en-PH')).toBe('₱500')
    expect(formatPeso(0, 'en-PH')).toBe('₱0')
  })

  it('preserves decimal precision from Number#toLocaleString options', () => {
    expect(formatPeso(-1234.5, 'en-PH', { minimumFractionDigits: 2 })).toBe('(₱1,234.50)')
    expect(formatPeso(1234.567, 'en-PH')).toBe('₱1,234.567')
  })

  it('treats negative zero as zero', () => {
    expect(formatPeso(-0, 'en-PH')).toBe('₱0')
  })
})

describe('formatWholePeso', () => {
  it('rounds to whole pesos and uses parentheses for negatives', () => {
    expect(formatWholePeso(-1250.4)).toBe('(₱1,250)')
    expect(formatWholePeso(1250.6)).toBe('₱1,251')
    expect(formatWholePeso(0)).toBe('₱0')
    expect(formatWholePeso(-0.3)).toBe('₱0')
  })
})

describe('formatCurrency', () => {
  it('places parentheses outside the peso sign for negatives', () => {
    expect(formatCurrency(-1250)).toBe('(₱1,250)')
    expect(formatCurrency(-1250, 2)).toBe('(₱1,250.00)')
  })

  it('keeps positive and zero values unchanged', () => {
    expect(formatCurrency(1250)).toBe('₱1,250')
    expect(formatCurrency(1250.5, 2)).toBe('₱1,250.50')
    expect(formatCurrency(0)).toBe('₱0')
  })
})

describe('formatPlanPeso', () => {
  it('keeps whole-peso plan prices and shows a fixed discount as a negative amount', () => {
    expect(formatPlanPeso(999)).toBe('₱999')
    expect(formatPlanPeso(-50)).toBe('(₱50)')
  })
})
