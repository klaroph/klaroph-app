import { readFileSync } from 'fs'
import path from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Call = {
  table: string
  op: string
  payload: unknown
  filters: Record<string, unknown>
}

const state = vi.hoisted(() => ({
  user: { id: 'user-1' } as { id: string } | null,
  profileError: null as { message: string } | null,
  goalError: null as { message: string } | null,
  incomeError: null as { message: string } | null,
  calls: [] as Call[],
  rpcCalls: 0,
}))

vi.mock('@/lib/format', () => ({
  toLocalDateString: () => '2026-10-05',
}))

vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: state.user } }),
    },
  }),
}))

vi.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    from(table: string) {
      const ctx: { op: string; payload: unknown; filters: Record<string, unknown> } = {
        op: 'unknown',
        payload: undefined,
        filters: {},
      }
      const api = {
        update(payload: unknown) {
          ctx.op = 'update'
          ctx.payload = payload
          return api
        },
        insert(payload: unknown) {
          ctx.op = 'insert'
          ctx.payload = payload
          return api
        },
        delete() {
          ctx.op = 'delete'
          return api
        },
        select() {
          return api
        },
        eq(col: string, val: unknown) {
          ctx.filters[col] = val
          return api
        },
        single() {
          return api
        },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          state.calls.push({
            table,
            op: ctx.op,
            payload: ctx.payload,
            filters: { ...ctx.filters },
          })
          let result: { data: unknown; error: { message: string } | null }
          if (table === 'profiles' && ctx.op === 'update') {
            result = { data: null, error: state.profileError }
          } else if (table === 'goals' && ctx.op === 'insert') {
            result = {
              data: state.goalError ? null : { id: 'goal-1' },
              error: state.goalError,
            }
          } else if (table === 'goals' && ctx.op === 'delete') {
            result = { data: null, error: null }
          } else if (table === 'income_records' && ctx.op === 'insert') {
            result = {
              data: state.incomeError ? null : { id: 'income-1' },
              error: state.incomeError,
            }
          } else if (table === 'income_allocations') {
            result = { data: null, error: { message: 'income_allocations must not be written' } }
          } else {
            result = { data: null, error: { message: `unexpected ${ctx.op} on ${table}` } }
          }
          return Promise.resolve(result).then(resolve, reject)
        },
      }
      return api
    },
    rpc() {
      state.rpcCalls += 1
      throw new Error('rpc must not be called')
    },
  },
}))

import { POST } from './route'

const root = path.resolve(__dirname, '..', '..', '..', '..')

function post(body: Record<string, unknown>) {
  return POST(
    new Request('http://localhost/api/onboarding/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  )
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    monthly_income: 25000,
    pay_period_income: 12500,
    income_frequency: 'semi-monthly',
    savings_percent: 20,
    goal_name: 'Emergency fund',
    goal_target_amount: 100000,
    ...overrides,
  }
}

function callsTo(table: string, op?: string) {
  return state.calls.filter((call) => call.table === table && (op == null || call.op === op))
}

beforeEach(() => {
  state.user = { id: 'user-1' }
  state.profileError = null
  state.goalError = null
  state.incomeError = null
  state.calls = []
  state.rpcCalls = 0
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/onboarding/complete', () => {
  it('rejects unauthenticated requests before any writes', async () => {
    state.user = null
    const res = await post(validBody())
    expect(res.status).toBe(401)
    expect(state.calls).toEqual([])
  })

  it('rejects an invalid goal before writing profile, goal, or income', async () => {
    const res = await post(validBody({ goal_name: '  ', goal_target_amount: 0 }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      error: 'Goal name and a valid target amount are required.',
    })
    expect(state.calls).toEqual([])
  })

  it.each([
    ['omitted', { pay_period_income: undefined }],
    ['null', { pay_period_income: null }],
    ['zero', { pay_period_income: 0 }],
    ['negative', { pay_period_income: -100 }],
    ['not a number', { pay_period_income: '12500' }],
  ])('rejects %s pay-period income without writing', async (_label, overrides) => {
    const res = await post(validBody(overrides))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      error: 'A valid pay-period income amount is required.',
    })
    expect(state.calls).toEqual([])
    expect(callsTo('income_records')).toEqual([])
  })

  it('inserts one unallocated income for the pay-period amount, not the monthlyized figure', async () => {
    const res = await post(validBody())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, income_id: 'income-1' })

    const profile = callsTo('profiles', 'update')
    expect(profile).toHaveLength(1)
    expect(profile[0]?.payload).toMatchObject({
      monthly_income: 25000,
      savings_percent: 20,
      income_frequency: 'semi-monthly',
      onboarding_completed: true,
    })
    expect(profile[0]?.filters).toEqual({ id: 'user-1' })

    expect(callsTo('goals', 'insert')[0]?.payload).toEqual({
      user_id: 'user-1',
      name: 'Emergency fund',
      target_amount: 100000,
      saved_amount: 0,
    })

    expect(callsTo('income_records', 'insert')).toEqual([
      {
        table: 'income_records',
        op: 'insert',
        payload: {
          user_id: 'user-1',
          total_amount: 12500,
          disposable_amount: 12500,
          date: '2026-10-05',
          income_source: null,
        },
        filters: {},
      },
    ])
    expect(callsTo('income_allocations')).toEqual([])
    expect(state.rpcCalls).toBe(0)
  })

  it('does not insert income when the profile update fails', async () => {
    state.profileError = { message: 'profile write failed' }
    const res = await post(validBody())
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'profile write failed' })
    expect(callsTo('goals')).toEqual([])
    expect(callsTo('income_records')).toEqual([])
  })

  it('does not insert income when the goal insert fails', async () => {
    state.goalError = { message: 'goal write failed' }
    const res = await post(validBody())
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'goal write failed' })
    expect(callsTo('income_records')).toEqual([])
    expect(callsTo('income_allocations')).toEqual([])
  })

  it('rolls back the new goal and onboarding flag when the income insert fails', async () => {
    state.incomeError = { message: 'income write failed' }
    const res = await post(validBody())
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'income write failed' })
    expect(callsTo('income_allocations')).toEqual([])
    expect(callsTo('goals', 'delete')).toEqual([
      {
        table: 'goals',
        op: 'delete',
        payload: undefined,
        filters: { id: 'goal-1', user_id: 'user-1' },
      },
    ])
    const profileWrites = callsTo('profiles', 'update')
    expect(profileWrites).toHaveLength(2)
    expect(profileWrites[1]?.payload).toEqual({ onboarding_completed: false })
    expect(profileWrites[1]?.filters).toEqual({ id: 'user-1' })
  })

  it('keeps savings percent on the profile and does not allocate from it', () => {
    const route = readFileSync(path.join(root, 'app/api/onboarding/complete/route.ts'), 'utf8')
    const flow = readFileSync(path.join(root, 'app/onboarding/OnboardingFlow.tsx'), 'utf8')
    expect(route).not.toContain('create_income_with_allocations')
    expect(route).not.toContain('income_allocations')
    expect(flow).toContain('pay_period_income: incomeNum')
    expect(flow).toContain('Nothing moves to your goal until you')
    expect(flow).toContain('your savings % stays a preference only')
    expect(flow).not.toContain('create_income_with_allocations')

    const card = readFileSync(
      path.join(root, 'components/dashboard/FirstIncomeAllocateCard.tsx'),
      'utf8'
    )
    expect(card).toContain('useState(false)')
    expect(card).toContain('onClick={() => setOpen(true)}')
    expect(card).not.toMatch(/useEffect\(\(\) => \{\s*setOpen\(true\)/)
    expect(card).toContain('suggestedAllocateAmount={card.suggested}')
  })
})
