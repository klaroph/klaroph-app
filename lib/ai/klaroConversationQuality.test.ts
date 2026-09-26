import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  isCasualMessage,
  parseRank,
  resolveDialogue,
  type DialogueResolution,
  type DialogueState,
} from './klaroDialogueResolver'
import { buildCasualFallback, isAcceptableCasualReply } from './klaroChatCasual'
import { getSpendingCategories } from './klaroChatTools'
import { aggregateSpendingCategories, type KlaroFinancialContext } from './klaroFinancialContext'
import { buildChatFallback } from './klaroChatFallback'
import { selectChatContext } from './klaroChatIntent'
import { sanitizeChatText } from './sanitizeChatText'
import type { SupabaseClient } from '@supabase/supabase-js'

const PERIOD = '2026-09-01'
const GOALS = ['Emergency Fund', 'Japan Trip']

function resolve(
  message: string,
  opts: { previous?: DialogueResolution | null; goalNames?: string[] } = {}
): DialogueResolution {
  return resolveDialogue({
    message,
    history: [],
    previous: opts.previous ?? null,
    goalNames: opts.goalNames ?? GOALS,
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
  if (r.action !== 'answer') throw new Error(`expected answer, got ${r.action}`)
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
      { name: 'Loan Payment', spent: 14000, percentOfExpenses: 35 },
      { name: 'Family Support', spent: 10000, percentOfExpenses: 25 },
      { name: 'Groceries', spent: 6000, percentOfExpenses: 15 },
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

const EXPENSES = [
  { category: 'Loan Payment', amount: 14000 },
  { category: 'Family Support', amount: 10000 },
  { category: 'Groceries', amount: 6000 },
  { category: 'Utilities', amount: 4000 },
  { category: 'Hobbies', amount: 1000 },
]

function fakeSupabase(rowsByTable: Record<string, unknown[]>) {
  const tablesQueried: string[] = []
  const client = {
    from(table: string) {
      tablesQueried.push(table)
      const builder = {
        select: () => builder,
        eq: () => builder,
        gte: () => builder,
        lt: () => builder,
        then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
          resolve({ data: rowsByTable[table] ?? [], error: null }),
      }
      return builder
    },
  }
  return { client: client as unknown as SupabaseClient, tablesQueried }
}

async function spendingFor(params: {
  rank?: number | null
  limit?: number
  sort?: 'desc' | 'asc'
  metric?: 'spent' | 'room'
  plans?: Array<{ category: string; amount: number }>
  expenses?: Array<{ category: string; amount: number }>
}) {
  const { client } = fakeSupabase({
    expenses: params.expenses ?? EXPENSES,
    budget_plans: params.plans ?? [],
  })
  return getSpendingCategories({
    supabase: client,
    userId: 'user-a',
    period: PERIOD,
    limit: params.limit ?? 3,
    rank: params.rank ?? null,
    sort: params.sort,
    metric: params.metric,
  })
}

const service = readFileSync(join(__dirname, 'klaroChatService.ts'), 'utf8')

describe('Casual / social messages', () => {
  it.each(['Alright! You are amazing!', 'Thanks!', 'Perfect', 'Okay thanks', 'Got it', "That's helpful", 'Nice', 'Awesome'])(
    '"%s" resolves to a casual turn',
    (msg) => {
      expect(isCasualMessage(msg)).toBe(true)
      expect(resolve(msg, { previous: answered({ intent: 'budget' }) }).action).toBe('casual')
    }
  )

  it('casual fallback is short, friendly, and has no financial facts', () => {
    const compliment = buildCasualFallback('Alright! You are amazing!')
    expect(compliment).toContain('thank you')
    expect(buildCasualFallback('Thanks!')).toContain("You're welcome")
    for (const msg of ['Perfect', 'Okay thanks', 'You are amazing']) {
      const text = buildCasualFallback(msg)
      expect(text).not.toMatch(/₱|\d/)
      expect(sanitizeChatText(text)).toBe(text)
    }
  })

  it('Gemini casual replies with financial figures are rejected', () => {
    expect(isAcceptableCasualReply("You're welcome! 😄 What would you like to look at next?")).toBe(true)
    expect(isAcceptableCasualReply("You're welcome! You have ₱5,000 left.")).toBe(false)
  })

  it('pure casual messages never read financial data', () => {
    expect(service).toMatch(/isCasualMessage\(message\)\s*\?\s*\[\]\s*:\s*await getGoalNames/)
    const start = service.indexOf('async function runCasualTurn')
    const casualFn = service.slice(start, service.indexOf('\n}\n', start))
    expect(casualFn).not.toMatch(/buildKlaroFinancialContext|getSpendingCategories|supabase/)
    const askFn = service.slice(service.indexOf('export async function askKlaro'))
    expect(askFn.slice(0, askFn.indexOf('export async function listKlaroChatMessages'))).not.toContain(
      'buildKlaroFinancialContext'
    )
  })

  it('a casual turn keeps the previous financial subject for the next follow-up', () => {
    expect(service).toContain("resolution.action === 'casual'")
    expect(service).toMatch(/previousResolution\?\.action === 'answer'\s*\?\s*previousResolution/)
  })
})

describe('Greetings and identity', () => {
  it.each(['Hello', 'Hi', 'Hey', 'Good morning', 'Good afternoon', 'Good evening', 'Hi there!', 'Whats your name?', 'Who are you?', 'What’s your name?'])(
    '"%s" → casual',
    (msg) => {
      expect(resolve(msg).action).toBe('casual')
    }
  )

  it.each([
    ['Hey, how much did I spend?', 'spending_categories'],
    ['Hi, where am I spending the most?', 'spending_categories'],
    ['Hello, how is my budget doing?', 'budget'],
  ] as const)('"%s" stays financial (%s)', (msg, intent) => {
    expect(isCasualMessage(msg)).toBe(false)
    expect(stateOf(resolve(msg)).intent).toBe(intent)
  })

  it('greeting fallback introduces Klaro without financial facts', () => {
    const text = buildCasualFallback('Hello')
    expect(text).toContain("I'm Klaro")
    expect(text).not.toMatch(/₱|\d/)
  })
})

describe('Compliments about Klaro improving', () => {
  it.each([
    'You are getting smarter huh :D',
    "You're getting smarter",
    'You are getting smarter',
    "You're getting smarter huh",
    "You're getting better",
    "You're getting better at this",
    "You're learning",
    "You're getting good",
    "You're pretty smart",
    "You're smart",
    'Nice work',
    'Nice work!',
    'Good job',
    'Well done',
    "That's impressive",
    "You're improving",
    "You're amazing!",
  ])('"%s" → casual', (msg) => {
    expect(isCasualMessage(msg)).toBe(true)
    expect(resolve(msg).action).toBe('casual')
  })

  it.each([
    ["You're getting smarter — now tell me how much I spent", 'spending_categories'],
    ['You are getting smarter — now tell me how much I spent.', 'spending_categories'],
    ['Nice work — show me my top 5', 'spending_categories'],
    ['Nice work — now show me my top 5.', 'spending_categories'],
    ["You're smart. How is my budget?", 'budget'],
  ] as const)('"%s" stays financial (%s)', (msg, intent) => {
    expect(isCasualMessage(msg)).toBe(false)
    const r = resolve(msg)
    expect(r.action).toBe('answer')
    expect(stateOf(r).intent).toBe(intent)
  })

  it("You're getting better. What should I cut? → advice, not casual", () => {
    expect(isCasualMessage("You're getting better. What should I cut?")).toBe(false)
    expect(resolve("You're getting better. What should I cut?").action).not.toBe('casual')
  })

  it('fallback reply is short, friendly, and has no financial figures', () => {
    const text = buildCasualFallback('You are getting smarter huh :D')
    expect(text).toBe("Haha, I'm learning! 😄 What would you like to look at next?")
    expect(isAcceptableCasualReply(text)).toBe(true)
    expect(buildCasualFallback('Nice work')).not.toMatch(/₱|\d/)
  })
})

describe('Financial questions with casual words stay financial', () => {
  it('"Thanks — what should I cut?" is an action request, not casual', () => {
    expect(isCasualMessage('Thanks — what should I cut?')).toBe(false)
    const s = stateOf(resolve('Thanks — what should I cut?'))
    expect(s.advice).toBe(true)
    expect(s.intent).toBe('budget')
  })

  it('"Okay, how much did I spend?" is a spending question', () => {
    expect(isCasualMessage('Okay, how much did I spend?')).toBe(false)
    expect(stateOf(resolve('Okay, how much did I spend?')).intent).toBe('spending_categories')
  })

  it('"ok, what about last month?" continues the previous subject', () => {
    const s = stateOf(resolve('ok, what about last month?', { previous: answered({ intent: 'budget' }) }))
    expect(s.intent).toBe('budget')
    expect(s.period).toBe('2026-08-01')
  })
})

describe('Contextual action ("What should I do?")', () => {
  it('inherits the budget context and switches to an action response', () => {
    const prev = answered({ intent: 'budget' })
    const s = stateOf(resolve('What should I do?', { previous: prev }))
    expect(s.intent).toBe('budget')
    expect(s.advice).toBe(true)
    expect(s.period).toBe(PERIOD)
  })

  it('action fallback uses real figures, names contributors, and does not re-dump the summary', () => {
    const text = buildChatFallback({
      message: 'What should I do?',
      context: sampleContext(),
      intent: 'budget',
      advice: true,
    })
    expect(text).toContain('₱5,000 of room left')
    expect(text).toContain('Loan Payment')
    expect(text).toContain('Family Support')
    expect(text).not.toContain('₱50,000') // income not repeated
    expect(text).not.toContain('₱10,000 surplus')
    expect(text.trim().endsWith('?')).toBe(true)
  })

  it('without prior context, "What should I do?" asks what to focus on', () => {
    const r = resolve('What should I do?')
    expect(r.action).toBe('clarify')
  })

  it('advice on a focused goal uses that goal only', () => {
    const prev = answered({ intent: 'goals', entity: { kind: 'goal', name: 'Japan Trip' } })
    const s = stateOf(resolve('what should I do?', { previous: prev }))
    const text = buildChatFallback({
      message: 'what should I do?',
      context: sampleContext(),
      intent: s.intent,
      focus: s.entity,
      advice: s.advice,
    })
    expect(text).toContain('Japan Trip')
    expect(text).not.toContain('Emergency Fund')
  })
})

describe('Natural budget-category language', () => {
  it('"What\'s my least spend on budget bucket?" → lowest-spending category', () => {
    const s = stateOf(resolve("What's my least spend on budget bucket?"))
    expect(s).toMatchObject({ intent: 'spending_categories', sort: 'asc', rank: 1, metric: 'spent' })
  })

  it.each(['Where am I spending the least?', 'Which budget am I spending the least on?', "What's my smallest spending category?"])(
    '"%s" → ascending rank 1',
    (msg) => {
      expect(stateOf(resolve(msg))).toMatchObject({ intent: 'spending_categories', sort: 'asc', rank: 1 })
    }
  )

  it('"Which category has the most room?" → ranked by budget remaining', () => {
    expect(stateOf(resolve('Which category has the most room?'))).toMatchObject({
      intent: 'spending_categories',
      metric: 'room',
      sort: 'desc',
      rank: 1,
    })
  })

  it('room ranking uses real budgets (including unspent budgeted categories)', async () => {
    const r = await spendingFor({
      rank: 1,
      metric: 'room',
      plans: [
        { category: 'Groceries', amount: 15000 },
        { category: 'Utilities', amount: 4500 },
        { category: 'Travel', amount: 3000 },
      ],
    })
    expect(r.categories[0].name).toBe('Groceries')
    const text = buildChatFallback({
      message: 'Which category has the most room?',
      context: sampleContext(),
      intent: 'spending_categories',
      spending: r,
    })
    expect(text).toContain('Groceries: ₱6,000 spent of its ₱15,000 budget, leaving about ₱9,000 (40% used)')
  })

  it('lowest category with a budget reports spent vs budget', async () => {
    const r = await spendingFor({ rank: 1, sort: 'asc', plans: [{ category: 'Hobbies', amount: 2000 }] })
    const text = buildChatFallback({
      message: "What's my least spend on budget bucket?",
      context: sampleContext(),
      intent: 'spending_categories',
      spending: r,
    })
    expect(text).toContain('lowest spending category for September 2026 is Hobbies at ₱1,000')
    expect(text).toContain('against a ₱2,000 budget (50% used)')
  })
})

describe('Financial data honesty', () => {
  it('income total available, source breakdown unavailable → no invented source', () => {
    expect(stateOf(resolve("What's my income source?")).intent).toBe('income')
    const text = buildChatFallback({
      message: "What's my income source?",
      context: sampleContext(),
      intent: 'income',
    })
    expect(text).toContain('₱50,000')
    expect(text).toContain("can't tell you where this income came from")
    expect(text).not.toMatch(/salary|freelance|business|Loan Payment/i)
    expect(selectChatContext(sampleContext(), 'income')).toMatchObject({
      incomeSourceBreakdownAvailable: false,
    })
  })

  it('missing category budget → says so instead of inventing one', async () => {
    const r = await spendingFor({ rank: 1, sort: 'asc' })
    const text = buildChatFallback({
      message: "What's my least spend on budget bucket?",
      context: sampleContext(),
      intent: 'spending_categories',
      spending: r,
    })
    expect(text).toContain("Klaro doesn't have a budget amount set for it")
    expect(text).not.toMatch(/budget \(\d+% used\)/)
  })

  it('no category budgets at all → honest limitation for room questions', async () => {
    const r = await spendingFor({ rank: 1, metric: 'room' })
    const text = buildChatFallback({
      message: 'Which category has the most room?',
      context: sampleContext(),
      intent: 'spending_categories',
      spending: r,
    })
    expect(text).toContain("Klaro doesn't have per-category budget amounts")
  })

  it('missing goal information → honest limitation or clarification', () => {
    const none = stateOf(resolve('How much more do I need?', { goalNames: [] }))
    const text = buildChatFallback({
      message: 'How much more do I need?',
      context: sampleContext({ goals: [] }),
      intent: none.intent,
      focus: none.entity,
    })
    expect(text).toContain("don't have active goals")
    expect(resolve('How much more do I need for my car?').action).toBe('clarify')
  })
})

describe('Ordinal spending requests (rank vs limit)', () => {
  it.each([
    ["What's my largest spending?", 1, 'desc'],
    ["What's my second largest spending?", 2, 'desc'],
    ["What's my third largest spending?", 3, 'desc'],
    ["What's my second biggest expense?", 2, 'desc'],
    ['Which category is my second highest?', 2, 'desc'],
    ["What's my #2 spending category?", 2, 'desc'],
    ["What's the second thing I spend the most on?", 2, 'desc'],
    ["What's my third biggest expense?", 3, 'desc'],
    ["What's my lowest spending?", 1, 'asc'],
    ["What's my lowest spending category?", 1, 'asc'],
    ["What's my second lowest spending?", 2, 'asc'],
    ["What's my second lowest?", 2, 'asc'],
  ] as const)('"%s" → rank %i (%s)', (msg, rank, sort) => {
    const s = stateOf(resolve(msg))
    expect(s).toMatchObject({ intent: 'spending_categories', rank, sort, limit: 1 })
  })

  it('"Give me top 5" / "Give me top 3" are ranges, not ranks', () => {
    const prev = answered({})
    expect(stateOf(resolve('Give me top 5', { previous: prev }))).toMatchObject({ limit: 5, rank: null })
    expect(stateOf(resolve('Give me top 3', { previous: prev }))).toMatchObject({ limit: 3, rank: null })
    expect(stateOf(resolve('Show me my top 5 spending categories'))).toMatchObject({ limit: 5, rank: null })
    expect(parseRank('give me top 5')).toBeNull()
  })

  it('plural list wording stays a range', () => {
    expect(stateOf(resolve('What are my biggest spending categories?'))).toMatchObject({ rank: null, limit: 3 })
  })

  it('ordinals that do not modify a ranking word are ignored', () => {
    expect(parseRank('what did i spend in the first week')).toBeNull()
  })

  it('rank 2 then "What about last month?" keeps rank 2 and changes the period', () => {
    const second = resolve("What's my second largest spending?")
    const s = stateOf(resolve('What about last month?', { previous: second }))
    expect(s).toMatchObject({ intent: 'spending_categories', rank: 2, sort: 'desc', period: '2026-08-01' })
  })

  it('rank 2 then "What about the largest?" → rank 1', () => {
    const second = resolve("What's my second largest spending?")
    expect(stateOf(resolve('What about the largest?', { previous: second }))).toMatchObject({
      intent: 'spending_categories',
      rank: 1,
      sort: 'desc',
    })
  })

  it('"And the third?" after a ranking → rank 3', () => {
    const largest = resolve("What's my largest spending?")
    expect(stateOf(resolve('And the third?', { previous: largest }))).toMatchObject({
      intent: 'spending_categories',
      rank: 3,
      sort: 'desc',
    })
  })

  it('retrieval returns only the requested position', async () => {
    const r = await spendingFor({ rank: 2 })
    expect(r.rank).toBe(2)
    expect(r.categories).toHaveLength(1)
    expect(r.categories[0].name).toBe('Family Support')
    expect(r.totalCategories).toBe(5)

    const asc2 = await spendingFor({ rank: 2, sort: 'asc' })
    expect(asc2.categories[0].name).toBe('Utilities')

    const beyond = await spendingFor({ rank: 9 })
    expect(beyond.categories).toHaveLength(0)
  })

  it('Gemini context carries only the ranked result', async () => {
    const r = await spendingFor({ rank: 2 })
    const compact = selectChatContext(sampleContext(), 'spending_categories', { spending: r })
    expect(compact.requestedRank).toMatchObject({ rank: 2, result: { category: 'Family Support', spent: 10000 } })
    expect(compact.categories).toEqual([])
    expect(JSON.stringify(compact)).not.toContain('Loan Payment')
  })

  it('Gemini unavailable → deterministic ordinal answer (rank only)', async () => {
    const r = await spendingFor({ rank: 2 })
    const text = buildChatFallback({
      message: "What's my second largest spending?",
      context: sampleContext(),
      intent: 'spending_categories',
      spending: r,
    })
    expect(text).toBe(
      'Your second-largest spending category for September 2026 is Family Support at ₱10,000, about 29% of your total expenses.'
    )
    expect(text).not.toContain('Loan Payment')
    expect(text).not.toContain('•')
  })

  it('Gemini incomplete → sanitizer rejects it so the ordinal fallback is used', async () => {
    expect(sanitizeChatText('Your second-largest spending category is Family Support at ₱10,0')).toBeNull()
    expect(service).toContain('sanitizeChatText(fallbackText) ?? fallbackText')
  })

  it('a rank beyond the available categories is stated honestly', async () => {
    const r = await spendingFor({ rank: 9 })
    const text = buildChatFallback({
      message: "What's my ninth largest spending?",
      context: sampleContext(),
      intent: 'spending_categories',
      spending: r,
    })
    expect(text).toContain('Klaro only has 5 categories with recorded spending')
  })

  it('top-N retrieval and fallback remain intact', async () => {
    const agg = aggregateSpendingCategories({ expenseRows: EXPENSES, planRows: [], overrideRows: [], limit: 5 })
    expect(agg.categories.map((c) => c.name)).toEqual([
      'Loan Payment',
      'Family Support',
      'Groceries',
      'Utilities',
      'Hobbies',
    ])
    const r = await spendingFor({ limit: 5 })
    const text = buildChatFallback({
      message: 'Give me top 5',
      context: sampleContext(),
      intent: 'spending_categories',
      spending: r,
    })
    expect(text.match(/^• /gm)).toHaveLength(5)
  })
})
