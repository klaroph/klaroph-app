import { describe, expect, it } from 'vitest'
import { isUuid } from '../domain/ids'
import { FREE_PLAN_MAX_GOALS, GOAL_LIMIT_REACHED } from '../domain/planLimits'
import { openTestRepository } from './testDb'

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

describe('local repository', () => {
  it('generates client uuids and stores an expense without an account', () => {
    const { repo } = openTestRepository()
    const expense = repo.createExpense({
      userId: null,
      category: 'Groceries',
      type: 'needs',
      amount: 120.5,
      date: '2026-02-28',
      description: 'Market',
    })
    expect(isUuid(expense.id)).toBe(true)
    expect(expense.user_id).toBeNull()
    expect(expense.dirty).toBe(true)
    expect(expense.values.amount).toBe('120.50')
    expect(repo.listLive('expenses', null)).toHaveLength(1)
  })

  it('stops local-only goal creation at the free plan max', () => {
    const { repo } = openTestRepository()
    repo.createGoal({ userId: null, name: 'One', targetAmount: 10, maxGoals: 20 })
    repo.createGoal({ userId: null, name: 'Two', targetAmount: 10, maxGoals: 20 })
    expect(FREE_PLAN_MAX_GOALS).toBe(2)
    expect(() => repo.createGoal({ userId: null, name: 'Three', targetAmount: 10, maxGoals: 20 })).toThrow(
      expect.objectContaining({ code: GOAL_LIMIT_REACHED }),
    )
  })

  it('counts unassigned goals toward a signed-in free cap, and allows a higher cap', () => {
    const { repo } = openTestRepository()
    repo.createGoal({ userId: null, name: 'Local', targetAmount: 10 })
    repo.createGoal({ userId: null, name: 'Local 2', targetAmount: 10 })
    expect(() => repo.createGoal({ userId: USER, name: 'Third', targetAmount: 10 })).toThrow(
      expect.objectContaining({ code: GOAL_LIMIT_REACHED }),
    )
    const extra = repo.createGoal({ userId: USER, name: 'Pro', targetAmount: 10, maxGoals: 20 })
    expect(extra.user_id).toBe(USER)
  })

  it('never writes saved_amount from goal edits', () => {
    const { repo } = openTestRepository()
    const id = '11111111-1111-4111-8111-111111111111'
    repo.applyServerRow('goals', {
      table: 'goals',
      id,
      user_id: USER,
      created_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-02T00:00:00.000Z',
      deleted_at: null,
      values: {
        name: 'Emergency',
        target_amount: '1000.00',
        saved_amount: '40.00',
        pinned_at: null,
      },
    })
    const renamed = repo.updateGoal(id, { name: 'Rainy day' })
    expect(renamed.values.saved_amount).toBe('40.00')
    expect(renamed.values.name).toBe('Rainy day')
    expect(renamed.dirty).toBe(true)
  })

  it('uses allocation sums, then saved_amount, and tombstones allocations with the goal or income', () => {
    const { repo } = openTestRepository()
    const goal = repo.createGoal({ userId: null, name: 'Emergency', targetAmount: 1000 })
    const income = repo.createIncome({ userId: null, totalAmount: 500, date: '2026-02-01', incomeSource: 'Salary' })
    const deposit = repo.createDeposit({ userId: null, goalId: goal.id, amount: 80 })
    const fromIncome = repo.createDeposit({
      userId: null,
      goalId: goal.id,
      amount: 20,
      incomeRecordId: income.id,
    })
    expect(repo.goalProgress(goal.id)).toBe(100)
    expect(repo.getRow('income_records', income.id)?.values.disposable_amount).toBe('480.00')

    repo.softDeleteIncome(income.id)
    expect(repo.getRow('income_allocations', fromIncome.id)?.deleted_at).not.toBeNull()
    expect(repo.getRow('income_allocations', deposit.id)?.deleted_at).toBeNull()
    expect(repo.goalProgress(goal.id)).toBe(80)

    repo.softDeleteGoal(goal.id)
    expect(repo.getRow('income_allocations', deposit.id)?.deleted_at).not.toBeNull()
    expect(repo.goalProgress(goal.id)).toBe(0)
  })

  it('rejects a deposit larger than the income still has left', () => {
    const { repo } = openTestRepository()
    const goal = repo.createGoal({ userId: null, name: 'Emergency', targetAmount: 1000 })
    const income = repo.createIncome({ userId: null, totalAmount: 100, date: '2026-02-01' })
    expect(() => repo.createDeposit({
      userId: null,
      goalId: goal.id,
      amount: 150,
      incomeRecordId: income.id,
    })).toThrow(/remaining/)
  })

  it('keeps one live budget plan per category and replaces a plan with new ids', () => {
    const { repo } = openTestRepository()
    const first = repo.createBudgetPlan({ userId: null, category: 'Groceries', amount: 4000, note: 'Market' })
    expect(() => repo.createBudgetPlan({ userId: null, category: 'Groceries', amount: 10 })).toThrow(
      expect.objectContaining({ code: 'UNIQUE_CONFLICT' }),
    )
    repo.replaceBudgetPlans(null, [{ category: 'Groceries', amount: 4500, note: 'Palengke' }])
    const live = repo.listLive('budget_plans', null)
    expect(live).toHaveLength(1)
    expect(live[0]?.id).not.toBe(first.id)
    expect(repo.getRow('budget_plans', first.id)?.deleted_at).not.toBeNull()
  })

  it('updates a live budget override in place and normalizes the month', () => {
    const { repo } = openTestRepository()
    const created = repo.saveBudgetOverride({
      userId: USER,
      category: 'Rent',
      amount: 0,
      month: '2026-01-31',
    })
    const updated = repo.saveBudgetOverride({
      userId: USER,
      category: 'Rent',
      amount: 12000,
      month: '2026-01-02',
      note: 'Moved',
    })
    expect(updated.id).toBe(created.id)
    expect(updated.values.month).toBe('2026-01-01')
    expect(updated.values.amount).toBe('12000.00')
  })
})

describe('local migrations', () => {
  it('creates the synced tables and partial unique indexes', () => {
    const { sqlite } = openTestRepository()
    const tables = sqlite.prepare(`select name from sqlite_master where type = 'table'`).all() as { name: string }[]
    expect(tables.map((row) => row.name)).toEqual(expect.arrayContaining([
      'expenses',
      'income_records',
      'goals',
      'income_allocations',
      'budget_plans',
      'budget_overrides',
      'financial_accounts',
      'sync_cursors',
    ]))
    const indexes = sqlite.prepare(`select name, sql from sqlite_master where type = 'index'`).all() as { name: string; sql: string | null }[]
    const plan = indexes.find((row) => row.name === 'budget_plans_user_category_live')
    expect(plan?.sql).toContain('deleted_at')
    expect(plan?.sql?.toLowerCase()).toContain('where')
    const override = indexes.find((row) => row.name === 'budget_overrides_user_category_month_live')
    expect(override?.sql?.toLowerCase()).toContain('where')
  })
})
