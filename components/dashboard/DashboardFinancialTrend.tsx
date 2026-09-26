'use client'

import { useEffect, useState } from 'react'
import { supabase, getBrowserUser } from '@/lib/supabaseClient'
import { toLocalDateString } from '@/lib/format'
import { getTrendInsight } from '@/lib/dashboardCardInsights'
import DashboardCardInsight from '@/components/dashboard/DashboardCardInsight'

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

type RangeMonths = 6 | 12

function getLastNMonths(n: RangeMonths): { monthFirst: string; label: string }[] {
  const out: { monthFirst: string; label: string }[] = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    out.push({
      monthFirst: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`,
      label: MONTH_LABELS[d.getMonth()],
    })
  }
  return out
}

type DashboardFinancialTrendProps = {
  refreshTrigger?: number
}

export default function DashboardFinancialTrend({ refreshTrigger = 0 }: DashboardFinancialTrendProps) {
  const [range, setRange] = useState<RangeMonths>(6)
  const [incomeByMonth, setIncomeByMonth] = useState<number[]>([])
  const [expenseByMonth, setExpenseByMonth] = useState<number[]>([])
  const [loading, setLoading] = useState(true)

  const months = getLastNMonths(range)
  const rangeStart = months[0].monthFirst
  const rangeEnd = (() => {
    const last = months[months.length - 1]
    const [y, m] = last.monthFirst.split('-').map(Number)
    return toLocalDateString(new Date(y, m, 0))
  })()

  useEffect(() => {
    let mounted = true
    const load = async () => {
      setLoading(true)
      const { data: { user } } = await getBrowserUser()
      if (!user) {
        if (mounted) {
          setIncomeByMonth(months.map(() => 0))
          setExpenseByMonth(months.map(() => 0))
          setLoading(false)
        }
        return
      }

      const [incRes, expRes] = await Promise.all([
        supabase
          .from('income_records')
          .select('total_amount, date')
          .eq('user_id', user.id)
          .gte('date', rangeStart)
          .lte('date', rangeEnd),
        supabase
          .from('expenses')
          .select('amount, date')
          .eq('user_id', user.id)
          .gte('date', rangeStart)
          .lte('date', rangeEnd),
      ])

      if (!mounted) return

      const incMap = new Map(months.map((m) => [m.monthFirst, 0]))
      const expMap = new Map(months.map((m) => [m.monthFirst, 0]))

      for (const row of incRes.data ?? []) {
        const r = row as { total_amount: number; date: string }
        const key = `${r.date.slice(0, 7)}-01`
        if (incMap.has(key)) incMap.set(key, (incMap.get(key) ?? 0) + Number(r.total_amount))
      }
      for (const row of expRes.data ?? []) {
        const r = row as { amount: number; date: string }
        const key = `${r.date.slice(0, 7)}-01`
        if (expMap.has(key)) expMap.set(key, (expMap.get(key) ?? 0) + Number(r.amount))
      }

      setIncomeByMonth(months.map((m) => incMap.get(m.monthFirst) ?? 0))
      setExpenseByMonth(months.map((m) => expMap.get(m.monthFirst) ?? 0))
      setLoading(false)
    }
    load()
    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- months derived from range
  }, [range, rangeStart, rangeEnd, refreshTrigger])

  const hasAnyData = incomeByMonth.some((v) => v > 0) || expenseByMonth.some((v) => v > 0)
  const maxVal = Math.max(1, ...incomeByMonth, ...expenseByMonth)

  const insight =
    !loading && hasAnyData
      ? getTrendInsight(incomeByMonth, expenseByMonth, months[months.length - 1].label)
      : null

  return (
    <section className="dash-financial-trend card dash-card" aria-labelledby="dash-financial-trend-heading">
      <div className="dash-financial-trend-header">
        <h3 id="dash-financial-trend-heading" className="dash-card-title">
          Your Financial Trend
        </h3>
        <div className="dash-financial-trend-controls" role="group" aria-label="Trend range">
          <button
            type="button"
            className={`dash-trend-range-btn${range === 6 ? ' is-active' : ''}`}
            onClick={() => setRange(6)}
            aria-pressed={range === 6}
          >
            6 Months
          </button>
          <button
            type="button"
            className={`dash-trend-range-btn${range === 12 ? ' is-active' : ''}`}
            onClick={() => setRange(12)}
            aria-pressed={range === 12}
          >
            12 Months
          </button>
        </div>
      </div>
      {!loading && hasAnyData && (
        <div className="dash-financial-trend-legend">
          <span className="dash-trend-legend-item dash-trend-legend-income">Income</span>
          <span className="dash-trend-legend-item dash-trend-legend-expense">Expenses</span>
        </div>
      )}
      {loading ? (
        <p className="dash-trend-loading">Loading trend…</p>
      ) : !hasAnyData ? (
        <p className="dash-trend-empty">
          Start logging income and expenses to build your financial trend.
        </p>
      ) : (
        <div
          className="dash-trend-bars"
          role="img"
          aria-label={`Income and expenses over the last ${range} months`}
        >
          {months.map((m, i) => (
            <div key={m.monthFirst} className="dash-trend-col">
              <div className="dash-trend-col-bars">
                <div
                  className="dash-trend-bar dash-trend-bar--income"
                  style={{ height: `${(incomeByMonth[i] / maxVal) * 100}%` }}
                  title={`Income ${m.label}`}
                />
                <div
                  className="dash-trend-bar dash-trend-bar--expense"
                  style={{ height: `${(expenseByMonth[i] / maxVal) * 100}%` }}
                  title={`Expenses ${m.label}`}
                />
              </div>
              <span className="dash-trend-col-label">{m.label}</span>
            </div>
          ))}
        </div>
      )}
      {insight && <DashboardCardInsight insight={insight} />}
    </section>
  )
}
