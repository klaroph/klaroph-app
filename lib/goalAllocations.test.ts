import { beforeEach, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { parseAllocationAmount, removeGoalAllocation, updateGoalAllocation } from './goalAllocations'
import { summarizeGoals } from './goalsSummary'

type Row = Record<string, unknown>
type Tables = Record<string, Row[]>

/** Minimal in-memory stand-in for the query chains the service uses (no RLS: ownership must be enforced in code). */
function fakeSupabase(tables: Tables) {
  class Query {
    private filters: [string, unknown][] = []
    private op: 'select' | 'update' | 'delete' = 'select'
    private patch: Row = {}
    private single = false
    constructor(private table: string) {}
    select() { return this }
    eq(column: string, value: unknown) { this.filters.push([column, value]); return this }
    update(patch: Row) { this.op = 'update'; this.patch = patch; return this }
    delete() { this.op = 'delete'; return this }
    maybeSingle() { this.single = true; return this }
    then(onFulfilled: (v: { data: unknown; error: null }) => unknown, onRejected?: (e: unknown) => unknown) {
      return Promise.resolve(this.run()).then(onFulfilled, onRejected)
    }
    private run() {
      const rows = tables[this.table] ?? []
      const matched = rows.filter((r) => this.filters.every(([c, v]) => r[c] === v))
      if (this.op === 'update') matched.forEach((r) => Object.assign(r, this.patch))
      if (this.op === 'delete') tables[this.table] = rows.filter((r) => !matched.includes(r))
      const data = this.single ? (matched[0] ? { ...matched[0] } : null) : matched.map((r) => ({ ...r }))
      return { data, error: null as null }
    }
  }
  return { from: (table: string) => new Query(table) } as unknown as SupabaseClient
}

const ME = 'user-me'
const OTHER = 'user-other'
const INCOME = '11111111-1111-4111-8111-111111111111'
const OTHER_INCOME = '22222222-2222-4222-8222-222222222222'
const GOAL = { id: 'goal-ef', name: 'Emergency Fund', target_amount: 100_000 }
const ALLOC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTHER_ALLOC = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

let tables: Tables
let db: SupabaseClient

function goalTotal() {
  return (tables.income_allocations as { goal_id: string; amount: number }[])
    .filter((r) => r.goal_id === GOAL.id)
    .reduce((sum, r) => sum + r.amount, 0)
}

function goalProgress() {
  return summarizeGoals([GOAL], { [GOAL.id]: goalTotal() }).overallPercent
}

function income(id: string) {
  return tables.income_records.find((r) => r.id === id)!
}

beforeEach(() => {
  tables = {
    income_records: [
      { id: INCOME, user_id: ME, total_amount: 30_000, disposable_amount: 20_000, date: '2026-09-01', income_source: 'Salary' },
      { id: OTHER_INCOME, user_id: OTHER, total_amount: 50_000, disposable_amount: 45_000, date: '2026-09-01', income_source: 'Salary' },
    ],
    income_allocations: [
      { id: ALLOC, income_record_id: INCOME, goal_id: GOAL.id, amount: 10_000 },
      { id: OTHER_ALLOC, income_record_id: OTHER_INCOME, goal_id: 'goal-theirs', amount: 5_000 },
    ],
  }
  db = fakeSupabase(tables)
})

describe('goal allocation totals', () => {
  it('a created allocation counts toward the goal total and progress', () => {
    tables.income_allocations.push({ id: 'new', income_record_id: INCOME, goal_id: GOAL.id, amount: 2_000 })
    expect(goalTotal()).toBe(12_000)
    expect(goalProgress()).toBe(12)
  })
})

describe('updateGoalAllocation', () => {
  it('edits the allocation in place: 10,000 → 7,500', async () => {
    const result = await updateGoalAllocation(db, ME, ALLOC, 7_500)
    expect(result).toEqual({ ok: true, amount: 7_500 })
    expect(tables.income_allocations.filter((r) => r.goal_id === GOAL.id)).toHaveLength(1)
    expect(goalTotal()).toBe(7_500)
    expect(goalProgress()).toBe(7.5)
  })

  it('keeps the income record intact and re-syncs only disposable_amount', async () => {
    await updateGoalAllocation(db, ME, ALLOC, 7_500)
    expect(income(INCOME)).toMatchObject({ total_amount: 30_000, date: '2026-09-01', income_source: 'Salary', disposable_amount: 22_500 })
  })

  it('rounds to centavos and accepts numeric strings', async () => {
    const result = await updateGoalAllocation(db, ME, ALLOC, '1500.555')
    expect(result).toEqual({ ok: true, amount: 1500.56 })
  })

  it.each([0, -5, 'abc', '', null, Number.NaN, Number.POSITIVE_INFINITY, 1e13])('rejects invalid amount %s', async (amount) => {
    const result = await updateGoalAllocation(db, ME, ALLOC, amount)
    expect(result).toMatchObject({ ok: false, status: 400 })
    expect(goalTotal()).toBe(10_000)
  })

  it('rejects amounts above what the income still has available', async () => {
    tables.income_allocations.push({ id: 'sibling', income_record_id: INCOME, goal_id: 'goal-2', amount: 25_000 })
    const result = await updateGoalAllocation(db, ME, ALLOC, 6_000)
    expect(result).toMatchObject({ ok: false, status: 400 })
    expect(goalTotal()).toBe(10_000)
    expect(await updateGoalAllocation(db, ME, ALLOC, 5_000)).toEqual({ ok: true, amount: 5_000 })
  })

  it("cannot edit another user's allocation", async () => {
    const result = await updateGoalAllocation(db, ME, OTHER_ALLOC, 1)
    expect(result).toEqual({ ok: false, status: 404, error: 'Allocation not found.' })
    expect(tables.income_allocations.find((r) => r.id === OTHER_ALLOC)?.amount).toBe(5_000)
    expect(income(OTHER_INCOME).disposable_amount).toBe(45_000)
  })

  it('handles nonexistent or malformed ids safely', async () => {
    expect(await updateGoalAllocation(db, ME, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 100)).toMatchObject({ status: 404 })
    expect(await updateGoalAllocation(db, ME, 'not-a-uuid', 100)).toMatchObject({ status: 404 })
  })
})

describe('removeGoalAllocation', () => {
  it('edit then remove: 10,000 → 7,500 → 0 with income unchanged', async () => {
    await updateGoalAllocation(db, ME, ALLOC, 7_500)
    const result = await removeGoalAllocation(db, ME, ALLOC)
    expect(result).toEqual({ ok: true, amount: 7_500 })
    expect(goalTotal()).toBe(0)
    expect(goalProgress()).toBe(0)
    expect(income(INCOME)).toMatchObject({ total_amount: 30_000, disposable_amount: 30_000 })
  })

  it('only removes the chosen allocation', async () => {
    tables.income_allocations.push({ id: 'keep', income_record_id: INCOME, goal_id: GOAL.id, amount: 3_000 })
    await removeGoalAllocation(db, ME, ALLOC)
    expect(goalTotal()).toBe(3_000)
    expect(income(INCOME).disposable_amount).toBe(27_000)
  })

  it("cannot remove another user's allocation", async () => {
    const result = await removeGoalAllocation(db, ME, OTHER_ALLOC)
    expect(result).toMatchObject({ ok: false, status: 404 })
    expect(tables.income_allocations.some((r) => r.id === OTHER_ALLOC)).toBe(true)
  })

  it('handles a nonexistent allocation safely', async () => {
    expect(await removeGoalAllocation(db, ME, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc')).toMatchObject({ status: 404 })
    expect(goalTotal()).toBe(10_000)
  })
})

describe('parseAllocationAmount', () => {
  it('accepts positive amounts up to the ceiling', () => {
    expect(parseAllocationAmount(1_000_000_000_000)).toEqual({ ok: true, amount: 1_000_000_000_000 })
    expect(parseAllocationAmount('0.01')).toEqual({ ok: true, amount: 0.01 })
  })

  it('rejects amounts that round to zero', () => {
    expect(parseAllocationAmount(0.004)).toMatchObject({ ok: false })
  })
})
