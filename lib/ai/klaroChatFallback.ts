import type { KlaroFinancialContext } from '@/lib/ai/klaroFinancialContext'
import type { CashFlowTimingAggregates } from '@/lib/ai/klaroCashFlowTiming'
import type { GoalRunwayChatContext } from '@/lib/ai/klaroGoalRunwayContext'
import {
  detectChatIntent,
  resolveSpendingCategoryFromHistory,
  type ChatIntent,
} from '@/lib/ai/klaroChatIntent'
import type { ChatHistoryTurn } from '@/lib/ai/klaroChatPrompt'
import type { SpendingCategoriesResult } from '@/lib/ai/klaroChatTools'
import type { LoanScenario } from '@/lib/ai/klaroLoanScenario'

function peso(n: number): string {
  return `₱${Math.abs(n).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`
}

/** "save ₱10,000 a month" / "10k monthly" → 10000; null when no monthly amount is stated. */
function parseMonthlySavingsAmount(message: string): number | null {
  const q = message.toLowerCase()
  if (!/\b(a|per|each|every)\s+month\b|\bmonthly\b/.test(q)) return null
  const m = q.match(/₱?\s*([\d,]+(?:\.\d+)?)\s*(k)?\b/)
  if (!m) return null
  const n = Number(m[1].replace(/,/g, '')) * (m[2] ? 1000 : 1)
  return Number.isFinite(n) && n > 0 ? n : null
}

type OverallBudget = NonNullable<KlaroFinancialContext['budget']>

/** "with about ₱X remaining" or "about ₱X over budget" — never prints an overspend as room left. */
function budgetStanding(b: OverallBudget): string {
  return b.remaining < 0
    ? `about ${peso(b.remaining)} over budget`
    : `with about ${peso(b.remaining)} remaining`
}

function generalSummaryFallback(c: KlaroFinancialContext): string {
  if (c.income === 0 && c.expenses === 0) {
    return `I don't have enough income and expense data for ${c.periodLabel} yet to form a clear monthly picture.`
  }

  if (c.netFlow > 0) {
    let text = `Overall, your ${c.periodLabel} numbers are positive: you have a ${peso(c.netFlow)} surplus because your ${peso(c.income)} income is above your ${peso(c.expenses)} expenses.`
    if (c.budget) {
      text +=
        c.budget.remaining < 0
          ? ` But your budget is ${c.budget.usedPercent}% used — ${budgetStanding(c.budget)} — so spending has gone past what you planned even though income covers it.`
          : ` Your budget is ${c.budget.usedPercent}% used, leaving about ${peso(c.budget.remaining)}, so the month is positive but there's less budget room left than your surplus alone might suggest.`
    }
    const progressing = c.goals.find((g) => g.progressPercent > 0)
    if (progressing) {
      text += ` ${progressing.name} is at ${progressing.progressPercent}% toward its target.`
    }
    return text
  }

  if (c.netFlow < 0) {
    let text = `For ${c.periodLabel}, recorded expenses (${peso(c.expenses)}) are higher than income (${peso(c.income)}) by ${peso(c.netFlow)}.`
    if (c.budget) {
      text += ` Your budget is ${c.budget.usedPercent}% used, ${budgetStanding(c.budget)}.`
    }
    return text
  }

  let text = `For ${c.periodLabel}, recorded income and expenses are balanced at ${peso(c.income)}.`
  if (c.budget) {
    text += ` Your budget is ${c.budget.usedPercent}% used, ${budgetStanding(c.budget)}.`
  }
  return text
}

const ORDINAL_PREFIX = ['', 'second-', 'third-', 'fourth-', 'fifth-', 'sixth-', 'seventh-', 'eighth-', 'ninth-', 'tenth-']

function ordinalPrefix(rank: number): string {
  return ORDINAL_PREFIX[rank - 1] ?? `${rank}th-`
}

function budgetDetail(
  row: { spent: number; budget?: number },
  mentionBudgetGap: boolean
): string {
  if (row.budget != null && row.budget > 0) {
    const used = Math.round((row.spent / row.budget) * 100)
    return ` against a ${peso(row.budget)} budget (${used}% used)`
  }
  return mentionBudgetGap ? ` — Klaro doesn't have a budget amount set for it` : ''
}

/** Room left in a category budget, phrased without inventing anything when over budget. */
function roomPhrase(row: { spent: number; budget?: number }): string {
  const budget = row.budget ?? 0
  const room = Math.round((budget - row.spent) * 100) / 100
  const used = budget > 0 ? Math.round((row.spent / budget) * 100) : 0
  return room >= 0
    ? `${peso(row.spent)} spent of its ${peso(budget)} budget, leaving about ${peso(room)} (${used}% used)`
    : `${peso(row.spent)} spent against its ${peso(budget)} budget, about ${peso(room)} over`
}

/** Single ordinal answer ("second-largest") — never lists the surrounding ranks. */
function rankedCategoryFallback(spending: SpendingCategoriesResult, message: string): string {
  const rank = spending.rank ?? 1
  const row = spending.categories[0]
  const room = spending.metric === 'room'
  const asc = spending.sort === 'asc'
  const position = room
    ? `category with the ${ordinalPrefix(rank).replace(/-$/, ' ')}${asc ? 'least' : 'most'} budget room left`
    : `${ordinalPrefix(rank)}${asc ? 'lowest' : 'largest'} spending category`

  if (!row) {
    if (room && spending.totalCategories === 0) {
      return `Klaro doesn't have per-category budget amounts for ${spending.periodLabel}, so I can't tell which category has the most room left.`
    }
    return `Klaro only has ${spending.totalCategories} ${spending.totalCategories === 1 ? 'category' : 'categories'} ${room ? 'with a budget' : 'with recorded spending'} in ${spending.periodLabel}, so there's no ${position} to show.`
  }

  if (room) {
    return `The ${position} for ${spending.periodLabel} is ${row.name}: ${roomPhrase(row)}.`
  }

  const mentionsBudget = /\b(budget|bucket)\b/i.test(message)
  const share = row.percentOfExpenses > 0 ? `, about ${row.percentOfExpenses}% of your total expenses` : ''
  return `Your ${position} for ${spending.periodLabel} is ${row.name} at ${peso(row.spent)}${share}${budgetDetail(row, mentionsBudget)}.`
}

function spendingCategoriesFallback(
  c: KlaroFinancialContext,
  spending: SpendingCategoriesResult | null | undefined,
  focus: { kind: 'goal' | 'category'; name: string } | null | undefined,
  message: string
): string {
  if (spending?.rank != null) return rankedCategoryFallback(spending, message)

  const periodLabel = spending?.periodLabel ?? c.periodLabel
  const rows = spending ? spending.categories : c.topSpendingCategories.slice(0, 3)
  const totalExpenses = spending?.totalExpenses ?? c.expenses

  if (spending?.metric === 'room') {
    if (rows.length === 0) {
      return `Klaro doesn't have per-category budget amounts for ${periodLabel}, so I can't compare budget room by category.`
    }
    const order = spending.sort === 'asc' ? 'least' : 'most'
    const bullets = rows.map((r) => `• ${r.name} — ${roomPhrase(r)}`).join('\n')
    return `Categories with the ${order} budget room left for ${periodLabel}:\n\n${bullets}`
  }

  if (totalExpenses === 0 || rows.length === 0) {
    return `I don't have enough category detail in Klaro for ${periodLabel} to identify where your spending is going yet.`
  }

  if (focus?.kind === 'category') {
    const hit = rows.find((r) => r.name === focus.name)
    if (!hit) {
      return `Klaro doesn't show any recorded ${focus.name} spending for ${periodLabel}.`
    }
    const budgetPart =
      hit.budget != null ? ` Your budget for it is ${peso(hit.budget)}.` : ''
    return `${hit.name} spending for ${periodLabel} is ${peso(hit.spent)}, about ${hit.percentOfExpenses}% of your recorded expenses.${budgetPart}`
  }

  const ascending = spending?.sort === 'asc'
  const bullets = rows.map((cat) => `• ${cat.name} — ${peso(cat.spent)}`).join('\n')
  const heading = ascending
    ? `Your smallest spending categories for ${periodLabel}:`
    : rows.length > 3
      ? `Your top ${rows.length} spending categories for ${periodLabel}:`
      : `Your biggest spending areas for ${periodLabel} are:`

  const shortfall =
    spending && spending.totalCategories < spending.requestedLimit
      ? `\n\nKlaro only has ${spending.totalCategories} ${spending.totalCategories === 1 ? 'category' : 'categories'} with recorded spending in ${periodLabel}.`
      : ''

  const largest = rows[0]
  const closing = ascending
    ? ''
    : `\n\n${largest.name} is currently your largest category at ${peso(largest.spent)} (about ${largest.percentOfExpenses}% of expenses), so that's the first area I'd review.`

  const budgetLine =
    !spending && c.budget != null
      ? `\n\nYour budget is ${c.budget.usedPercent}% used (${peso(c.budget.spent)} of ${peso(c.budget.amount)}), ${budgetStanding(c.budget)}.`
      : ''

  return `${heading}\n\n${bullets}${shortfall}${closing}${budgetLine}`
}

function budgetFallback(c: KlaroFinancialContext): string {
  if (!c.budget) {
    return `I don't see a monthly budget plan for ${c.periodLabel} yet. Set spending limits in KlaroPH to track remaining budget.`
  }

  const util = `You're at ${c.budget.usedPercent}% of your ${c.periodLabel} budget (${peso(c.budget.spent)} of ${peso(c.budget.amount)}), ${budgetStanding(c.budget)}.`

  if (c.topSpendingCategories.length === 0) {
    return `${util} Klaro doesn't have category-level spending detail to show what's contributing most to that usage.`
  }

  const names = c.topSpendingCategories
    .slice(0, 2)
    .map((cat) => cat.name)
    .join(' and ')
  const detail = c.topSpendingCategories
    .slice(0, 3)
    .map((cat) => `• ${cat.name} — ${peso(cat.spent)} (${cat.percentOfExpenses}% of expenses)`)
    .join('\n')

  return `${util} ${names} are currently the largest contributors to your spending:\n\n${detail}`
}

function cashFlowTimingFallback(
  c: KlaroFinancialContext,
  timing: CashFlowTimingAggregates | null | undefined
): string {
  const surplusLine =
    c.netFlow === 0
      ? `Your ${c.periodLabel} income and expenses are balanced at ${peso(c.income)}.`
      : c.netFlow > 0
        ? `Your ${c.periodLabel} numbers show a ${peso(c.netFlow)} overall surplus (income ${peso(c.income)}, expenses ${peso(c.expenses)}), so the month is positive as a whole.`
        : `Your ${c.periodLabel} numbers show a ${peso(c.netFlow)} overall deficit (income ${peso(c.income)}, expenses ${peso(c.expenses)}).`

  if (!timing || !timing.dataSufficientForTiming) {
    return [
      surplusLine,
      '',
      `That monthly total alone doesn't explain why cash can feel tight day to day. Klaro can see the timing of recorded income and expenses, but the available data doesn't establish a specific timing cause yet.`,
      '',
      timing?.limitation
        ? timing.limitation
        : 'Not enough dated income and expense events in this period to explain the cash-flow pattern.',
    ].join('\n')
  }

  const lateHeavy =
    timing.expensesDays15toEnd > timing.expensesDays1to14 && timing.expensesDays15toEnd > 0
  const earlyHeavy =
    timing.expensesDays1to14 > timing.expensesDays15toEnd && timing.expensesDays1to14 > 0

  const buckets = [
    `Looking at dated Klaro events for ${timing.periodLabel}:`,
    `• Income days 1–14: ${peso(timing.incomeDays1to14)}; days 15–end: ${peso(timing.incomeDays15toEnd)}`,
    `• Expenses days 1–14: ${peso(timing.expensesDays1to14)}; days 15–end: ${peso(timing.expensesDays15toEnd)}`,
  ].join('\n')

  if (lateHeavy && c.netFlow >= 0) {
    return [
      surplusLine,
      '',
      buckets,
      '',
      `Recorded spending is concentrated later in the month (days 15–end ${peso(timing.expensesDays15toEnd)} vs days 1–14 ${peso(timing.expensesDays1to14)}). That can make cash feel tight even when monthly income is higher than expenses.`,
    ].join('\n')
  }

  if (earlyHeavy && c.netFlow >= 0) {
    return [
      surplusLine,
      '',
      buckets,
      '',
      `Recorded spending is heavier earlier in the month (days 1–14 ${peso(timing.expensesDays1to14)} vs days 15–end ${peso(timing.expensesDays15toEnd)}). The monthly total is still positive, but early outflows can leave less room later.`,
    ].join('\n')
  }

  return [
    surplusLine,
    '',
    buckets,
    '',
    `The dated split is available, but it doesn't establish a clear early- vs late-month spending concentration by itself.`,
  ].join('\n')
}

function focusGoalFallback(
  c: KlaroFinancialContext,
  goalRunways: GoalRunwayChatContext | null | undefined,
  goalName: string
): string | null {
  const withRunway = goalRunways?.goals.find((g) => g.name === goalName)
  const plain = c.goals.find((g) => g.name === goalName)
  const g = withRunway ?? plain
  if (!g) return null

  const remaining = Math.max(0, Math.round((g.targetAmount - g.currentAmount) * 100) / 100)
  if (remaining === 0) {
    return `${g.name} is fully funded: ${peso(g.currentAmount)} of ${peso(g.targetAmount)} saved.`
  }

  let text = `You need about ${peso(remaining)} more to reach ${g.name} (${peso(g.currentAmount)} of ${peso(g.targetAmount)} saved, ${g.progressPercent}%).`
  if (withRunway?.runway.estimateAvailable && withRunway.runway.primary) {
    text += ` At your recent pace, Klaro estimates: ${withRunway.runway.primary}.`
  } else if (withRunway?.runway.limitation) {
    text += ` ${withRunway.runway.limitation}`
  }
  return text
}

function goalsFallback(
  c: KlaroFinancialContext,
  goalRunways: GoalRunwayChatContext | null | undefined,
  focus?: { kind: 'goal' | 'category'; name: string } | null
): string {
  const runwayGoals = goalRunways?.goals
  if ((!runwayGoals || runwayGoals.length === 0) && c.goals.length === 0) {
    return `You don't have active goals recorded in Klaro yet. Add a goal in KlaroPH to start tracking progress.`
  }

  if (focus?.kind === 'goal') {
    const focused = focusGoalFallback(c, goalRunways, focus.name)
    if (focused) return focused
  }

  if (runwayGoals && runwayGoals.length > 0) {
    const lines = runwayGoals.slice(0, 5).map((g) => {
      const progress = `${g.progressPercent}% (${peso(g.currentAmount)} of ${peso(g.targetAmount)})`
      if (g.runway.status === 'complete') {
        return `• ${g.name}: ${progress} — goal reached.`
      }
      if (g.runway.estimateAvailable && g.runway.primary) {
        return `• ${g.name}: ${progress} — ${g.runway.primary}${
          g.runway.secondary ? ` ${g.runway.secondary}` : ''
        }`
      }
      return `• ${g.name}: ${progress} — ${
        g.runway.limitation ??
        'Klaro cannot estimate a timeline yet (not enough contribution history).'
      }`
    })

    const longest = goalRunways?.longestEstimate
    const longestLine = longest
      ? `\n\nAmong goals with an estimate, ${longest.name} currently looks longest at about ${longest.displayMonthsRemaining} months.`
      : ''

    return `Here's how your goals look in Klaro right now:\n\n${lines.join('\n')}${longestLine}`
  }

  const lines = c.goals
    .slice(0, 3)
    .map(
      (g) =>
        `• ${g.name}: ${g.progressPercent}% (${peso(g.currentAmount)} of ${peso(g.targetAmount)})`
    )
    .join('\n')
  return `Here's how your goals look in Klaro right now:\n\n${lines}\n\nA timeline estimate needs contribution history; Klaro doesn't have enough allocation pace data in this reply.`
}

/**
 * "What should I do?" — builds on the current topic: what to watch, why (real figures),
 * and one natural next step. Never re-dumps the full overview.
 */
function adviceFallback(
  c: KlaroFinancialContext,
  intent: ChatIntent,
  goalRunways: GoalRunwayChatContext | null | undefined,
  focus: { kind: 'goal' | 'category'; name: string } | null | undefined
): string {
  if (intent === 'goals') {
    if (focus?.kind === 'goal') {
      const focused = focusGoalFallback(c, goalRunways, focus.name)
      if (focused) return focused
    }
    const behind = [...c.goals]
      .filter((g) => g.progressPercent < 100)
      .sort((a, b) => a.progressPercent - b.progressPercent)[0]
    if (!behind) {
      return `Klaro doesn't show any unfinished goals right now, so there's nothing to prioritize there yet.`
    }
    return `I'd put attention on ${behind.name} first — it's at ${behind.progressPercent}% (${peso(behind.currentAmount)} of ${peso(behind.targetAmount)}). Should I check how long it could take at your current pace?`
  }

  const top = c.topSpendingCategories.slice(0, 2)
  if (top.length === 0) {
    return `Klaro doesn't have category-level spending for ${c.periodLabel} yet, so I can't point to a specific area to focus on. Recording expenses by category would make that possible.`
  }

  let status: string
  if (c.budget) {
    status =
      c.budget.remaining < 0
        ? `You're about ${peso(c.budget.remaining)} over your ${c.periodLabel} budget.`
        : c.budget.usedPercent >= 80
          ? `Your budget is still positive, but you only have about ${peso(c.budget.remaining)} of room left.`
          : `You still have about ${peso(c.budget.remaining)} of budget room left (${c.budget.usedPercent}% used).`
  } else if (c.netFlow < 0) {
    status = `Your recorded expenses are ${peso(c.netFlow)} above your income for ${c.periodLabel}.`
  } else {
    status = `You're keeping about ${peso(c.netFlow)} after expenses for ${c.periodLabel}.`
  }

  const contributors =
    top.length === 2
      ? `${top[0].name} (${peso(top[0].spent)}) and ${top[1].name} (${peso(top[1].spent)})`
      : `${top[0].name} (${peso(top[0].spent)})`
  const next = c.budget
    ? 'Want me to show you which categories have the most budget room left?'
    : 'Should I break down the rest of your spending by category?'

  return `${status} I'd focus first on your largest spending ${top.length === 2 ? 'contributors' : 'contributor'} — ${contributors}. ${next}`
}

function periodComparisonFallback(
  c: KlaroFinancialContext,
  previous: KlaroFinancialContext | null | undefined
): string {
  if (!previous) {
    return `I can compare periods when both months have data in Klaro. For ${c.periodLabel}, income is ${peso(c.income)} and expenses are ${peso(c.expenses)} (net ${peso(c.netFlow)}). Previous-month detail isn't available in this reply.`
  }

  const expenseDelta = Math.round((c.expenses - previous.expenses) * 100) / 100
  const incomeDelta = Math.round((c.income - previous.income) * 100) / 100
  const direction =
    expenseDelta > 0
      ? `higher by ${peso(expenseDelta)}`
      : expenseDelta < 0
        ? `lower by ${peso(expenseDelta)}`
        : 'about the same'

  const lines: string[] = [
    `Comparing ${c.periodLabel} with ${previous.periodLabel}: expenses are ${direction} (${peso(c.expenses)} vs ${peso(previous.expenses)}).`,
    `Income changed by ${peso(incomeDelta)} (${peso(c.income)} vs ${peso(previous.income)}); net flow is ${peso(c.netFlow)} vs ${peso(previous.netFlow)}.`,
  ]

  const prevMap = new Map(previous.topSpendingCategories.map((x) => [x.name, x.spent]))
  const catDiffs = c.topSpendingCategories
    .map((cat) => ({
      name: cat.name,
      delta: Math.round((cat.spent - (prevMap.get(cat.name) ?? 0)) * 100) / 100,
    }))
    .filter((d) => d.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 3)

  if (catDiffs.length > 0) {
    lines.push(
      'Largest category changes:',
      ...catDiffs.map(
        (d) =>
          `• ${d.name}: ${d.delta > 0 ? '+' : '−'}${peso(d.delta)} vs ${previous.periodLabel}`
      )
    )
  }

  return lines.join('\n')
}

function loanFallback(s: LoanScenario | null | undefined): string {
  if (!s) {
    return `I couldn't put that loan estimate together right now. You can also run it in the KlaroPH Loan Calculator.`
  }
  const lines = [
    `This is an estimate — your Klaro data wasn't changed. Borrowing ${peso(s.principal)} at ${s.annualRatePercent}% a year over ${s.termMonths} months works out to about ${peso(s.monthlyPayment)} a month, or ${peso(s.totalPayment)} in total (${peso(s.totalInterest)} of interest).`,
  ]

  const cat = s.loanPaymentCategory
  if (cat && cat.budget != null) {
    lines.push(
      `For your loan budget: Loan Payment is at ${peso(cat.spentThisPeriod)} in ${s.periodLabel} against a ${peso(cat.budget)} budget. Adding about ${peso(s.monthlyPayment)} a month would bring it to ${peso(cat.projectedWithNewLoan)} (${cat.projectedBudgetUsedPercent}% of that budget).`
    )
  } else if (cat) {
    lines.push(
      `Loan Payment is at ${peso(cat.spentThisPeriod)} in ${s.periodLabel}; adding this loan would make it about ${peso(cat.projectedWithNewLoan)} a month. Klaro doesn't have a Loan Payment budget set, so I can't compare it against one.`
    )
  } else {
    lines.push(`Klaro doesn't show any Loan Payment spending in ${s.periodLabel}, so this would be a new ${peso(s.monthlyPayment)} monthly commitment.`)
  }

  const overall = s.overallBudget
  if (overall?.overBudgetBy != null) {
    lines.push(
      `You're already about ${peso(overall.overBudgetBy)} over your overall ${s.periodLabel} budget. Adding this hypothetical payment would put you about ${peso(overall.remainingAfterNewLoan)} over, assuming everything else stays the same.`
    )
  } else if (overall) {
    lines.push(
      overall.remainingAfterNewLoan >= 0
        ? `It would leave about ${peso(overall.remainingAfterNewLoan)} of your overall budget room, assuming everything else stays the same.`
        : `That's more than the ${peso(overall.remaining)} of overall budget room you have left — it would put you about ${peso(overall.remainingAfterNewLoan)} over budget.`
    )
  }

  lines.push(`Lender fees and insurance aren't included.`)
  return lines.join('\n\n')
}

function scenarioFallback(
  c: KlaroFinancialContext,
  projections: Record<string, unknown> | null | undefined
): string {
  if (projections?.type === 'category_cut') {
    const name = String(projections.categoryName ?? 'that category')
    const current = Number(projections.currentSpent) || 0
    const pct = Number(projections.percent) || 0
    const saveAmt =
      Number(projections.hypotheticalSave) ||
      Math.round(((current * pct) / 100) * 100) / 100
    return `This is a scenario — your actual Klaro data was not changed. If you reduced ${name} by ${pct}% from its current ${peso(current)}, that would be about ${peso(saveAmt)} less spending in ${c.periodLabel}.`
  }

  if (projections?.goalName) {
    return `This is a scenario — your actual Klaro data was not changed. ${String(projections.goalName)} would move from ${peso(Number(projections.currentAmount) || 0)} to about ${peso(Number(projections.projectedAmount) || 0)} (${Number(projections.projectedProgressPercent) || 0}% of target).`
  }

  if (projections?.percent != null && projections?.amount != null) {
    return `This is a scenario — your actual Klaro data was not changed. ${Number(projections.percent)}% of your ${c.periodLabel} income (${peso(c.income)}) is about ${peso(Number(projections.amount) || 0)}.`
  }

  return `This is a scenario — your actual Klaro data was not changed. Current net flow for ${c.periodLabel} is ${peso(c.netFlow)}. Any change would only appear in Klaro once you record it yourself.`
}

/** Deterministic Ask Klaro replies when Gemini is unavailable or incomplete. */
export function buildChatFallback(params: {
  message: string
  context: KlaroFinancialContext
  intent?: ChatIntent
  cashFlowTiming?: CashFlowTimingAggregates | null
  goalRunways?: GoalRunwayChatContext | null
  previousPeriod?: KlaroFinancialContext | null
  scenarioProjections?: Record<string, unknown> | null
  spending?: SpendingCategoriesResult | null
  focus?: { kind: 'goal' | 'category'; name: string } | null
  advice?: boolean
  loanScenario?: LoanScenario | null
}): string {
  const intent = params.intent ?? detectChatIntent(params.message)
  const c = params.context

  if (intent === 'loan') {
    return loanFallback(params.loanScenario)
  }

  if (params.advice) {
    return adviceFallback(c, intent, params.goalRunways, params.focus)
  }

  if (intent === 'cash_flow_timing') {
    return cashFlowTimingFallback(c, params.cashFlowTiming)
  }

  if (intent === 'net_worth') {
    return `Assets are ${peso(c.assets)} and liabilities are ${peso(c.liabilities)}. Net worth is currently ${peso(c.netWorth)}.`
  }

  if (intent === 'budget') {
    return budgetFallback(c)
  }

  if (intent === 'goals') {
    return goalsFallback(c, params.goalRunways, params.focus)
  }

  if (intent === 'savings') {
    if (c.income === 0 && c.expenses === 0) {
      return `I don't have enough income and expense data for ${c.periodLabel} to talk about savings yet.`
    }
    const monthlyTarget = parseMonthlySavingsAmount(params.message)
    if (monthlyTarget != null) {
      if (c.netFlow >= monthlyTarget) {
        return `Based on ${c.periodLabel}'s recorded numbers, your surplus is ${peso(c.netFlow)} (income ${peso(c.income)}, expenses ${peso(c.expenses)}), which covers saving ${peso(monthlyTarget)} a month with about ${peso(c.netFlow - monthlyTarget)} left over. That's one month of data, so it's worth checking against other months too.`
      }
      const gap = monthlyTarget - Math.max(0, c.netFlow)
      return `Based on ${c.periodLabel}'s recorded numbers, your surplus is ${peso(Math.max(0, c.netFlow))}, so saving ${peso(monthlyTarget)} a month would be about ${peso(gap)} more than this month's income minus expenses.`
    }
    if (c.netFlow > 0) {
      return `For ${c.periodLabel}, income ${peso(c.income)} minus expenses ${peso(c.expenses)} leaves a ${peso(c.netFlow)} surplus. That surplus is what Klaro can see as room to save — it doesn't move money automatically.`
    }
    if (c.netFlow < 0) {
      return `For ${c.periodLabel}, expenses (${peso(c.expenses)}) exceed income (${peso(c.income)}) by ${peso(c.netFlow)}, so Klaro doesn't show a surplus to save from this month's totals.`
    }
    return `For ${c.periodLabel}, income and expenses balance at ${peso(c.income)}, so Klaro doesn't show a surplus this month.`
  }

  if (intent === 'income') {
    if (/\b(source|sources|where|from|breakdown|come)\b/i.test(params.message)) {
      return `Your total income recorded for ${c.periodLabel} is ${peso(c.income)}. However, Klaro doesn't have income-source or category detail for it, so I can't tell you where this income came from.`
    }
    return `For ${c.periodLabel}, recorded income is ${peso(c.income)}. Expenses are ${peso(c.expenses)}, so net flow is ${peso(c.netFlow)}.`
  }

  if (intent === 'spending_categories') {
    return spendingCategoriesFallback(c, params.spending, params.focus, params.message)
  }

  if (intent === 'period_comparison') {
    return periodComparisonFallback(c, params.previousPeriod)
  }

  if (intent === 'scenario') {
    return scenarioFallback(c, params.scenarioProjections)
  }

  if (intent === 'general_summary') {
    return generalSummaryFallback(c)
  }

  // unknown / default — still prefer multi-fact summary over bare surplus
  return generalSummaryFallback(c)
}

/** App-side arithmetic helpers for simple scenario / percent questions. */
export function computeSimpleScenario(params: {
  message: string
  context: KlaroFinancialContext
  history?: ChatHistoryTurn[]
}): { note: string; projections?: Record<string, unknown> } | null {
  const q = params.message.toLowerCase()
  const note = 'This is a scenario — your actual Klaro data was not changed.'

  // Cut category by N% (including "cut that by 20%" with history)
  const cutPctMatch = params.message.match(/cut\b.{0,40}?\bby\s+(\d+)\s*%/i) ||
    params.message.match(/(\d+)\s*%\s*(less|reduction|cut)/i)
  if (cutPctMatch || /\bhow much (could|would|can) i save\b/.test(q)) {
    const pct = cutPctMatch
      ? Number(cutPctMatch[1])
      : (() => {
          const m = q.match(/(\d+)\s*%/)
          return m ? Number(m[1]) : 20
        })()
    if (pct > 0 && pct <= 100) {
      const known = params.context.topSpendingCategories.map((c) => c.name)
      const resolved = resolveSpendingCategoryFromHistory(
        params.message,
        params.history,
        known
      )
      const cat =
        (resolved
          ? params.context.topSpendingCategories.find((c) => c.name === resolved)
          : null) ??
        params.context.topSpendingCategories.find((c) => q.includes(c.name.toLowerCase())) ??
        null

      if (cat) {
        const hypotheticalSave = Math.round(((cat.spent * pct) / 100) * 100) / 100
        return {
          note,
          projections: {
            type: 'category_cut',
            categoryName: cat.name,
            currentSpent: cat.spent,
            percent: pct,
            hypotheticalSave,
          },
        }
      }
    }
  }

  const amountMatch = params.message.match(/₱?\s*([\d,]+(?:\.\d+)?)/)
  const amount = amountMatch ? Number(amountMatch[1].replace(/,/g, '')) : NaN

  if (Number.isFinite(amount) && amount > 0) {
    const goalHint =
      params.context.goals.find((g) => q.includes(g.name.toLowerCase())) ??
      params.context.goals.find(
        (g) => /emergency/.test(g.name.toLowerCase()) && /emergency/.test(q)
      ) ??
      null

    if (goalHint && /\b(put|allocate|toward|towards|into|save)\b/.test(q)) {
      const next = Math.min(
        goalHint.targetAmount,
        Math.round((goalHint.currentAmount + amount) * 100) / 100
      )
      const nextPct =
        goalHint.targetAmount > 0
          ? Math.min(100, Math.round((next / goalHint.targetAmount) * 100))
          : 0
      return {
        note,
        projections: {
          goalName: goalHint.name,
          addAmount: amount,
          currentAmount: goalHint.currentAmount,
          projectedAmount: next,
          currentProgressPercent: goalHint.progressPercent,
          projectedProgressPercent: nextPct,
          remainingToTarget: Math.max(0, goalHint.targetAmount - next),
        },
      }
    }
  }

  if (/\b20%\b|\btwenty percent\b|%\s*of\s*(my\s*)?income/.test(q) && params.context.income > 0) {
    const pctMatch = q.match(/(\d+)\s*%/)
    const pct = pctMatch ? Number(pctMatch[1]) : 20
    if (pct > 0 && pct <= 100) {
      const value = Math.round(((params.context.income * pct) / 100) * 100) / 100
      return {
        note: 'Calculated from your Klaro income figure.',
        projections: {
          income: params.context.income,
          percent: pct,
          amount: value,
        },
      }
    }
  }

  return null
}
