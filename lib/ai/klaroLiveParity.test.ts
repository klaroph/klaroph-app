/**
 * Live/test parity: drives the real askKlaro service (resolver → context → fallback → persistence)
 * with the exact strings typed in the live UI. Only external edges are faked: Supabase clients,
 * plan lookup, and Gemini (forced to fail, matching the live 503 outage).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const h = vi.hoisted(() => {
  const db = {
    messages: [] as Array<Record<string, unknown>>,
    adminWrites: [] as string[],
    userReads: [] as string[],
    contextBuilds: 0,
    clock: 0,
  }

  function adminFrom(table: string) {
    let op: 'select' | 'insert' | 'update' = 'select'
    let payload: Record<string, unknown> | null = null
    let limit = Infinity
    const b: Record<string, unknown> = {}
    const chain = () => b
    Object.assign(b, {
      select: chain,
      eq: chain,
      order: chain,
      maybeSingle: chain,
      single: chain,
      limit: (n: number) => ((limit = n), b),
      insert: (row: Record<string, unknown>) => ((op = 'insert'), (payload = row), b),
      update: () => ((op = 'update'), b),
      then: (resolve: (v: unknown) => unknown) => {
        if (op !== 'select') db.adminWrites.push(table)
        if (table === 'klaro_ai_conversations') {
          return resolve({ data: { id: 'conv-1', user_id: 'user-a', title: 't' }, error: null })
        }
        if (table === 'klaro_ai_messages') {
          if (op === 'insert') {
            db.messages.push({ ...payload, created_at: new Date(Date.UTC(2026, 8, 25, 0, 0, db.clock++)).toISOString() })
            return resolve({ data: null, error: null })
          }
          return resolve({ data: [...db.messages].reverse().slice(0, limit), error: null })
        }
        return resolve({ data: null, error: null })
      },
    })
    return b
  }

  return { db, adminFrom }
})

vi.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: (t: string) => h.adminFrom(t),
    rpc: async () => ({ data: { allowed: true, reason: null, generation_count: 1 }, error: null }),
  },
}))
vi.mock('@/lib/resolveUserPlan', () => ({ resolveUserPlan: async () => ({ plan_name: 'pro' }) }))
vi.mock('@/lib/ai/gemini', () => ({
  generateGeminiText: async () => ({ ok: false, reason: 'api_error', message: '503 UNAVAILABLE' }),
  getGeminiModelName: () => 'test-model',
}))
vi.mock('@/lib/ai/klaroFinancialContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/klaroFinancialContext')>()
  return {
    ...actual,
    buildKlaroFinancialContext: async (_s: unknown, _u: string, period: string) => {
      h.db.contextBuilds++
      return {
        contextHash: 'x',
        context: {
          period,
          periodLabel: 'September 2026',
          income: 263548,
          expenses: 161322,
          netFlow: 102226,
          budget: { amount: 146583, spent: 161322, remaining: -14739, usedPercent: 110 },
          topSpendingCategories: [
            { name: 'Loan Payment', spent: 71668, budget: 70000, percentOfExpenses: 44 },
            { name: 'Family Support', spent: 24500, percentOfExpenses: 15 },
            { name: 'Groceries', spent: 22923, percentOfExpenses: 14 },
          ],
          goals: [{ name: 'Emergency Fund', targetAmount: 100000, currentAmount: 7000, progressPercent: 7 }],
          assets: 0,
          liabilities: 0,
          netWorth: 0,
          observationSeeds: [],
        },
      }
    },
  }
})

import { askKlaro } from './klaroChatService'

/** User-scoped client (RLS) — read-only fake that records which tables were read. */
function userSupabase(): SupabaseClient {
  const rows: Record<string, unknown[]> = {
    goals: [{ name: 'Emergency Fund' }],
    expenses: [
      { category: 'Loan Payment', amount: 71668 },
      { category: 'Family Support', amount: 24500 },
      { category: 'Groceries', amount: 22923 },
    ],
    budget_plans: [{ category: 'Loan Payment', amount: 70000 }],
    budget_overrides: [],
  }
  return {
    from(table: string) {
      h.db.userReads.push(table)
      const b: Record<string, unknown> = {}
      const chain = () => b
      Object.assign(b, {
        select: chain,
        eq: chain,
        gte: chain,
        lt: chain,
        order: chain,
        limit: chain,
        then: (resolve: (v: unknown) => unknown) => resolve({ data: rows[table] ?? [], error: null }),
      })
      return b
    },
  } as unknown as SupabaseClient
}

async function send(message: string, conversationId: string | null = 'conv-1') {
  const r = await askKlaro({ userId: 'user-a', supabase: userSupabase(), message, conversationId })
  if (!r.success) throw new Error(`askKlaro failed: ${r.code}`)
  return r
}

function lastAssistantState() {
  const a = [...h.db.messages].reverse().find((m) => m.role === 'assistant')
  return a?.resolved_state as Record<string, unknown> | null
}

beforeEach(() => {
  h.db.messages = []
  h.db.adminWrites = []
  h.db.userReads = []
  h.db.contextBuilds = 0
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

describe('Live parity — exact UI strings through askKlaro (Gemini down)', () => {
  it('"Hello" → greeting, no financial reads, no context built', async () => {
    const r = await send('Hello', null)
    expect(r.message).toBe("Hi! 👋 I'm Klaro, your personal financial assistant. What would you like to look at?")
    expect(r.message).not.toMatch(/₱|September|budget/)
    expect(h.db.contextBuilds).toBe(0)
    expect(h.db.userReads).toEqual([])
  })

  it('"Whats your name?" → identity reply, no financial reads', async () => {
    const r = await send('Whats your name?')
    expect(r.message).toContain("I'm Klaro")
    expect(h.db.userReads).toEqual([])
  })

  it('exact live typo loan message → asks for missing rate + term, no budget summary', async () => {
    await send('Hello', null)
    const r = await send('I am takingout a lon for 200000 how much will my monthly budget be considering theat?')
    expect(r.message).toContain('I can estimate that loan')
    expect(r.message).toContain('the interest rate')
    expect(r.message).toContain('how many months')
    expect(r.message).not.toMatch(/110%|Family Support|Groceries/)
    expect(h.db.contextBuilds).toBe(0)
    expect(lastAssistantState()).toMatchObject({
      action: 'clarify',
      reason: 'loan_details',
      pendingState: { loan: { principal: 200000, annualRatePercent: null, termMonths: null } },
    })
  })

  it('reported loan string → loan clarification (the word "budget" does not win)', async () => {
    const r = await send("I'm taking out a loan for 20000 how much will my monthly budget be considering that?", null)
    expect(r.message).toContain('I can estimate that loan')
    expect(r.message).not.toContain('110%')
  })

  it('"…at 36% per annum. How much will that be monthly?" → asks only for the term', async () => {
    const r = await send("I'm taking out a loan for 20000 at 36% per annum. How much will that be monthly?", null)
    expect(r.message).toContain('how many months')
    expect(r.message).not.toContain('interest rate')
  })

  it('full live chain: loan → "20,000 at 36%" → "12 months" → "What about 24 months?"', async () => {
    await send('Hello', null)
    await send('I am takingout a lon for 200000 how much will my monthly budget be considering theat?')

    const rate = await send('20,000 at 36%')
    expect(rate.message).toContain('how many months')
    expect(rate.message).not.toContain('interest rate')
    expect(h.db.contextBuilds).toBe(0)

    const twelve = await send('12 months')
    expect(twelve.message).toContain('This is an estimate')
    expect(twelve.message).toContain('₱20,000 at 36% a year over 12 months')
    expect(twelve.message).toContain('about ₱2,009 a month')
    expect(twelve.message).toContain('Loan Payment is at ₱71,668')
    expect(twelve.message).toContain('against a ₱70,000 budget')
    expect(twelve.message).toContain('already about ₱14,739 over')
    expect(twelve.message).toContain('put you about ₱16,748 over')
    expect(twelve.message).toContain("wasn't changed")
    expect(h.db.contextBuilds).toBe(1)

    const longer = await send('What about 24 months?')
    expect(longer.message).toContain('over 24 months')
    expect(longer.message).toContain('about ₱1,181 a month')
    expect(lastAssistantState()).toMatchObject({
      action: 'answer',
      state: { intent: 'loan', loan: { principal: 20000, annualRatePercent: 36, termMonths: 24 } },
    })
  })

  it.each(['12', '1 year'])('reply "%s" after the rate is known completes the estimate', async (reply) => {
    await send("I'm taking out a loan for 20000 at 36% per annum. How much will that be monthly?", null)
    const r = await send(reply)
    expect(r.message).toContain('about ₱2,009 a month')
  })

  it('loan estimates never write financial records', async () => {
    await send("I'm taking out a loan for 20000 at 36% per annum. How much will that be monthly?", null)
    await send('12 months')
    expect(new Set(h.db.adminWrites)).toEqual(new Set(['klaro_ai_conversations', 'klaro_ai_messages']))
    expect(h.db.userReads.every((t) => ['goals', 'expenses', 'budget_plans', 'budget_overrides'].includes(t))).toBe(true)
  })
})
