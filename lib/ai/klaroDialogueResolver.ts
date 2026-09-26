/**
 * Ask Klaro dialogue resolver — decides "answer" vs "clarify" and resolves
 * intent / entity / period / sort / limit, inheriting from the previous turn.
 * Pure: no DB access. Goal names must come from the authenticated user's data.
 */

import { detectChatIntent, type ChatIntent } from '@/lib/ai/klaroChatIntent'
import type { ChatHistoryTurn } from '@/lib/ai/klaroChatPrompt'
import { clampSpendingLimit, SPENDING_LIMIT_DEFAULT } from '@/lib/ai/klaroChatTools'
import { toLocalDateString, parseLocalDateString } from '@/lib/format'
import { EXPENSE_CATEGORIES } from '@/lib/expenseCategories'
import {
  isLoanRequest,
  mergeLoanTerms,
  missingLoanFields,
  parseLoanTerms,
  type LoanTerms,
} from '@/lib/ai/klaroLoanScenario'

export type DialogueEntity = { kind: 'goal' | 'category'; name: string }

/** 'room' ranks budgeted categories by budget left instead of amount spent. */
export type SpendingMetric = 'spent' | 'room'

export type DialogueState = {
  intent: ChatIntent
  entity: DialogueEntity | null
  period: string
  sort: 'desc' | 'asc'
  /** Range size for top-N requests ("top 5" → 5). */
  limit: number
  /** Specific position for ordinal requests ("second largest" → 2); null for ranges. */
  rank: number | null
  metric: SpendingMetric
  /** User asked what to do — answer with priorities, not another summary. */
  advice: boolean
  /** Hypothetical loan terms stated by the user (loan intent only). */
  loan: LoanTerms | null
}

export type ClarifyReason =
  | 'vague_overview'
  | 'savings_purpose'
  | 'goal_unspecified'
  | 'unresolved_reference'
  | 'out_of_scope'
  | 'loan_details'

export type DialogueResolution =
  | { action: 'answer'; state: DialogueState }
  | { action: 'casual' }
  | {
      action: 'clarify'
      reason: ClarifyReason
      choices: string[]
      pendingState: Partial<DialogueState>
    }

const CHAT_INTENTS: ReadonlySet<string> = new Set([
  'general_summary',
  'spending_categories',
  'budget',
  'goals',
  'net_worth',
  'period_comparison',
  'income',
  'cash_flow_timing',
  'scenario',
  'savings',
  'loan',
  'unknown',
])

const CLARIFY_REASONS: ReadonlySet<string> = new Set([
  'vague_overview',
  'savings_purpose',
  'goal_unspecified',
  'unresolved_reference',
  'out_of_scope',
  'loan_details',
])

const OVERVIEW_CHOICES = ['spending', 'monthly cash flow', 'goals', 'budget']
const SAVINGS_CHOICES = ['a specific goal', 'an emergency fund', 'a monthly savings amount']

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
]

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  fifteen: 15,
  twenty: 20,
}

const TOPIC_WORDS =
  /\b(spend|spending|spent|expense|expenses|budget|goal|goals|income|salary|earn|net worth|assets|liabilities|debt|sav(e|ing|ings)|cash[-\s]?flow|categor(y|ies)|surplus|emergency fund)\b/

function monthOffset(periodFirst: string, delta: number): string {
  const d = parseLocalDateString(periodFirst)
  return toLocalDateString(new Date(d.getFullYear(), d.getMonth() + delta, 1))
}

/** "top 5", "top ten", "5 biggest" → 5 (clamped server-side). */
export function parseTopN(q: string): number | null {
  const m =
    q.match(/\btop\s+(\d{1,3})\b/) ??
    q.match(/\b(\d{1,3})\s+(biggest|largest|highest|top|smallest|lowest)\b/)
  if (m) return clampSpendingLimit(Number(m[1]))
  const w =
    q.match(/\btop\s+(one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty)\b/) ??
    q.match(
      /\b(one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty)\s+(biggest|largest|highest|smallest|lowest)\b/
    )
  if (w) return clampSpendingLimit(NUMBER_WORDS[w[1]])
  return null
}

/** Resolve "last month" / "August" / "August 2026" to a month start, never in the future. */
export function parsePeriodOverride(q: string, currentPeriod: string): string | null {
  if (/\b(last|previous|past) month\b/.test(q)) return monthOffset(currentPeriod, -1)
  if (/\bthis month\b/.test(q)) return currentPeriod

  const cur = parseLocalDateString(currentPeriod)
  for (let i = 0; i < MONTHS.length; i++) {
    const name = MONTHS[i]
    const pattern =
      name === 'may'
        ? /\b(in|for|about|of|during|than|since)\s+may\b(\s+(\d{4}))?/
        : new RegExp(`\\b${name}\\b(\\s+(\\d{4}))?`)
    const m = q.match(pattern)
    if (!m) continue
    const yearStr = name === 'may' ? m[3] : m[2]
    let year = yearStr ? Number(yearStr) : cur.getFullYear()
    if (!yearStr && i > cur.getMonth()) year -= 1
    const candidate = new Date(year, i, 1)
    if (candidate > cur) return null
    return toLocalDateString(candidate)
  }
  return null
}

function parseSort(q: string): 'desc' | 'asc' | null {
  if (/\b(least|smallest|lowest)\b/.test(q)) return 'asc'
  if (/\b(most|biggest|largest|highest|top)\b/.test(q)) return 'desc'
  return null
}

const ORDINAL_WORDS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
}

const DESC_SIGNAL =
  /\b(largest|biggest|highest|top)\b|\b(spen[dt]\w*|expens\w*)\s+(the\s+)?most\b|\bmost\s+(spen[dt]\w*|money|room)\b|\bthe most on\b/
const ASC_SIGNAL =
  /\b(lowest|smallest)\b|\b(spen[dt]\w*|expens\w*)\s+(the\s+)?least\b|\bleast\s+(spen[dt]\w*|money|room)\b|\bthe least on\b/
const BARE_SUPERLATIVE = /\bthe\s+(most|least)\s*[?.!]*$/
/** Plural / list wording means a range ("biggest categories"), not a single position. */
const LIST_WORDING =
  /\b(categories|areas|buckets|expenses|things|ones|items|costs)\b|\bwhat are\b|\bshow me\b|\blist\b/
/** An ordinal only counts on a fresh question when it modifies a ranking word ("second largest", "#2 spending"). */
const ORDINAL_TARGET =
  /^\s*(most|least|largest|biggest|highest|top|lowest|smallest|spen[dt]\w*|expense|category|bucket|thing|place)\b/
const ROOM_SIGNAL =
  /\b(most|least|more|less)\s+(budget\s+)?room\b|\broom\s+(left|remaining)\b|\b(most|least)\s+(budget\s+)?(left|remaining)\b/
/** Words that make a ranking request about spending categories. */
const SPENDING_NOUN = /\b(spen[dt]\w*|expens\w*|categor\w*|bucket|budget|room|cost)\b/

function matchOrdinal(q: string): { rank: number; after: string } | null {
  const word = q.match(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/)
  if (word?.index != null) {
    return { rank: ORDINAL_WORDS[word[1]], after: q.slice(word.index + word[0].length) }
  }
  const numeric =
    q.match(/\b(\d{1,2})(st|nd|rd|th)\b/) ?? q.match(/#\s?(\d{1,2})\b/) ?? q.match(/\bnumber\s+(\d{1,2})\b/)
  if (numeric?.index != null) {
    return { rank: clampSpendingLimit(Number(numeric[1])), after: q.slice(numeric.index + numeric[0].length) }
  }
  return null
}

/**
 * Ordinal position request: "second largest" → rank 2 desc, "lowest spending" → rank 1 asc.
 * Top-N ranges ("top 5") and plural list wording return null. `allowBare` accepts
 * "and the third?" / "what about the largest?" when continuing a spending ranking.
 */
export function parseRank(
  q: string,
  allowBare = false
): { rank: number; sort: 'desc' | 'asc' | null } | null {
  if (parseTopN(q) != null) return null
  const asc = ASC_SIGNAL.test(q) || (allowBare && /\bthe least\b/.test(q) && BARE_SUPERLATIVE.test(q))
  const desc = DESC_SIGNAL.test(q) || (allowBare && /\bthe most\b/.test(q) && BARE_SUPERLATIVE.test(q))
  const sort = asc ? 'asc' : desc ? 'desc' : null

  const ordinal = matchOrdinal(q)
  if (ordinal && (allowBare || ORDINAL_TARGET.test(ordinal.after))) {
    return { rank: ordinal.rank, sort }
  }
  if (sort && !LIST_WORDING.test(q)) return { rank: 1, sort }
  return null
}

const SOCIAL_PHRASES =
  /\b(hello|hi|hiya|hey( there)?|good (morning|afternoon|evening|day)|kumusta|musta|who are you|what are you|what'?s your name|what is your name|what can you (do|help( me)? with)|thank you( so much| very much)?|thanks( a lot| so much)?|thx|ty|salamat( po)?|appreciate it|i appreciate (it|that|you)|much appreciated|you('?re| are) (getting|becoming) (a lot |so much |even )?(smarter|better|good|smart)( at this)?|you('?re| are) (learning|improving)|you('?re| are) (pretty |so |really |very )?(amazing|awesome|the best|great|a lifesaver|so helpful|helpful|a star|smart|clever|good at this)|that('?s| is| was) (really |very |so )?(helpful|great|perfect|awesome|amazing|nice|good|useful|clear|impressive)|very helpful|so helpful|great job|nice one|nice work|good job|well done|impressive|got it|gotcha|understood|makes sense|sounds good|love it|all right|alright|okay|ok|sure|noted|cool|nice|great|awesome|perfect|amazing|wow|sweet|good|yay|haha+|hehe+|lol)\b/g
const SOCIAL_FILLER = /\b(so|really|very|much|oh|klaro|po|and|just|you|too|there|huh|eh|ha+|xd)\b/g
const EMOTICON = /[:;=][-'^]?[)(dp3o|/\\\]*]+/g

/**
 * Purely social message — greeting, identity question, thanks, compliment, acknowledgement
 * ("Hello", "What's your name?", "Alright! You are amazing!"). Nothing financial may remain
 * once social phrases are removed, so "Hi, where am I spending the most?" stays financial.
 */
export function isCasualMessage(message: string): boolean {
  const q = message.toLowerCase().replace(/[‘’]/g, "'").replace(EMOTICON, ' ')
  if (!q.match(SOCIAL_PHRASES)) return false
  const rest = q
    .replace(SOCIAL_PHRASES, ' ')
    .replace(SOCIAL_FILLER, ' ')
    .replace(/[^a-z0-9₱]+/g, '')
  return rest.length === 0
}

const LEADING_SOCIAL =
  /^(?:(?:hi|hey|hello|thanks|thank you|ok(?:ay)?|alright|all right|got it|great|cool|nice|perfect|hmm+|so|and|then)[\s,!.—–-]*)+/

/** "What should I do?", "Thanks — what should I cut?" → an action request on the current topic. */
function isAdviceRequest(q: string): boolean {
  const core = q.replace(LEADING_SOCIAL, '').trim()
  return /^(what should i do|what (can|do) i do( about (it|that|this))?|what do you (suggest|recommend)|any (advice|suggestions|tips)|how (can|do|should) i (fix|improve) (it|that|this)|what (should|can) i (cut|reduce|change|focus on)|where (should|can) i (cut|start))(\s+(now|next|then|first))?\s*[?.!]*$/.test(
    core
  )
}

function significantTokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4)
}

/** Match a user goal named in the message (full name, or a distinctive word of it). */
export function findGoalInMessage(q: string, goalNames: string[]): string | null {
  const full = goalNames.find((n) => n.trim() && q.includes(n.toLowerCase()))
  if (full) return full
  const matches = goalNames.filter((n) =>
    significantTokens(n).some((t) => new RegExp(`\\b${t}\\b`).test(q))
  )
  return matches.length === 1 ? matches[0] : null
}

function findCategoryInMessage(q: string): string | null {
  const hit = EXPENSE_CATEGORIES.find((c) => q.includes(c.label.toLowerCase()))
  if (hit) return hit.label
  if (/\bfood\b/.test(q)) return 'Groceries'
  if (/\btransport\b/.test(q)) return 'Transportation'
  if (/\bdining\b/.test(q)) return 'Dining Out'
  if (/\brent\b/.test(q)) return 'Rent / Mortgage'
  return null
}

function isPureReference(q: string): boolean {
  return /^(and\s+|so\s+)?(what|how)\s+about\s+(it|that|this|those|them)\s*[?.!]*$/.test(q) ||
    /^(and|what of)\s+(it|that|this)\s*[?.!]*$/.test(q)
}

function isVagueOverview(q: string): boolean {
  const overview =
    /^(so,?\s+|hey,?\s+|klaro,?\s+)?how\s+(am i|are we|'m i|is it)\s+doing\s*[?.!]*$/.test(q) ||
    /^(so,?\s+)?am i\s+(ok|okay|fine|good|alright)\s*[?.!]*$/.test(q) ||
    /^how('?s| is)\s+(it|everything)\s+going\s*[?.!]*$/.test(q)
  return overview
}

function isSavingsPurposeUnclear(q: string, goalNames: string[]): boolean {
  if (!/\bhow much should i (save|be saving|put aside|set aside)\b/.test(q)) return false
  if (/\b(goal|emergency|fund)\b/.test(q)) return false
  if (/₱|\d|%/.test(q)) return false
  if (findGoalInMessage(q, goalNames)) return false
  return true
}

function needsSpecificGoal(q: string): boolean {
  return /\b(how much more|how much (do i|else do i|else i) need|how much (is )?left (for|to reach)|how long until|how long till|when will i reach|when (might|could) i reach|how close am i)\b/.test(
    q
  )
}

function isOutOfScope(q: string): boolean {
  return /\b(weather|recipe|joke|lottery|horoscope|which stocks?|stocks? to buy|crypto to buy|best crypto|should i invest in)\b/.test(
    q
  )
}

function answer(
  state: Omit<DialogueState, 'rank' | 'metric' | 'advice' | 'loan'> &
    Partial<Pick<DialogueState, 'rank' | 'metric' | 'advice' | 'loan'>>
): DialogueResolution {
  return {
    action: 'answer',
    state: { rank: null, metric: 'spent', advice: false, loan: null, ...state },
  }
}

/** Answer a loan estimate when all terms are known, otherwise ask for exactly what's missing. */
function resolveLoan(terms: LoanTerms, period: string): DialogueResolution {
  const missing = missingLoanFields(terms)
  if (missing.length > 0) {
    return { action: 'clarify', reason: 'loan_details', choices: missing, pendingState: { period, loan: terms } }
  }
  return answer({
    intent: 'loan',
    entity: null,
    period,
    sort: 'desc',
    limit: SPENDING_LIMIT_DEFAULT,
    loan: terms,
  })
}

function mapOverviewChoice(q: string): ChatIntent | null {
  if (/\bspend/.test(q)) return 'spending_categories'
  if (/\bcash[-\s]?flow\b/.test(q)) return 'cash_flow_timing'
  if (/\bgoal/.test(q)) return 'goals'
  if (/\bbudget\b/.test(q)) return 'budget'
  if (/\b(overall|everything|all of|all)\b/.test(q)) return 'general_summary'
  return null
}

function resolveClarificationReply(
  q: string,
  previous: Extract<DialogueResolution, { action: 'clarify' }>,
  goalNames: string[],
  currentPeriod: string
): DialogueResolution | null {
  const base: DialogueState = {
    intent: 'general_summary',
    entity: null,
    period: previous.pendingState.period ?? currentPeriod,
    sort: previous.pendingState.sort ?? 'desc',
    limit: previous.pendingState.limit ?? SPENDING_LIMIT_DEFAULT,
    rank: null,
    metric: 'spent',
    advice: false,
    loan: null,
  }

  if (previous.reason === 'loan_details') {
    const prior = previous.pendingState.loan ?? null
    const merged = mergeLoanTerms(prior, q)
    const supplied = missingLoanFields(merged).length < missingLoanFields(prior ?? parseLoanTerms('')).length
    return supplied ? resolveLoan(merged, base.period) : null
  }

  if (previous.reason === 'goal_unspecified') {
    const offered = previous.choices.filter((c) => goalNames.includes(c))
    const goal = findGoalInMessage(q, offered.length ? offered : goalNames)
    if (goal) return answer({ ...base, intent: 'goals', entity: { kind: 'goal', name: goal } })
    return null
  }

  if (previous.reason === 'vague_overview') {
    const intent = mapOverviewChoice(q)
    if (intent) return answer({ ...base, intent })
    return null
  }

  if (previous.reason === 'savings_purpose') {
    const goal = findGoalInMessage(q, goalNames)
    if (goal) return answer({ ...base, intent: 'goals', entity: { kind: 'goal', name: goal } })
    if (/\bemergency\b/.test(q)) {
      const ef = goalNames.find((n) => /emergency/i.test(n))
      return answer({
        ...base,
        intent: ef ? 'goals' : 'savings',
        entity: ef ? { kind: 'goal', name: ef } : null,
      })
    }
    if (/\b(monthly|amount|month)\b/.test(q)) return answer({ ...base, intent: 'savings' })
    if (/\bgoal\b/.test(q)) {
      if (goalNames.length > 1) {
        return {
          action: 'clarify',
          reason: 'goal_unspecified',
          choices: goalNames.slice(0, 5),
          pendingState: { period: base.period },
        }
      }
      return answer({
        ...base,
        intent: 'goals',
        entity: goalNames[0] ? { kind: 'goal', name: goalNames[0] } : null,
      })
    }
    return null
  }

  return null
}

export function resolveDialogue(params: {
  message: string
  history: ChatHistoryTurn[]
  previous: DialogueResolution | null
  goalNames: string[]
  currentPeriod: string
}): DialogueResolution {
  const q = params.message.toLowerCase().trim()
  const { goalNames, currentPeriod } = params
  const prev = params.previous
  const prevAnswer = prev?.action === 'answer' ? prev.state : null

  // 0. Purely social message — no financial operation (a social message cannot carry a choice)
  if (isCasualMessage(q)) return { action: 'casual' }

  // 1. Reply to our own clarification question
  if (prev?.action === 'clarify') {
    const resolved = resolveClarificationReply(q, prev, goalNames, currentPeriod)
    if (resolved) return resolved
  }

  if (isOutOfScope(q)) {
    return { action: 'clarify', reason: 'out_of_scope', choices: OVERVIEW_CHOICES, pendingState: {} }
  }

  // Hypothetical new loan ("take out a loan for 20000 at 36%"), or adjusting the last estimate ("what about 24 months?")
  if (isLoanRequest(q)) {
    return resolveLoan(parseLoanTerms(q), prevAnswer?.period ?? currentPeriod)
  }
  if (prevAnswer?.intent === 'loan' && prevAnswer.loan) {
    const adjusted = parseLoanTerms(q)
    if (adjusted.principal != null || adjusted.annualRatePercent != null || adjusted.termMonths != null) {
      return resolveLoan(mergeLoanTerms(prevAnswer.loan, q), prevAnswer.period)
    }
  }

  const topN = parseTopN(q)
  const rankInfo = parseRank(q, prevAnswer?.intent === 'spending_categories')
  const roomRequested = ROOM_SIGNAL.test(q)
  const periodOverride = parsePeriodOverride(q, currentPeriod)
  const sortOverride = parseSort(q)
  const goalInMessage = findGoalInMessage(q, goalNames)
  const categoryInMessage = findCategoryInMessage(q)
  const hasTopic = TOPIC_WORDS.test(q) || !!goalInMessage || !!categoryInMessage
  const comparing = /\b(compare|compared|versus|vs\.?)\b/.test(q)

  // 2. Modifier-only follow-up ("Give me top 5", "And the third?", "Same but last month")
  if (
    prevAnswer &&
    !hasTopic &&
    !comparing &&
    (topN != null || rankInfo != null || periodOverride != null)
  ) {
    // List size and position only apply to category rankings
    const ranking = topN != null || rankInfo != null
    return answer({
      intent: ranking ? 'spending_categories' : prevAnswer.intent,
      entity: ranking ? null : prevAnswer.entity,
      period: periodOverride ?? prevAnswer.period,
      limit: topN ?? (rankInfo ? 1 : prevAnswer.limit),
      rank: topN != null ? null : rankInfo?.rank ?? prevAnswer.rank,
      sort: rankInfo?.sort ?? sortOverride ?? prevAnswer.sort,
      metric: roomRequested ? 'room' : prevAnswer.metric,
      loan: ranking ? null : prevAnswer.loan,
    })
  }

  // 3. Action request on the current topic ("What should I do?", "Thanks — what should I cut?")
  if (isAdviceRequest(q)) {
    const cutting = /\b(cut|reduce)\b/.test(q)
    if (prevAnswer) {
      const keepsTopic = !cutting || ['spending_categories', 'budget'].includes(prevAnswer.intent)
      return answer({
        ...prevAnswer,
        intent: keepsTopic ? prevAnswer.intent : 'budget',
        rank: null,
        limit: SPENDING_LIMIT_DEFAULT,
        advice: true,
      })
    }
    if (cutting) {
      return answer({
        intent: 'budget',
        entity: null,
        period: currentPeriod,
        sort: 'desc',
        limit: SPENDING_LIMIT_DEFAULT,
        advice: true,
      })
    }
    return { action: 'clarify', reason: 'vague_overview', choices: OVERVIEW_CHOICES, pendingState: {} }
  }

  // 4. Pure reference ("What about it?")
  if (isPureReference(q)) {
    if (prevAnswer?.entity) return answer(prevAnswer)
    return {
      action: 'clarify',
      reason: 'unresolved_reference',
      choices: OVERVIEW_CHOICES,
      pendingState: prevAnswer ? { period: prevAnswer.period } : {},
    }
  }

  // 5. Ambiguity on a fresh question
  if (isVagueOverview(q)) {
    return { action: 'clarify', reason: 'vague_overview', choices: OVERVIEW_CHOICES, pendingState: {} }
  }

  if (isSavingsPurposeUnclear(q, goalNames)) {
    return { action: 'clarify', reason: 'savings_purpose', choices: SAVINGS_CHOICES, pendingState: {} }
  }

  let intent = detectChatIntent(params.message, params.history)
  if (/\b(afford|can i)\b.{0,30}\bsave\b/.test(q)) intent = 'savings'

  const period = periodOverride ?? currentPeriod
  const limit = topN ?? SPENDING_LIMIT_DEFAULT
  const sort = sortOverride ?? 'desc'

  if (needsSpecificGoal(q) && !categoryInMessage) {
    if (goalInMessage) {
      return answer({ intent: 'goals', entity: { kind: 'goal', name: goalInMessage }, period, sort, limit })
    }
    if (prevAnswer?.entity?.kind === 'goal' && goalNames.includes(prevAnswer.entity.name)) {
      return answer({ ...prevAnswer, intent: 'goals' })
    }
    if (goalNames.length > 1) {
      return {
        action: 'clarify',
        reason: 'goal_unspecified',
        choices: goalNames.slice(0, 5),
        pendingState: { period },
      }
    }
    if (goalNames.length === 1) {
      return answer({ intent: 'goals', entity: { kind: 'goal', name: goalNames[0] }, period, sort, limit })
    }
    return answer({ intent: 'goals', entity: null, period, sort, limit })
  }

  // 6. Clear answer. Ranking wording ("least spend on budget bucket", "most room") is a category ranking.
  const rankingRequested = topN != null || rankInfo != null || roomRequested
  if (
    rankingRequested &&
    !goalInMessage &&
    (SPENDING_NOUN.test(q) || !hasTopic) &&
    ['spending_categories', 'budget', 'general_summary', 'unknown'].includes(intent)
  ) {
    intent = 'spending_categories'
  }

  let entity: DialogueEntity | null = null
  if (intent === 'goals' && goalInMessage) entity = { kind: 'goal', name: goalInMessage }
  else if (intent === 'spending_categories' && categoryInMessage) {
    entity = { kind: 'category', name: categoryInMessage }
  }

  const rank = intent === 'spending_categories' && !entity && rankInfo ? rankInfo.rank : null
  return answer({
    intent,
    entity,
    period,
    sort: rankInfo?.sort ?? sort,
    limit: rank != null ? 1 : limit,
    rank,
    metric: intent === 'spending_categories' && roomRequested ? 'room' : 'spent',
  })
}

/** Validate a resolved_state value read back from the DB; returns null if malformed. */
export function parseStoredResolution(raw: unknown): DialogueResolution | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>

  if (r.action === 'answer' && r.state && typeof r.state === 'object') {
    const s = r.state as Record<string, unknown>
    if (typeof s.intent !== 'string' || !CHAT_INTENTS.has(s.intent)) return null
    if (typeof s.period !== 'string' || !/^\d{4}-\d{2}-01$/.test(s.period)) return null
    return {
      action: 'answer',
      state: {
        intent: s.intent as ChatIntent,
        entity: parseEntity(s.entity),
        period: s.period,
        sort: s.sort === 'asc' ? 'asc' : 'desc',
        limit: clampSpendingLimit(s.limit),
        rank: s.rank == null ? null : clampSpendingLimit(s.rank),
        metric: s.metric === 'room' ? 'room' : 'spent',
        advice: s.advice === true,
        loan: parseLoan(s.loan),
      },
    }
  }

  if (r.action === 'clarify' && typeof r.reason === 'string' && CLARIFY_REASONS.has(r.reason)) {
    const choices = Array.isArray(r.choices)
      ? r.choices.filter((c): c is string => typeof c === 'string').slice(0, 5)
      : []
    const p = (r.pendingState ?? {}) as Record<string, unknown>
    const loan = parseLoan(p.loan)
    return {
      action: 'clarify',
      reason: r.reason as ClarifyReason,
      choices,
      pendingState: {
        ...(typeof p.period === 'string' && /^\d{4}-\d{2}-01$/.test(p.period)
          ? { period: p.period }
          : {}),
        ...(loan ? { loan } : {}),
      },
    }
  }

  return null
}

function parseLoan(raw: unknown): LoanTerms | null {
  if (!raw || typeof raw !== 'object') return null
  const l = raw as Record<string, unknown>
  const num = (v: unknown, min: number) =>
    typeof v === 'number' && Number.isFinite(v) && v >= min ? v : null
  return {
    principal: num(l.principal, 1),
    annualRatePercent: num(l.annualRatePercent, 0),
    termMonths: num(l.termMonths, 1),
  }
}

function parseEntity(raw: unknown): DialogueEntity | null {
  if (!raw || typeof raw !== 'object') return null
  const e = raw as Record<string, unknown>
  if ((e.kind === 'goal' || e.kind === 'category') && typeof e.name === 'string' && e.name.trim()) {
    return { kind: e.kind, name: e.name.slice(0, 120) }
  }
  return null
}
