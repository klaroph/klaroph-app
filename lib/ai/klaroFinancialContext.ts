/**
 * Structured financial context for Klaro Insight.
 * Values come from EXISTING KlaroPH tables + the same math the dashboard uses.
 * Gemini must not recalculate these — it only interprets them.
 */

import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { toLocalDateString, parseLocalDateString } from '@/lib/format'
import { EXPENSE_CATEGORIES } from '@/lib/expenseCategories'
import { deriveMonthInsights } from '@/lib/dashboardInsight'

export type KlaroFinancialContext = {
  period: string
  periodLabel: string
  income: number
  expenses: number
  netFlow: number
  budget?: {
    amount: number
    spent: number
    remaining: number
    usedPercent: number
  }
  topSpendingCategories: Array<{
    name: string
    spent: number
    budget?: number
    percentOfExpenses: number
  }>
  goals: Array<{
    name: string
    targetAmount: number
    currentAmount: number
    progressPercent: number
  }>
  assets: number
  liabilities: number
  netWorth: number
  /** Deterministic observation seeds (from deriveMonthInsights) — AI must not invent different facts */
  observationSeeds: string[]
}

export type BuiltFinancialContext = {
  context: KlaroFinancialContext
  contextHash: string
}

export type SpendingCategoryRow = KlaroFinancialContext['topSpendingCategories'][number]

/**
 * Shared category aggregation (dashboard math): spent per category, effective budget
 * (plan overridden by month override), percent of total expenses. Pure.
 */
export function aggregateSpendingCategories(params: {
  expenseRows: Array<{ amount: number; category: string | null }>
  planRows: Array<{ category: string; amount: number }>
  overrideRows: Array<{ category: string; amount: number }>
  limit: number
  sort?: 'desc' | 'asc'
  /** 'room' ranks categories with a budget by (budget − spent), including unspent ones. */
  metric?: 'spent' | 'room'
}): { categories: SpendingCategoryRow[]; totalExpenses: number; totalCategories: number } {
  const spentByCategory: Record<string, number> = {}
  let total = 0
  for (const row of params.expenseRows) {
    const cat = String(row.category || 'Other')
    const amt = Number(row.amount) || 0
    spentByCategory[cat] = (spentByCategory[cat] ?? 0) + amt
    total += amt
  }
  const totalExpenses = roundMoney(total)

  const budgetByCategory = effectiveBudgetByCategory(params.planRows, params.overrideRows)
  const byRoom = params.metric === 'room'
  const keys = byRoom
    ? Object.keys(budgetByCategory).filter((k) => budgetByCategory[k] > 0)
    : Object.keys(spentByCategory)
  const rankValue = (r: SpendingCategoryRow) => (byRoom ? (r.budget ?? 0) - r.spent : r.spent)

  const all = keys
    .map((name) => {
      const spent = spentByCategory[name] ?? 0
      return {
        name: categoryLabel(name),
        spent: roundMoney(spent),
        budget: budgetByCategory[name] != null ? roundMoney(budgetByCategory[name]) : undefined,
        percentOfExpenses: totalExpenses > 0 ? Math.round((spent / totalExpenses) * 100) : 0,
      }
    })
    .sort((a, b) =>
      params.sort === 'asc' ? rankValue(a) - rankValue(b) : rankValue(b) - rankValue(a)
    )

  return {
    categories: all.slice(0, Math.max(0, params.limit)),
    totalExpenses,
    totalCategories: all.length,
  }
}

function effectiveBudgetByCategory(
  planRows: Array<{ category: string; amount: number }>,
  overrideRows: Array<{ category: string; amount: number }>
): Record<string, number> {
  const budgetByCategory: Record<string, number> = {}
  for (const r of planRows) budgetByCategory[r.category] = Number(r.amount) || 0
  for (const r of overrideRows) budgetByCategory[r.category] = Number(r.amount) || 0
  return budgetByCategory
}

export function monthBounds(periodFirst: string): {
  start: string
  endExclusive: string
  label: string
} {
  const d = parseLocalDateString(periodFirst)
  const start = toLocalDateString(new Date(d.getFullYear(), d.getMonth(), 1))
  const endExclusive = toLocalDateString(new Date(d.getFullYear(), d.getMonth() + 1, 1))
  const label = d.toLocaleString('en-PH', { month: 'long', year: 'numeric' })
  return { start, endExclusive, label }
}

function categoryLabel(value: string): string {
  return EXPENSE_CATEGORIES.find((c) => c.value === value)?.label ?? value
}

function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

/**
 * Build Klaro financial context for the authenticated user from server-side Supabase.
 * Uses the user-scoped client (RLS) AND explicit user_id filters (defense in depth).
 * Does not accept client-supplied totals.
 */
export async function buildKlaroFinancialContext(
  supabase: SupabaseClient,
  userId: string,
  periodFirst: string
): Promise<BuiltFinancialContext> {
  const { start, endExclusive, label } = monthBounds(periodFirst)

  const [
    incomeRes,
    expenseRes,
    goalsRes,
    planRes,
    overrideRes,
    accountsRes,
  ] = await Promise.all([
    supabase
      .from('income_records')
      .select('total_amount')
      .eq('user_id', userId)
      .gte('date', start)
      .lt('date', endExclusive),
    supabase
      .from('expenses')
      .select('amount, category')
      .eq('user_id', userId)
      .gte('date', start)
      .lt('date', endExclusive),
    supabase.from('goals').select('id, name, target_amount').eq('user_id', userId),
    supabase.from('budget_plans').select('category, amount').eq('user_id', userId),
    supabase
      .from('budget_overrides')
      .select('category, amount')
      .eq('user_id', userId)
      .eq('month', start),
    supabase.from('financial_accounts').select('type, amount').eq('user_id', userId),
  ])

  // income_allocations has no user_id — scope via this user's goal ids only
  const goalIds = ((goalsRes.data ?? []) as Array<{ id: string }>).map((g) => g.id)
  const allocRes =
    goalIds.length > 0
      ? await supabase.from('income_allocations').select('goal_id, amount').in('goal_id', goalIds)
      : { data: [] as Array<{ goal_id: string; amount: number }>, error: null }

  const income = roundMoney(
    (incomeRes.data ?? []).reduce((s, r) => s + (Number((r as { total_amount: number }).total_amount) || 0), 0)
  )
  const expenses = roundMoney(
    (expenseRes.data ?? []).reduce((s, r) => s + (Number((r as { amount: number }).amount) || 0), 0)
  )
  const netFlow = roundMoney(income - expenses)

  const planRows = (planRes.data ?? []) as Array<{ category: string; amount: number }>
  const overrideRows = (overrideRes.data ?? []) as Array<{ category: string; amount: number }>
  const budgetByCategory = effectiveBudgetByCategory(planRows, overrideRows)

  const budgetAmount = roundMoney(Object.values(budgetByCategory).reduce((s, n) => s + n, 0))
  const budgetSpent = expenses
  const budgetRemaining = roundMoney(budgetAmount - budgetSpent)
  const usedPercent = budgetAmount > 0 ? Math.round((budgetSpent / budgetAmount) * 100) : 0

  const { categories: topSpendingCategories } = aggregateSpendingCategories({
    expenseRows: (expenseRes.data ?? []) as Array<{ amount: number; category: string | null }>,
    planRows,
    overrideRows,
    limit: 5,
  })

  const savedByGoal: Record<string, number> = {}
  for (const row of allocRes.data ?? []) {
    const r = row as { goal_id: string; amount: number }
    savedByGoal[r.goal_id] = (savedByGoal[r.goal_id] ?? 0) + (Number(r.amount) || 0)
  }

  const goals = ((goalsRes.data ?? []) as Array<{ id: string; name: string; target_amount: number }>).map(
    (g) => {
      const targetAmount = roundMoney(Number(g.target_amount) || 0)
      const currentAmount = roundMoney(savedByGoal[g.id] ?? 0)
      const progressPercent =
        targetAmount > 0 ? Math.min(100, Math.round((currentAmount / targetAmount) * 100)) : 0
      return {
        name: g.name,
        targetAmount,
        currentAmount,
        progressPercent,
      }
    }
  )

  let assets = 0
  let liabilities = 0
  for (const row of accountsRes.data ?? []) {
    const r = row as { type: string; amount: number }
    const amt = Number(r.amount) || 0
    if (r.type === 'asset') assets += amt
    else if (r.type === 'liability') liabilities += amt
  }
  assets = roundMoney(assets)
  liabilities = roundMoney(liabilities)
  const netWorth = roundMoney(assets - liabilities)

  const totalTarget = goals.reduce((s, g) => s + g.targetAmount, 0)
  const totalSaved = goals.reduce((s, g) => s + g.currentAmount, 0)
  const goalsProgressPct =
    totalTarget > 0 ? Math.min(100, Math.round((totalSaved / totalTarget) * 100)) : 0

  const seedStack = deriveMonthInsights({
    income,
    expenses,
    goalsCount: goals.length,
    goalsProgressPct,
  })
  const observationSeeds = seedStack.items.map((i) => i.body)

  if (budgetAmount > 0 && usedPercent >= 90) {
    observationSeeds.unshift(
      `You have used about ${usedPercent}% of your monthly budget (${peso(budgetSpent)} of ${peso(budgetAmount)}).`
    )
  }
  if (topSpendingCategories[0] && expenses > 0) {
    const top = topSpendingCategories[0]
    observationSeeds.unshift(
      `${top.name} is your biggest spending category this month (${peso(top.spent)}, about ${top.percentOfExpenses}% of expenses).`
    )
  }

  const context: KlaroFinancialContext = {
    period: start,
    periodLabel: label,
    income,
    expenses,
    netFlow,
    budget:
      budgetAmount > 0
        ? {
            amount: budgetAmount,
            spent: budgetSpent,
            remaining: budgetRemaining,
            usedPercent,
          }
        : undefined,
    topSpendingCategories,
    goals,
    assets,
    liabilities,
    netWorth,
    observationSeeds: observationSeeds.slice(0, 5),
  }

  const contextHash = hashFinancialContext(context)
  return { context, contextHash }
}

function peso(n: number): string {
  return `₱${Math.abs(n).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`
}

export function hashFinancialContext(context: KlaroFinancialContext): string {
  // Stable subset — exclude observationSeeds wording drift from hash if we ever change copy
  const fingerprint = {
    period: context.period,
    income: context.income,
    expenses: context.expenses,
    netFlow: context.netFlow,
    budget: context.budget ?? null,
    topSpendingCategories: context.topSpendingCategories,
    goals: context.goals,
    assets: context.assets,
    liabilities: context.liabilities,
    netWorth: context.netWorth,
  }
  return createHash('sha256').update(JSON.stringify(fingerprint)).digest('hex')
}

export function parsePeriodParam(input: unknown): string {
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}/.test(input)) {
    const d = parseLocalDateString(input.slice(0, 10))
    return toLocalDateString(new Date(d.getFullYear(), d.getMonth(), 1))
  }
  const now = new Date()
  return toLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1))
}
