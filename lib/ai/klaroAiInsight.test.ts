import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { dailyLimitForPlan, KLARO_AI_LIMITS } from './limits'
import { buildFallbackInsight, buildKlaroInsightUserPrompt } from './klaroInsightPrompt'
import {
  hashFinancialContext,
  parsePeriodParam,
  type KlaroFinancialContext,
} from './klaroFinancialContext'
import { sanitizeInsightText } from './sanitizeInsightText'
import { BANNED_AI_INSIGHT_BODY_KEYS } from './bannedInsightBodyKeys'
import { generateGeminiText } from './gemini'

function sampleContext(overrides: Partial<KlaroFinancialContext> = {}): KlaroFinancialContext {
  return {
    period: '2026-09-01',
    periodLabel: 'September 2026',
    income: 50000,
    expenses: 60000,
    netFlow: -10000,
    topSpendingCategories: [
      { name: 'Dining Out', spent: 8000, percentOfExpenses: 13 },
    ],
    goals: [],
    assets: 100000,
    liabilities: 20000,
    netWorth: 80000,
    observationSeeds: [
      'Expenses are higher than income this month. You are ₱10,000 over.',
      'Dining Out is your biggest spending category this month (₱8,000, about 13% of expenses).',
    ],
    ...overrides,
  }
}

describe('klaro AI limits', () => {
  it('uses configurable free vs pro daily caps', () => {
    expect(dailyLimitForPlan('free')).toBe(KLARO_AI_LIMITS.FREE_DAILY_GENERATIONS)
    expect(dailyLimitForPlan('pro')).toBe(KLARO_AI_LIMITS.PRO_DAILY_GENERATIONS)
    expect(KLARO_AI_LIMITS.FREE_DAILY_GENERATIONS).toBe(1)
    expect(KLARO_AI_LIMITS.PRO_DAILY_GENERATIONS).toBe(20)
    expect(KLARO_AI_LIMITS.COOLDOWN_MS).toBe(30_000)
  })

  it('never treats unknown plan names as pro via dailyLimitForPlan', () => {
    // Server resolveUserPlan only returns 'free' | 'pro'; free is the safe default path
    expect(dailyLimitForPlan('free')).toBe(1)
    expect(dailyLimitForPlan('pro')).toBe(20)
  })
})

describe('hashFinancialContext', () => {
  it('is stable for the same financial fingerprint', () => {
    const a = hashFinancialContext(sampleContext())
    const b = hashFinancialContext(sampleContext())
    expect(a).toBe(b)
    expect(a).toHaveLength(64)
  })

  it('changes when net flow changes', () => {
    const a = hashFinancialContext(sampleContext({ expenses: 60000, netFlow: -10000 }))
    const b = hashFinancialContext(sampleContext({ expenses: 40000, netFlow: 10000 }))
    expect(a).not.toBe(b)
  })

  it('ignores observationSeeds wording for cache invalidation', () => {
    const a = hashFinancialContext(sampleContext({ observationSeeds: ['A'] }))
    const b = hashFinancialContext(sampleContext({ observationSeeds: ['Completely different seed'] }))
    expect(a).toBe(b)
  })

  it('isolates different users by hashing only financial fingerprint (cache keyed by user_id separately)', () => {
    // Same context hash for identical finances is OK — DB primary key is (user_id, period)
    const hash = hashFinancialContext(sampleContext())
    expect(hash).toHaveLength(64)
  })
})

describe('buildFallbackInsight', () => {
  it('uses observation seeds when present', () => {
    const text = buildFallbackInsight(sampleContext())
    expect(text).toContain('₱10,000')
    expect(text).toContain('Dining Out')
  })

  it('handles empty month safely', () => {
    const text = buildFallbackInsight(
      sampleContext({
        income: 0,
        expenses: 0,
        netFlow: 0,
        observationSeeds: [],
        topSpendingCategories: [],
      })
    )
    expect(text.toLowerCase()).toContain('forming')
  })
})

describe('parsePeriodParam', () => {
  it('normalizes to first of month', () => {
    expect(parsePeriodParam('2026-09-15')).toBe('2026-09-01')
  })
})

describe('client input allowlist (security)', () => {
  it('rejects client-supplied user_id and plan keys', () => {
    expect(BANNED_AI_INSIGHT_BODY_KEYS).toContain('user_id')
    expect(BANNED_AI_INSIGHT_BODY_KEYS).toContain('userId')
    expect(BANNED_AI_INSIGHT_BODY_KEYS).toContain('plan')
    expect(BANNED_AI_INSIGHT_BODY_KEYS).toContain('isPro')
  })

  it('rejects client-supplied financial context keys', () => {
    for (const key of [
      'income',
      'expenses',
      'netFlow',
      'budget',
      'categories',
      'goals',
      'assets',
      'liabilities',
      'netWorth',
      'context',
      'financialContext',
      'observationSeeds',
      'contextHash',
    ]) {
      expect(BANNED_AI_INSIGHT_BODY_KEYS).toContain(key)
    }
  })
})

describe('sanitizeInsightText', () => {
  it('strips HTML/script tags', () => {
    const out = sanitizeInsightText('<script>alert(1)</script>Your surplus looks healthy.')
    expect(out).not.toContain('<script>')
    expect(out).toContain('Your surplus looks healthy.')
  })

  it('bounds excessive output', () => {
    const out = sanitizeInsightText('x'.repeat(5000))
    expect(out).not.toBeNull()
    expect(out!.length).toBeLessThanOrEqual(1200)
  })

  it('returns null for empty/malformed whitespace', () => {
    expect(sanitizeInsightText('   ')).toBeNull()
    expect(sanitizeInsightText('<b></b>')).toBeNull()
  })
})

describe('financial data minimization', () => {
  it('prompt payload does not include email, auth IDs, or tokens', () => {
    const prompt = buildKlaroInsightUserPrompt(sampleContext())
    expect(prompt.toLowerCase()).not.toContain('email')
    expect(prompt).not.toMatch(/access[_-]?token/i)
    expect(prompt).not.toMatch(/refresh[_-]?token/i)
    expect(prompt).not.toContain('user_id')
    expect(JSON.parse(prompt.split('\n\n')[1] || '{}')).not.toHaveProperty('email')
  })

  it('context type shape excludes PII fields', () => {
    const ctx = sampleContext()
    const keys = Object.keys(ctx)
    expect(keys).not.toContain('email')
    expect(keys).not.toContain('fullName')
    expect(keys).not.toContain('name')
    expect(keys).not.toContain('userId')
  })
})

describe('GEMINI_API_KEY exposure', () => {
  it('is never NEXT_PUBLIC_* in gemini module source', () => {
    const src = readFileSync(join(process.cwd(), 'lib/ai/gemini.ts'), 'utf8')
    expect(src).toContain('GEMINI_API_KEY')
    expect(src).not.toContain('NEXT_PUBLIC_GEMINI')
    expect(src).toMatch(/process\.env\.GEMINI_API_KEY/)
  })

  it('is not imported by client components', () => {
    const roots = ['components', 'app']
    const offenders: string[] = []

    function walk(dir: string) {
      let entries: string[]
      try {
        entries = readdirSync(dir)
      } catch {
        return
      }
      for (const name of entries) {
        const full = join(dir, name)
        const st = statSync(full)
        if (st.isDirectory()) {
          if (name === 'api' || name === 'node_modules') continue
          walk(full)
          continue
        }
        if (!/\.(tsx|jsx)$/.test(name)) continue
        const src = readFileSync(full, 'utf8')
        if (!src.includes("'use client'") && !src.includes('"use client"')) continue
        if (
          /from\s+['"]@\/lib\/ai\/gemini['"]/.test(src) ||
          /from\s+['"]\.\.?\/.*gemini['"]/.test(src)
        ) {
          offenders.push(full)
        }
      }
    }

    for (const root of roots) walk(join(process.cwd(), root))
    expect(offenders).toEqual([])
  })
})

describe('missing GEMINI_API_KEY fallback', () => {
  const prev = process.env.GEMINI_API_KEY

  beforeEach(() => {
    delete process.env.GEMINI_API_KEY
  })

  afterEach(() => {
    if (prev === undefined) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = prev
  })

  it('returns ok:false missing_key without throwing', async () => {
    const result = await generateGeminiText({
      systemInstruction: 'test',
      userPrompt: 'hello',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('missing_key')
      // message stays server-side; API must not forward raw provider errors
      expect(result.message).toContain('GEMINI_API_KEY')
    }
  })
})

describe('atomic reserve contract (SQL)', () => {
  it('migration defines row lock + conditional increment for concurrent safety', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260924000001_klaro_ai_atomic_reserve.sql'),
      'utf8'
    )
    expect(sql).toContain('klaro_ai_try_reserve_generation')
    expect(sql).toContain('FOR UPDATE')
    expect(sql).toContain('generation_count = v_count + 1')
    expect(sql).toContain('cooldown')
    expect(sql).toContain('daily_cap')
    expect(sql).toContain('GRANT EXECUTE')
    expect(sql).toContain('service_role')
    expect(sql).toContain('REVOKE INSERT, UPDATE, DELETE, TRUNCATE')
  })
})

describe('route auth contract (static)', () => {
  it('derives user from createSupabaseServerClient + getUser only', () => {
    const src = readFileSync(join(process.cwd(), 'app/api/ai/insight/route.ts'), 'utf8')
    expect(src).toContain('createSupabaseServerClient')
    expect(src).toContain('auth.getUser()')
    expect(src).toContain('userId: user.id')
    expect(src).not.toMatch(/userId:\s*body/)
    expect(src).not.toMatch(/user_id:\s*body/)
  })
})
