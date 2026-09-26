import { describe, it, expect } from 'vitest'
import { deriveMonthInsight, deriveMonthInsights } from './dashboardInsight'

describe('deriveMonthInsights', () => {
  it('stacks money pressure + goals when overspending with early goals', () => {
    const stack = deriveMonthInsights({
      income: 55454,
      expenses: 78385,
      goalsCount: 2,
      goalsProgressPct: 12,
    })
    expect(stack.source).toBe('calculated')
    expect(stack.variant).toBe('warning')
    expect(stack.items.length).toBeGreaterThanOrEqual(2)
    expect(stack.items.length).toBeLessThanOrEqual(3)
    expect(stack.items[0].body).toContain('₱22,931')
    expect(stack.items[0].actionLabel).toBe('Review expenses →')
    expect(stack.items.some((i) => i.id === 'goals-early')).toBe(true)
    expect(stack.items.find((i) => i.id === 'goals-early')?.href).toContain('allocate=1')
  })

  it('returns a single placeholder when there is no activity', () => {
    const stack = deriveMonthInsights({
      income: 0,
      expenses: 0,
      goalsCount: 0,
      goalsProgressPct: 0,
    })
    expect(stack.source).toBe('placeholder')
    expect(stack.items).toHaveLength(1)
  })

  it('surplus CTA opens allocate modal when goals exist', () => {
    const stack = deriveMonthInsights({
      income: 100000,
      expenses: 40000,
      goalsCount: 1,
      goalsProgressPct: 50,
    })
    expect(stack.variant).toBe('positive')
    expect(stack.items[0].body).toContain('₱60,000')
    expect(stack.items[0].href).toBe('/dashboard/goals?allocate=1')
    expect(stack.items[0].actionLabel).toBe('Allocate to goal →')
    expect(stack.items.length).toBe(2)
  })

  it('surplus without goals points to new goal', () => {
    const stack = deriveMonthInsights({
      income: 100000,
      expenses: 40000,
      goalsCount: 0,
      goalsProgressPct: 0,
    })
    expect(stack.items[0].href).toBe('/dashboard/goals?new=1')
    expect(stack.items[0].actionLabel).toBe('Add a goal →')
  })

  it('uses consistent two-sentence copy format', () => {
    const stack = deriveMonthInsights({
      income: 55454,
      expenses: 78385,
      goalsCount: 2,
      goalsProgressPct: 12,
    })
    for (const item of stack.items) {
      expect(item.body.endsWith('.')).toBe(true)
      expect(item.actionLabel.endsWith('→')).toBe(true)
    }
  })
})

describe('deriveMonthInsight (primary only)', () => {
  it('warns when expenses exceed income', () => {
    const insight = deriveMonthInsight({
      income: 55454,
      expenses: 78385,
      goalsCount: 2,
      goalsProgressPct: 12,
    })
    expect(insight.variant).toBe('warning')
    expect(insight.body).toContain('₱22,931')
  })
})
