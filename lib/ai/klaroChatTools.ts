/**
 * Ask Klaro server-side financial tools.
 * userId must come from the authenticated session (auth.getUser()) — never from the client.
 * Each tool reuses existing Klaro query/calculation logic; add new tools here.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  aggregateSpendingCategories,
  monthBounds,
  type SpendingCategoryRow,
} from '@/lib/ai/klaroFinancialContext'

/** Abuse protection for conversational "top N" requests. */
export const SPENDING_LIMIT_MAX = 20
export const SPENDING_LIMIT_DEFAULT = 3

export function clampSpendingLimit(n: unknown): number {
  const v = Math.floor(Number(n))
  if (!Number.isFinite(v) || v < 1) return SPENDING_LIMIT_DEFAULT
  return Math.min(v, SPENDING_LIMIT_MAX)
}

export type SpendingCategoriesResult = {
  period: string
  periodLabel: string
  sort: 'desc' | 'asc'
  metric: 'spent' | 'room'
  requestedLimit: number
  /** Ordinal request ("second largest" → 2): `categories` holds only that position (or is empty). */
  rank: number | null
  totalExpenses: number
  /** Categories eligible for this ranking (with spending, or with a budget for 'room'). */
  totalCategories: number
  categories: SpendingCategoryRow[]
}

/** Top-N (`limit`) or a single ordinal position (`rank`), ranked by spent or budget room. */
export async function getSpendingCategories(params: {
  supabase: SupabaseClient
  userId: string
  period: string
  limit: number
  rank?: number | null
  sort?: 'desc' | 'asc'
  metric?: 'spent' | 'room'
}): Promise<SpendingCategoriesResult> {
  const { start, endExclusive, label } = monthBounds(params.period)
  const rank = params.rank == null ? null : clampSpendingLimit(params.rank)
  const limit = rank ?? clampSpendingLimit(params.limit)
  const sort = params.sort === 'asc' ? 'asc' : 'desc'
  const metric = params.metric === 'room' ? 'room' : 'spent'

  const [expenseRes, planRes, overrideRes] = await Promise.all([
    params.supabase
      .from('expenses')
      .select('amount, category')
      .eq('user_id', params.userId)
      .gte('date', start)
      .lt('date', endExclusive),
    params.supabase.from('budget_plans').select('category, amount').eq('user_id', params.userId),
    params.supabase
      .from('budget_overrides')
      .select('category, amount')
      .eq('user_id', params.userId)
      .eq('month', start),
  ])

  if (expenseRes.error) {
    console.error('[klaro-chat] spending_tool_error', { message: expenseRes.error.message })
  }

  const agg = aggregateSpendingCategories({
    expenseRows: (expenseRes.data ?? []) as Array<{ amount: number; category: string | null }>,
    planRows: (planRes.data ?? []) as Array<{ category: string; amount: number }>,
    overrideRows: (overrideRes.data ?? []) as Array<{ category: string; amount: number }>,
    limit,
    sort,
    metric,
  })

  return {
    period: start,
    periodLabel: label,
    sort,
    metric,
    requestedLimit: rank != null ? 1 : limit,
    rank,
    totalExpenses: agg.totalExpenses,
    totalCategories: agg.totalCategories,
    categories: rank != null ? agg.categories.slice(rank - 1, rank) : agg.categories,
  }
}

/** The authenticated user's goal names — used to resolve and clarify goal references. */
export async function getGoalNames(supabase: SupabaseClient, userId: string): Promise<string[]> {
  const { data, error } = await supabase.from('goals').select('name').eq('user_id', userId)
  if (error) {
    console.error('[klaro-chat] goal_names_error', { message: error.message })
    return []
  }
  return ((data ?? []) as Array<{ name: string | null }>)
    .map((g) => String(g.name ?? '').trim())
    .filter(Boolean)
}
