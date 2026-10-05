import { readFileSync } from 'fs'
import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://ref.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'service-role-test'
})

import {
  BUDGET_FREE_TRIAL_DAYS,
  getBudgetEditingAllowed,
  getBudgetTrialDaysLeft,
} from './entitlements'
import {
  BUDGET_LOCK_STILL_FREE_LINE,
  BUDGET_LOCK_UPGRADE_MESSAGE,
  budgetTrialFreedomNotice,
} from './budgetLockMessage'

const root = path.resolve(__dirname, '..')
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8')

const freePlan = {
  plan_name: 'free' as const,
  max_goals: 2,
  max_rows_per_tool: 300,
  export_enabled: false,
  advanced_analytics: false,
  full_budgeting_entitled: false,
  can_create_goals: true,
}

const proPlan = {
  ...freePlan,
  plan_name: 'pro' as const,
  full_budgeting_entitled: true,
}

const NOW = new Date('2026-10-05T12:00:00.000Z')
const DAY_MS = 24 * 60 * 60 * 1000

function isoDaysBefore(days: number): string {
  return new Date(NOW.getTime() - days * DAY_MS).toISOString()
}

describe('budget trial clock', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('reports whole days left while free editing is still allowed', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    expect(getBudgetEditingAllowed(freePlan, isoDaysBefore(0))).toBe(true)
    expect(getBudgetTrialDaysLeft(freePlan, isoDaysBefore(0))).toBe(BUDGET_FREE_TRIAL_DAYS)
    expect(getBudgetEditingAllowed(freePlan, isoDaysBefore(10.2))).toBe(true)
    expect(getBudgetTrialDaysLeft(freePlan, isoDaysBefore(10.2))).toBe(20)
  })

  it('counts the last partial day as 1 day left and still allows editing', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const lastHour = new Date(NOW.getTime() - (BUDGET_FREE_TRIAL_DAYS * DAY_MS - 60 * 60 * 1000)).toISOString()
    expect(getBudgetEditingAllowed(freePlan, lastHour)).toBe(true)
    expect(getBudgetTrialDaysLeft(freePlan, lastHour)).toBe(1)
    expect(getBudgetEditingAllowed(freePlan, isoDaysBefore(BUDGET_FREE_TRIAL_DAYS))).toBe(true)
    expect(getBudgetTrialDaysLeft(freePlan, isoDaysBefore(BUDGET_FREE_TRIAL_DAYS))).toBe(1)
  })

  it('locks after the window with 0 days left', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const expired = new Date(NOW.getTime() - (BUDGET_FREE_TRIAL_DAYS * DAY_MS + 1000)).toISOString()
    expect(getBudgetEditingAllowed(freePlan, expired)).toBe(false)
    expect(getBudgetTrialDaysLeft(freePlan, expired)).toBe(0)
  })

  it('has no trial clock when budgeting is fully entitled', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    expect(getBudgetEditingAllowed(proPlan, isoDaysBefore(400))).toBe(true)
    expect(getBudgetTrialDaysLeft(proPlan, isoDaysBefore(400))).toBeNull()
  })

  it('does not invent a clock when created_at cannot be read', () => {
    expect(getBudgetEditingAllowed(freePlan, null)).toBe(false)
    expect(getBudgetTrialDaysLeft(freePlan, null)).toBeNull()
    expect(getBudgetTrialDaysLeft(freePlan, 'not-a-date')).toBeNull()
  })
})

describe('budget freedom copy', () => {
  it('names what stays free and includes days left when the clock is known', () => {
    const notice = budgetTrialFreedomNotice(12)
    expect(notice).toContain('Income, expenses, and goals stay free')
    expect(notice).toContain('Budget editing needs Pro')
    expect(notice).toContain('12 days left')
    expect(notice.toLowerCase()).not.toBe('upgrade soon')
  })

  it('uses the singular day and omits a count when the clock is missing', () => {
    expect(budgetTrialFreedomNotice(1)).toContain('1 day left.')
    expect(budgetTrialFreedomNotice(1)).not.toContain('1 days left')
    const withoutClock = budgetTrialFreedomNotice(null)
    expect(withoutClock).toContain('Income, expenses, and goals stay free')
    expect(withoutClock).toContain('Budget editing needs Pro')
    expect(withoutClock).not.toMatch(/days? left/)
  })

  it('keeps the existing lock upgrade message and adds a short still-free line', () => {
    expect(BUDGET_LOCK_UPGRADE_MESSAGE).toBe('Upgrade to continue managing budgets beyond 30 days.')
    expect(BUDGET_LOCK_STILL_FREE_LINE).toBe('Income, expenses, and goals still work.')
  })
})

describe('upgrade opens stay entitlement-gated', () => {
  it('removes activity auto-open hooks and keeps the 90-day range trigger', () => {
    const hook = read('hooks/useSmartUpgradeTriggers.ts')
    expect(hook).not.toMatch(/useTrigger100Transactions|useTriggerSecondGoalCompleted/)
    expect(hook).toMatch(/export function useTriggerDateRangeBeyond90/)
    expect(read('app/dashboard/expenses/page.tsx')).toMatch(/useTriggerDateRangeBeyond90/)
    expect(read('app/dashboard/income/page.tsx')).toMatch(/useTriggerDateRangeBeyond90/)
  })

  it('still opens upgrade from budget lock, import quota, and max goals', () => {
    const budget = read('components/dashboard/BudgetOverview.tsx')
    expect(budget).toMatch(/openUpgrade\(\{ message: BUDGET_LOCK_UPGRADE_MESSAGE \}\)/)
    expect(budget).toMatch(/budgetTrialFreedomNotice/)
    expect(budget).toMatch(/BUDGET_LOCK_STILL_FREE_LINE/)
    expect(read('components/dashboard/ImportCSVModal.tsx')).toMatch(/openUpgradeModal\(/)
    expect(read('components/dashboard/ManageGoalsModal.tsx')).toMatch(/onUpgradeClick/)
    expect(read('app/dashboard/page.tsx')).toMatch(/openUpgradeModal\(\)/)
    expect(read('app/api/features/route.ts')).toMatch(/budget_trial_days_left/)
  })
})
