import { beforeEach, describe, expect, it, vi } from 'vitest'

const QUOTA_BODY = {
  error: "You've used your 2 free imports. Explore KlaroPH Pro for unlimited CSV imports.",
  code: 'IMPORT_QUOTA_EXCEEDED',
}

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  planName: 'free' as 'free' | 'pro',
  importCount: 0,
  calls: [] as string[],
  refundArgs: undefined as unknown,
  quotaError: null as { message: string; code?: string } | null,
  insertError: null as { message: string } | null,
  refundError: null as { message: string } | null,
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
            state.calls.push('user:insert')
            return { error: state.insertError }
          },
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
    rpc: async (fn: string) => {
      if (fn !== 'consume_import_quota') throw new Error(`unexpected user rpc ${fn}`)
      state.calls.push(`user:${fn}`)
      return { data: state.quotaError ? null : 1, error: state.quotaError }
    },
  }),
}))

vi.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    rpc: async (fn: string, args?: unknown) => {
      if (fn !== 'refund_import_quota') throw new Error(`unexpected admin rpc ${fn}`)
      state.calls.push(`admin:${fn}`)
      state.refundArgs = args
      return { data: state.refundError ? null : 0, error: state.refundError }
    },
  },
}))

vi.mock('@/lib/resolveUserPlan', () => ({
  resolveUserPlan: async () => ({ plan_name: state.planName }),
}))

import { plainDbErrorText } from '@/lib/apiError'
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
  state.calls = []
  state.refundArgs = undefined
  state.quotaError = null
  state.insertError = null
  state.refundError = null
})

describe('POST /api/income/import/confirm', () => {
  it('keeps the free-quota 403 from the pre-check', async () => {
    state.importCount = 2
    const res = await post()
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual(QUOTA_BODY)
    expect(state.calls).toEqual([])
  })

  it('consumes quota before insert and maps IMPORT_QUOTA_EXCEEDED to the same 403', async () => {
    state.importCount = 1
    state.quotaError = {
      message: 'IMPORT_QUOTA_EXCEEDED: free import quota is already used',
    }
    const res = await post()
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual(QUOTA_BODY)
    expect(state.calls).toEqual(['user:consume_import_quota'])
  })

  it('returns 500 and does not insert when quota consumption fails for another reason', async () => {
    state.quotaError = {
      message: 'permission denied for function consume_import_quota',
      code: '42501',
    }
    const res = await post()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({
      error: 'Could not update import usage. Nothing was imported.',
    })
    expect(state.calls).toEqual(['user:consume_import_quota'])
  })

  it('maps the PR 8 42501 import_count protect error to the same 403', async () => {
    state.quotaError = {
      message: 'import_count is not updatable by client',
      code: '42501',
    }
    const res = await post()
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual(QUOTA_BODY)
    expect(state.calls).toEqual(['user:consume_import_quota'])
  })

  it('returns the row validation error and does not consume quota', async () => {
    const res = await POST(
      new Request('http://localhost/api/income/import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: [{ date: 'not-a-date', amount: 5000, category: 'Salary' }] }),
      })
    )
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Row 1: invalid date.' })
    expect(state.calls).toEqual([])
  })

  it('inserts only after consume succeeds', async () => {
    const res = await post()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ imported: 1 })
    expect(state.calls).toEqual(['user:consume_import_quota', 'user:insert'])
  })

  it('refunds the quota and returns 500 when insert fails after consume', async () => {
    state.insertError = { message: 'duplicate key' }
    const res = await post()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: plainDbErrorText.save })
    expect(state.calls).toEqual(['user:consume_import_quota', 'user:insert', 'admin:refund_import_quota'])
    expect(state.refundArgs).toEqual({ p_user_id: 'user-1' })
  })

  it('still returns the insert 500 when the refund call fails', async () => {
    state.insertError = { message: 'duplicate key' }
    state.refundError = { message: 'permission denied for function refund_import_quota' }
    const res = await post()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: plainDbErrorText.save })
    expect(state.calls).toEqual(['user:consume_import_quota', 'user:insert', 'admin:refund_import_quota'])
    expect(state.refundArgs).toEqual({ p_user_id: 'user-1' })
  })
})
