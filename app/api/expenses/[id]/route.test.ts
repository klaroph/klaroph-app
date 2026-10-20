import { beforeEach, describe, expect, it, vi } from 'vitest'

const LOCKED = {
  error: 'Entries older than 90 days are read-only on the Free plan.',
  code: 'HISTORY_LOCKED',
}

const state = vi.hoisted(() => ({
  user: { id: 'user-1' } as { id: string } | null,
  planName: 'free' as 'free' | 'pro',
  response: { data: null as unknown, error: null as { message?: string; code?: string; details?: string } | null },
  adminFilters: [] as Array<[string, unknown]>,
  adminRow: null as { date: string } | null,
}))

function query() {
  const api = {
    update: () => api,
    eq: () => api,
    is: () => api,
    select: () => api,
    single: async () => state.response,
    then: (
      onFulfilled: (value: typeof state.response) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(state.response).then(onFulfilled, onRejected),
  }
  return api
}

vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: () => query(),
  }),
}))

vi.mock('@/lib/resolveUserPlan', () => ({
  resolveUserPlan: async () => ({ plan_name: state.planName }),
}))

vi.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: (column: string, value: unknown) => {
          state.adminFilters.push([column, value])
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

const params = { params: Promise.resolve({ id: 'expense-1' }) }

function put() {
  return PUT(
    new Request('http://localhost/api/expenses/expense-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'Groceries', amount: 20, date: '2026-10-01' }),
    }),
    params,
  )
}

beforeEach(() => {
  state.user = { id: 'user-1' }
  state.planName = 'free'
  state.response = { data: null, error: null }
  state.adminFilters = []
  state.adminRow = null
})

describe('PUT /api/expenses/[id]', () => {
  it('maps a HISTORY_LOCKED trigger error to 403', async () => {
    state.response = { data: null, error: { message: 'HISTORY_LOCKED: entries older than 90 days are read-only on the Free plan', code: 'P0001' } }
    const res = await put()
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual(LOCKED)
    expect(state.adminFilters).toEqual([])
  })

  it('returns HISTORY_LOCKED when the hidden row is owned and older than 90 days', async () => {
    state.response = { data: null, error: { code: 'PGRST116', message: 'Cannot coerce the result to a single JSON object' } }
    state.adminRow = { date: '2020-01-01' }
    const res = await put()
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual(LOCKED)
    expect(state.adminFilters).toEqual([
      ['id', 'expense-1'],
      ['user_id', 'user-1'],
    ])
  })

  it('keeps not-found when the row is missing or still inside the window', async () => {
    state.response = { data: null, error: { code: 'PGRST116', message: '0 rows' } }
    state.adminRow = { date: '2026-10-01' }
    const recent = await put()
    expect(recent.status).toBe(404)

    state.adminRow = null
    state.adminFilters = []
    const missing = await put()
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual({ error: 'Expense not found.' })
  })

  it('does not treat a Pro miss as history locked', async () => {
    state.planName = 'pro'
    state.response = { data: null, error: { code: 'PGRST116', message: '0 rows' } }
    state.adminRow = { date: '2020-01-01' }
    const res = await put()
    expect(res.status).toBe(404)
    expect(state.adminFilters).toEqual([])
  })
})

describe('DELETE /api/expenses/[id]', () => {
  it('returns HISTORY_LOCKED when a Free user deletes a hidden old row', async () => {
    state.response = { data: [], error: null }
    state.adminRow = { date: '2020-01-01' }
    const res = await DELETE(new Request('http://localhost'), params)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual(LOCKED)
    expect(state.adminFilters).toEqual([
      ['id', 'expense-1'],
      ['user_id', 'user-1'],
    ])
  })

  it('keeps ok when the delete matches nothing and the row is not an old owned row', async () => {
    state.response = { data: [], error: null }
    const res = await DELETE(new Request('http://localhost'), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })
})
