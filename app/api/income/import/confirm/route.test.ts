import { beforeEach, describe, expect, it, vi } from 'vitest'

const QUOTA_BODY = {
  error: "You've used your 2 free imports. Explore KlaroPH Pro for unlimited CSV imports.",
  code: 'IMPORT_QUOTA_EXCEEDED',
}

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  planName: 'free' as 'free' | 'pro',
  importCount: 0,
  insertCalls: 0,
  rpcCalls: 0,
  rpcArgs: undefined as unknown,
  quotaError: null as { message: string } | null,
}))

vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { import_count: state.importCount }, error: null }),
            }),
          }),
        }
      }
      if (table === 'income_records') {
        return {
          insert: async () => {
            state.insertCalls += 1
            return { error: null }
          },
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
    rpc: async (fn: string, args?: unknown) => {
      if (fn !== 'consume_import_quota') throw new Error(`unexpected rpc ${fn}`)
      state.rpcCalls += 1
      state.rpcArgs = args
      return { data: state.quotaError ? null : 1, error: state.quotaError }
    },
  }),
}))

vi.mock('@/lib/resolveUserPlan', () => ({
  resolveUserPlan: async () => ({ plan_name: state.planName }),
}))

import { POST } from './route'

const row = { date: '2026-10-01', amount: 5000, category: 'Salary', description: null }

function post() {
  return POST(
    new Request('http://localhost/api/income/import/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: [row] }),
    })
  )
}

beforeEach(() => {
  state.user = { id: 'user-1' }
  state.planName = 'free'
  state.importCount = 0
  state.insertCalls = 0
  state.rpcCalls = 0
  state.rpcArgs = undefined
  state.quotaError = null
})

describe('POST /api/income/import/confirm', () => {
  it('keeps the free-quota 403 from the pre-check', async () => {
    state.importCount = 2
    const res = await post()
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual(QUOTA_BODY)
    expect(state.insertCalls).toBe(0)
    expect(state.rpcCalls).toBe(0)
  })

  it('maps a consume_import_quota IMPORT_QUOTA_EXCEEDED error to the same 403', async () => {
    state.importCount = 1
    state.quotaError = {
      message: 'IMPORT_QUOTA_EXCEEDED: free import quota is already used',
    }
    const res = await post()
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual(QUOTA_BODY)
    expect(state.insertCalls).toBe(1)
    expect(state.rpcCalls).toBe(1)
    expect(state.rpcArgs).toBeUndefined()
  })

  it('still returns 500 when quota consumption fails for another reason', async () => {
    state.quotaError = { message: 'permission denied for function consume_import_quota' }
    const res = await post()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({
      error: 'Imports saved but usage count could not be updated.',
    })
  })
})
