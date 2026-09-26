import { useEffect, useState } from 'react'
import { supabase, getBrowserUser } from '@/lib/supabaseClient'
import {
  EMPTY_DASHBOARD_MONTH_MONEY,
  getMonthDateRange,
  summarizeDashboardMonth,
  type DashboardMonthMoney,
} from '@/lib/dashboardMonthMoney'

/**
 * Selected-month income and expenses for the dashboard, fetched once and shared by the
 * snapshot strip and Monthly Budget card. `data` stays null until the first load finishes;
 * later month changes / refreshes keep the previous values until the new ones arrive.
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
          .select('total_amount')
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
      setData(summarizeDashboardMonth(incRes.data ?? [], expRes.data ?? []))
      setLoading(false)
    }
    load()
    return () => {
      mounted = false
    }
  }, [monthFirst, refreshKey])

  return { data, loading }
}
