'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useSubscription } from '@/contexts/SubscriptionContext'
import { useUpgradeTriggerOptional } from '@/contexts/UpgradeTriggerContext'
import LockIcon from '@/components/ui/LockIcon'
import { toLocalDateString } from '@/lib/format'

type FilterKey =
  | 'this_week'
  | 'previous_week'
  | 'current_month'
  | 'previous_month'
  | 'this_quarter'
  | 'previous_quarter'
  | 'this_year'
  | 'previous_year'
  | 'all_time'
  | 'custom'

type IncomeRow = { total_amount: number; date: string; income_source: string | null }
type ExpenseRow = { category: string; type: string; amount: number; date: string }

/** Returns { start, end } for the month whose first day is monthFirst (YYYY-MM-01). */
function getMonthRange(monthFirst: string): { start: string; end: string } {
  const [y, m] = monthFirst.split('-').map(Number)
  const start = new Date(y, (m ?? 1) - 1, 1)
  const end = new Date(y, m ?? 1, 0)
  return { start: toLocalDateString(start), end: toLocalDateString(end) }
}

function getDateRange(
  period: FilterKey,
  customStart: string,
  customEnd: string
): { start: string; end: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()

  switch (period) {
    case 'this_week': {
      const dayOfWeek = now.getDay()
      const start = new Date(now)
      start.setDate(now.getDate() - dayOfWeek)
      return { start: toLocalDateString(start), end: toLocalDateString(now) }
    }
    case 'previous_week': {
      const dayOfWeek = now.getDay()
      const end = new Date(now)
      end.setDate(now.getDate() - dayOfWeek - 1)
      const start = new Date(end)
      start.setDate(end.getDate() - 6)
      return { start: toLocalDateString(start), end: toLocalDateString(end) }
    }
    case 'current_month': {
      const start = new Date(y, m, 1)
      const end = new Date(y, m + 1, 0)
      return { start: toLocalDateString(start), end: toLocalDateString(end) }
    }
    case 'previous_month': {
      const start = new Date(y, m - 1, 1)
      const end = new Date(y, m, 0)
      return { start: toLocalDateString(start), end: toLocalDateString(end) }
    }
    case 'this_quarter': {
      const qStart = Math.floor(m / 3) * 3
      const start = new Date(y, qStart, 1)
      const end = new Date(y, qStart + 3, 0)
      return { start: toLocalDateString(start), end: toLocalDateString(end) }
    }
    case 'previous_quarter': {
      const qStart = Math.floor(m / 3) * 3 - 3
      const start = new Date(y, qStart, 1)
      const end = new Date(y, qStart + 3, 0)
      return { start: toLocalDateString(start), end: toLocalDateString(end) }
    }
    case 'this_year':
      return { start: `${y}-01-01`, end: `${y}-12-31` }
    case 'previous_year':
      return { start: `${y - 1}-01-01`, end: `${y - 1}-12-31` }
    case 'all_time':
      return { start: '2000-01-01', end: toLocalDateString(now) }
    case 'custom':
      return { start: customStart || `${y}-01-01`, end: customEnd || toLocalDateString(now) }
  }
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** Date-level display: mm/dd/yyyy */
function formatMMDDYYYY(isoDate: string): string {
  const [y, mo, d] = isoDate.split('-').map(Number)
  const month = String(mo).padStart(2, '0')
  const day = String(d).padStart(2, '0')
  return `${month}/${day}/${y}`
}

/** Month summary display: "January 2025" */
function formatMonthYYYY(ym: string): string {
  const [y, mo] = ym.split('-').map(Number)
  return `${MONTH_NAMES[mo - 1]} ${y}`
}

/** Breakdown display mode: date-level rows vs month summary vs year summary */
function getBreakdownMode(period: FilterKey): 'date' | 'month' | 'year' {
  if (period === 'this_quarter' || period === 'previous_quarter' || period === 'this_year' || period === 'previous_year') return 'month'
  if (period === 'all_time') return 'year'
  return 'date'
}

const FILTER_BUTTONS: { key: FilterKey; label: string }[] = [
  { key: 'this_week', label: 'This Week' },
  { key: 'previous_week', label: 'Last Week' },
  { key: 'current_month', label: 'This Month' },
  { key: 'previous_month', label: 'Last Month' },
  { key: 'this_quarter', label: 'This Quarter' },
  { key: 'previous_quarter', label: 'Last Quarter' },
  { key: 'this_year', label: 'This Year' },
  { key: 'previous_year', label: 'Last Year' },
  { key: 'all_time', label: 'All Time' },
  { key: 'custom', label: 'Custom Range' },
]

/** Filter keys that require Pro (unlimited history). Free users see lock and open upgrade modal on click. */
const PREMIUM_FILTER_KEYS = new Set<FilterKey>(['previous_quarter', 'this_year', 'previous_year', 'all_time', 'custom'])
const LOCKED_FILTER_TOOLTIP = 'Available in Pro — unlock unlimited history.'

/** Display-only: rounded whole peso, abbreviated K/M for mobile; does not change stored totals. */
function formatPesoAbbrevDisplay(amount: number): string {
  const neg = amount < 0
  const v = Math.round(Math.abs(Number(amount)))
  let text: string
  if (v >= 1_000_000) {
    const m = v / 1_000_000
    if (m >= 100) text = `₱${Math.round(m)}M`
    else {
      const x = Math.round(m * 100) / 100
      let s = x.toFixed(2)
      if (s.endsWith('.00')) s = s.slice(0, -3)
      else if (s.endsWith('0')) s = s.slice(0, -1)
      text = `₱${s}M`
    }
  } else if (v >= 1_000) {
    const k = Math.round((v / 1000) * 10) / 10
    text = `₱${Number.isInteger(k) ? k : k.toFixed(1)}K`
  } else {
    text = `₱${v.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`
  }
  return neg ? `−${text}` : text
}

/** Philippine Peso (₱) icon */
function IncomeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 5v14M7 5h7a3.5 3.5 0 0 1 0 7H7M5 8.5h14M5 14.5h14" />
    </svg>
  )
}
function ExpenseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
    </svg>
  )
}
function NetIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" />
    </svg>
  )
}

function getCurrentMonthFirst(): string {
  const d = new Date()
  return toLocalDateString(new Date(d.getFullYear(), d.getMonth(), 1))
}
function getPreviousMonthFirst(): string {
  const d = new Date()
  return toLocalDateString(new Date(d.getFullYear(), d.getMonth() - 1, 1))
}

export default function IncomeExpenseFlow({
  refreshTrigger = 0,
  showTitle,
  monthFirst: monthFirstProp,
  onMonthChange,
  className,
}: {
  refreshTrigger?: number
  showTitle?: boolean
  /** When set (e.g. from dashboard Budget Overview), data uses this month's range and follows budget month. */
  monthFirst?: string
  /** When monthFirst is set, called when user changes period so parent can sync (e.g. Budget Overview). */
  onMonthChange?: (monthFirst: string) => void
  /** Optional BEM-style modifier for page-specific responsive CSS (e.g. dashboard mobile row). */
  className?: string
}) {
  const [period, setPeriod] = useState<FilterKey>('current_month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  /** When monthFirst is set (dashboard): non-null means user picked a non-month preset; data follows this, Budget Overview does not. */
  const [overridePeriod, setOverridePeriod] = useState<FilterKey | null>(null)
  const [incomeRows, setIncomeRows] = useState<IncomeRow[]>([])
  const [expenseRows, setExpenseRows] = useState<ExpenseRow[]>([])
  const [loading, setLoading] = useState(true)
  const { isPro } = useSubscription()
  const openUpgrade = useUpgradeTriggerOptional()?.openUpgradeModal

  useEffect(() => {
    if (monthFirstProp != null) setOverridePeriod(null)
  }, [monthFirstProp])

  const range = useMemo(() => {
    if (monthFirstProp && overridePeriod === null) return getMonthRange(monthFirstProp)
    const effectivePeriod = (monthFirstProp && overridePeriod !== null) ? overridePeriod : period
    return getDateRange(effectivePeriod, customStart, customEnd)
  }, [monthFirstProp, overridePeriod, period, customStart, customEnd])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setIncomeRows([])
        setExpenseRows([])
        setLoading(false)
        return
      }

      const [incRes, expRes] = await Promise.all([
        supabase
          .from('income_records')
          .select('total_amount, date, income_source')
          .gte('date', range.start)
          .lte('date', range.end)
          .order('date', { ascending: false }),
        supabase
          .from('expenses')
          .select('category, type, amount, date')
          .gte('date', range.start)
          .lte('date', range.end)
          .order('date', { ascending: false }),
      ])

      setIncomeRows((incRes.data as IncomeRow[]) || [])
      setExpenseRows((expRes.data as ExpenseRow[]) || [])
      setLoading(false)
    }
    load()
  }, [range.start, range.end, refreshTrigger])

  const totalIncome = incomeRows.reduce((s, r) => s + Number(r.total_amount), 0)
  const totalExpenses = expenseRows.reduce((s, r) => s + Number(r.amount), 0)
  const netFlow = totalIncome - totalExpenses

  const effectivePeriod = (monthFirstProp && overridePeriod !== null) ? overridePeriod : period
  const breakdownMode = useMemo(() => getBreakdownMode(effectivePeriod), [effectivePeriod])

  type DateRow = { dateFormatted: string; source: string; amount: number }
  type SummaryRow = { periodLabel: string; amount: number }

  const incomeBreakdownRows = useMemo((): (DateRow | SummaryRow)[] => {
    if (breakdownMode === 'date') {
      return incomeRows.map((r) => ({
        dateFormatted: formatMMDDYYYY(r.date),
        source: r.income_source || '—',
        amount: Number(r.total_amount),
      }))
    }
    if (breakdownMode === 'month') {
      const byMonth = new Map<string, number>()
      for (const r of incomeRows) {
        const ym = r.date.slice(0, 7)
        byMonth.set(ym, (byMonth.get(ym) ?? 0) + Number(r.total_amount))
      }
      return Array.from(byMonth.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([ym, amount]) => ({ periodLabel: formatMonthYYYY(ym), amount }))
    }
    const byYear = new Map<string, number>()
    for (const r of incomeRows) {
      const y = r.date.slice(0, 4)
      byYear.set(y, (byYear.get(y) ?? 0) + Number(r.total_amount))
    }
    return Array.from(byYear.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([y, amount]) => ({ periodLabel: y, amount }))
  }, [incomeRows, breakdownMode])

  const expenseBreakdownRows = useMemo((): (DateRow | SummaryRow)[] => {
    if (breakdownMode === 'date') {
      return expenseRows.map((r) => ({
        dateFormatted: formatMMDDYYYY(r.date),
        source: r.category || '—',
        amount: Number(r.amount),
      }))
    }
    if (breakdownMode === 'month') {
      const byMonth = new Map<string, number>()
      for (const r of expenseRows) {
        const ym = r.date.slice(0, 7)
        byMonth.set(ym, (byMonth.get(ym) ?? 0) + Number(r.amount))
      }
      return Array.from(byMonth.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([ym, amount]) => ({ periodLabel: formatMonthYYYY(ym), amount }))
    }
    const byYear = new Map<string, number>()
    for (const r of expenseRows) {
      const y = r.date.slice(0, 4)
      byYear.set(y, (byYear.get(y) ?? 0) + Number(r.amount))
    }
    return Array.from(byYear.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([y, amount]) => ({ periodLabel: y, amount }))
  }, [expenseRows, breakdownMode])

  const isDateMode = breakdownMode === 'date'

  /** Dashboard home only: mobile CSS hides all filters without this data attribute */
  const isDashboardHomeFlow = (className ?? '').includes('income-expense-flow--dashboard-page')
  const MOBILE_DASHBOARD_FILTER_KEEP: ReadonlySet<FilterKey> = new Set([
    'current_month',
    'previous_month',
    'custom',
  ])

  return (
    <div className={['income-expense-flow', className].filter(Boolean).join(' ')}>
      <div className="flow-header-and-filters">
        {showTitle && <h3 className="dash-card-title">Income & Expenses</h3>}
        <div className="flow-filter-row">
          <div className="flow-filter-buttons">
          {FILTER_BUTTONS.map((f) => {
            const isActive = monthFirstProp
              ? overridePeriod !== null
                ? f.key === overridePeriod
                : (f.key === 'current_month' && range.start === getMonthRange(getCurrentMonthFirst()).start) ||
                  (f.key === 'previous_month' && range.start === getMonthRange(getPreviousMonthFirst()).start)
              : period === f.key
            const isLocked = !isPro && openUpgrade && PREMIUM_FILTER_KEYS.has(f.key)
            return (
            <button
              key={f.key}
              type="button"
              data-flow-period={f.key}
              {...(isDashboardHomeFlow && MOBILE_DASHBOARD_FILTER_KEEP.has(f.key)
                ? { 'data-mobile-dashboard-filter': 'keep' as const }
                : {})}
              title={isLocked ? LOCKED_FILTER_TOOLTIP : undefined}
              className={`flow-filter-btn${isActive ? ' active' : ''}${isLocked ? ' analytics-filter-locked' : ''}`}
              style={isLocked ? { display: 'inline-flex', alignItems: 'center', gap: 4 } : undefined}
              onClick={() => {
                if (isLocked) {
                  openUpgrade()
                  return
                }
                if (monthFirstProp && onMonthChange) {
                  if (f.key === 'current_month') {
                    onMonthChange(getCurrentMonthFirst())
                    setOverridePeriod(null)
                  } else if (f.key === 'previous_month') {
                    onMonthChange(getPreviousMonthFirst())
                    setOverridePeriod(null)
                  } else {
                    setOverridePeriod(f.key)
                  }
                } else {
                  setPeriod(f.key)
                }
              }}
            >
              {isLocked && <LockIcon size={11} className="opacity-85" />}
              {f.label}
            </button>
          )})}
        </div>
        {effectivePeriod === 'custom' && (
          <div className="flow-custom-range">
            <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
            <span className="flow-custom-to">to</span>
            <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
          </div>
        )}
          <span className="flow-range-label">{range.start} — {range.end}</span>
        </div>
      </div>

      {loading ? (
        <div className="flow-loading">Loading...</div>
      ) : (
        <div className="flow-three-col">
          {/* Column 1: Snapshot */}
          <div className="flow-col flow-col-snapshot">
            <div className="flow-snapshot-card flow-snapshot-income">
              <IncomeIcon />
              <div>
                <div className="flow-snapshot-label">Income</div>
                <div className="flow-snapshot-value">
                  <span className="lg:hidden tabular-nums">{formatPesoAbbrevDisplay(totalIncome)}</span>
                  <span className="hidden lg:inline tabular-nums">₱{totalIncome.toLocaleString()}</span>
                </div>
              </div>
            </div>
            <div className="flow-snapshot-card flow-snapshot-expense">
              <ExpenseIcon />
              <div>
                <div className="flow-snapshot-label">Expenses</div>
                <div className="flow-snapshot-value">
                  <span className="lg:hidden tabular-nums">{formatPesoAbbrevDisplay(totalExpenses)}</span>
                  <span className="hidden lg:inline tabular-nums">₱{totalExpenses.toLocaleString()}</span>
                </div>
              </div>
            </div>
            <div className={`flow-snapshot-card flow-snapshot-net ${netFlow >= 0 ? 'positive' : 'negative'}`}>
              <NetIcon />
              <div>
                <div className="flow-snapshot-label">Net Flow</div>
                <div className="flow-snapshot-value">
                  <span className="lg:hidden tabular-nums">{formatPesoAbbrevDisplay(netFlow)}</span>
                  <span className="hidden lg:inline tabular-nums">
                    {netFlow < 0 ? '−' : ''}₱{Math.abs(netFlow).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Column 2: Income breakdown (scrollable) */}
          <div className="flow-col flow-col-income">
            <div className="flow-table-header">Income breakdown</div>
            {incomeBreakdownRows.length === 0 ? (
              <div className="flow-empty">No income in this period</div>
            ) : (
              <div className="flow-table-scroll">
                <table className="flow-table">
                  <thead>
                    <tr>
                      {isDateMode ? (
                        <>
                          <th>Date</th>
                          <th>Source</th>
                          <th style={{ textAlign: 'right' }}>Amount</th>
                        </>
                      ) : (
                        <>
                          <th>Period</th>
                          <th style={{ textAlign: 'right' }}>Amount</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {incomeBreakdownRows.map((row, i) => (
                      <tr key={isDateMode ? `${(row as DateRow).dateFormatted}-${i}` : `${(row as SummaryRow).periodLabel}-${i}`}>
                        {isDateMode ? (
                          <>
                            <td>{(row as DateRow).dateFormatted}</td>
                            <td>{(row as DateRow).source}</td>
                            <td style={{ textAlign: 'right', color: 'var(--color-success)' }}>₱{(row as DateRow).amount.toLocaleString()}</td>
                          </>
                        ) : (
                          <>
                            <td>{(row as SummaryRow).periodLabel}</td>
                            <td style={{ textAlign: 'right', color: 'var(--color-success)' }}>₱{(row as SummaryRow).amount.toLocaleString()}</td>
                          </>
                        )}
                      </tr>
                    ))}
                    <tr className="flow-table-total">
                      <td colSpan={isDateMode ? 2 : 1}>Total</td>
                      <td style={{ textAlign: 'right', color: 'var(--color-success)' }}>₱{totalIncome.toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Column 3: Expense breakdown (scrollable) */}
          <div className="flow-col flow-col-expense">
            <div className="flow-table-header">Expense breakdown</div>
            {expenseBreakdownRows.length === 0 ? (
              <div className="flow-empty">No expenses in this period</div>
            ) : (
              <div className="flow-table-scroll">
                <table className="flow-table">
                  <thead>
                    <tr>
                      {isDateMode ? (
                        <>
                          <th>Date</th>
                          <th>Category</th>
                          <th style={{ textAlign: 'right' }}>Amount</th>
                        </>
                      ) : (
                        <>
                          <th>Period</th>
                          <th style={{ textAlign: 'right' }}>Amount</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {expenseBreakdownRows.map((row, i) => (
                      <tr key={isDateMode ? `${(row as DateRow).dateFormatted}-${i}` : `${(row as SummaryRow).periodLabel}-${i}`}>
                        {isDateMode ? (
                          <>
                            <td>{(row as DateRow).dateFormatted}</td>
                            <td>{(row as DateRow).source}</td>
                            <td style={{ textAlign: 'right', color: 'var(--color-red)' }}>₱{(row as DateRow).amount.toLocaleString()}</td>
                          </>
                        ) : (
                          <>
                            <td>{(row as SummaryRow).periodLabel}</td>
                            <td style={{ textAlign: 'right', color: 'var(--color-red)' }}>₱{(row as SummaryRow).amount.toLocaleString()}</td>
                          </>
                        )}
                      </tr>
                    ))}
                    <tr className="flow-table-total">
                      <td colSpan={isDateMode ? 2 : 1}>Total</td>
                      <td style={{ textAlign: 'right', color: 'var(--color-red)' }}>₱{totalExpenses.toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
