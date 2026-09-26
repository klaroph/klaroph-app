/**
 * Date-level cash-flow aggregates for Ask Klaro timing questions.
 * Uses existing income_records.date and expenses.date — no descriptions.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { parseLocalDateString } from '@/lib/format'
import { monthBounds } from '@/lib/ai/klaroFinancialContext'

export type CashFlowTimingAggregates = {
  period: string
  periodLabel: string
  incomeEventCount: number
  expenseEventCount: number
  /** Days 1–14 vs 15–end (common mid-month payday split) */
  incomeDays1to14: number
  incomeDays15toEnd: number
  expensesDays1to14: number
  expensesDays15toEnd: number
  /** Calendar weeks within the month (1–7, 8–14, 15–21, 22–end) */
  expensesByWeekBucket: Array<{ label: string; amount: number }>
  incomeByWeekBucket: Array<{ label: string; amount: number }>
  dataSufficientForTiming: boolean
  limitation: string | null
}

function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

function dayOfMonth(dateStr: string): number {
  const d = parseLocalDateString(String(dateStr).slice(0, 10))
  return d.getDate()
}

function weekBucket(day: number): string {
  if (day <= 7) return 'days_1_7'
  if (day <= 14) return 'days_8_14'
  if (day <= 21) return 'days_15_21'
  return 'days_22_end'
}

/**
 * Build timing aggregates from dated income/expense rows.
 * AVAILABLE from current data model: yes (date columns exist).
 * Does NOT include raw transaction descriptions.
 */
export async function buildCashFlowTimingAggregates(
  supabase: SupabaseClient,
  userId: string,
  periodFirst: string
): Promise<CashFlowTimingAggregates> {
  const { start, endExclusive, label } = monthBounds(periodFirst)

  const [incomeRes, expenseRes] = await Promise.all([
    supabase
      .from('income_records')
      .select('total_amount, date')
      .eq('user_id', userId)
      .gte('date', start)
      .lt('date', endExclusive),
    supabase
      .from('expenses')
      .select('amount, date')
      .eq('user_id', userId)
      .gte('date', start)
      .lt('date', endExclusive),
  ])

  let incomeDays1to14 = 0
  let incomeDays15toEnd = 0
  let expensesDays1to14 = 0
  let expensesDays15toEnd = 0
  const incomeWeeks: Record<string, number> = {
    days_1_7: 0,
    days_8_14: 0,
    days_15_21: 0,
    days_22_end: 0,
  }
  const expenseWeeks: Record<string, number> = {
    days_1_7: 0,
    days_8_14: 0,
    days_15_21: 0,
    days_22_end: 0,
  }

  for (const row of incomeRes.data ?? []) {
    const amt = Number((row as { total_amount: number }).total_amount) || 0
    const day = dayOfMonth(String((row as { date: string }).date))
    if (day <= 14) incomeDays1to14 += amt
    else incomeDays15toEnd += amt
    incomeWeeks[weekBucket(day)] += amt
  }

  for (const row of expenseRes.data ?? []) {
    const amt = Number((row as { amount: number }).amount) || 0
    const day = dayOfMonth(String((row as { date: string }).date))
    if (day <= 14) expensesDays1to14 += amt
    else expensesDays15toEnd += amt
    expenseWeeks[weekBucket(day)] += amt
  }

  const incomeEventCount = (incomeRes.data ?? []).length
  const expenseEventCount = (expenseRes.data ?? []).length
  const dataSufficientForTiming = incomeEventCount > 0 && expenseEventCount > 0

  return {
    period: start,
    periodLabel: label,
    incomeEventCount,
    expenseEventCount,
    incomeDays1to14: roundMoney(incomeDays1to14),
    incomeDays15toEnd: roundMoney(incomeDays15toEnd),
    expensesDays1to14: roundMoney(expensesDays1to14),
    expensesDays15toEnd: roundMoney(expensesDays15toEnd),
    incomeByWeekBucket: Object.entries(incomeWeeks).map(([labelKey, amount]) => ({
      label: labelKey,
      amount: roundMoney(amount),
    })),
    expensesByWeekBucket: Object.entries(expenseWeeks).map(([labelKey, amount]) => ({
      label: labelKey,
      amount: roundMoney(amount),
    })),
    dataSufficientForTiming,
    limitation: dataSufficientForTiming
      ? null
      : 'Klaro has monthly totals but not enough dated income and expense events in this period to explain cash-flow timing.',
  }
}
