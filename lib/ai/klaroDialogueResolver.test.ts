import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  parsePeriodOverride,
  parseStoredResolution,
  parseTopN,
  resolveDialogue,
  type DialogueResolution,
  type DialogueState,
} from './klaroDialogueResolver'
import {
  buildClarifyFallback,
  buildClarifyUserPrompt,
  isAcceptableClarification,
} from './klaroChatClarify'
import { getSpendingCategories, SPENDING_LIMIT_MAX } from './klaroChatTools'
import { aggregateSpendingCategories, type KlaroFinancialContext } from './klaroFinancialContext'
import { buildChatFallback } from './klaroChatFallback'
import { selectChatContext } from './klaroChatIntent'
import { sanitizeChatText } from './sanitizeChatText'
import { BANNED_AI_CHAT_BODY_KEYS } from './bannedChatBodyKeys'
import type { SupabaseClient } from '@supabase/supabase-js'

const PERIOD = '2026-09-01'
const TWO_GOALS = ['Emergency Fund', 'Japan Trip']

function resolve(
  message: string,
  opts: { previous?: DialogueResolution | null; goalNames?: string[] } = {}
): DialogueResolution {
  return resolveDialogue({
    message,
    history: [],
    previous: opts.previous ?? null,
    goalNames: opts.goalNames ?? TWO_GOALS,
    currentPeriod: PERIOD,
  })
}

function answered(state: Partial<DialogueState>): DialogueResolution {
  return {
    action: 'answer',
    state: {
      intent: 'spending_categories',
      entity: null,
      period: PERIOD,
      sort: 'desc',
      limit: 3,
      rank: null,
      metric: 'spent',
      advice: false,
      loan: null,
      ...state,
    },
  }
}

function stateOf(r: DialogueResolution): DialogueState {
  if (r.action !== 'answer') {
    throw new Error(`expected answer, got ${r.action === 'clarify' ? `clarify (${r.reason})` : r.action}`)
  }
  return r.state
}

function sampleContext(overrides: Partial<KlaroFinancialContext> = {}): KlaroFinancialContext {
  return {
    period: PERIOD,
    periodLabel: 'September 2026',
    income: 50000,
    expenses: 40000,
    netFlow: 10000,
    budget: { amount: 45000, spent: 40000, remaining: 5000, usedPercent: 89 },
    topSpendingCategories: [
      { name: 'Groceries', spent: 12000, percentOfExpenses: 30 },
      { name: 'Transportation', spent: 8000, percentOfExpenses: 20 },
      { name: 'Shopping', spent: 6000, percentOfExpenses: 15 },
    ],
    goals: [
      { name: 'Emergency Fund', targetAmount: 100000, currentAmount: 40000, progressPercent: 40 },
      { name: 'Japan Trip', targetAmount: 80000, currentAmount: 20000, progressPercent: 25 },
    ],
    assets: 200000,
    liabilities: 50000,
    netWorth: 150000,
    observationSeeds: [],
    ...overrides,
  }
}

const TWELVE_CATEGORIES = [
  'Rent / Mortgage',
  'Utilities',
  'Groceries',
  'Transportation',
  'Health',
  'Education',
  'Insurance',
  'Dining Out',
  'Shopping',
  'Entertainment',
  'Subscriptions',
  'Hobbies',
]
const TWELVE_ROWS = TWELVE_CATEGORIES.map((category, i) => ({ category, amount: (12 - i) * 1000 }))

/** Minimal Supabase query-builder fake that records every filter applied per table. */
function fakeSupabase(rowsByTable: Record<string, unknown[]>) {
  const filters: Array<{ table: string; column: string; value: unknown }> = []
  const client = {
    from(table: string) {
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters.push({ table, column, value })
          return builder
        },
        gte: () => builder,
        lt: () => builder,
        then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
          resolve({ data: rowsByTable[table] ?? [], error: null }),
      }
      return builder
    },
  }
  return { client: client as unknown as SupabaseClient, filters }
}

describe('1. Clear question → answer', () => {
  it('answers a clear spending question with the default list size', () => {
    const s = stateOf(resolve('What are my biggest spending categories?'))
    expect(s.intent).toBe('spending_categories')
    expect(s.period).toBe(PERIOD)
    expect(s.limit).toBe(3)
    expect(s.sort).toBe('desc')
  })

  it('answers a clear budget question', () => {
    expect(stateOf(resolve('How much of my budget is left?')).intent).toBe('budget')
  })
})

describe('2. Follow-up modifier inherits context', () => {
  it('"How about August?" keeps the spending subject and changes only the period', () => {
    const prev = answered({ limit: 5 })
    const s = stateOf(resolve('How about August?', { previous: prev }))
    expect(s.intent).toBe('spending_categories')
    expect(s.period).toBe('2026-08-01')
    expect(s.limit).toBe(5)
  })

  it('keeps a focused goal when only the period changes', () => {
    const prev = answered({ intent: 'goals', entity: { kind: 'goal', name: 'Japan Trip' } })
    const s = stateOf(resolve('what about last month?', { previous: prev }))
    expect(s.intent).toBe('goals')
    expect(s.entity).toEqual({ kind: 'goal', name: 'Japan Trip' })
    expect(s.period).toBe('2026-08-01')
  })

  it('never resolves a month to the future', () => {
    expect(parsePeriodOverride('how about october?', PERIOD)).toBe('2025-10-01')
    expect(parsePeriodOverride('how about december 2026?', PERIOD)).toBeNull()
    expect(parsePeriodOverride('i may spend less', PERIOD)).toBeNull()
  })
})

describe('3. "Give me top N" inherits spending context (no hard cap at 5)', () => {
  it('"Give me top 5" inherits spending with limit 5', () => {
    const s = stateOf(resolve('Give me top 5', { previous: answered({}) }))
    expect(s.intent).toBe('spending_categories')
    expect(s.limit).toBe(5)
  })

  it('"Give me top 10" genuinely requests 10', () => {
    expect(stateOf(resolve('Give me top 10', { previous: answered({}) })).limit).toBe(10)
    expect(parseTopN('top ten')).toBe(10)
  })

  it('clamps abusive limits to the server maximum', () => {
    expect(SPENDING_LIMIT_MAX).toBe(20)
    expect(parseTopN('top 50')).toBe(20)
    expect(parseTopN('top 999')).toBe(20)
  })

  it('a top-N follow-up widens a single-category focus into a ranking', () => {
    const prev = answered({ entity: { kind: 'category', name: 'Groceries' } })
    const s = stateOf(resolve('give me top 5', { previous: prev }))
    expect(s.entity).toBeNull()
    expect(s.limit).toBe(5)
  })

  it('aggregation returns 10 of 12 categories for limit 10 and reports the total', () => {
    const agg = aggregateSpendingCategories({
      expenseRows: TWELVE_ROWS,
      planRows: [],
      overrideRows: [],
      limit: 10,
    })
    expect(agg.categories).toHaveLength(10)
    expect(agg.totalCategories).toBe(12)
    expect(agg.categories[0].name).toBe('Rent / Mortgage')
  })

  it('getSpendingCategories retrieves 10 real rows (not a slice of the top-5 context)', async () => {
    const { client } = fakeSupabase({ expenses: TWELVE_ROWS })
    const r = await getSpendingCategories({
      supabase: client,
      userId: 'user-a',
      period: PERIOD,
      limit: 10,
    })
    expect(r.categories).toHaveLength(10)
    expect(r.requestedLimit).toBe(10)
    expect(r.periodLabel).toBe('September 2026')
  })

  it('fallback lists every returned category and states when fewer exist than requested', async () => {
    const ten = await getSpendingCategories({
      supabase: fakeSupabase({ expenses: TWELVE_ROWS }).client,
      userId: 'user-a',
      period: PERIOD,
      limit: 10,
    })
    const text = buildChatFallback({
      message: 'give me top 10',
      context: sampleContext(),
      intent: 'spending_categories',
      spending: ten,
    })
    expect(text).toContain('top 10')
    expect(text.match(/^• /gm)).toHaveLength(10)

    const few = await getSpendingCategories({
      supabase: fakeSupabase({ expenses: TWELVE_ROWS.slice(0, 4) }).client,
      userId: 'user-a',
      period: PERIOD,
      limit: 10,
    })
    const shortText = buildChatFallback({
      message: 'give me top 10',
      context: sampleContext(),
      intent: 'spending_categories',
      spending: few,
    })
    expect(shortText).toContain('Klaro only has 4 categories')
  })

  it('selectChatContext passes the tool result and ranking to Gemini', () => {
    const agg = aggregateSpendingCategories({
      expenseRows: TWELVE_ROWS,
      planRows: [],
      overrideRows: [],
      limit: 10,
    })
    const compact = selectChatContext(sampleContext(), 'spending_categories', {
      spending: {
        period: PERIOD,
        periodLabel: 'September 2026',
        sort: 'desc',
        metric: 'spent',
        rank: null,
        requestedLimit: 10,
        totalExpenses: agg.totalExpenses,
        totalCategories: agg.totalCategories,
        categories: agg.categories,
      },
    })
    const json = JSON.stringify(compact)
    expect(json).toContain('Entertainment')
    expect(json).not.toContain('Subscriptions')
    expect(json).toContain('"categoriesInRanking":12')
  })
})

describe('4. "Same but last month" inherits and changes period', () => {
  it('keeps intent + limit and moves to the previous month', () => {
    const prev = answered({ limit: 5 })
    const s = stateOf(resolve('Same but last month', { previous: prev }))
    expect(s.intent).toBe('spending_categories')
    expect(s.limit).toBe(5)
    expect(s.period).toBe('2026-08-01')
  })
})

describe('5. "How am I doing?" → clarify', () => {
  it('clarifies with fixed topic choices', () => {
    const r = resolve('How am I doing?')
    expect(r.action).toBe('clarify')
    if (r.action !== 'clarify') return
    expect(r.reason).toBe('vague_overview')
    expect(r.choices).toContain('spending')
  })

  it('a reply to the clarification resolves to that topic', () => {
    const clarify = resolve('How am I doing?')
    const s = stateOf(resolve('spending please', { previous: clarify }))
    expect(s.intent).toBe('spending_categories')
  })
})

describe('6. "How much should I save?" → clarify when purpose is unclear', () => {
  it('clarifies without a purpose', () => {
    const r = resolve('How much should I save?')
    expect(r.action).toBe('clarify')
    if (r.action === 'clarify') expect(r.reason).toBe('savings_purpose')
  })

  it('answers when a goal or amount is stated', () => {
    expect(resolve('How much should I save for my Emergency Fund?').action).toBe('answer')
    expect(stateOf(resolve('Can I afford to save 5,000 a month?')).intent).toBe('savings')
  })

  it('savings fallback checks a stated monthly amount against the real surplus', () => {
    const text = buildChatFallback({
      message: 'Can I afford to save 5,000 a month?',
      context: sampleContext(),
      intent: 'savings',
    })
    expect(text).toContain('₱10,000')
    expect(text).toContain('₱5,000')
  })
})

describe('7. Multiple goals + "How much more do I need?" → clarify', () => {
  it('clarifies with the user\'s real goal names', () => {
    const r = resolve('How much more do I need?')
    expect(r.action).toBe('clarify')
    if (r.action !== 'clarify') return
    expect(r.reason).toBe('goal_unspecified')
    expect(r.choices).toEqual(TWO_GOALS)
  })

  it('the goal-name reply resolves to that goal', () => {
    const clarify = resolve('How much more do I need?')
    const s = stateOf(resolve('Japan Trip', { previous: clarify }))
    expect(s.entity).toEqual({ kind: 'goal', name: 'Japan Trip' })
  })

  it('a single goal answers directly', () => {
    const s = stateOf(resolve('How much more do I need?', { goalNames: ['Emergency Fund'] }))
    expect(s.entity).toEqual({ kind: 'goal', name: 'Emergency Fund' })
  })
})

describe('8. Unresolvable "What about it?" → clarify', () => {
  it('clarifies with no prior subject', () => {
    const r = resolve('What about it?')
    expect(r.action).toBe('clarify')
    if (r.action === 'clarify') expect(r.reason).toBe('unresolved_reference')
  })

  it('inherits when the previous answer had a clear subject', () => {
    const prev = answered({ intent: 'goals', entity: { kind: 'goal', name: 'Japan Trip' } })
    expect(stateOf(resolve('What about it?', { previous: prev })).entity?.name).toBe('Japan Trip')
  })
})

describe('9. Named goal "how much more" → answer', () => {
  it('resolves the goal and the fallback states the real remaining amount', () => {
    const s = stateOf(resolve('How much more do I need for my Emergency Fund?'))
    expect(s.intent).toBe('goals')
    expect(s.entity).toEqual({ kind: 'goal', name: 'Emergency Fund' })

    const text = buildChatFallback({
      message: 'How much more do I need for my Emergency Fund?',
      context: sampleContext(),
      intent: 'goals',
      focus: s.entity,
    })
    expect(text).toContain('₱60,000 more')
    expect(text).toContain('Emergency Fund')
    expect(text).not.toContain('Japan Trip')
  })
})

describe('10. Gemini unavailable → useful deterministic output', () => {
  it('every clarification reason has a complete deterministic question', () => {
    for (const reason of [
      'vague_overview',
      'savings_purpose',
      'goal_unspecified',
      'unresolved_reference',
      'out_of_scope',
    ] as const) {
      const text = buildClarifyFallback(reason, TWO_GOALS)
      expect(text.trim().endsWith('?')).toBe(true)
      expect(sanitizeChatText(text)).toBe(text)
    }
  })

  it('focused-category answers use real category data', () => {
    const text = buildChatFallback({
      message: 'how much on groceries?',
      context: sampleContext(),
      intent: 'spending_categories',
      spending: {
        period: PERIOD,
        periodLabel: 'September 2026',
        sort: 'desc',
        metric: 'spent',
        rank: null,
        requestedLimit: 20,
        totalExpenses: 40000,
        totalCategories: 3,
        categories: sampleContext().topSpendingCategories,
      },
      focus: { kind: 'category', name: 'Groceries' },
    })
    expect(text).toContain('Groceries spending for September 2026 is ₱12,000')
  })
})

describe('11. Gemini incomplete → existing fallback', () => {
  it('incomplete Gemini text is rejected so the fallback is used', () => {
    expect(sanitizeChatText('Your biggest spending areas are ₱41,2')).toBeNull()
  })

  it('clarifications that are not questions or contain amounts are rejected', () => {
    expect(isAcceptableClarification('Which goal do you mean', 'goal_unspecified', TWO_GOALS)).toBe(false)
    expect(
      isAcceptableClarification('You need ₱60,000 — which goal?', 'goal_unspecified', TWO_GOALS)
    ).toBe(false)
  })
})

describe('12. No fabricated facts in clarifications', () => {
  it('deterministic clarifications contain no amounts', () => {
    for (const reason of ['vague_overview', 'savings_purpose', 'unresolved_reference'] as const) {
      expect(buildClarifyFallback(reason, ['spending', 'goals'])).not.toMatch(/₱|\d/)
    }
  })

  it('goal clarification names only the offered goals', () => {
    const text = buildClarifyFallback('goal_unspecified', TWO_GOALS)
    expect(text).toContain('Emergency Fund')
    expect(text).toContain('Japan Trip')
  })

  it('Gemini phrasing that drops a real goal is rejected', () => {
    expect(
      isAcceptableClarification('Which goal — Emergency Fund?', 'goal_unspecified', TWO_GOALS)
    ).toBe(false)
    expect(
      isAcceptableClarification(
        'Which goal do you mean — Emergency Fund or Japan Trip?',
        'goal_unspecified',
        TWO_GOALS
      )
    ).toBe(true)
  })

  it('the clarify prompt restricts Gemini to the supplied choices', () => {
    const prompt = buildClarifyUserPrompt({
      message: 'How much more do I need?',
      reason: 'goal_unspecified',
      choices: TWO_GOALS,
    })
    expect(prompt).toContain('Offer ONLY these choices')
    expect(prompt).toContain(JSON.stringify(TWO_GOALS))
  })
})

describe('13. No cross-user data in choices or tools', () => {
  it('goal choices come only from the supplied (authenticated user\'s) goal names', () => {
    const r = resolve('How much more do I need?', { goalNames: ['Car Fund', 'Wedding'] })
    expect(r.action).toBe('clarify')
    if (r.action === 'clarify') expect(r.choices).toEqual(['Car Fund', 'Wedding'])
  })

  it('a clarification reply cannot resolve to a goal the user no longer has', () => {
    const stale: DialogueResolution = {
      action: 'clarify',
      reason: 'goal_unspecified',
      choices: ['Someone Else Goal', 'Japan Trip'],
      pendingState: {},
    }
    const r = resolve('someone else goal', { previous: stale })
    expect(r.action === 'answer' && r.state.entity?.name === 'Someone Else Goal').toBe(false)
  })

  it('getSpendingCategories scopes every query to the session userId', async () => {
    const { client, filters } = fakeSupabase({ expenses: TWELVE_ROWS })
    await getSpendingCategories({ supabase: client, userId: 'user-a', period: PERIOD, limit: 5 })
    for (const table of ['expenses', 'budget_plans', 'budget_overrides']) {
      expect(filters).toContainEqual({ table, column: 'user_id', value: 'user-a' })
    }
    expect(filters.filter((f) => f.column === 'user_id').every((f) => f.value === 'user-a')).toBe(true)
  })

  it('stored resolution parsing drops unknown fields and malformed data', () => {
    expect(parseStoredResolution({ action: 'answer', state: { intent: 'hack', period: PERIOD } })).toBeNull()
    expect(parseStoredResolution({ action: 'answer', state: { intent: 'goals', period: 'x' } })).toBeNull()
    const parsed = parseStoredResolution({
      action: 'answer',
      userId: 'other-user',
      state: { intent: 'spending_categories', period: PERIOD, limit: 500, entity: null },
    })
    expect(parsed).toEqual(answered({ limit: 20 }))
  })
})

describe('14. Security + quota invariants', () => {
  const service = readFileSync(join(__dirname, 'klaroChatService.ts'), 'utf8')
  const route = readFileSync(join(process.cwd(), 'app', 'api', 'ai', 'chat', 'route.ts'), 'utf8')

  it('client cannot supply resolved state, intent, or operation', () => {
    for (const key of ['resolved_state', 'resolvedState', 'dialogueState', 'resolvedOperation', 'intent']) {
      expect(BANNED_AI_CHAT_BODY_KEYS).toContain(key)
    }
    expect(route).toContain('BANNED_AI_CHAT_BODY_KEYS')
  })

  it('resolved_state is server-written on assistant rows and never returned to the client', () => {
    expect(service).toContain("resolved_state: params.role === 'assistant'")
    const listFn = service.slice(service.indexOf('export async function listKlaroChatMessages'))
    expect(listFn).toContain(".select('id, role, content, created_at')")
    expect(listFn).not.toContain('resolved_state')
  })

  it('quota is reserved before resolving, so clarifications count', () => {
    expect(service.indexOf('tryReserveChatGeneration(params.userId')).toBeLessThan(
      service.indexOf('resolveDialogue({')
    )
  })

  it('spending limit for a focused category uses the server max, not a client value', () => {
    expect(service).toContain("state.entity?.kind === 'category' ? SPENDING_LIMIT_MAX : state.limit")
  })
})
