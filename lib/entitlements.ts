/**
 * KlaroPH feature entitlements — single source of truth for Free vs Pro logic.
 * All backend access rules and feature flags must align with this module and planFeatures (display).
 *
 * FREE: 2 goals, 90-day analytics, basic charts, no export, budgeting only in first 30 days.
 * PRO:  20 goals, unlimited history, advanced charts, export, full budgeting always.
 */

import type { ResolvedPlan } from '@/lib/resolveUserPlan'
import { resolveUserPlan } from '@/lib/resolveUserPlan'

/** Free plan: analytics limited to last N days. */
export const FREE_ANALYTICS_DAYS = 90

/** Free plan: full budgeting access for first N days after account creation. */
export const BUDGET_FREE_TRIAL_DAYS = 30

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Fractional days since account creation, or null when the clock cannot be read. */
function daysSinceAccountCreation(userCreatedAt: string | null | undefined): number | null {
  if (!userCreatedAt) return null
  const created = new Date(userCreatedAt).getTime()
  if (!Number.isFinite(created)) return null
  return (Date.now() - created) / MS_PER_DAY
}

/**
 * Returns whether the user is allowed to create/edit/delete budgets.
 * Plan with full_budgeting_entitled (from plans.has_budgeting): always true.
 * Free: true only within BUDGET_FREE_TRIAL_DAYS of account creation.
 * Use auth user's created_at (ISO string) as source of truth for the 30-day rule.
 */
export function getBudgetEditingAllowed(
  plan: ResolvedPlan,
  userCreatedAt: string | null | undefined
): boolean {
  if (plan.full_budgeting_entitled) return true
  const daysSinceCreation = daysSinceAccountCreation(userCreatedAt)
  if (daysSinceCreation == null) return false
  return daysSinceCreation <= BUDGET_FREE_TRIAL_DAYS
}

/**
 * Whole days of free budget editing still left.
 * null when the plan has full budgeting (no trial clock) or created_at cannot be read.
 * 0 after the free window ends.
 * At least 1 while editing is still allowed, including the last partial day.
 */
export function getBudgetTrialDaysLeft(
  plan: ResolvedPlan,
  userCreatedAt: string | null | undefined
): number | null {
  if (plan.full_budgeting_entitled) return null
  const daysSinceCreation = daysSinceAccountCreation(userCreatedAt)
  if (daysSinceCreation == null) return null
  if (daysSinceCreation > BUDGET_FREE_TRIAL_DAYS) return 0
  const wholeDaysLeft = Math.ceil(BUDGET_FREE_TRIAL_DAYS - daysSinceCreation)
  return Math.min(BUDGET_FREE_TRIAL_DAYS, Math.max(1, wholeDaysLeft))
}

/**
 * Resolve plan and budget editing for a user. Use in API routes that need both.
 */
export async function resolvePlanAndBudgetEntitlement(
  userId: string,
  userCreatedAt: string | null | undefined
): Promise<{ plan: ResolvedPlan; budgetEditingAllowed: boolean }> {
  const plan = await resolveUserPlan(userId)
  const budgetEditingAllowed = getBudgetEditingAllowed(plan, userCreatedAt)
  return { plan, budgetEditingAllowed }
}
