/**
 * Ask Klaro orchestration: ownership → reserve → history → resolve (answer | clarify | casual)
 * → context (answer only) → Gemini → fallback.
 * Server-only. supabaseAdmin writes always scoped to authenticated userId.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveUserPlan } from '@/lib/resolveUserPlan'
import { generateGeminiText } from '@/lib/ai/gemini'
import {
  buildKlaroFinancialContext,
  parsePeriodParam,
  type KlaroFinancialContext,
} from '@/lib/ai/klaroFinancialContext'
import { buildLoanScenario, LOAN_CATEGORY, type LoanScenario } from '@/lib/ai/klaroLoanScenario'
import { sanitizeChatText } from '@/lib/ai/sanitizeChatText'
import {
  chatCooldownMsForPlan,
  chatDailyLimitForPlan,
  KLARO_AI_CHAT_LIMITS,
} from '@/lib/ai/chatLimits'
import { selectChatContext } from '@/lib/ai/klaroChatIntent'
import {
  isCasualMessage,
  parseStoredResolution,
  resolveDialogue,
  type DialogueResolution,
  type DialogueState,
} from '@/lib/ai/klaroDialogueResolver'
import {
  buildCasualFallback,
  buildCasualUserPrompt,
  isAcceptableCasualReply,
} from '@/lib/ai/klaroChatCasual'
import {
  buildClarifyFallback,
  buildClarifyUserPrompt,
  isAcceptableClarification,
} from '@/lib/ai/klaroChatClarify'
import { getGoalNames, getSpendingCategories, SPENDING_LIMIT_MAX } from '@/lib/ai/klaroChatTools'
import {
  buildKlaroChatUserPrompt,
  KLARO_CHAT_SYSTEM_INSTRUCTION,
  type ChatHistoryTurn,
} from '@/lib/ai/klaroChatPrompt'
import { validateChatMessage } from '@/lib/ai/validateChatMessage'
import { buildChatFallback, computeSimpleScenario } from '@/lib/ai/klaroChatFallback'
import { buildCashFlowTimingAggregates } from '@/lib/ai/klaroCashFlowTiming'
import { buildGoalRunwayChatContext } from '@/lib/ai/klaroGoalRunwayContext'
import { toLocalDateString, parseLocalDateString } from '@/lib/format'
import type { SupabaseClient } from '@supabase/supabase-js'

export type KlaroChatSource = 'gemini' | 'fallback'

export type KlaroChatResult = {
  success: true
  conversationId: string
  message: string
  source: KlaroChatSource
  dailyRemaining?: number
}

export type KlaroChatError = {
  success: false
  error: string
  code: 'unauthorized' | 'validation' | 'forbidden' | 'rate_limited' | 'cooldown' | 'server_error'
  retryAfterSeconds?: number
}

type ReserveResult = {
  allowed: boolean
  reason: 'cooldown' | 'daily_cap' | 'invalid_user' | null
  generation_count: number
  retry_after_seconds: number | null
}

function previousMonthFirst(periodFirst: string): string {
  const d = parseLocalDateString(periodFirst)
  return toLocalDateString(new Date(d.getFullYear(), d.getMonth() - 1, 1))
}

export async function tryReserveChatGeneration(
  userId: string,
  dailyLimit: number,
  cooldownMs: number
): Promise<ReserveResult> {
  const cooldownSeconds = Math.ceil(cooldownMs / 1000)
  const { data, error } = await supabaseAdmin.rpc('klaro_ai_try_reserve_generation', {
    p_user_id: userId,
    p_daily_limit: dailyLimit,
    p_cooldown_seconds: cooldownSeconds,
    p_feature: 'chat',
  })

  if (error) {
    console.error('[klaro-chat] reserve_rpc_error', { message: error.message })
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

async function getOwnedConversation(conversationId: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from('klaro_ai_conversations')
    .select('id, user_id, title')
    .eq('id', conversationId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error('[klaro-chat] conversation_read_error', { message: error.message })
    return null
  }
  return data
}

async function createConversation(userId: string, title: string | null) {
  const { data, error } = await supabaseAdmin
    .from('klaro_ai_conversations')
    .insert({
      user_id: userId,
      title,
      updated_at: new Date().toISOString(),
    })
    .select('id, user_id, title')
    .single()

  if (error || !data) {
    console.error('[klaro-chat] conversation_create_error', { message: error?.message })
    return null
  }
  return data
}

/** Recent turns plus the server-written resolution of the latest assistant turn. */
async function loadHistory(
  conversationId: string,
  userId: string
): Promise<{ history: ChatHistoryTurn[]; previous: DialogueResolution | null }> {
  const { data, error } = await supabaseAdmin
    .from('klaro_ai_messages')
    .select('role, content, resolved_state, created_at')
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(KLARO_AI_CHAT_LIMITS.HISTORY_WINDOW)

  if (error) {
    console.error('[klaro-chat] history_read_error', { message: error.message })
    return { history: [], previous: null }
  }

  const latestAssistant = (data ?? []).find((r) => r.role === 'assistant')
  const previous = latestAssistant ? parseStoredResolution(latestAssistant.resolved_state) : null

  const history = (data ?? []).reverse().map((r) => ({
    role: r.role === 'assistant' ? ('assistant' as const) : ('user' as const),
    content: String(r.content),
  }))
  return { history, previous }
}

async function persistMessage(params: {
  conversationId: string
  userId: string
  role: 'user' | 'assistant'
  content: string
  source?: 'gemini' | 'fallback' | null
  resolvedState?: DialogueResolution | null
}) {
  const { error } = await supabaseAdmin.from('klaro_ai_messages').insert({
    conversation_id: params.conversationId,
    user_id: params.userId,
    role: params.role,
    content: params.content,
    source: params.role === 'assistant' ? params.source ?? null : null,
    resolved_state: params.role === 'assistant' ? params.resolvedState ?? null : null,
  })
  if (error) {
    console.error('[klaro-chat] message_write_error', { message: error.message })
  }

  await supabaseAdmin
    .from('klaro_ai_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', params.conversationId)
    .eq('user_id', params.userId)
}

function titleFromMessage(message: string): string {
  const t = message.trim().replace(/\s+/g, ' ')
  return t.length <= 60 ? t : `${t.slice(0, 57)}...`
}

type TurnOutput = {
  reply: string
  source: KlaroChatSource
  generatedLength: number
  sanitizedLength: number
}

/** Gemini text if it passes sanitize + accept, otherwise the deterministic fallback. */
function settleReply(
  gemini: Awaited<ReturnType<typeof generateGeminiText>>,
  fallbackText: string,
  accept: (text: string) => boolean = () => true
): TurnOutput {
  if (gemini.ok) {
    const safe = sanitizeChatText(gemini.text)
    if (safe && accept(safe)) {
      return {
        reply: safe,
        source: 'gemini',
        generatedLength: gemini.text.length,
        sanitizedLength: safe.length,
      }
    }
  } else {
    console.info('[klaro-chat] fallback_usage', { reason: gemini.reason })
  }
  return {
    reply: sanitizeChatText(fallbackText) ?? fallbackText,
    source: 'fallback',
    generatedLength: gemini.ok ? gemini.text.length : 0,
    sanitizedLength: 0,
  }
}

async function runClarifyTurn(
  message: string,
  resolution: Extract<DialogueResolution, { action: 'clarify' }>
): Promise<TurnOutput> {
  const gemini = await generateGeminiText({
    systemInstruction: KLARO_CHAT_SYSTEM_INSTRUCTION,
    userPrompt: buildClarifyUserPrompt({
      message,
      reason: resolution.reason,
      choices: resolution.choices,
    }),
    maxOutputTokens: KLARO_AI_CHAT_LIMITS.MAX_OUTPUT_TOKENS,
  })
  return settleReply(
    gemini,
    buildClarifyFallback(resolution.reason, resolution.choices),
    (text) => isAcceptableClarification(text, resolution.reason, resolution.choices)
  )
}

async function runCasualTurn(message: string): Promise<TurnOutput> {
  const gemini = await generateGeminiText({
    systemInstruction: KLARO_CHAT_SYSTEM_INSTRUCTION,
    userPrompt: buildCasualUserPrompt(message),
    maxOutputTokens: KLARO_AI_CHAT_LIMITS.MAX_OUTPUT_TOKENS,
  })
  return settleReply(gemini, buildCasualFallback(message), isAcceptableCasualReply)
}

/** Loan estimate from the resolved terms plus the user's real Loan Payment category for the period. */
async function buildLoanScenarioForUser(
  supabase: SupabaseClient,
  userId: string,
  state: DialogueState,
  context: KlaroFinancialContext
): Promise<LoanScenario | null> {
  const t = state.loan
  if (!t || t.principal == null || t.annualRatePercent == null || t.termMonths == null) return null
  const categories = await getSpendingCategories({
    supabase,
    userId,
    period: state.period,
    limit: SPENDING_LIMIT_MAX,
  })
  return buildLoanScenario({
    terms: { principal: t.principal, annualRatePercent: t.annualRatePercent, termMonths: t.termMonths },
    context,
    loanCategory: categories.categories.find((c) => c.name === LOAN_CATEGORY) ?? null,
  })
}

async function runAnswerTurn(params: {
  supabase: SupabaseClient
  userId: string
  message: string
  history: ChatHistoryTurn[]
  state: DialogueState
}): Promise<TurnOutput> {
  const { supabase, userId, message, history, state } = params
  const intent = state.intent
  const period = state.period

  const { context } = await buildKlaroFinancialContext(supabase, userId, period)

  const previous =
    intent === 'period_comparison'
      ? (await buildKlaroFinancialContext(supabase, userId, previousMonthFirst(period))).context
      : null

  const loanScenario =
    intent === 'loan' ? await buildLoanScenarioForUser(supabase, userId, state, context) : null

  const spending =
    intent === 'spending_categories'
      ? await getSpendingCategories({
          supabase,
          userId,
          period,
          limit: state.entity?.kind === 'category' ? SPENDING_LIMIT_MAX : state.limit,
          rank: state.entity ? null : state.rank,
          sort: state.sort,
          metric: state.metric,
        })
      : null

  const cashFlowTiming =
    intent === 'cash_flow_timing'
      ? await buildCashFlowTimingAggregates(supabase, userId, period)
      : null

  const goalRunways = intent === 'goals' ? await buildGoalRunwayChatContext(supabase, userId) : null

  const scenario = intent === 'loan' ? null : computeSimpleScenario({ message, context, history })
  const compact = selectChatContext(context, intent, {
    previousPeriod: previous,
    scenarioNote: scenario?.note,
    cashFlowTiming,
    goalRunways,
    scenarioProjections: scenario?.projections ?? null,
    spending,
    focus: state.entity,
    loanScenario,
  })
  if (scenario?.projections) {
    compact.klaroCalculatedScenario = scenario.projections
  }
  const ranking = intent === 'spending_categories' && !state.entity
  compact.resolvedOperation = {
    topic: intent,
    period: context.periodLabel,
    ...(ranking
      ? {
          ...(state.rank != null ? { rank: state.rank } : { limit: state.limit }),
          order: state.sort === 'asc' ? 'smallest first' : 'largest first',
          rankedBy: state.metric === 'room' ? 'budget remaining' : 'amount spent',
        }
      : {}),
    ...(state.entity ? { focus: state.entity.name } : {}),
    ...(state.advice ? { responseStyle: 'action' } : {}),
  }

  const gemini = await generateGeminiText({
    systemInstruction: KLARO_CHAT_SYSTEM_INSTRUCTION,
    userPrompt: buildKlaroChatUserPrompt({ message, context: compact, history, intent }),
    maxOutputTokens: KLARO_AI_CHAT_LIMITS.MAX_OUTPUT_TOKENS,
  })

  const fallbackText = buildChatFallback({
    message,
    context,
    intent,
    cashFlowTiming,
    goalRunways,
    previousPeriod: previous,
    scenarioProjections: scenario?.projections ?? null,
    spending,
    focus: state.entity,
    advice: state.advice,
    loanScenario,
  })

  const turn = settleReply(gemini, fallbackText)
  if (scenario?.note && !turn.reply.includes('scenario') && !turn.reply.includes('not changed')) {
    turn.reply = `${turn.reply} ${scenario.note}`
  }
  return turn
}

/**
 * Ask Klaro turn. userId MUST come from auth.getUser() — never from the client body.
 */
export async function askKlaro(params: {
  userId: string
  supabase: SupabaseClient
  message: unknown
  conversationId?: string | null
  periodInput?: unknown
}): Promise<KlaroChatResult | KlaroChatError> {
  try {
    if (!params.userId) {
      return { success: false, error: 'Unauthorized', code: 'unauthorized' }
    }

    const validated = validateChatMessage(params.message)
    if (!validated.ok) {
      return { success: false, error: validated.error, code: 'validation' }
    }
    const message = validated.message

    let conversationId = params.conversationId?.trim() || null
    if (conversationId) {
      const owned = await getOwnedConversation(conversationId, params.userId)
      if (!owned) {
        return {
          success: false,
          error: 'Conversation not found.',
          code: 'forbidden',
        }
      }
    } else {
      const created = await createConversation(params.userId, titleFromMessage(message))
      if (!created) {
        return {
          success: false,
          error: 'Could not start conversation.',
          code: 'server_error',
        }
      }
      conversationId = created.id
    }

    // Narrowed: always set after create/ownership checks above
    const activeConversationId = conversationId as string

    const plan = await resolveUserPlan(params.userId)
    const dailyLimit = chatDailyLimitForPlan(plan.plan_name)
    const cooldownMs = chatCooldownMsForPlan(plan.plan_name)
    const reserve = await tryReserveChatGeneration(params.userId, dailyLimit, cooldownMs)

    if (!reserve.allowed) {
      if (reserve.reason === 'cooldown') {
        return {
          success: false,
          error: 'Please wait a moment before sending another message.',
          code: 'cooldown',
          retryAfterSeconds: reserve.retry_after_seconds ?? undefined,
        }
      }
      return {
        success: false,
        error: 'You have reached today’s Ask Klaro limit. Try again tomorrow.',
        code: 'rate_limited',
      }
    }

    const currentPeriod = parsePeriodParam(params.periodInput)

    // History + previous server-written resolution drive follow-up inheritance
    const { history, previous: previousResolution } = await loadHistory(
      activeConversationId,
      params.userId
    )
    // Purely social messages never read financial data
    const goalNames = isCasualMessage(message)
      ? []
      : await getGoalNames(params.supabase, params.userId)
    const resolution = resolveDialogue({
      message,
      history,
      previous: previousResolution,
      goalNames,
      currentPeriod,
    })

    await persistMessage({
      conversationId: activeConversationId,
      userId: params.userId,
      role: 'user',
      content: message,
    })

    const turn =
      resolution.action === 'casual'
        ? await runCasualTurn(message)
        : resolution.action === 'clarify'
          ? await runClarifyTurn(message, resolution)
          : await runAnswerTurn({
              supabase: params.supabase,
              userId: params.userId,
              message,
              history,
              state: resolution.state,
            })

    await persistMessage({
      conversationId: activeConversationId,
      userId: params.userId,
      role: 'assistant',
      content: turn.reply,
      source: turn.source,
      // A social turn keeps the previous financial subject alive for the next follow-up
      resolvedState:
        resolution.action === 'casual'
          ? previousResolution?.action === 'answer'
            ? previousResolution
            : null
          : resolution,
    })

    // Length-only diagnostics — never log message body, context, or secrets
    console.info('[KLARO CHAT DEBUG]', {
      action: resolution.action,
      intent: resolution.action === 'answer' ? resolution.state.intent : null,
      source: turn.source,
      generatedLength: turn.generatedLength,
      sanitizedLength: turn.sanitizedLength,
      persistedLength: turn.reply.length,
      apiLength: turn.reply.length,
      endsClean: /[.!?…]["')\]]*\s*$/.test(turn.reply.trim()),
    })

    return {
      success: true,
      conversationId: activeConversationId,
      message: turn.reply,
      source: turn.source,
      dailyRemaining: Math.max(0, dailyLimit - reserve.generation_count),
    }
  } catch (err) {
    console.error('[klaro-chat] server_error', {
      message: err instanceof Error ? err.message.slice(0, 200) : 'unknown',
    })
    return {
      success: false,
      error: 'Something went wrong. Please try again.',
      code: 'server_error',
    }
  }
}

/** List recent messages for a conversation owned by userId (for UI hydration). */
export async function listKlaroChatMessages(params: {
  userId: string
  conversationId: string
  limit?: number
}): Promise<Array<{ id: string; role: 'user' | 'assistant'; content: string; created_at: string }> | null> {
  const owned = await getOwnedConversation(params.conversationId, params.userId)
  if (!owned) return null

  const { data, error } = await supabaseAdmin
    .from('klaro_ai_messages')
    .select('id, role, content, created_at')
    .eq('conversation_id', params.conversationId)
    .eq('user_id', params.userId)
    .order('created_at', { ascending: true })
    .limit(params.limit ?? 50)

  if (error) {
    console.error('[klaro-chat] list_messages_error', { message: error.message })
    return null
  }

  return (data ?? []).map((r) => ({
    id: String(r.id),
    role: r.role === 'assistant' ? 'assistant' : 'user',
    content: String(r.content),
    created_at: String(r.created_at),
  }))
}
