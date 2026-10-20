import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  user: { id: 'user-1' } as { id: string } | null,
  error: null as { message: string; code?: string } | null,
}))

vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: () => ({
      insert: () => ({
        select: () => ({
          single: async () => ({ data: null, error: state.error }),
        }),
      }),
    }),
  }),
}))

import { POST } from './route'

beforeEach(() => {
  state.user = { id: 'user-1' }
  state.error = null
})

describe('POST /api/income', () => {
  it('maps a HISTORY_LOCKED insert to 403', async () => {
    state.error = { message: 'HISTORY_LOCKED: entries older than 90 days are read-only on the Free plan', code: 'P0001' }
    const res = await POST(
      new Request('http://localhost/api/income', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ total_amount: 100, date: '2020-01-01', income_source: 'Salary' }),
      }),
    )
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({
      error: 'Entries older than 90 days are read-only on Free. Upgrade to edit them.',
      code: 'HISTORY_LOCKED',
    })
  })
})
