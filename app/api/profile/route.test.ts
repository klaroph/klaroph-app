import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  user: { id: 'user-1' } as { id: string } | null,
  updates: [] as unknown[],
  updateError: null as { message: string; code?: string; details?: string | null } | null,
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
          if (state.updateError) return { data: null, error: state.updateError }
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

import { plainDbErrorText } from '@/lib/apiError'
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
  state.updateError = null
})

afterEach(() => {
  vi.restoreAllMocks()
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

describe('PATCH /api/profile financial stage and risk comfort', () => {
  it('stores blank financial stage and risk comfort as null on a full profile save', async () => {
    const res = await patch({
      nickname: '  Ana  ',
      avatar_url: '',
      monthly_income_range: '',
      primary_goal_category: '',
      financial_stage: '',
      savings_confidence: null,
      risk_comfort: '   ',
      motivation_type: '',
      dream_statement: '',
    })
    expect(res.status).toBe(200)
    expect(state.updates).toEqual([
      {
        nickname: 'Ana',
        avatar_url: '',
        monthly_income_range: null,
        primary_goal_category: '',
        financial_stage: null,
        risk_comfort: null,
        motivation_type: '',
        dream_statement: '',
      },
    ])
  })

  it('stores a blank monthly income range as null', async () => {
    const res = await patch({ monthly_income_range: '' })
    expect(res.status).toBe(200)
    expect(state.updates).toEqual([{ monthly_income_range: null }])
  })

  it('keeps a chosen financial stage and risk comfort, including an explicit null', async () => {
    const res = await patch({ financial_stage: 'building', risk_comfort: null })
    expect(res.status).toBe(200)
    expect(state.updates).toEqual([{ financial_stage: 'building', risk_comfort: null }])
  })

  it('still rejects a blank nickname on a full form save and does not write', async () => {
    const res = await patch({
      nickname: '',
      financial_stage: '',
      risk_comfort: '',
      dream_statement: 'A house by the sea',
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: NICKNAME_REQUIRED_ERROR })
    expect(state.updates).toEqual([])
  })

  it.each([
    {
      code: '23514',
      message:
        'new row for relation "profiles" violates check constraint "profiles_financial_stage_check"',
      details: 'Failing row contains (financial_stage).',
    },
    {
      code: '23514',
      message:
        'new row for relation "profiles" violates check constraint "profiles_risk_comfort_check"',
      details: null,
    },
    {
      message:
        'new row for relation "profiles" violates check constraint "profiles_savings_confidence_check"',
    },
  ])('returns the plain save error for a check constraint ($message)', async (updateError) => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    state.updateError = updateError
    const res = await patch({ financial_stage: 'not-a-stage', risk_comfort: 'nope' })
    expect(res.status).toBe(500)
    const body = await res.json()
    const raw = JSON.stringify(body)
    expect(body).toEqual({ error: plainDbErrorText.save })
    expect(raw).not.toContain('check constraint')
    expect(raw).not.toContain('profiles_')
    expect(raw).not.toContain('Failing row')
    expect(raw).not.toContain('23514')
    expect(spy).toHaveBeenCalledWith('PATCH /api/profile update error:', updateError)
    expect(state.updates).toEqual([{ financial_stage: 'not-a-stage', risk_comfort: 'nope' }])
  })
})
