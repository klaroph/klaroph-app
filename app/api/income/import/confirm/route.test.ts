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
  quotaError: null as { message: string } | null,
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
            state.calls.push('insert')
            return { error: state.insertError }
          },
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
    rpc: async (fn: string) => {
      if (fn !== 'consume_import_quota' && fn !== 'refund_import_quota') {
        throw new Error(`unexpected rpc ${fn}`)
      }
      state.calls.push(fn)
      if (fn === 'consume_import_quota') {
        return { data: state.quotaError ? null : 1, error: state.quotaError }
      }
      return { data: state.refundError ? null : 0, error: state.refundError }
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
  state.calls = []
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
    expect(state.calls).toEqual(['consume_import_quota'])
  })

  it('returns 500 and does not insert when quota consumption fails for another reason', async () => {
    state.quotaError = { message: 'permission denied for function consume_import_quota' }
    const res = await post()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({
      error: 'Could not update import usage. Nothing was imported.',
    })
    expect(state.calls).toEqual(['consume_import_quota'])
  })

  it('inserts only after consume succeeds', async () => {
    const res = await post()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ imported: 1 })
    expect(state.calls).toEqual(['consume_import_quota', 'insert'])
  })

  it('refunds the quota and returns 500 when insert fails after consume', async () => {
    state.insertError = { message: 'duplicate key' }
    const res = await post()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'duplicate key' })
    expect(state.calls).toEqual(['consume_import_quota', 'insert', 'refund_import_quota'])
  })

  it('still returns the insert 500 when the refund call fails', async () => {
    state.insertError = { message: 'duplicate key' }
    state.refundError = { message: 'permission denied for function refund_import_quota' }
    const res = await post()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'duplicate key' })
    expect(state.calls).toEqual(['consume_import_quota', 'insert', 'refund_import_quota'])
  })
})
