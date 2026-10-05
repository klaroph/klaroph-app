import { useEffect, useState } from 'react'
import { supabase, getBrowserUser } from '@/lib/supabaseClient'
import {
  EMPTY_DASHBOARD_MONTH_MONEY,
  getMonthDateRange,
  summarizeDashboardMonth,
  type DashboardMonthMoney,
} from '@/lib/dashboardMonthMoney'

type IncomeMonthRow = { id: string; total_amount: number | string | null }
type AllocationAmountRow = { amount: number | string | null }

/**
 * Selected-month income, allocations on that income, and expenses for the dashboard.
 * Fetched once and shared by the snapshot strip and Monthly Budget card.
 * Allocations are tied to income dated in the month (`income_record_id`), matching
 * other allocation reads — they are not expenses and have no date of their own.
 * `data` stays null until the first load finishes; later month changes / refreshes
 * keep the previous values until the new ones arrive.
 */
export function useDashboardMonthMoney(monthFirst: string, refreshKey: number) {
  const [data, setData] = useState<DashboardMonthMoney | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      setLoading(true)
      const { data: { user } } = await getBrowserUser()
      if (!mounted) return
      if (!user) {
        setData(EMPTY_DASHBOARD_MONTH_MONEY)
        setLoading(false)
        return
      }
      const { start, end } = getMonthDateRange(monthFirst)
      const [incRes, expRes] = await Promise.all([
        supabase
          .from('income_records')
          .select('id, total_amount')
          .eq('user_id', user.id)
          .gte('date', start)
          .lte('date', end),
        supabase
          .from('expenses')
          .select('category, amount')
          .eq('user_id', user.id)
          .gte('date', start)
          .lte('date', end),
      ])
      if (!mounted) return
      const incomeRows = (incRes.data ?? []) as IncomeMonthRow[]
      const incomeIds = incomeRows.map((row) => row.id).filter((id) => typeof id === 'string' && id.length > 0)
      let allocationRows: AllocationAmountRow[] = []
      if (incomeIds.length > 0) {
        const allocRes = await supabase
          .from('income_allocations')
          .select('amount')
          .in('income_record_id', incomeIds)
        if (!mounted) return
        allocationRows = (allocRes.data ?? []) as AllocationAmountRow[]
      }
      setData(summarizeDashboardMonth(incomeRows, expRes.data ?? [], allocationRows))
      setLoading(false)
    }
    load()
    return () => {
      mounted = false
    }
  }, [monthFirst, refreshKey])

  return { data, loading }
}
