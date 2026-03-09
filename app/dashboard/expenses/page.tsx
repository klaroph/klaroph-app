'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabaseClient'
import { EXPENSE_CATEGORIES } from '../../../lib/expenseCategories'
import AddExpenseModal from '../../../components/dashboard/AddExpenseModal'
import EditExpenseModal, { type ExpenseRecord } from '../../../components/dashboard/EditExpenseModal'
import ImportCSVModal from '@/components/dashboard/ImportCSVModal'
import BudgetOverview from '@/components/dashboard/BudgetOverview'
import BudgetPlanner from '@/components/budget/BudgetPlanner'
import MonthOverrideModal from '@/components/budget/MonthOverrideModal'
import CardHeaderWithAction from '@/components/cards/CardHeaderWithAction'
import {
  TREND_CHART_TYPES,
  CATEGORY_CHART_TYPES,
  TREND_CHART_TYPES_PREMIUM,
  CATEGORY_CHART_TYPES_PREMIUM,
  type PlanType,
  type TrendChartType,
  type CategoryChartType,
} from '@/lib/chart-types'
import FinancialChart, { isProChartType, type ChartTypeTrend, type ChartTypeCategory } from '@/components/charts/FinancialChart'
import PremiumBadge from '@/components/ui/PremiumBadge'
import UpgradeCTA from '@/components/ui/UpgradeCTA'
import LockIcon from '@/components/ui/LockIcon'
import { useSubscription } from '@/contexts/SubscriptionContext'
import { usePremiumGate } from '@/hooks/usePremiumGate'
import { useUpgradeTrigger } from '@/contexts/UpgradeTriggerContext'
import { useTriggerDateRangeBeyond90 } from '@/hooks/useSmartUpgradeTriggers'
import { getAllTimeRangeAndGrouping, type AllTimeRangeResult } from '@/lib/allTimeRange'
import { DASHBOARD_REFRESH_EVENT } from '@/lib/dashboardRefresh'
import { toLocalDateString } from '@/lib/format'

type ExpenseRow = {
  id: string
  category: string
  type: string
  amount: number
  date: string
  description?: string | null
}

type FilterPeriod = 'this_week' | 'previous_week' | 'month' | 'previous_month' | 'quarter' | 'previous_quarter' | 'year' | 'previous_year' | 'all_time' | 'custom'

/** Returns { start, end } for the month whose first day is monthFirst (YYYY-MM-01). */
function getMonthRange(monthFirst: string): { start: string; end: string } {
  const [y, m] = monthFirst.split('-').map(Number)
  const start = new Date(y, (m ?? 1) - 1, 1)
  const end = new Date(y, (m ?? 1), 0)
  return { start: toLocalDateString(start), end: toLocalDateString(end) }
}

function getRange(period: FilterPeriod, customStart: string, customEnd: string) {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const dayOfWeek = now.getDay()
  switch (period) {
    case 'this_week': {
      const start = new Date(now)
      start.setDate(now.getDate() - dayOfWeek)
      return { start: toLocalDateString(start), end: toLocalDateString(now) }
    }
    case 'previous_week': {
      const end = new Date(now)
      end.setDate(now.getDate() - dayOfWeek - 1)
      const start = new Date(end)
      start.setDate(end.getDate() - 6)
      return { start: toLocalDateString(start), end: toLocalDateString(end) }
    }
    case 'month': return { start: toLocalDateString(new Date(y, m, 1)), end: toLocalDateString(new Date(y, m + 1, 0)) }
    case 'previous_month': return { start: toLocalDateString(new Date(y, m - 1, 1)), end: toLocalDateString(new Date(y, m, 0)) }
    case 'quarter': {
      const q = Math.floor(m / 3) * 3
      return { start: toLocalDateString(new Date(y, q, 1)), end: toLocalDateString(new Date(y, q + 3, 0)) }
    }
    case 'previous_quarter': {
      const q = Math.floor(m / 3) * 3 - 3
      const start = new Date(y, q, 1)
      const end = new Date(y, q + 3, 0)
      return { start: toLocalDateString(start), end: toLocalDateString(end) }
    }
    case 'year': return { start: `${y}-01-01`, end: `${y}-12-31` }
    case 'previous_year': return { start: `${y - 1}-01-01`, end: `${y - 1}-12-31` }
    case 'all_time': return { start: toLocalDateString(now), end: toLocalDateString(now) }
    case 'custom': return { start: customStart || `${y}-01-01`, end: customEnd || toLocalDateString(now) }
  }
}

function aggregateByCategory(rows: ExpenseRow[]) {
  const map = new Map<string, number>()
  for (const r of rows) {
    const key = r.category || 'Other'
    map.set(key, (map.get(key) ?? 0) + Number(r.amount))
  }
  return Array.from(map.entries())
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total)
}

const PERIOD_LABELS: Record<FilterPeriod, string> = {
  this_week: 'This Week',
  previous_week: 'Last Week',
  month: 'This Month',
  previous_month: 'Last Month',
  quarter: 'This Quarter',
  previous_quarter: 'Last Quarter',
  year: 'This Year',
  previous_year: 'Last Year',
  all_time: 'All Time',
  custom: 'Custom Range',
}

/** Periods that require Pro (unlimited history). Free users see lock and open upgrade modal on click. */
const PREMIUM_PERIODS = new Set<FilterPeriod>(['previous_quarter', 'year', 'previous_year', 'all_time', 'custom'])
const LOCKED_FILTER_TOOLTIP = 'Available in Pro — unlock unlimited history.'

function getTrendGrouping(period: FilterPeriod): 'day' | 'month' | 'year' {
  if (period === 'year' || period === 'previous_year') return 'month'
  return 'day'
}

const dayLabelFmt = new Intl.DateTimeFormat('en-PH', { month: '2-digit', day: '2-digit' })
const monthLabelFmt = new Intl.DateTimeFormat('en-PH', { month: 'short', year: 'numeric' })
const monthLongFmt = new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric' })
function formatMonthLabel(monthFirst: string): string {
  const [y, m] = monthFirst.split('-').map(Number)
  return monthLongFmt.format(new Date(y, (m ?? 1) - 1, 1))
}

function formatTrendLabel(key: string, grouping: 'day' | 'month' | 'year'): string {
  if (grouping === 'day') {
    const [y, m, d] = key.split('-').map(Number)
    return dayLabelFmt.format(new Date(y, (m ?? 1) - 1, d ?? 1))
  }
  if (grouping === 'month') {
    const [y, m] = key.split('-').map(Number)
    return monthLabelFmt.format(new Date(y, (m ?? 1) - 1, 1))
  }
  return key
}

const BAR_COLORS = ['#dc2626', '#ef4444', '#f87171', '#fca5a5', '#fecaca', '#fee2e2']
const UNIQUE_CATEGORIES = [...new Set(EXPENSE_CATEGORIES.map((c) => c.value))]

const TREND_TYPE_LABELS: Record<ChartTypeTrend, string> = {
  line: 'Line',
  bar: 'Bar',
  area: 'Area',
  multiLine: 'Multi-line',
}
const CATEGORY_TYPE_LABELS: Record<ChartTypeCategory, string> = {
  pie: 'Pie',
  doughnut: 'Doughnut',
  radar: 'Radar',
}

export default function ExpensesPage() {
  const router = useRouter()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<ExpenseRecord | null>(null)
  const [rows, setRows] = useState<ExpenseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [period, setPeriod] = useState<FilterPeriod>('month')
  const [typeFilter, setTypeFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [trendChartType, setTrendChartType] = useState<TrendChartType>('line')
  const [categoryChartType, setCategoryChartType] = useState<CategoryChartType>('pie')
  const [attemptedProTrendType, setAttemptedProTrendType] = useState<TrendChartType | null>(null)
  const [attemptedProCategoryType, setAttemptedProCategoryType] = useState<CategoryChartType | null>(null)
  const [exportLoading, setExportLoading] = useState(false)
  const [allTimeRange, setAllTimeRange] = useState<AllTimeRangeResult | null>(null)
  const [isMobilePortrait, setIsMobilePortrait] = useState(false)
  const [budgetRefreshKey, setBudgetRefreshKey] = useState(0)
  const [budgetPlannerOpen, setBudgetPlannerOpen] = useState(false)
  const [monthOverrideOpen, setMonthOverrideOpen] = useState(false)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [overrideMonth, setOverrideMonth] = useState(() => {
    const d = new Date()
    d.setDate(1)
    d.setHours(0, 0, 0, 0)
    return d.toISOString().slice(0, 10)
  })
  const currentMonthFirst = useMemo(() => {
    const d = new Date()
    d.setDate(1)
    d.setHours(0, 0, 0, 0)
    return d.toISOString().slice(0, 10)
  }, [])
  const previousMonthFirst = useMemo(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 1)
    d.setDate(1)
    d.setHours(0, 0, 0, 0)
    return d.toISOString().slice(0, 10)
  }, [])
  const [budgetSelectedMonth, setBudgetSelectedMonth] = useState(currentMonthFirst)
  const [syncFromBudget, setSyncFromBudget] = useState(false)

  const { isPro, features } = useSubscription()
  const { openUpgradeModal } = useUpgradeTrigger()

  useEffect(() => {
    const checkOrientation = () => {
      const isMobile = window.innerWidth <= 768
      const isPortrait = window.innerHeight > window.innerWidth
      setIsMobilePortrait(isMobile && isPortrait)
    }

    checkOrientation()
    window.addEventListener('resize', checkOrientation)

    return () => window.removeEventListener('resize', checkOrientation)
  }, [])

  useEffect(() => {
    const onRefresh = () => setRefreshTrigger((n) => n + 1)
    window.addEventListener(DASHBOARD_REFRESH_EVENT, onRefresh)
    return () => window.removeEventListener(DASHBOARD_REFRESH_EVENT, onRefresh)
  }, [])

  const userPlan = isPro ? 'pro' : 'free'
  const { requestProFeature } = usePremiumGate({ onRequestPro: openUpgradeModal })

  const resolvedPlan: PlanType = isPro ? 'premium' : 'free'
  const availableTrendTypes = TREND_CHART_TYPES[resolvedPlan]
  const availableCategoryTypes = CATEGORY_CHART_TYPES[resolvedPlan]
  const safeTrendType: TrendChartType = availableTrendTypes.includes(trendChartType) ? trendChartType : availableTrendTypes[0]
  const safeCategoryType: CategoryChartType = availableCategoryTypes.includes(categoryChartType) ? categoryChartType : availableCategoryTypes[0]

  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const range = useMemo(() => {
    if (syncFromBudget) return getMonthRange(budgetSelectedMonth)
    if (period === 'all_time') return allTimeRange ?? { start: today, end: today }
    return getRange(period, customStart, customEnd)
  }, [syncFromBudget, budgetSelectedMonth, period, customStart, customEnd, allTimeRange, today])
  const trendGrouping = period === 'all_time' ? (allTimeRange?.grouping ?? 'day') : getTrendGrouping(period)
  useTriggerDateRangeBeyond90(range.start, features?.analyticsCutoffDate)

  useEffect(() => {
    if (period !== 'all_time') {
      setAllTimeRange(null)
      return
    }
    let mounted = true
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!mounted || !user) return
      getAllTimeRangeAndGrouping(supabase, user.id, 'expenses').then((result) => {
        if (mounted) setAllTimeRange(result)
      })
    })
    return () => { mounted = false }
  }, [period, refreshTrigger])

  useEffect(() => {
    if (period === 'all_time' && !allTimeRange) return
    const load = async () => {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setRows([])
        setLoading(false)
        return
      }
      let query = supabase
        .from('expenses')
        .select('id, category, type, amount, date, description')
        .eq('user_id', user.id)
        .gte('date', range.start)
        .lte('date', range.end)
        .order('date', { ascending: false })
      if (typeFilter) query = query.eq('type', typeFilter)
      if (categoryFilter) query = query.eq('category', categoryFilter)
      const { data, error } = await query
      setRows((data as ExpenseRow[]) || [])
      setLoading(false)
    }
    load()
  }, [period, allTimeRange, refreshTrigger, range.start, range.end, typeFilter, categoryFilter])

  const totalExpenses = useMemo(() => rows.reduce((s, r) => s + Number(r.amount), 0), [rows])
  const byCategory = useMemo(() => aggregateByCategory(rows), [rows])
  const topCategory = byCategory[0]
  const topCategoryPct = totalExpenses > 0 && topCategory ? Math.round((topCategory.total / totalExpenses) * 100) : 0
  const maxCatVal = Math.max(1, ...byCategory.map((c) => c.total))

  const spendingByCategoryForBudget = useMemo(() => {
    const monthRange = getMonthRange(budgetSelectedMonth)
    if (range.start !== monthRange.start || range.end !== monthRange.end) return undefined
    return Object.fromEntries(byCategory.map((c) => [c.category, c.total]))
  }, [budgetSelectedMonth, range.start, range.end, byCategory])

  const effectivePeriodForPill = syncFromBudget
    ? (budgetSelectedMonth === currentMonthFirst ? 'month' : budgetSelectedMonth === previousMonthFirst ? 'previous_month' : period)
    : period

  const trendData = useMemo(() => {
    const trendMap = new Map<string, number>()
    for (const r of rows) {
      const key =
        trendGrouping === 'day'
          ? r.date
          : trendGrouping === 'month'
            ? r.date.slice(0, 7)
            : r.date.slice(0, 4)
      trendMap.set(key, (trendMap.get(key) ?? 0) + Number(r.amount))
    }
    if (trendGrouping === 'day' && range.start && range.end) {
      const out: [string, number][] = []
      const start = new Date(range.start)
      const end = new Date(range.end)
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const key = d.toISOString().slice(0, 10)
        out.push([key, trendMap.get(key) ?? 0])
      }
      return out.sort((a, b) => a[0].localeCompare(b[0]))
    }
    if (trendGrouping === 'month' && range.start && range.end) {
      const out: [string, number][] = []
      const [sy, sm] = range.start.slice(0, 7).split('-').map(Number)
      const [ey, em] = range.end.slice(0, 7).split('-').map(Number)
      for (let y = sy; y <= ey; y++) {
        const mStart = y === sy ? (sm ?? 1) : 1
        const mEnd = y === ey ? (em ?? 12) : 12
        for (let m = mStart; m <= mEnd; m++) {
          const key = `${y}-${String(m).padStart(2, '0')}`
          out.push([key, trendMap.get(key) ?? 0])
        }
      }
      return out.sort((a, b) => a[0].localeCompare(b[0]))
    }
    if (trendGrouping === 'year' && range.start && range.end) {
      const out: [string, number][] = []
      const sy = Number(range.start.slice(0, 4))
      const ey = Number(range.end.slice(0, 4))
      for (let y = sy; y <= ey; y++) {
        const key = String(y)
        out.push([key, trendMap.get(key) ?? 0])
      }
      return out.sort((a, b) => a[0].localeCompare(b[0]))
    }
    return Array.from(trendMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [rows, range.start, range.end, trendGrouping])
  const trendLabels = useMemo(() => trendData.map(([key]) => formatTrendLabel(key, trendGrouping)), [trendData, trendGrouping])
  const trendValues = useMemo(() => trendData.map(([, v]) => v), [trendData])

  const categoryChartData = useMemo(() => {
    if (byCategory.length <= 8) {
      return { labels: byCategory.map((c) => c.category), values: byCategory.map((c) => c.total) }
    }
    const top = byCategory.slice(0, 7)
    const rest = byCategory.slice(7)
    const othersTotal = rest.reduce((s, c) => s + c.total, 0)
    return {
      labels: [...top.map((c) => c.category), 'Others'],
      values: [...top.map((c) => c.total), othersTotal],
    }
  }, [byCategory])

  const labelStyle: React.CSSProperties = { fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }
  const valueStyle: React.CSSProperties = { fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }

  return (
    <div className="expenses-page premium-page">
      <div className="page-header page-header-with-actions">
        <div>
          <h2>Expenses</h2>
          <p>See where your money goes. Awareness is the first step to control.</p>
        </div>
        <div className="page-header-actions">
          {isPro ? (
            <button
              type="button"
              className="btn-secondary"
              style={{ padding: '8px 14px', fontSize: 14 }}
              disabled={exportLoading}
              onClick={async () => {
                setExportLoading(true)
                try {
                  const res = await fetch('/api/analytics/export', { credentials: 'include' })
                  if (res.ok) {
                    const blob = await res.blob()
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = 'klaroph-export.csv'
                    a.click()
                    URL.revokeObjectURL(url)
                  }
                } finally {
                  setExportLoading(false)
                }
              }}
            >
              {exportLoading ? 'Exporting…' : 'Export CSV'}
            </button>
          ) : (
            <span title="CSV export available in Pro plan." className="premium-btn-disabled">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Export CSV
              <PremiumBadge size="sm" />
            </span>
          )}
          <button type="button" className="btn-secondary" style={{ padding: '8px 14px', fontSize: 14 }} onClick={() => setImportModalOpen(true)}>
            Import CSV
          </button>
          <button className="btn-primary header-add-btn-desktop-only" onClick={() => setModalOpen(true)}>
            + Add Expense
          </button>
        </div>
      </div>

      <ImportCSVModal
        mode="expense"
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onSuccess={() => { setRefreshTrigger((n) => n + 1); setBudgetRefreshKey((k) => k + 1); }}
      />

      <div className="income-expense-page">
      {/* Monthly Budget Overview at top */}
      <div style={{ marginBottom: 24 }}>
        <BudgetOverview
          spendingByCategory={spendingByCategoryForBudget}
          budgetRefreshKey={budgetRefreshKey}
          selectedMonth={budgetSelectedMonth}
          onMonthChange={(month) => {
            setBudgetSelectedMonth(month)
            setSyncFromBudget(true)
          }}
          onSetBudget={() => setBudgetPlannerOpen(true)}
          onEditThisMonth={(month) => {
            setOverrideMonth(month)
            setMonthOverrideOpen(true)
          }}
        />
      </div>

      {/* Row 1: Summary Cards (3 columns) */}
      <div className="income-expense-summary-grid">
        <div className="income-expense-summary-card premium-summary-card premium-summary-card-accent-red">
          <div style={labelStyle}>Total Expenses</div>
          <div style={{ ...valueStyle, color: 'var(--color-danger)' }}>
            {loading ? '...' : `₱${totalExpenses.toLocaleString()}`}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{syncFromBudget ? formatMonthLabel(budgetSelectedMonth) : PERIOD_LABELS[period]}</div>
        </div>

        <div className="income-expense-summary-card premium-summary-card premium-summary-card-accent-yellow">
          <div style={labelStyle}>Top Category</div>
          <div style={valueStyle}>
            {loading ? '...' : (topCategory?.category ?? '—')}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, fontWeight: 600 }}>
            {loading ? '...' : (topCategory ? `₱${topCategory.total.toLocaleString()}` : '—')}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            {loading ? '...' : (topCategory ? `${topCategoryPct}% of expenses` : '—')}
          </div>
        </div>

        <div className="income-expense-summary-card income-expense-filters-card premium-summary-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {isMobilePortrait && (
            <div className="rotate-overlay">
              <div className="rotate-card">
                <p>For better chart visibility, rotate your device.</p>
              </div>
            </div>
          )}
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Filters
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(['this_week', 'previous_week', 'month', 'previous_month', 'quarter', 'previous_quarter', 'year', 'previous_year', 'all_time', 'custom'] as FilterPeriod[]).map((p) => {
              const isLocked = !isPro && PREMIUM_PERIODS.has(p)
              return (
                <button
                  key={p}
                  type="button"
                  title={isLocked ? LOCKED_FILTER_TOOLTIP : undefined}
                  onClick={() => {
                    if (isLocked) {
                      openUpgradeModal()
                      return
                    }
                    setSyncFromBudget(false)
                    setPeriod(p)
                    if (p === 'month') setBudgetSelectedMonth(currentMonthFirst)
                    else if (p === 'previous_month') setBudgetSelectedMonth(previousMonthFirst)
                  }}
                  style={{
                    padding: '4px 10px', fontSize: 12, fontWeight: effectivePeriodForPill === p ? 600 : 400,
                    border: `1px solid ${effectivePeriodForPill === p ? '#dc2626' : 'var(--border)'}`,
                    borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
                    background: effectivePeriodForPill === p ? 'rgba(220, 38, 38, 0.08)' : 'var(--surface)',
                    color: effectivePeriodForPill === p ? '#dc2626' : 'var(--text-secondary)',
                    opacity: isLocked ? 0.85 : 1,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                  className={isLocked ? 'analytics-filter-locked' : ''}
                >
                  {isLocked && <LockIcon size={11} />}
                  {PERIOD_LABELS[p]}
                </button>
              )
            })}
          </div>
          {period === 'custom' && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} style={{ fontSize: 12, padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 6 }} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>to</span>
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} style={{ fontSize: 12, padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 6 }} />
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              style={{ fontSize: 12, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'inherit', flex: 1, minWidth: 0 }}
            >
              <option value="">All Types</option>
              <option value="needs">Needs</option>
              <option value="wants">Wants</option>
            </select>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              style={{ fontSize: 12, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'inherit', flex: 1, minWidth: 0 }}
            >
              <option value="">All Categories</option>
              {UNIQUE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button
              type="button"
              onClick={() => {
                setSyncFromBudget(false)
                setPeriod('month')
                setBudgetSelectedMonth(currentMonthFirst)
                setTypeFilter('')
                setCategoryFilter('')
                setCustomStart('')
                setCustomEnd('')
              }}
              style={{ fontSize: 12, padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'inherit', cursor: 'pointer', background: 'var(--surface)', color: 'var(--text-secondary)' }}
            >
              Reset Filter
            </button>
          </div>
        </div>
      </div>

      {/* Row 2: Two-column layout */}
      <div className="income-expense-two-col">
        {/* LEFT — Trend + Breakdown */}
        <div className="income-expense-left-col">
          {/* Trend Chart */}
          <div className="income-expense-trend-section premium-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>Expense Trend</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label htmlFor="expense-trend-type" style={{ fontSize: 12, color: 'var(--text-muted)' }}>Chart:</label>
                <select
                  id="expense-trend-type"
                  value={safeTrendType}
                  onChange={(e) => {
                    const v = e.target.value as TrendChartType
                    if (isPro) {
                      setTrendChartType(v)
                      setAttemptedProTrendType(null)
                    } else if (isProChartType(v)) {
                      setAttemptedProTrendType(v)
                    } else {
                      setTrendChartType(v)
                      setAttemptedProTrendType(null)
                    }
                  }}
                  style={{ fontSize: 12, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'inherit' }}
                >
                  {TREND_CHART_TYPES_PREMIUM.map((t) => (
                    <option key={t} value={t} style={!isPro && isProChartType(t) ? { opacity: 0.7 } : undefined}>
                      {TREND_TYPE_LABELS[t]}
                      {!isPro && isProChartType(t) ? ' (PRO)' : ''}
                    </option>
                  ))}
                </select>
                {isPro && isProChartType(trendChartType) && <PremiumBadge size="sm" />}
              </div>
            </div>
            {loading ? (
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading...</span>
            ) : trendData.length === 0 ? (
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>No data yet.</span>
            ) : !availableTrendTypes?.length ? null : (
              <>
                <div className="income-expense-chart-wrapper income-expense-trend-chart-container">
                  <FinancialChart
                    type={safeTrendType}
                    labels={trendLabels}
                    dataset={trendValues}
                    userPlan={userPlan}
                    chartContext="trend"
                    height={220}
                    onPremiumRequired={requestProFeature}
                  />
                </div>
                <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
                  {period === 'all_time' && allTimeRange
                    ? `Grouped by ${allTimeRange.grouping === 'day' ? 'Day' : allTimeRange.grouping === 'month' ? 'Month' : 'Year'} (auto-adjusted for range)`
                    : trendGrouping === 'day'
                      ? 'Daily trend based on selected period'
                      : trendGrouping === 'year'
                        ? 'Yearly trend overview'
                        : 'Monthly trend overview'}
                </p>
                {!isPro && attemptedProTrendType && (
                  <div
                    style={{
                      marginTop: 12,
                      padding: '10px 12px',
                      background: 'var(--border-muted)',
                      borderRadius: 8,
                      fontSize: 13,
                      color: 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span>Upgrade to Pro to unlock advanced chart types and deeper insights.</span>
                    <UpgradeCTA variant="compact" />
                  </div>
                )}
              </>
            )}
          </div>

          {/* Breakdown by Category: chart + fixed total + scrollable list */}
          <div className="income-expense-category-section premium-section">
            <CardHeaderWithAction
              title="By Category"
              titleAs="h3"
              actions={
                byCategory.length > 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <select
                      value={safeCategoryType}
                      onChange={(e) => {
                        const v = e.target.value as CategoryChartType
                        if (isPro) {
                          setCategoryChartType(v)
                          setAttemptedProCategoryType(null)
                        } else if (isProChartType(v)) {
                          setAttemptedProCategoryType(v)
                        } else {
                          setCategoryChartType(v)
                          setAttemptedProCategoryType(null)
                        }
                      }}
                      style={{ fontSize: 12, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'inherit' }}
                    >
                      {CATEGORY_CHART_TYPES_PREMIUM.map((t) => (
                        <option key={t} value={t} style={!isPro && isProChartType(t) ? { opacity: 0.7 } : undefined}>
                          {CATEGORY_TYPE_LABELS[t]}
                          {!isPro && isProChartType(t) ? ' (PRO)' : ''}
                        </option>
                      ))}
                    </select>
                    {isPro && isProChartType(categoryChartType) && <PremiumBadge size="sm" />}
                  </div>
                ) : undefined
              }
            />
            {loading ? (
              <span style={{ fontSize: 13, color: 'var(--text-muted)', paddingTop: 4 }}>Loading...</span>
            ) : byCategory.length === 0 ? (
              <span style={{ fontSize: 13, color: 'var(--text-muted)', paddingTop: 4 }}>No data.</span>
            ) : (
              <div className="income-expense-category-content">
                <div className="income-expense-category-chart-row">
                  {availableCategoryTypes?.length ? (
                    <div className="income-expense-chart-wrapper income-expense-pie-chart-container" style={{ flexShrink: 0, marginBottom: 12 }}>
                      <FinancialChart
                        type={safeCategoryType}
                        labels={categoryChartData.labels}
                        dataset={categoryChartData.values}
                        userPlan={userPlan}
                        chartContext="category"
                        height={200}
                        onPremiumRequired={requestProFeature}
                      />
                      {!isPro && attemptedProCategoryType && (
                        <div
                          style={{
                            marginTop: 12,
                            padding: '10px 12px',
                            background: 'var(--border-muted)',
                            borderRadius: 8,
                            fontSize: 13,
                            color: 'var(--text-secondary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 12,
                            flexWrap: 'wrap',
                          }}
                        >
                          <span>Upgrade to Pro to unlock advanced chart types and deeper insights.</span>
                          <UpgradeCTA variant="compact" />
                        </div>
                      )}
                    </div>
                  ) : null}
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, flexShrink: 0 }}>
                    Total: ₱{totalExpenses.toLocaleString()}
                  </div>
                </div>
                <div className="income-expense-breakdown-scroll">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {byCategory.map((c, i) => {
                      const pct = (c.total / totalExpenses) * 100
                      return (
                        <div key={c.category}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                            <span style={{ fontWeight: 500 }}>{c.category}</span>
                            <span style={{ color: 'var(--text-muted)' }}>{pct.toFixed(0)}% · ₱{c.total.toLocaleString()}</span>
                          </div>
                          <div style={{ height: 4, background: 'var(--border-muted)', borderRadius: 2 }}>
                            <div style={{ height: '100%', width: `${(c.total / maxCatVal) * 100}%`, background: BAR_COLORS[i % BAR_COLORS.length], borderRadius: 2 }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — Detailed Table (stable height; only body scrolls) */}
        <div className="income-expense-table-card premium-section">
          <CardHeaderWithAction title="Detailed Breakdown" titleAs="h3" />
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {loading ? (
              <div className="income-expense-table-body-empty">
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading...</span>
              </div>
            ) : rows.length === 0 ? (
              <div className="income-expense-table-body-empty">
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  <p style={{ margin: '0 0 6px' }}>No expenses recorded for {(syncFromBudget ? formatMonthLabel(budgetSelectedMonth) : PERIOD_LABELS[period]).toLowerCase()}.</p>
                  <p style={{ margin: 0, fontSize: 12 }}>Try adjusting your filter or add an expense.</p>
                  {period === 'month' && (
                    <button
                      type="button"
                      onClick={() => setPeriod('all_time')}
                      style={{ marginTop: 10, fontSize: 12, background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', padding: 0, textDecoration: 'underline', fontFamily: 'inherit' }}
                    >
                      View All Time
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="income-expense-table-body-scroll">
                <table className="income-expense-detail-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Category</th>
                      <th>Description</th>
                      <th>Type</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                      <th style={{ width: 1, textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r.id ?? `${r.date}-${r.category}-${i}`}>
                        <td>{r.date}</td>
                        <td>{r.category || '—'}</td>
                        <td>{r.description || '—'}</td>
                        <td style={{ textTransform: 'capitalize' }}>{r.type}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>₱{Number(r.amount).toLocaleString()}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <div className="goal-card-premium-actions" style={{ display: 'flex', gap: 8, flexWrap: 'nowrap', alignItems: 'center' }}>
                            <button
                              type="button"
                              className="goal-card-premium-btn goal-card-premium-btn-edit"
                              onClick={() => setEditingExpense({ id: r.id, category: r.category, type: r.type === 'wants' ? 'wants' : 'needs', amount: r.amount, date: r.date, description: r.description ?? null })}
                              title="Edit"
                              aria-label="Edit"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="goal-card-premium-btn goal-card-premium-btn-delete"
                              onClick={async () => {
                                if (!confirm('Delete this expense?')) return
                                const res = await fetch(`/api/expenses/${r.id}`, { method: 'DELETE', credentials: 'include' })
                                if (!res.ok) {
                                  const data = await res.json().catch(() => ({}))
                                  alert((data?.error as string) ?? 'Could not delete.')
                                  return
                                }
                                setRefreshTrigger((n) => n + 1)
                              }}
                              title="Delete"
                              aria-label="Delete"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    <tr className="income-expense-table-total">
                      <td colSpan={4}>Total</td>
                      <td style={{ textAlign: 'right', color: '#dc2626' }}>₱{totalExpenses.toLocaleString()}</td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
      </div>

      <AddExpenseModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          setRefreshTrigger((n) => n + 1)
          router.refresh()
        }}
      />
      <EditExpenseModal
        isOpen={!!editingExpense}
        onClose={() => setEditingExpense(null)}
        onSaved={() => {
          setRefreshTrigger((n) => n + 1)
          setEditingExpense(null)
          router.refresh()
        }}
        expense={editingExpense}
      />
      <BudgetPlanner
        isOpen={budgetPlannerOpen}
        onClose={() => setBudgetPlannerOpen(false)}
        onSaved={() => setBudgetRefreshKey(Date.now())}
      />
      <MonthOverrideModal
        isOpen={monthOverrideOpen}
        onClose={() => setMonthOverrideOpen(false)}
        onSaved={() => setBudgetRefreshKey(Date.now())}
        month={overrideMonth}
      />
    </div>
  )
}
