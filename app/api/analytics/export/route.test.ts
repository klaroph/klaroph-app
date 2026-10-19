import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  income: [] as { date: string; total_amount: number; income_source: string | null }[],
  expenses: [] as { date: string; amount: number; category: string; type: string }[],
}))

vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      const rows = table === 'income_records' ? state.income : table === 'expenses' ? state.expenses : null
      if (!rows) throw new Error(`unexpected table ${table}`)
      return {
        select: () => ({
          order: async () => ({ data: rows, error: null }),
        }),
      }
    },
  }),
}))

vi.mock('@/lib/resolveUserPlan', () => ({
  resolveUserPlan: async () => {
    throw new Error('export must not read the plan')
  },
}))

import { GET } from './route'

beforeEach(() => {
  state.user = { id: 'free-user' }
  state.income = [{ date: '2026-10-01', total_amount: 1500, income_source: 'Salary, bonus' }]
  state.expenses = [{ date: '2026-10-02', amount: 200, category: 'Food, dining', type: 'variable' }]
})

describe('GET /api/analytics/export', () => {
  it('returns the income and expense CSV for a signed-in free user', async () => {
    const res = await GET()
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

  it('rejects a signed-out request', async () => {
    state.user = null
    const res = await GET()
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })
})
