/**
 * Ask Klaro intent detection + compact context selection.
 * Prefer phrase/pattern matching over huge keyword lists.
 * Only include intents the Klaro data model can support.
 */

import type { KlaroFinancialContext } from '@/lib/ai/klaroFinancialContext'
import type { CashFlowTimingAggregates } from '@/lib/ai/klaroCashFlowTiming'
import type { GoalRunwayChatContext } from '@/lib/ai/klaroGoalRunwayContext'
import type { ChatHistoryTurn } from '@/lib/ai/klaroChatPrompt'
import type { SpendingCategoriesResult } from '@/lib/ai/klaroChatTools'
import type { LoanScenario } from '@/lib/ai/klaroLoanScenario'

export type ChatIntent =
  | 'general_summary'
  | 'spending_categories'
  | 'budget'
  | 'goals'
  | 'net_worth'
  | 'period_comparison'
  | 'income'
  | 'cash_flow_timing'
  | 'scenario'
  | 'savings'
  | 'loan'
  | 'unknown'

function lastUserMessage(history: ChatHistoryTurn[] | undefined): string | null {
  if (!history?.length) return null
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === 'user') return history[i].content
  }
  return null
}

function lastAssistantMessage(history: ChatHistoryTurn[] | undefined): string | null {
  if (!history?.length) return null
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === 'assistant') return history[i].content
  }
  return null
}

/**
 * Resolve a category name mentioned in recent spending conversation
 * (e.g. follow-up "cut that by 20%" after discussing Transportation).
 */
export function resolveSpendingCategoryFromHistory(
  message: string,
  history: ChatHistoryTurn[] | undefined,
  knownCategories: string[]
): string | null {
  if (!knownCategories.length) return null
  const q = message.toLowerCase()
  const named = knownCategories.find((c) => q.includes(c.toLowerCase()))
  if (named) return named

  const refersBack = /\b(that|it|this|there)\b/.test(q) || /\bcut (that|it|this)\b/.test(q)
  if (!refersBack || !history?.length) return null

  // Prefer category named in the latest user follow-up ("What about Transportation?")
  const prevUser = lastUserMessage(history)
  if (prevUser) {
    const fromPrev = knownCategories.find((c) => prevUser.toLowerCase().includes(c.toLowerCase()))
    if (fromPrev) return fromPrev
  }

  // Else first category mentioned in the latest assistant reply
  const prevAsst = lastAssistantMessage(history)
  if (prevAsst) {
    const fromAsst = knownCategories.find((c) => prevAsst.toLowerCase().includes(c.toLowerCase()))
    if (fromAsst) return fromAsst
  }

  return null
}

function coreDetect(message: string): ChatIntent {
  const q = message.toLowerCase().trim()
  if (!q) return 'unknown'

  // Hypothetical allocation / what-if / cut-by-percent scenarios
  if (
    /\b(scenario|what if|if i (put|allocate|save|add|cut)|hypothetical)\b/.test(q) ||
    /\b(put|allocate)\b.{0,40}\b(toward|towards|into|to)\b/.test(q) ||
    /\bcut\b.{0,30}\bby\s+\d+\s*%/.test(q) ||
    /\bhow much (could|would|can) i save\b/.test(q)
  ) {
    return 'scenario'
  }

  // Cash-flow timing — payday / end-of-month / "no money left" pressure
  if (
    /\b(cash[-\s]?flow|cashflow)\b/.test(q) ||
    /\b(timing|payday|pay day|get paid|paid on|gets? paid)\b/.test(q) ||
    /\b(feel|feeling|always)\b.{0,40}\b(short|tight|broke|squeezed|no money|nothing left|out of money)\b/.test(
      q
    ) ||
    /\b(short|tight|broke|squeezed)\b.{0,40}\b(end of (the )?month|month'?s? end)\b/.test(q) ||
    /\b(end of (the )?month|month'?s? end|beginning of (the )?month|start of (the )?month)\b/.test(
      q
    ) ||
    /\b(before|after)\b.{0,20}\b(payday|pay day|i get paid)\b/.test(q) ||
    /\bbroke by\b/.test(q) ||
    /\b(no money left|nothing left|out of (money|cash)|cash feels? (tight|gone)|feel like i have no money)\b/.test(
      q
    ) ||
    /\brun out\b.{0,30}\b(money|cash)\b/.test(q)
  ) {
    return 'cash_flow_timing'
  }

  // Period comparison
  if (
    /\b(last month|previous month|compare|compared|vs\.?|versus|month over month|mom)\b/.test(q) ||
    /\b(why did i (spend|spend more)|spend(ing)? more (this|than)|changed|change from)\b/.test(q) ||
    /\b(more|less)\s+(than\s+)?(last|previous)\s+month\b/.test(q)
  ) {
    return 'period_comparison'
  }

  if (/\b(net worth|assets|liabilities)\b/.test(q) || /\b(how much )?debt\b/.test(q)) {
    return 'net_worth'
  }

  if (
    /\b(goal|goals|emergency fund|saved toward|saving toward|progress on (my )?goal)\b/.test(q) ||
    /\b(how long (until|till) i reach|how many months .{0,60}(goal|take)|when (might|will|could) i (reach|hit)|which .{0,40}take the longest|months to (go|reach)|goal runway|estimated timeline)\b/.test(
      q
    )
  ) {
    return 'goals'
  }

  if (
    /\b(how much (am i|did i) sav(e|ing)|surplus|saving rate|how much left after (expenses|spending))\b/.test(
      q
    )
  ) {
    return 'savings'
  }

  // Spending destination / "where is money going" — before generic budget
  if (
    /\b(money (disappear|disappearing|going|goes)|where .{0,30}money|eating up|where (is|does) (my|the) money|where('?s| is) my money)\b/.test(
      q
    ) ||
    /\b(cut (down )?(on )?(my )?(expense|expenses|spending)|where (should|can) i cut|reduce (my )?(expense|expenses|spending)|biggest (expense|spending)|spend(ing)? the most|spent the most|top (spending )?categor|what am i spending|spent on|spending categor)\b/.test(
      q
    ) ||
    /\b(food|dining|transport|transportation|rent|grocery|groceries)\b/.test(q) ||
    /\bhow much did i spend on\b/.test(q) ||
    /\bwhere (is|does) (my|the) money go\b/.test(q)
  ) {
    return 'spending_categories'
  }

  // Remaining budget / utilization (not "what's eating the budget")
  if (
    /\b(remaining|left in (my )?budget|how much (is )?left|budget usage|over budget|budget (left|remaining))\b/.test(
      q
    ) ||
    (/\bbudget\b/.test(q) && !/\b(eating|disappear|where|going)\b/.test(q))
  ) {
    return 'budget'
  }

  if (/\b(income|earn|earned|salary|paycheck)\b/.test(q) && !/\b(spend|expense|cut)\b/.test(q)) {
    return 'income'
  }

  if (/\b(expense|expenses|spending|spend|spent|overspend)\b/.test(q)) {
    return 'spending_categories'
  }

  // "Am I doing okay / actually okay this month?"
  if (
    /\b(how (am i|are we) doing|overview|summary|financial (picture|health))\b/.test(q) ||
    /\bam i .{0,40}\b(ok|okay|fine)\b/.test(q) ||
    /\bdoing okay\b/.test(q) ||
    /\bactually (ok|okay|fine)\b/.test(q)
  ) {
    return 'general_summary'
  }

  return 'general_summary'
}

/**
 * Detect Ask Klaro intent. Optional history enables short follow-ups
 * ("What about Transportation?") to stay on the prior topic.
 */
export function detectChatIntent(
  message: string,
  history?: ChatHistoryTurn[]
): ChatIntent {
  const q = message.toLowerCase().trim()

  // Cut-by-% after a spending discussion → scenario (with category resolved later)
  if (
    history?.length &&
    (/\bcut\b.{0,30}\bby\s+\d+\s*%/.test(q) ||
      /\bhow much (could|would|can) i save\b/.test(q))
  ) {
    const prev = lastUserMessage(history)
    const prevIntent = prev ? coreDetect(prev) : null
    if (
      prevIntent === 'spending_categories' ||
      coreDetect(prev ?? '') === 'spending_categories' ||
      detectRecentSpendingThread(history)
    ) {
      return 'scenario'
    }
  }

  // Follow-up that references a prior spending / goals / timing discussion
  if (
    history?.length &&
    /\b(what about|how about|and what about|what of)\b/.test(q)
  ) {
    if (detectRecentSpendingThread(history)) return 'spending_categories'
    const prev = lastUserMessage(history)
    if (prev && coreDetect(prev) === 'spending_categories') return 'spending_categories'
    if (prev && coreDetect(prev) === 'goals') return 'goals'
    if (prev && coreDetect(prev) === 'cash_flow_timing') return 'cash_flow_timing'
  }

  return coreDetect(message)
}

function detectRecentSpendingThread(history: ChatHistoryTurn[]): boolean {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role !== 'user') continue
    if (coreDetect(history[i].content) === 'spending_categories') return true
    // Only look at recent user turns
    break
  }
  // Also check second-to-last user if last was a "what about"
  let seen = 0
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role !== 'user') continue
    seen++
    if (coreDetect(history[i].content) === 'spending_categories') return true
    if (seen >= 2) break
  }
  return false
}

/** When a single category is in focus, a short ranking is enough for context. */
const SPENDING_CONTEXT_WITH_FOCUS = 5

export type ChatContextExtras = {
  previousPeriod?: KlaroFinancialContext | null
  scenarioNote?: string
  cashFlowTiming?: CashFlowTimingAggregates | null
  goalRunways?: GoalRunwayChatContext | null
  scenarioProjections?: Record<string, unknown> | null
  /** Parameterized spending retrieval result (limit/sort/period resolved server-side). */
  spending?: SpendingCategoriesResult | null
  /** Goal or category the user is asking about, resolved server-side. */
  focus?: { kind: 'goal' | 'category'; name: string } | null
  loanScenario?: LoanScenario | null
}

/** Overall budget for Gemini: never a negative "remaining" — overspend is stated explicitly. */
function budgetForPrompt(b: KlaroFinancialContext['budget']) {
  if (!b) return null
  const over = b.remaining < 0
  return {
    amount: b.amount,
    spent: b.spent,
    remaining: over ? 0 : b.remaining,
    overBudgetBy: over ? Math.round(-b.remaining * 100) / 100 : null,
    utilizationPercent: b.usedPercent,
  }
}

type SpendingRow = KlaroFinancialContext['topSpendingCategories'][number]

/** Category row for Gemini with budget room/usage precomputed so it never recalculates. */
function categoryForPrompt(c: SpendingRow) {
  const hasBudget = c.budget != null && c.budget > 0
  return {
    category: c.name,
    spent: c.spent,
    percentOfTotalExpenses: c.percentOfExpenses,
    budget: hasBudget ? c.budget : null,
    budgetRemaining: hasBudget ? Math.round((c.budget! - c.spent) * 100) / 100 : null,
    budgetUsedPercent: hasBudget ? Math.round((c.spent / c.budget!) * 100) : null,
  }
}

function categoryDiffs(
  current: KlaroFinancialContext,
  previous: KlaroFinancialContext
): Array<{ name: string; currentSpent: number; previousSpent: number; delta: number }> {
  const prevMap = new Map(previous.topSpendingCategories.map((c) => [c.name, c.spent]))
  const names = new Set([
    ...current.topSpendingCategories.map((c) => c.name),
    ...previous.topSpendingCategories.map((c) => c.name),
  ])
  const diffs: Array<{
    name: string
    currentSpent: number
    previousSpent: number
    delta: number
  }> = []
  for (const name of names) {
    const cur = current.topSpendingCategories.find((c) => c.name === name)?.spent ?? 0
    const prev = prevMap.get(name) ?? 0
    diffs.push({
      name,
      currentSpent: cur,
      previousSpent: prev,
      delta: Math.round((cur - prev) * 100) / 100,
    })
  }
  return diffs.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 5)
}

/**
 * Compact context subset for Gemini — Klaro still owns the numbers.
 */
export function selectChatContext(
  full: KlaroFinancialContext,
  intent: ChatIntent,
  extras?: ChatContextExtras
): Record<string, unknown> {
  const base = {
    period: full.period,
    periodLabel: full.periodLabel,
  }

  switch (intent) {
    case 'goals': {
      const runwayCtx = extras?.goalRunways
      const goalsList = runwayCtx?.goals ?? full.goals
      const focusGoal =
        extras?.focus?.kind === 'goal'
          ? goalsList.find((g) => g.name === extras.focus!.name) ?? null
          : null
      return {
        ...base,
        focusGoal,
        goals: goalsList,
        longestEstimate: runwayCtx?.longestEstimate ?? null,
        runwayGuidance:
          runwayCtx?.guidance ??
          'If runway is missing, say a timeline cannot be estimated from available Klaro data.',
        netFlow: full.netFlow,
        observationSeeds: full.observationSeeds.slice(0, 3),
      }
    }
    case 'budget':
      return {
        ...base,
        income: full.income,
        expenses: full.expenses,
        netFlow: full.netFlow,
        budget: budgetForPrompt(full.budget),
        // Category contribution when available
        categoryContribution: full.topSpendingCategories.slice(0, 5).map(categoryForPrompt),
      }
    case 'income':
      return {
        ...base,
        income: full.income,
        expenses: full.expenses,
        netFlow: full.netFlow,
        incomeSourceBreakdownAvailable: false,
        incomeNote:
          'Klaro only has the total income for this period. Never name or infer income sources.',
      }
    case 'savings':
      return {
        ...base,
        income: full.income,
        expenses: full.expenses,
        netFlow: full.netFlow,
        goals: full.goals.slice(0, 5),
      }
    case 'net_worth':
      return {
        ...base,
        assets: full.assets,
        liabilities: full.liabilities,
        netWorth: full.netWorth,
      }
    case 'spending_categories': {
      const spending = extras?.spending ?? null
      const rows = spending?.categories ?? full.topSpendingCategories
      const focusCategory =
        extras?.focus?.kind === 'category'
          ? rows.find((c) => c.name === extras.focus!.name) ?? null
          : null
      const ranked = spending?.rank != null
      return {
        ...base,
        expenses: full.expenses,
        income: full.income,
        netFlow: full.netFlow,
        ranking: spending
          ? {
              order: spending.sort === 'asc' ? 'smallest first' : 'largest first',
              rankedBy: spending.metric === 'room' ? 'budget remaining' : 'amount spent',
              requestedLimit: spending.requestedLimit,
              categoriesInRanking: spending.totalCategories,
            }
          : null,
        requestedRank: ranked
          ? {
              rank: spending!.rank,
              result: rows[0] ? categoryForPrompt(rows[0]) : null,
              note: rows[0]
                ? 'Answer with this single category only. Do not list other ranks.'
                : `Only ${spending!.totalCategories} categories exist in this ranking, so this position does not exist.`,
            }
          : null,
        focusCategory: focusCategory
          ? categoryForPrompt(focusCategory)
          : extras?.focus?.kind === 'category'
            ? { category: extras.focus.name, spent: 0, note: 'No recorded spending in this period.' }
            : null,
        categories: ranked
          ? []
          : (focusCategory ? rows.slice(0, SPENDING_CONTEXT_WITH_FOCUS) : rows).map(categoryForPrompt),
        budget: budgetForPrompt(full.budget),
      }
    }
    case 'period_comparison': {
      const previous = extras?.previousPeriod ?? null
      return {
        ...base,
        currentPeriod: {
          period: full.period,
          periodLabel: full.periodLabel,
          income: full.income,
          expenses: full.expenses,
          netFlow: full.netFlow,
          categories: full.topSpendingCategories.slice(0, 5),
        },
        previousPeriod: previous
          ? {
              period: previous.period,
              periodLabel: previous.periodLabel,
              income: previous.income,
              expenses: previous.expenses,
              netFlow: previous.netFlow,
              categories: previous.topSpendingCategories.slice(0, 5),
            }
          : null,
        totalExpenseDifference: previous
          ? Math.round((full.expenses - previous.expenses) * 100) / 100
          : null,
        categoryDifferences: previous ? categoryDiffs(full, previous) : null,
      }
    }
    case 'cash_flow_timing':
      return {
        ...base,
        monthlyTotals: {
          income: full.income,
          expenses: full.expenses,
          netFlow: full.netFlow,
        },
        cashFlowTiming: extras?.cashFlowTiming ?? null,
        guidance:
          'Monthly surplus/deficit alone cannot explain payday or end-of-month cash pressure. Use cashFlowTiming date buckets if present. If dataSufficientForTiming is false or cashFlowTiming is null, say the timing pattern cannot be explained from available Klaro data — do not invent payday behavior. Only claim late-month concentration when expensesDays15toEnd exceeds expensesDays1to14.',
      }
    case 'scenario':
      return {
        ...base,
        income: full.income,
        expenses: full.expenses,
        netFlow: full.netFlow,
        budget: budgetForPrompt(full.budget),
        goals: full.goals,
        categories: full.topSpendingCategories.slice(0, 5),
        scenarioNote:
          extras?.scenarioNote ??
          'Any allocation amounts discussed are hypothetical. Actual Klaro data was not changed.',
        klaroCalculatedScenario: extras?.scenarioProjections ?? null,
      }
    case 'loan':
      return {
        ...base,
        klaroCalculatedLoan: extras?.loanScenario ?? null,
        guidance:
          'Use klaroCalculatedLoan figures exactly — do not recompute the payment. Explain the monthly payment, total interest, and the effect on the Loan Payment budget and overall budget. State that it is an estimate, that fees are not included, and that Klaro data was not changed.',
      }
    case 'unknown':
      return {
        ...base,
        note: 'Intent unclear. Ask a clarifying question or give a brief overview using only these totals.',
        income: full.income,
        expenses: full.expenses,
        netFlow: full.netFlow,
      }
    case 'general_summary':
    default:
      return {
        ...base,
        income: full.income,
        expenses: full.expenses,
        netFlow: full.netFlow,
        budget: budgetForPrompt(full.budget),
        goalsSummary: full.goals.slice(0, 3).map((g) => ({
          name: g.name,
          progressPercent: g.progressPercent,
          currentAmount: g.currentAmount,
          targetAmount: g.targetAmount,
        })),
        topSpendingCategories: full.topSpendingCategories.slice(0, 3),
        observationSeeds: full.observationSeeds.slice(0, 3),
      }
  }
}
