import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { createSupabaseRemote } from './supabaseRemote'

type Call = Record<string, unknown>

function mockClient(options?: {
  insertConflict?: boolean
  features?: unknown
  featuresError?: { message: string; code?: string }
  user?: { id: string; created_at?: string | null } | null
  simulate?: boolean
  profileError?: { message: string; code?: string }
}) {
  const calls: Call[] = []
  const rpcCalls: Call[] = []
  const client = {
    rpc(fn: string, args: unknown) {
      rpcCalls.push({ fn, args })
      if (options?.featuresError) return Promise.resolve({ data: null, error: options.featuresError })
      return Promise.resolve({
        data: options?.features ?? { plan_name: 'free', max_goals: 2 },
        error: null,
      })
    },
    auth: {
      getUser() {
        const user = options?.user === undefined
          ? { id: 'user-1', created_at: '2026-10-01T00:00:00.000Z' }
          : options.user
        return Promise.resolve({ data: { user }, error: null })
      },
    },
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
        insert(payload: Record<string, unknown>) {
          state.write = 'insert'
          state.payload = payload
          return api
        },
        update(payload: Record<string, unknown>) {
          state.write = 'update'
          state.payload = payload
          return api
        },
        single() {
          calls.push({ ...state, op: 'single' })
          const payload = state.payload as { id: string; deleted_at?: string }
          if (options?.insertConflict && state.write === 'insert') {
            return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "goals_pkey"' } })
          }
          return Promise.resolve({
            data: {
              id: payload.id,
              updated_at: '2026-10-01T00:00:00.000Z',
              deleted_at: payload.deleted_at ?? null,
            },
            error: null,
          })
        },
        maybeSingle() {
          calls.push({ ...state, op: 'maybeSingle', table })
          if (options?.profileError) return Promise.resolve({ data: null, error: options.profileError })
          return Promise.resolve({
            data: { simulate_budget_expired: options?.simulate === true },
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
  return { client: client as unknown as SupabaseClient, calls, rpcCalls }
}

describe('supabase remote', () => {
  it('inserts a new row and updates an acknowledged row by id', async () => {
    const { client, calls } = mockClient()
    const remote = createSupabaseRemote(client)
    await remote.push('budget_plans', {
      id: 'plan-1',
      user_id: 'user-1',
      category: 'Food',
      amount: 10,
      note: null,
      created_at: '2026-10-01T00:00:00.000Z',
    }, 'insert')
    await remote.push('goals', {
      id: 'goal-1',
      user_id: 'user-1',
      name: 'Emergency',
      target_amount: 10,
      created_at: '2026-10-01T00:00:00.000Z',
    }, 'update')
    const writes = calls.filter((entry) => entry.op === 'single')
    expect(writes.map((entry) => entry.write)).toEqual(['insert', 'update'])
    expect(writes[1]?.eq).toEqual([['id', 'goal-1']])
    expect(writes.some((entry) => 'upsert' in entry)).toBe(false)
  })

  it('updates by id when an insert hits a duplicate primary key', async () => {
    const { client, calls } = mockClient({ insertConflict: true })
    const remote = createSupabaseRemote(client)
    await remote.push('goals', {
      id: 'goal-1',
      user_id: 'user-1',
      name: 'Emergency',
      target_amount: 10,
      created_at: '2026-10-01T00:00:00.000Z',
    }, 'insert')
    const writes = calls.filter((entry) => entry.op === 'single')
    expect(writes.map((entry) => entry.write)).toEqual(['insert', 'update'])
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

  it('resolves Pro from get_user_features and reads the budget clock', async () => {
    const { client, rpcCalls, calls } = mockClient({
      features: { plan_name: 'clarity_premium', max_goals: 20, is_grace: false },
      user: { id: 'user-1', created_at: '2024-01-01T00:00:00.000Z' },
      simulate: false,
    })
    const remote = createSupabaseRemote(client)
    await expect(remote.resolveAccount('user-1')).resolves.toEqual({
      plan: { name: 'Pro', maxGoals: 20 },
      fullBudgeting: true,
      accountCreatedAt: '2024-01-01T00:00:00.000Z',
      simulateBudgetExpired: false,
    })
    expect(rpcCalls).toEqual([{ fn: 'get_user_features', args: { p_user_id: 'user-1' } }])
    const profile = calls.find((entry) => entry.op === 'maybeSingle')
    expect(profile?.table).toBe('profiles')
    expect(profile?.select).toBe('simulate_budget_expired')
    expect(profile?.eq).toEqual([['id', 'user-1']])
  })

  it('throws when get_user_features fails and ignores a profile read failure', async () => {
    const denied = mockClient({ featuresError: { code: '42501', message: 'permission denied for function get_user_features' } })
    await expect(createSupabaseRemote(denied.client).resolveAccount('user-1')).rejects.toMatchObject({ code: '42501' })

    const { client } = mockClient({
      features: { plan_name: 'free', max_goals: 2 },
      profileError: { message: 'profile unavailable' },
      simulate: true,
    })
    await expect(createSupabaseRemote(client).resolveAccount('user-1')).resolves.toMatchObject({
      plan: { name: 'Free', maxGoals: 2 },
      fullBudgeting: false,
      simulateBudgetExpired: false,
    })
  })
})
