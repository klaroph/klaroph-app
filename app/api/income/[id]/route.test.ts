import { beforeEach, describe, expect, it, vi } from 'vitest'

const LOCKED = {
  error: 'Entries older than 90 days are read-only on the Free plan.',
  code: 'HISTORY_LOCKED',
}

const state = vi.hoisted(() => ({
  user: { id: 'user-1' } as { id: string } | null,
  planName: 'free' as 'free' | 'pro',
  row: null as { date: string; income_source: string | null } | null,
  rpcError: null as { message: string; code?: string } | null,
  deleteData: [] as { id: string }[],
  tables: [] as string[],
  adminFilters: [] as Array<[string, unknown]>,
  adminRow: null as { date: string } | null,
}))

function query(table: string) {
  const api = {
    update: () => api,
    eq: () => api,
    is: () => api,
    select: () => api,
    single: async () => ({ data: table === 'income_records' ? state.row : null, error: null }),
    then: (
      onFulfilled: (value: { data: { id: string }[]; error: null }) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve({ data: state.deleteData, error: null }).then(onFulfilled, onRejected),
  }
  return api
}

vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      state.tables.push(table)
      return query(table)
    },
    rpc: async () => ({ data: null, error: state.rpcError }),
  }),
}))

vi.mock('@/lib/resolveUserPlan', () => ({
  resolveUserPlan: async () => ({ plan_name: state.planName }),
}))

vi.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: (table: string) => ({
      select: () => ({
        eq: (column: string, value: unknown) => {
          state.adminFilters.push([column, value])
          state.tables.push(`admin:${table}`)
          return {
            eq: (column2: string, value2: unknown) => {
              state.adminFilters.push([column2, value2])
              return { maybeSingle: async () => ({ data: state.adminRow, error: null }) }
            },
          }
        },
      }),
    }),
  },
}))

import { DELETE, PUT } from './route'

const params = { params: Promise.resolve({ id: 'income-1' }) }

function put() {
  return PUT(
    new Request('http://localhost/api/income/income-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ total_amount: 100, date: '2026-10-01' }),
    }),
    params,
  )
}

beforeEach(() => {
  state.user = { id: 'user-1' }
  state.planName = 'free'
  state.row = { date: '2026-10-01', income_source: 'Salary' }
  state.rpcError = null
  state.deleteData = [{ id: 'income-1' }]
  state.tables = []
  state.adminFilters = []
  state.adminRow = null
})

describe('PUT /api/income/[id]', () => {
  it('maps a HISTORY_LOCKED trigger error to 403', async () => {
    state.rpcError = { message: 'HISTORY_LOCKED: entries older than 90 days are read-only on the Free plan', code: 'P0001' }
    const res = await put()
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual(LOCKED)
  })

  it('returns HISTORY_LOCKED when the parent income is hidden and older than 90 days', async () => {
    state.row = null
    state.adminRow = { date: '2020-01-01' }
    const res = await put()
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual(LOCKED)
    expect(state.adminFilters).toEqual([
      ['id', 'income-1'],
      ['user_id', 'user-1'],
    ])
    expect(state.tables).toEqual(['income_records', 'admin:income_records'])
  })

  it('keeps not-found when the income row is missing', async () => {
    state.row = null
    const res = await put()
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Income record not found.' })
  })
})

describe('DELETE /api/income/[id]', () => {
  it('returns HISTORY_LOCKED and does not tombstone allocations when the income is hidden', async () => {
    state.deleteData = []
    state.adminRow = { date: '2020-01-01' }
    const res = await DELETE(new Request('http://localhost'), params)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual(LOCKED)
    expect(state.tables).toEqual(['income_records', 'admin:income_records'])
  })

  it('keeps ok without touching allocations when nothing was deleted', async () => {
    state.deleteData = []
    const res = await DELETE(new Request('http://localhost'), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(state.tables).toEqual(['income_records', 'admin:income_records'])
    expect(state.adminFilters).toEqual([
      ['id', 'income-1'],
      ['user_id', 'user-1'],
    ])
  })

  it('soft-deletes allocations only after the income delete matches', async () => {
    const res = await DELETE(new Request('http://localhost'), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(state.tables).toEqual(['income_records', 'income_allocations'])
  })
})
