'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import FinancialChart from '@/components/charts/FinancialChart'
import { useSubscription } from '@/contexts/SubscriptionContext'

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Last 6 calendar months (oldest first) for trend labels and range */
function getLast6Months(): { monthFirst: string; label: string }[] {
  const out: { monthFirst: string; label: string }[] = []
  const now = new Date()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    const monthFirst = `${y}-${String(m).padStart(2, '0')}-01`
    out.push({ monthFirst, label: MONTH_LABELS[d.getMonth()] })
  }
  return out
}

/** Fixed chart height so the chart does not resize with viewport */
const CHART_HEIGHT_PX = 200

type ExpenseRow = { amount: number; date: string }

export default function ExpensesTrendChartCard({ refreshTrigger = 0 }: { refreshTrigger?: number }) {
  const { isPro } = useSubscription()
  const [expenseRows, setExpenseRows] = useState<ExpenseRow[]>([])
  const [loading, setLoading] = useState(true)

  const months = useMemo(() => getLast6Months(), [])
  const rangeStart = months[0].monthFirst
  const rangeEnd = useMemo(() => {
    const last = months[months.length - 1]
    const [y, m] = last.monthFirst.split('-').map(Number)
    const lastDay = new Date(y, m, 0)
    return lastDay.toISOString().slice(0, 10)
  }, [months])

  useEffect(() => {
    let mounted = true
    const load = async () => {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setExpenseRows([])
        if (mounted) setLoading(false)
        return
      }
      const { data } = await supabase
        .from('expenses')
        .select('amount, date')
        .eq('user_id', user.id)
        .gte('date', rangeStart)
        .lte('date', rangeEnd)
        .order('date', { ascending: true })
      if (mounted) {
        setExpenseRows((data as ExpenseRow[]) ?? [])
        setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [rangeStart, rangeEnd, refreshTrigger])

  const { labels, values } = useMemo(() => {
    const byMonth = new Map<string, number>()
    for (const m of months) byMonth.set(m.monthFirst, 0)
    for (const r of expenseRows) {
      const ym = r.date.slice(0, 7) + '-01'
      if (byMonth.has(ym)) byMonth.set(ym, (byMonth.get(ym) ?? 0) + Number(r.amount))
    }
    return {
      labels: months.map((m) => m.label),
      values: months.map((m) => byMonth.get(m.monthFirst) ?? 0),
    }
  }, [months, expenseRows])

  return (
    <section
      className="expenses-trend-chart-card flex flex-col bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] shadow-[var(--shadow-sm)] overflow-hidden"
      aria-labelledby="expenses-trend-chart-heading"
    >
      <div className="expenses-trend-chart-header flex-none flex items-center justify-between gap-2 px-4 pt-4 pb-2">
        <h2 id="expenses-trend-chart-heading" className="dashboard-card-title font-semibold m-0 text-[var(--text-primary)]">
          6-Month Expenses Trend
        </h2>
        <Link href="/dashboard/expenses" className="card-outline-link dashboard-card-link text-xs">
          Expenses Page →
        </Link>
      </div>
      <div className="px-4 pb-3">
        <div
          className="expenses-trend-chart-container"
          style={{ height: CHART_HEIGHT_PX, width: '100%' }}
        >
          {loading ? (
            <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">
              Loading…
            </div>
          ) : (
            <FinancialChart
              type="line"
              chartContext="trend"
              labels={labels}
              dataset={values}
              userPlan={isPro ? 'pro' : 'free'}
              height={CHART_HEIGHT_PX}
            />
          )}
        </div>
      </div>
    </section>
  )
}
