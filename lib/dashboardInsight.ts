/**
 * Deterministic dashboard insights from existing KlaroPH totals.
 * Not AI — arithmetic the app already owns. Future AI can wrap this context.
 *
 * Returns a prioritized stack of 1–3 insights (never more).
 *
 * Copy format (consistent):
 *   "[Situation]. [Detail]."
 * CTA format: "[Verb] →"
 */

import { formatWholePeso } from '@/lib/format'

export type InsightVariant = 'insight' | 'warning' | 'positive' | 'goal' | 'budget'

export type InsightItem = {
  id: string
  variant: InsightVariant
  body: string
  href: string
  actionLabel: string
}

export type DerivedDashboardInsightStack = {
  title: string
  /** Card chrome follows the highest-priority item */
  variant: InsightVariant
  source: 'calculated' | 'placeholder'
  items: InsightItem[]
}

/** @deprecated Prefer DerivedDashboardInsightStack — kept for transitional typing */
export type DerivedDashboardInsight = InsightItem & {
  title: string
  source: 'calculated' | 'placeholder'
}

const MAX_INSIGHTS = 3

/** Magnitude only: insight copy states direction in words ("over by", "left"). */
function peso(n: number): string {
  return formatWholePeso(Math.abs(n))
}

export function deriveMonthInsights(params: {
  income: number
  expenses: number
  goalsCount: number
  goalsProgressPct: number
}): DerivedDashboardInsightStack {
  const income = Number(params.income) || 0
  const expenses = Number(params.expenses) || 0
  const net = income - expenses
  const goalsCount = Number(params.goalsCount) || 0
  const goalsProgressPct = Number(params.goalsProgressPct) || 0

  if (income === 0 && expenses === 0) {
    return {
      title: 'Klaro Insight',
      variant: 'insight',
      source: 'placeholder',
      items: [
        {
          id: 'start-logging',
          variant: 'insight',
          body: 'No activity logged this month. Start with income and expenses to build clarity.',
          href: '/dashboard/income',
          actionLabel: 'Add income →',
        },
      ],
    }
  }

  const candidates: InsightItem[] = []

  // 1. Money pressure
  if (net < 0) {
    candidates.push({
      id: 'overspend',
      variant: 'warning',
      body: `Expenses are higher than income this month. You are ${peso(net)} over.`,
      href: '/dashboard/expenses',
      actionLabel: 'Review expenses →',
    })
  }

  // 2. Plan / cash-flow state
  if (net > 0) {
    candidates.push({
      id: 'surplus',
      variant: 'positive',
      body: `You have a ${peso(net)} surplus this month. Allocate some of it toward a goal.`,
      href: goalsCount > 0 ? '/dashboard/goals?allocate=1' : '/dashboard/goals?new=1',
      actionLabel: goalsCount > 0 ? 'Allocate to goal →' : 'Add a goal →',
    })
  } else if (net === 0) {
    candidates.push({
      id: 'balanced',
      variant: 'budget',
      body: 'Income and expenses are balanced this month. Keep tracking to stay in control.',
      href: '/dashboard/expenses',
      actionLabel: 'Review budget →',
    })
  }

  // 3. Goals progress
  if (goalsCount === 0) {
    candidates.push({
      id: 'no-goals',
      variant: 'goal',
      body: 'No active goals yet. Set one target to start building momentum.',
      href: '/dashboard/goals?new=1',
      actionLabel: 'Add a goal →',
    })
  } else if (goalsProgressPct < 30) {
    candidates.push({
      id: 'goals-early',
      variant: 'goal',
      body: 'You are early on your goals. Consistent allocations this month will build momentum.',
      href: '/dashboard/goals?allocate=1',
      actionLabel: 'Allocate to goal →',
    })
  } else if (goalsProgressPct >= 70) {
    candidates.push({
      id: 'goals-strong',
      variant: 'positive',
      body: `Strong goal progress this month. You are about ${Math.round(goalsProgressPct)}% of the way there.`,
      href: '/dashboard/goals',
      actionLabel: 'View goals →',
    })
  } else {
    candidates.push({
      id: 'goals-mid',
      variant: 'goal',
      body: `You are about ${Math.round(goalsProgressPct)}% toward your goals. Keep allocating to build momentum.`,
      href: '/dashboard/goals?allocate=1',
      actionLabel: 'Allocate to goal →',
    })
  }

  const items = candidates.slice(0, MAX_INSIGHTS)
  const primary = items[0]

  return {
    title: 'Klaro Insight',
    variant: primary.variant,
    source: 'calculated',
    items,
  }
}

/** Single-insight helper (primary only) — used by tests matching the old API shape. */
export function deriveMonthInsight(params: {
  income: number
  expenses: number
  goalsCount: number
  goalsProgressPct: number
}): DerivedDashboardInsight {
  const stack = deriveMonthInsights(params)
  const primary = stack.items[0]
  return {
    ...primary,
    title: stack.title,
    source: stack.source,
  }
}
