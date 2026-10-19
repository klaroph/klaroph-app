import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  user: { id: 'user-1' } as { id: string } | null,
  updates: [] as unknown[],
}))

vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: state.user } }),
    },
    from: () => {
      let payload: unknown
      const api = {
        update(values: unknown) {
          payload = values
          return api
        },
        eq() {
          return api
        },
        select() {
          return api
        },
        async single() {
          state.updates.push(payload)
          const nickname = (payload as { nickname?: string | null } | undefined)?.nickname
          return { data: { id: state.user?.id ?? 'user-1', nickname: nickname ?? null }, error: null }
        },
      }
      return api
    },
    rpc: async () => ({ data: 0, error: null }),
  }),
}))

vi.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: { from: () => ({}) },
}))

import { NICKNAME_MAX_LENGTH, NICKNAME_REQUIRED_ERROR, NICKNAME_TOO_LONG_ERROR } from '@/lib/displayName'
import { PATCH } from './route'

const patch = (body: unknown) =>
  PATCH(
    new Request('http://localhost/api/profile', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  )

beforeEach(() => {
  state.user = { id: 'user-1' }
  state.updates = []
})

describe('PATCH /api/profile nickname', () => {
  it('trims a nickname within 15 characters', async () => {
    const res = await patch({ nickname: '  Christopher  ' })
    expect(res.status).toBe(200)
    expect(state.updates).toEqual([{ nickname: 'Christopher' }])
  })

  it('accepts a nickname of exactly 15 characters', async () => {
    const nickname = 'A'.repeat(NICKNAME_MAX_LENGTH)
    const res = await patch({ nickname })
    expect(res.status).toBe(200)
    expect(state.updates).toEqual([{ nickname }])
  })

  it('rejects an empty, blank, or null nickname without writing', async () => {
    for (const nickname of ['', '   ', null]) {
      state.updates = []
      const res = await patch({ nickname })
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: NICKNAME_REQUIRED_ERROR })
      expect(state.updates).toEqual([])
    }
  })

  it('returns 400 for more than 15 characters and does not truncate', async () => {
    const nickname = `  ${'A'.repeat(16)}  `
    const res = await patch({ nickname, dream_statement: 'A house by the sea' })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toEqual({ error: NICKNAME_TOO_LONG_ERROR })
    expect(JSON.stringify(body)).not.toContain('A'.repeat(15))
    expect(state.updates).toEqual([])
  })

  it('saves other fields when nickname is omitted, even if the stored name is long or missing', async () => {
    const res = await patch({ dream_statement: 'A house by the sea', financial_stage: 'starter' })
    expect(res.status).toBe(200)
    expect(state.updates).toEqual([
      { dream_statement: 'A house by the sea', financial_stage: 'starter' },
    ])
    expect(state.updates[0]).not.toHaveProperty('nickname')
  })
})
