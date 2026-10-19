import { DomainError } from './errors'

/**
 * Same rule as the web budget routes (`POST /api/budget-plan`,
 * `POST|PATCH|DELETE /api/budget-overrides`):
 * a plan with full budgeting (Pro / lifetime) can always edit;
 * a signed-in Free account can edit for 30 days after `auth.users.created_at`;
 * `profiles.simulate_budget_expired` pretends the account is 31 days old.
 * Local-only mode has no account, so this lock does not apply there.
 */
export const BUDGET_FREE_TRIAL_DAYS = 30

export const BUDGET_LOCK_UPGRADE_MESSAGE = 'Upgrade to continue managing budgets beyond 30 days.'

export const BUDGET_LOCKED = 'BUDGET_LOCKED'

const MS_PER_DAY = 24 * 60 * 60 * 1000

export type BudgetAccess = {
  fullBudgeting: boolean
  accountCreatedAt: string | null
  simulateExpired: boolean
}

export function budgetEditingAllowed(access: BudgetAccess, now: Date): boolean {
  if (access.fullBudgeting) return true
  const createdAt = access.simulateExpired
    ? new Date(now.getTime() - 31 * MS_PER_DAY).toISOString()
    : access.accountCreatedAt
  if (!createdAt) return false
  const created = new Date(createdAt).getTime()
  if (!Number.isFinite(created)) return false
  return (now.getTime() - created) / MS_PER_DAY <= BUDGET_FREE_TRIAL_DAYS
}

export function assertBudgetEditingAllowed(access: BudgetAccess, now: Date): void {
  if (budgetEditingAllowed(access, now)) return
  throw new DomainError(BUDGET_LOCKED, BUDGET_LOCK_UPGRADE_MESSAGE)
}
