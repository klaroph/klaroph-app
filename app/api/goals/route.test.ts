import { beforeEach, describe, expect, it, vi } from 'vitest'

const GOAL_LIMIT_MESSAGE =
  "You've reached the Free limit. Explore KlaroPH Pro to unlock up to 20 goals."
const GRACE_MESSAGE =
  'Goal creation is paused while your payment is being updated. Please update your payment method.'

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  plan: {
    can_create_goals: true,
    is_grace: false,
    max_goals: 2,
  },
  count: 0,
  countError: null as { message: string } | null,
  insertError: null as { message: string } | null,
  insertCalls: 0,
}))

vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: () => ({
      select: () => ({
        eq: async () => ({ count: state.count, error: state.countError }),
      }),
      insert: () => {
        state.insertCalls += 1
        return {
          select: () => ({
            single: async () => ({
              data: state.insertError
                ? null
                : {
                    id: 'goal-1',
                    name: 'Emergency fund',
                    target_amount: 1000,
                    saved_amount: 0,
                    created_at: '2026-10-05T00:00:00.000Z',
                  },
              error: state.insertError,
            }),
          }),
        }
      },
    }),
  }),
}))

vi.mock('@/lib/resolveUserPlan', () => ({
  resolveUserPlan: async () => state.plan,
}))

import { POST } from './route'

function post(body: unknown = { name: 'Emergency fund', target_amount: 1000 }) {
  return POST(
    new Request('http://localhost/api/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  )
}

beforeEach(() => {
  state.user = { id: 'user-1' }
  state.plan = { can_create_goals: true, is_grace: false, max_goals: 2 }
  state.count = 0
  state.countError = null
  state.insertError = null
  state.insertCalls = 0
})

describe('POST /api/goals', () => {
  it('keeps the grace 403 from the plan pre-check', async () => {
    state.plan = { can_create_goals: false, is_grace: true, max_goals: 20 }
    const res = await post()
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({
      error: GRACE_MESSAGE,
      upgrade_required: false,
    })
    expect(state.insertCalls).toBe(0)
  })

  it('keeps the free-limit 403 from the count pre-check', async () => {
    state.count = 2
    const res = await post()
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({
      error: GOAL_LIMIT_MESSAGE,
      upgrade_required: true,
    })
    expect(state.insertCalls).toBe(0)
  })

  it('maps a goal-limit trigger error to the existing upgrade 403', async () => {
    state.count = 1
    state.insertError = {
      message: 'GOAL_LIMIT_REACHED: goal count is already at the plan max_goals',
    }
    const res = await post()
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({
      error: GOAL_LIMIT_MESSAGE,
      upgrade_required: true,
    })
    expect(state.insertCalls).toBe(1)
  })

  it('maps a grace trigger error to the existing grace 403', async () => {
    state.insertError = {
      message:
        'GOAL_CREATION_GRACE: goal creation is blocked while the subscription is past due and still in grace',
    }
    const res = await post()
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({
      error: GRACE_MESSAGE,
      upgrade_required: false,
    })
  })

  it('still returns 500 for an unrelated insert error', async () => {
    state.insertError = { message: 'permission denied for table goals' }
    const res = await post()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Couldn’t save that.' })
  })
})
