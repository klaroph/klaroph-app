import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { createSupabaseRemote } from './supabaseRemote'

type Call = Record<string, unknown>

function mockClient() {
  const calls: Call[] = []
  const client = {
    from(table: string) {
      const state: Call = { table }
      const api = {
        select(columns: string, options?: unknown) {
          state.select = columns
          state.selectOptions = options
          return api
        },
        eq(column: string, value: unknown) {
          state.eq = [...((state.eq as unknown[]) ?? []), [column, value]]
          return api
        },
        gte(column: string, value: unknown) {
          state.gte = [column, value]
          return api
        },
        or(filters: string) {
          state.or = filters
          return api
        },
        is(column: string, value: unknown) {
          state.is = [column, value]
          return api
        },
        order(column: string, options: unknown) {
          state.order = [...((state.order as unknown[]) ?? []), [column, options]]
          return api
        },
        limit(count: number) {
          calls.push({ ...state, op: 'limit', limit: count })
          return Promise.resolve({ data: [], error: null })
        },
        upsert(payload: Record<string, unknown>, options: { onConflict: string }) {
          state.upsert = { payload, options }
          return api
        },
        single() {
          calls.push({ ...state, op: 'single' })
          const payload = (state.upsert as { payload: { id: string; deleted_at?: string } }).payload
          return Promise.resolve({
            data: {
              id: payload.id,
              updated_at: '2026-10-01T00:00:00.000Z',
              deleted_at: payload.deleted_at ?? null,
            },
            error: null,
          })
        },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          calls.push({ ...state, op: 'then' })
          return Promise.resolve({ data: null, error: null, count: 4 }).then(resolve, reject)
        },
      }
      return api
    },
  }
  return { client: client as unknown as SupabaseClient, calls }
}

describe('supabase remote', () => {
  it('upserts by id and does not use a partial unique index as the conflict target', async () => {
    const { client, calls } = mockClient()
    const remote = createSupabaseRemote(client)
    await remote.push('budget_plans', {
      id: 'plan-1',
      user_id: 'user-1',
      category: 'Food',
      amount: 10,
      note: null,
      created_at: '2026-10-01T00:00:00.000Z',
    })
    const call = calls.find((entry) => entry.op === 'single')
    expect(call?.upsert).toEqual({
      payload: expect.objectContaining({ id: 'plan-1', category: 'Food' }),
      options: { onConflict: 'id' },
    })
  })

  it('pulls by user and updated_at with a quoted keyset for equal timestamps', async () => {
    const { client, calls } = mockClient()
    const remote = createSupabaseRemote(client)
    await remote.pullPage({
      table: 'expenses',
      userId: 'user-1',
      updatedAtGte: '2026-10-01T00:00:00.000Z',
      after: { updatedAt: '2026-10-01T00:00:00.000Z', id: 'abc' },
      limit: 1,
    })
    const call = calls.find((entry) => entry.op === 'limit')
    expect(call?.gte).toEqual(['updated_at', '2026-10-01T00:00:00.000Z'])
    expect(call?.or).toBe(
      'updated_at.gt."2026-10-01T00:00:00.000Z",and(updated_at.eq."2026-10-01T00:00:00.000Z",id.gt."abc")',
    )
    expect(call?.eq).toEqual([['user_id', 'user-1']])
  })

  it('counts live server rows only', async () => {
    const { client, calls } = mockClient()
    const remote = createSupabaseRemote(client)
    await expect(remote.countLive('goals', 'user-1')).resolves.toBe(4)
    const call = calls.find((entry) => entry.op === 'then')
    expect(call?.selectOptions).toEqual({ count: 'exact', head: true })
    expect(call?.is).toEqual(['deleted_at', null])
  })
})
