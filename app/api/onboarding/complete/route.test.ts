import { readFileSync } from 'fs'
import path from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { plainDbErrorText } from '@/lib/apiError'
import { NICKNAME_MAX_LENGTH, NICKNAME_REQUIRED_ERROR, NICKNAME_TOO_LONG_ERROR, onboardingNamePrefill } from '@/lib/displayName'

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
  goalCount: 0,
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
        is() {
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
            if (state.goalError) {
              result = { data: null, error: state.goalError }
            } else {
              state.goalCount += 1
              result = { data: { id: 'goal-1' }, error: null }
            }
          } else if (
            table === 'goals' &&
            ctx.op === 'update' &&
            ctx.payload != null &&
            typeof ctx.payload === 'object' &&
            'deleted_at' in ctx.payload
          ) {
            state.goalCount -= 1
            result = { data: null, error: null }
          } else if (table === 'goals' && ctx.op === 'delete') {
            state.goalCount -= 1
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
    nickname: 'Juan',
    ...overrides,
  }
}

function callsTo(table: string, op?: string) {
  return state.calls.filter((call) => call.table === table && (op == null || call.op === op))
}

function goalTombstones() {
  return state.calls.filter(
    (call) =>
      call.table === 'goals' &&
      call.op === 'update' &&
      call.payload != null &&
      typeof call.payload === 'object' &&
      'deleted_at' in call.payload
  )
}

beforeEach(() => {
  state.user = { id: 'user-1' }
  state.profileError = null
  state.goalError = null
  state.incomeError = null
  state.calls = []
  state.rpcCalls = 0
  state.goalCount = 0
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
    expect(state.calls.map((call) => `${call.table}:${call.op}`)).toEqual([
      'goals:insert',
      'profiles:update',
      'income_records:insert',
    ])

    const profile = callsTo('profiles', 'update')
    expect(profile).toHaveLength(1)
    expect(profile[0]?.payload).toMatchObject({
      monthly_income: 25000,
      savings_percent: 20,
      income_frequency: 'semi-monthly',
      onboarding_completed: true,
      nickname: 'Juan',
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

  it('does not touch income range or removed profile fields on a 4-step finish', async () => {
    const omitted = [
      'monthly_income_range',
      'savings_confidence',
      'financial_stage',
      'risk_comfort',
      'motivation_type',
      'dream_statement',
    ] as const
    for (const extra of [{}, { monthly_income_range: '' }, { monthly_income_range: '   ' }]) {
      state.calls = []
      const res = await post(validBody(extra))
      expect(res.status).toBe(200)
      const payload = callsTo('profiles', 'update')[0]?.payload as Record<string, unknown>
      for (const key of omitted) expect(payload).not.toHaveProperty(key)
      expect(payload).toMatchObject({
        monthly_income: 25000,
        income_frequency: 'semi-monthly',
        savings_percent: 20,
        onboarding_completed: true,
        nickname: 'Juan',
      })
    }
  })

  it('still accepts an old 8-step finish and writes the optional profile fields', async () => {
    const res = await post(
      validBody({
        monthly_income_range: '20k_50k',
        primary_goal_category: 'emergency_fund',
        savings_confidence: 3,
        financial_stage: 'building',
        risk_comfort: 'medium',
        motivation_type: 'security',
        dream_statement: '  Own a home by 35  ',
      }),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, income_id: 'income-1' })
    expect(callsTo('profiles', 'update')[0]?.payload).toMatchObject({
      monthly_income_range: '20k_50k',
      savings_confidence: 3,
      financial_stage: 'building',
      risk_comfort: 'medium',
      motivation_type: 'security',
      dream_statement: 'Own a home by 35',
      monthly_income: 25000,
      income_frequency: 'semi-monthly',
      savings_percent: 20,
      primary_goal_category: 'emergency_fund',
      onboarding_completed: true,
      nickname: 'Juan',
    })
  })

  it('writes null when an old client sends the optional fields as empty', async () => {
    const res = await post(
      validBody({
        savings_confidence: null,
        financial_stage: null,
        risk_comfort: '',
        motivation_type: null,
        dream_statement: '   ',
      }),
    )
    expect(res.status).toBe(200)
    const payload = callsTo('profiles', 'update')[0]?.payload as Record<string, unknown>
    expect(payload).toMatchObject({
      savings_confidence: null,
      financial_stage: null,
      risk_comfort: null,
      motivation_type: null,
      dream_statement: null,
    })
    expect(payload).not.toHaveProperty('monthly_income_range')
  })

  it('writes a trimmed nickname of 15 characters or fewer', async () => {
    const res = await post(validBody({ nickname: '  Christopher  ' }))
    expect(res.status).toBe(200)
    expect(callsTo('profiles', 'update')[0]?.payload).toMatchObject({ nickname: 'Christopher' })

    state.calls = []
    const max = 'A'.repeat(NICKNAME_MAX_LENGTH)
    const exact = await post(validBody({ nickname: max }))
    expect(exact.status).toBe(200)
    expect(callsTo('profiles', 'update')[0]?.payload).toMatchObject({ nickname: max })
  })

  it('rejects a skipped or blank nickname before any write', async () => {
    expect(onboardingNamePrefill({ nickname: null, fullName: 'ada@example.com' })).toBe('')
    for (const nickname of [undefined, null, '', '   ', 12]) {
      state.calls = []
      const res = await post(validBody({ nickname }))
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: NICKNAME_REQUIRED_ERROR })
      expect(state.calls).toEqual([])
    }
  })

  it('returns 400 for more than 15 characters and does not truncate', async () => {
    const nickname = 'Christopher John'
    expect(nickname).toHaveLength(16)
    const res = await post(validBody({ nickname: `  ${nickname}  ` }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toEqual({ error: NICKNAME_TOO_LONG_ERROR })
    expect(JSON.stringify(body)).not.toContain('Christopher Joh')
    expect(state.calls).toEqual([])
  })

  it('finishes when the user is already at the goal limit and leaves that count unchanged', async () => {
    const raw = 'GOAL_LIMIT_REACHED: goal count is already at the plan max_goals'
    state.goalCount = 2
    state.goalError = { message: raw }
    const res = await post(validBody())
    expect(res.status).toBe(200)
    const body = await res.json()
    const serialized = JSON.stringify(body)
    expect(body).toEqual({ ok: true, income_id: 'income-1' })
    expect(serialized).not.toContain('GOAL_LIMIT_REACHED')
    expect(serialized).not.toContain('max_goals')
    expect(serialized).not.toContain(raw)
    expect(state.goalCount).toBe(2)
    expect(state.calls.map((call) => `${call.table}:${call.op}`)).toEqual([
      'goals:insert',
      'profiles:update',
      'income_records:insert',
    ])
    expect(goalTombstones()).toEqual([])
    expect(callsTo('profiles', 'update')[0]?.payload).toMatchObject({
      nickname: 'Juan',
      onboarding_completed: true,
    })
    expect(callsTo('income_records', 'insert')).toHaveLength(1)
    expect(console.error).toHaveBeenCalledWith(
      'POST /api/onboarding/complete goal insert error:',
      state.goalError,
    )
  })

  it('returns plain text and does not update the profile when the goal insert fails', async () => {
    const raw = 'permission denied for table goals'
    state.goalError = { message: raw }
    const res = await post(validBody())
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({ error: plainDbErrorText.save })
    expect(JSON.stringify(body)).not.toContain(raw)
    expect(callsTo('profiles')).toEqual([])
    expect(callsTo('income_records')).toEqual([])
    expect(callsTo('income_allocations')).toEqual([])
    expect(console.error).toHaveBeenCalledWith(
      'POST /api/onboarding/complete goal insert error:',
      state.goalError,
    )
  })

  it('deletes the inserted goal and returns plain text when the profile update fails', async () => {
    const raw = 'new row for relation "profiles" violates check constraint "profiles_nickname_check"'
    state.profileError = { message: raw }
    const res = await post(validBody())
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({ error: plainDbErrorText.save })
    expect(JSON.stringify(body)).not.toContain(raw)
    expect(JSON.stringify(body)).not.toContain('profiles_nickname_check')
    expect(state.calls.map((call) => `${call.table}:${call.op}`)).toEqual([
      'goals:insert',
      'profiles:update',
      'goals:update',
    ])
    expect(goalTombstones()).toEqual([
      {
        table: 'goals',
        op: 'update',
        payload: { deleted_at: expect.any(String) },
        filters: { id: 'goal-1', user_id: 'user-1' },
      },
    ])
    const profileWrites = callsTo('profiles', 'update')
    expect(profileWrites).toHaveLength(1)
    expect(profileWrites[0]?.payload).toMatchObject({ nickname: 'Juan', onboarding_completed: true })
    expect(callsTo('income_records')).toEqual([])
    expect(console.error).toHaveBeenCalledWith(
      'POST /api/onboarding/complete profile update error:',
      state.profileError,
    )
  })

  it('deletes no goal when the profile update fails after a skipped goal', async () => {
    state.goalCount = 2
    state.goalError = { message: 'GOAL_LIMIT_REACHED: goal count is already at the plan max_goals' }
    state.profileError = { message: 'new row for relation "profiles" violates check constraint "profiles_nickname_check"' }
    const res = await post(validBody())
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: plainDbErrorText.save })
    expect(state.goalCount).toBe(2)
    expect(goalTombstones()).toEqual([])
    expect(state.calls.map((call) => `${call.table}:${call.op}`)).toEqual([
      'goals:insert',
      'profiles:update',
    ])
    expect(callsTo('income_records')).toEqual([])
  })

  it('rolls back the new goal and onboarding flag when the income insert fails', async () => {
    const raw = 'duplicate key value violates unique constraint "income_records_pkey"'
    state.incomeError = { message: raw }
    const res = await post(validBody())
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({ error: plainDbErrorText.save })
    expect(JSON.stringify(body)).not.toContain(raw)
    expect(JSON.stringify(body)).not.toContain('income_records_pkey')
    expect(callsTo('income_allocations')).toEqual([])
    expect(state.calls.map((call) => `${call.table}:${call.op}`)).toEqual([
      'goals:insert',
      'profiles:update',
      'income_records:insert',
      'goals:update',
      'profiles:update',
    ])
    expect(goalTombstones()).toEqual([
      {
        table: 'goals',
        op: 'update',
        payload: { deleted_at: expect.any(String) },
        filters: { id: 'goal-1', user_id: 'user-1' },
      },
    ])
    const profileWrites = callsTo('profiles', 'update')
    expect(profileWrites).toHaveLength(2)
    expect(profileWrites[0]?.payload).toMatchObject({ nickname: 'Juan', onboarding_completed: true })
    expect(profileWrites[1]?.payload).toEqual({ onboarding_completed: false })
    expect(profileWrites[1]?.filters).toEqual({ id: 'user-1' })
    expect(console.error).toHaveBeenCalledWith(
      'POST /api/onboarding/complete income insert error:',
      state.incomeError,
    )
  })

  it('resets onboarding and deletes no goal when income fails after a skipped goal', async () => {
    const raw = 'duplicate key value violates unique constraint "income_records_pkey"'
    state.goalCount = 2
    state.goalError = { message: 'GOAL_LIMIT_REACHED: goal count is already at the plan max_goals' }
    state.incomeError = { message: raw }
    const res = await post(validBody())
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({ error: plainDbErrorText.save })
    expect(JSON.stringify(body)).not.toContain(raw)
    expect(JSON.stringify(body)).not.toContain('GOAL_LIMIT_REACHED')
    expect(state.goalCount).toBe(2)
    expect(goalTombstones()).toEqual([])
    expect(state.calls.map((call) => `${call.table}:${call.op}`)).toEqual([
      'goals:insert',
      'profiles:update',
      'income_records:insert',
      'profiles:update',
    ])
    const profileWrites = callsTo('profiles', 'update')
    expect(profileWrites).toHaveLength(2)
    expect(profileWrites[0]?.payload).toMatchObject({ nickname: 'Juan', onboarding_completed: true })
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
