import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  calls: [] as { op: string; userId: string; id: string; amount?: unknown }[],
}))

vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
  }),
}))

vi.mock('@/lib/goalAllocations', () => ({
  updateGoalAllocation: async (_db: unknown, userId: string, id: string, amount: unknown) => {
    state.calls.push({ op: 'update', userId, id, amount })
    return { ok: true, amount: 7_500 }
  },
  removeGoalAllocation: async (_db: unknown, userId: string, id: string) => {
    state.calls.push({ op: 'remove', userId, id })
    return { ok: false, status: 404, error: 'Allocation not found.' }
  },
}))

import { DELETE, PATCH } from './route'

const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const params = { params: Promise.resolve({ id: ID }) }

function patchRequest(body: unknown) {
  return new Request(`http://localhost/api/goal-allocations/${ID}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  state.user = null
  state.calls = []
})

describe('/api/goal-allocations/[id]', () => {
  it('rejects signed-out requests without touching allocations', async () => {
    expect((await PATCH(patchRequest({ amount: 1 }), params)).status).toBe(401)
    expect((await DELETE(new Request('http://localhost'), params)).status).toBe(401)
    expect(state.calls).toEqual([])
  })

  it('acts as the signed-in user, ignoring any user id in the body', async () => {
    state.user = { id: 'user-me' }
    const res = await PATCH(patchRequest({ amount: 7_500, user_id: 'user-other' }), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, amount: 7_500 })
    expect(state.calls).toEqual([{ op: 'update', userId: 'user-me', id: ID, amount: 7_500 }])
  })

  it('passes through safe not-found results', async () => {
    state.user = { id: 'user-me' }
    const res = await DELETE(new Request('http://localhost'), params)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Allocation not found.' })
  })
})
