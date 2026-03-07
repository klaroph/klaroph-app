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
  if (!userCreatedAt) return false
  const created = new Date(userCreatedAt).getTime()
  const now = Date.now()
  const daysSinceCreation = (now - created) / MS_PER_DAY
  return daysSinceCreation <= BUDGET_FREE_TRIAL_DAYS
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
