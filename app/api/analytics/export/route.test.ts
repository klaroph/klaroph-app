import { beforeEach, describe, expect, it, vi } from 'vitest'

type IncomeRow = { date: string; total_amount: number; income_source: string | null }
type ExpenseRow = { date: string; amount: number; category: string; type: string }
type Filter = { table: string; column: string; value: unknown }

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  income: [] as IncomeRow[],
  expenses: [] as ExpenseRow[],
  filters: [] as Filter[],
  ranges: [] as { table: string; from: number; to: number }[],
  userClientReads: 0,
}))

function adminQuery(table: string, rows: unknown[]) {
  return {
    select: () => adminQuery(table, rows),
    eq: (column: string, value: unknown) => {
      state.filters.push({ table, column, value })
      return adminQuery(table, rows)
    },
    order: () => adminQuery(table, rows),
    range: async (from: number, to: number) => {
      state.ranges.push({ table, from, to })
      return { data: rows.slice(from, to + 1), error: null }
    },
  }
}

vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: () => {
      state.userClientReads += 1
      throw new Error('export must not read tables as the signed-in client')
    },
  }),
}))

vi.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === 'income_records') return adminQuery(table, state.income)
      if (table === 'expenses') return adminQuery(table, state.expenses)
      throw new Error(`unexpected table ${table}`)
    },
  },
}))

vi.mock('@/lib/resolveUserPlan', () => ({
  resolveUserPlan: async () => {
    throw new Error('export must not read the plan')
  },
}))

import { GET } from './route'

const get = () =>
  GET()

beforeEach(() => {
  state.user = { id: 'free-user' }
  state.income = [{ date: '2026-10-01', total_amount: 1500, income_source: 'Salary, bonus' }]
  state.expenses = [{ date: '2026-10-02', amount: 200, category: 'Food, dining', type: 'variable' }]
  state.filters = []
  state.ranges = []
  state.userClientReads = 0
})

describe('GET /api/analytics/export', () => {
  it('returns the income and expense CSV for a signed-in free user', async () => {
    const res = await get()
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/csv')
    expect(res.headers.get('Content-Disposition')).toContain('klaroph-export.csv')
    expect(await res.text()).toBe(
      [
        'Type,Date,Amount,Category/Source',
        'Income,2026-10-01,1500,Salary  bonus',
        'Expense,2026-10-02,200,Food  dining',
      ].join('\n')
    )
  })

  it("includes a free user's rows older than 90 days", async () => {
    state.income = [{ date: '2020-01-15', total_amount: 800, income_source: 'Salary' }]
    state.expenses = [{ date: '2019-06-01', amount: 40, category: 'Fare', type: 'needs' }]
    const csv = await (await get()).text()
    expect(csv).toContain('Income,2020-01-15,800,Salary')
    expect(csv).toContain('Expense,2019-06-01,40,Fare')
    expect(state.userClientReads).toBe(0)
  })

  it('returns every row when a table has more than 1,000', async () => {
    state.income = Array.from({ length: 1001 }, (_, index) => ({
      date: '2020-01-01',
      total_amount: index + 1,
      income_source: 'Salary',
    }))
    state.expenses = []
    const csv = await (await get()).text()
    const incomeLines = csv.split('\n').filter((line) => line.startsWith('Income,'))
    expect(incomeLines).toHaveLength(1001)
    expect(incomeLines[0]).toBe('Income,2020-01-01,1,Salary')
    expect(incomeLines[1000]).toBe('Income,2020-01-01,1001,Salary')
    expect(state.ranges.filter((range) => range.table === 'income_records')).toEqual([
      { table: 'income_records', from: 0, to: 999 },
      { table: 'income_records', from: 1000, to: 1999 },
    ])
  })

  it('scopes both tables to the authenticated user id only', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(state.filters.length).toBeGreaterThan(0)
    for (const filter of state.filters) {
      expect(filter).toEqual({ table: filter.table, column: 'user_id', value: 'free-user' })
    }
    expect(state.filters.map((filter) => filter.table).sort()).toEqual(['expenses', 'income_records'])
    expect(state.userClientReads).toBe(0)
  })

  it('rejects a signed-out request', async () => {
    state.user = null
    const res = await get()
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
    expect(state.filters).toEqual([])
    expect(state.ranges).toEqual([])
  })
})
