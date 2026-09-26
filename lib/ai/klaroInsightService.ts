/**
 * Klaro Insight orchestration: cache → atomic reserve → Gemini → fallback.
 * Server-only. Uses supabaseAdmin for cache/usage after caller authenticates.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveUserPlan } from '@/lib/resolveUserPlan'
import { dailyLimitForPlan, KLARO_AI_LIMITS } from '@/lib/ai/limits'
import { generateGeminiText } from '@/lib/ai/gemini'
import {
  buildKlaroFinancialContext,
  parsePeriodParam,
  type KlaroFinancialContext,
} from '@/lib/ai/klaroFinancialContext'
import {
  buildFallbackInsight,
  buildKlaroInsightUserPrompt,
  KLARO_INSIGHT_SYSTEM_INSTRUCTION,
} from '@/lib/ai/klaroInsightPrompt'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sanitizeInsightText } from '@/lib/ai/sanitizeInsightText'

export type KlaroInsightSource = 'gemini' | 'fallback' | 'cache'

export type KlaroInsightResult = {
  success: true
  insight: string
  source: KlaroInsightSource
  cached: boolean
  period: string
  dailyRemaining?: number
}

export type KlaroInsightError = {
  success: false
  error: string
  code: 'unauthorized' | 'rate_limited' | 'cooldown' | 'server_error'
  retryAfterSeconds?: number
}

type ReserveResult = {
  allowed: boolean
  reason: 'cooldown' | 'daily_cap' | 'invalid_user' | null
  generation_count: number
  retry_after_seconds: number | null
}

export { sanitizeInsightText } from '@/lib/ai/sanitizeInsightText'

async function readCache(userId: string, period: string, contextHash: string) {
  const { data, error } = await supabaseAdmin
    .from('klaro_ai_insights')
    .select('insight_text, source, context_hash')
    .eq('user_id', userId)
    .eq('period', period)
    .maybeSingle()

  if (error) {
    console.error('[klaro-ai] cache_read_error', { message: error.message })
    return null
  }
  if (!data) return null
  if (data.context_hash !== contextHash) {
    console.info('[klaro-ai] cache_miss', { reason: 'hash_changed' })
    return null
  }
  const insight = sanitizeInsightText(String(data.insight_text))
  if (!insight) return null
  console.info('[klaro-ai] cache_hit')
  return {
    insight,
    source: (data.source === 'gemini' ? 'gemini' : 'fallback') as 'gemini' | 'fallback',
  }
}

async function writeCache(
  userId: string,
  period: string,
  contextHash: string,
  insightText: string,
  source: 'gemini' | 'fallback'
) {
  const safe = sanitizeInsightText(insightText)
  if (!safe) return
  const now = new Date().toISOString()
  const { error } = await supabaseAdmin.from('klaro_ai_insights').upsert(
    {
      user_id: userId,
      period,
      context_hash: contextHash,
      insight_text: safe,
      source,
      updated_at: now,
    },
    { onConflict: 'user_id,period' }
  )
  if (error) {
    console.error('[klaro-ai] cache_write_error', { message: error.message })
  }
}

async function readCacheAny(userId: string, period: string) {
  const { data } = await supabaseAdmin
    .from('klaro_ai_insights')
    .select('insight_text, source')
    .eq('user_id', userId)
    .eq('period', period)
    .maybeSingle()
  if (!data?.insight_text) return null
  const insight = sanitizeInsightText(String(data.insight_text))
  if (!insight) return null
  return {
    insight,
    source: data.source as string,
  }
}

/**
 * Atomically reserve one generation under daily cap + cooldown.
 * Must run via service role (SECURITY DEFINER RPC).
 */
export async function tryReserveGeneration(
  userId: string,
  dailyLimit: number
): Promise<ReserveResult> {
  const cooldownSeconds = Math.ceil(KLARO_AI_LIMITS.COOLDOWN_MS / 1000)
  const { data, error } = await supabaseAdmin.rpc('klaro_ai_try_reserve_generation', {
    p_user_id: userId,
    p_daily_limit: dailyLimit,
    p_cooldown_seconds: cooldownSeconds,
    p_feature: 'insight',
  })

  if (error) {
    console.error('[klaro-ai] reserve_rpc_error', { message: error.message })
    // Fail closed for generation (do not call Gemini without a reserved slot)
    return {
      allowed: false,
      reason: 'daily_cap',
      generation_count: dailyLimit,
      retry_after_seconds: null,
    }
  }

  const row = (data ?? {}) as Record<string, unknown>
  const reasonRaw = row.reason
  const reason =
    reasonRaw === 'cooldown' || reasonRaw === 'daily_cap' || reasonRaw === 'invalid_user'
      ? reasonRaw
      : null

  return {
    allowed: row.allowed === true,
    reason,
    generation_count: Number(row.generation_count) || 0,
    retry_after_seconds:
      row.retry_after_seconds == null ? null : Number(row.retry_after_seconds) || null,
  }
}

/**
 * Generate or return cached Klaro Insight for an authenticated user.
 * Caller must already have verified auth and pass user-scoped supabase for data reads.
 * userId MUST come from auth.getUser() — never from the client body.
 */
export async function getKlaroInsight(params: {
  userId: string
  supabase: SupabaseClient
  periodInput?: unknown
  forceRefresh?: boolean
}): Promise<KlaroInsightResult | KlaroInsightError> {
  try {
    console.info('[KLARO AI] request started')
    if (!params.userId) {
      return { success: false, error: 'Unauthorized', code: 'unauthorized' }
    }
    console.info('[KLARO AI] authenticated: true')

    const period = parsePeriodParam(params.periodInput)
    const { context, contextHash } = await buildKlaroFinancialContext(
      params.supabase,
      params.userId,
      period
    )
    console.info('[KLARO AI] context built: true')

    if (!params.forceRefresh) {
      const cached = await readCache(params.userId, period, contextHash)
      if (cached) {
        console.info('[KLARO AI] cache hit/miss', { hit: true })
        console.info('[KLARO AI] Gemini attempted: false')
        console.info('[KLARO AI] fallback used: false')
        console.info('[KLARO AI] response insight length:', cached.insight.length)
        return {
          success: true,
          insight: cached.insight,
          source: 'cache',
          cached: true,
          period,
        }
      }
      console.info('[KLARO AI] cache hit/miss', { hit: false })
    } else {
      console.info('[KLARO AI] cache hit/miss', { hit: false, forceRefresh: true })
    }

    const plan = await resolveUserPlan(params.userId)
    const dailyLimit = dailyLimitForPlan(plan.plan_name)
    const reserve = await tryReserveGeneration(params.userId, dailyLimit)
    console.info('[KLARO AI] reservation:', reserve.allowed ? 'allowed' : 'denied')

    if (!reserve.allowed) {
      console.info('[klaro-ai] rate_limit_rejection', {
        reason: reserve.reason,
        plan: plan.plan_name,
      })

      const stale = await readCacheAny(params.userId, period)
      if (stale) {
        console.info('[KLARO AI] Gemini attempted: false')
        console.info('[KLARO AI] fallback used: false')
        console.info('[KLARO AI] response insight length:', stale.insight.length)
        return {
          success: true,
          insight: stale.insight,
          source: 'cache',
          cached: true,
          period,
          dailyRemaining: Math.max(0, dailyLimit - reserve.generation_count),
        }
      }

      if (reserve.reason === 'cooldown') {
        console.info('[KLARO AI] Gemini attempted: false')
        console.info('[KLARO AI] fallback used: false')
        console.info('[KLARO AI] response insight length: 0')
        return {
          success: false,
          error: 'Please wait a moment before generating another insight.',
          code: 'cooldown',
          retryAfterSeconds: reserve.retry_after_seconds ?? undefined,
        }
      }

      // Daily cap with no cache: deterministic fallback only (no Gemini, no extra increment)
      const fallback = sanitizeInsightText(buildFallbackInsight(context)) ?? buildFallbackInsight(context)
      await writeCache(params.userId, period, contextHash, fallback, 'fallback')
      console.info('[KLARO AI] Gemini attempted: false')
      console.info('[KLARO AI] fallback used: true')
      console.info('[KLARO AI] response insight length:', fallback.length)
      return {
        success: true,
        insight: fallback,
        source: 'fallback',
        cached: false,
        period,
        dailyRemaining: 0,
      }
    }

    // Slot reserved — call Gemini (or fall back). Slot is consumed either way.
    console.info('[KLARO AI] Gemini attempted: true')
    const gemini = await generateGeminiText({
      systemInstruction: KLARO_INSIGHT_SYSTEM_INSTRUCTION,
      userPrompt: buildKlaroInsightUserPrompt(context),
    })

    if (gemini.ok) {
      const safe = sanitizeInsightText(gemini.text)
      if (safe) {
        await writeCache(params.userId, period, contextHash, safe, 'gemini')
        console.info('[KLARO AI] Gemini result: received')
        console.info('[KLARO AI] fallback used: false')
        console.info('[KLARO AI] response insight length:', safe.length)
        return {
          success: true,
          insight: safe,
          source: 'gemini',
          cached: false,
          period,
          dailyRemaining: Math.max(0, dailyLimit - reserve.generation_count),
        }
      }
      console.info('[KLARO AI] Gemini result: empty')
    } else {
      console.info('[KLARO AI] Gemini result: error')
      console.info('[klaro-ai] fallback_usage', { reason: gemini.reason })
    }

    const fallback = sanitizeInsightText(buildFallbackInsight(context)) ?? buildFallbackInsight(context)
    await writeCache(params.userId, period, contextHash, fallback, 'fallback')
    console.info('[KLARO AI] fallback used: true')
    console.info('[KLARO AI] response insight length:', fallback.length)
    return {
      success: true,
      insight: fallback,
      source: 'fallback',
      cached: false,
      period,
      dailyRemaining: Math.max(0, dailyLimit - reserve.generation_count),
    }
  } catch (err) {
    console.error('[klaro-ai] server_error', {
      message: err instanceof Error ? err.message.slice(0, 200) : 'unknown',
    })
    return {
      success: false,
      error: 'Something went wrong generating your insight.',
      code: 'server_error',
    }
  }
}

/** Exported for tests — pure fallback builder */
export function fallbackFromContext(context: KlaroFinancialContext): string {
  return buildFallbackInsight(context)
}
