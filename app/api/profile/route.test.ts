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
  it('trims and caps a nickname at 40 characters', async () => {
    const res = await patch({ nickname: `  ${'Maria'.repeat(12)}  ` })
    expect(res.status).toBe(200)
    expect(state.updates).toEqual([{ nickname: 'Maria'.repeat(8) }])
    expect('Maria'.repeat(8)).toHaveLength(40)
  })

  it('clears a nickname that is only spaces', async () => {
    const res = await patch({ nickname: '   ' })
    expect(res.status).toBe(200)
    expect(state.updates).toEqual([{ nickname: '' }])
  })

  it('stores null when nickname is cleared to null', async () => {
    const res = await patch({ nickname: null })
    expect(res.status).toBe(200)
    expect(state.updates).toEqual([{ nickname: null }])
  })
})
