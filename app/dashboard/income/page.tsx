'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabaseClient'
import { INCOME_SOURCES } from '../../../lib/incomeSources'
import IncomeAllocationModal from '../../../components/dashboard/IncomeAllocationModal'
import type { IncomeRecordForEdit } from '../../../components/dashboard/IncomeAllocationModal'
import ImportCSVModal from '@/components/dashboard/ImportCSVModal'
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
import {
  DASHBOARD_REFRESH_EVENT,
  DASHBOARD_TRANSACTIONS_REFRESH_EVENT,
  dispatchDashboardTransactionsRefresh,
  dispatchDashboardGoalsRefresh,
} from '@/lib/dashboardRefresh'
import { toLocalDateString, parseLocalDateString } from '@/lib/format'

type IncomeRecord = {
  id: string
  total_amount: number
  date: string
  income_source: string | null
  description?: string | null
}

type FilterPeriod = 'this_week' | 'previous_week' | 'month' | 'previous_month' | 'quarter' | 'previous_quarter' | 'year' | 'previous_year' | 'all_time' | 'custom'

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

function aggregateBySource(rows: IncomeRecord[]) {
  const map = new Map<string, number>()
  for (const r of rows) {
    const key = r.income_source || 'Other'
    map.set(key, (map.get(key) ?? 0) + Number(r.total_amount))
  }
  return Array.from(map.entries())
    .map(([source, total]) => ({ source, total }))
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

const BAR_COLORS = ['#0038A8', '#1a4fbf', '#4a7de0', '#7ba3f0', '#adc5f5', '#d4e2fa']

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

export default function IncomePage() {
  const router = useRouter()
  const [modalOpen, setModalOpen] = useState(false)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<IncomeRecordForEdit | null>(null)
  const [records, setRecords] = useState<IncomeRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [period, setPeriod] = useState<FilterPeriod>('month')
  const [sourceFilter, setSourceFilter] = useState('')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [trendChartType, setTrendChartType] = useState<TrendChartType>('line')
  const [categoryChartType, setCategoryChartType] = useState<CategoryChartType>('pie')
  const [attemptedProTrendType, setAttemptedProTrendType] = useState<TrendChartType | null>(null)
  const [attemptedProCategoryType, setAttemptedProCategoryType] = useState<CategoryChartType | null>(null)
  const [exportLoading, setExportLoading] = useState(false)
  const [allTimeRange, setAllTimeRange] = useState<AllTimeRangeResult | null>(null)
  const [isMobilePortrait, setIsMobilePortrait] = useState(false)

  const { isPro, features } = useSubscription()

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
    window.addEventListener(DASHBOARD_TRANSACTIONS_REFRESH_EVENT, onRefresh)
    return () => {
      window.removeEventListener(DASHBOARD_REFRESH_EVENT, onRefresh)
      window.removeEventListener(DASHBOARD_TRANSACTIONS_REFRESH_EVENT, onRefresh)
    }
  }, [])

  const userPlan = isPro ? 'pro' : 'free'
  const { openUpgradeModal } = useUpgradeTrigger()
  const { requestProFeature } = usePremiumGate({ onRequestPro: openUpgradeModal })

  const resolvedPlan: PlanType = isPro ? 'premium' : 'free'
  const availableTrendTypes = TREND_CHART_TYPES[resolvedPlan]
  const availableCategoryTypes = CATEGORY_CHART_TYPES[resolvedPlan]
  const safeTrendType: TrendChartType = availableTrendTypes.includes(trendChartType) ? trendChartType : availableTrendTypes[0]
  const safeCategoryType: CategoryChartType = availableCategoryTypes.includes(categoryChartType) ? categoryChartType : availableCategoryTypes[0]

  const today = useMemo(() => toLocalDateString(new Date()), [])
  const range = useMemo(() => {
    if (period === 'all_time') return allTimeRange ?? { start: today, end: today }
    return getRange(period, customStart, customEnd)
  }, [period, customStart, customEnd, allTimeRange, today])
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
      getAllTimeRangeAndGrouping(supabase, user.id, 'income_records').then((result) => {
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
        setRecords([])
        setLoading(false)
        return
      }
      let query = supabase
        .from('income_records')
        .select('id, total_amount, date, income_source')
        .eq('user_id', user.id)
        .gte('date', range.start)
        .lte('date', range.end)
        .order('date', { ascending: false })
      if (sourceFilter) query = query.eq('income_source', sourceFilter)
      const { data, error } = await query
      setRecords((data as IncomeRecord[]) || [])
      setLoading(false)
    }
    load()
  }, [period, allTimeRange, refreshTrigger, range.start, range.end, sourceFilter])

  const totalIncome = useMemo(() => records.reduce((s, r) => s + Number(r.total_amount), 0), [records])
  const bySource = useMemo(() => aggregateBySource(records), [records])
  const topSource = bySource[0]
  const topSourcePct = totalIncome > 0 && topSource ? Math.round((topSource.total / totalIncome) * 100) : 0
  const maxSourceVal = Math.max(1, ...bySource.map((s) => s.total))

  const trendData = useMemo(() => {
    const trendMap = new Map<string, number>()
    for (const r of records) {
      const key =
        trendGrouping === 'day'
          ? r.date
          : trendGrouping === 'month'
            ? r.date.slice(0, 7)
            : r.date.slice(0, 4)
      trendMap.set(key, (trendMap.get(key) ?? 0) + Number(r.total_amount))
    }
    if (trendGrouping === 'day' && range.start && range.end) {
      const out: [string, number][] = []
      const start = parseLocalDateString(range.start)
      const end = parseLocalDateString(range.end)
      for (let d = new Date(start.getFullYear(), start.getMonth(), start.getDate()); d <= end; d.setDate(d.getDate() + 1)) {
        const key = toLocalDateString(d)
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
  }, [records, range.start, range.end, trendGrouping])
  const trendLabels = useMemo(() => trendData.map(([key]) => formatTrendLabel(key, trendGrouping)), [trendData, trendGrouping])
  const trendValues = useMemo(() => trendData.map(([, v]) => v), [trendData])

  const sourceChartData = useMemo(() => {
    if (bySource.length <= 8) {
      return { labels: bySource.map((s) => s.source), values: bySource.map((s) => s.total) }
    }
    const top = bySource.slice(0, 7)
    const rest = bySource.slice(7)
    const othersTotal = rest.reduce((s, c) => s + c.total, 0)
    return {
      labels: [...top.map((c) => c.source), 'Others'],
      values: [...top.map((c) => c.total), othersTotal],
    }
  }, [bySource])

  const labelStyle: React.CSSProperties = { fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }
  const valueStyle: React.CSSProperties = { fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }

  return (
    <div className="income-page premium-page">
      <div className="page-header page-header-with-actions">
        <div>
          <h2>Income</h2>
          <p>Track your income over time. Every peso logged moves you closer to clarity.</p>
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
          <button className="btn-primary header-add-btn-desktop-only" onClick={() => { setEditingRecord(null); setModalOpen(true) }}>
            + Add Income
          </button>
        </div>
      </div>

      <ImportCSVModal
        mode="income"
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onSuccess={() => setRefreshTrigger((n) => n + 1)}
      />

      <div className="income-expense-page">
      {/* Row 1: Summary Cards (3 columns) */}
      <div className="income-expense-summary-grid">
        <div className="income-expense-summary-card premium-summary-card premium-summary-card-accent-blue">
          <div style={labelStyle}>Total Income</div>
          <div style={{ ...valueStyle, color: 'var(--color-blue)' }}>
            {loading ? '...' : `₱${totalIncome.toLocaleString()}`}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{PERIOD_LABELS[period]}</div>
        </div>

        <div className="income-expense-summary-card premium-summary-card premium-summary-card-accent-yellow">
          <div style={labelStyle}>Top Category</div>
          <div style={valueStyle}>
            {loading ? '...' : (topSource?.source ?? '—')}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, fontWeight: 600 }}>
            {loading ? '...' : (topSource ? `₱${topSource.total.toLocaleString()}` : '—')}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            {loading ? '...' : (topSource ? `${topSourcePct}% of income` : '—')}
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
                    setPeriod(p)
                  }}
                  style={{
                    padding: '4px 10px', fontSize: 12, fontWeight: period === p ? 600 : 400,
                    border: `1px solid ${period === p ? 'var(--color-primary)' : 'var(--border)'}`,
                    borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
                    background: period === p ? 'var(--color-blue-muted)' : 'var(--surface)',
                    color: period === p ? 'var(--color-primary)' : 'var(--text-secondary)',
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
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              style={{ fontSize: 12, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'inherit' }}
            >
              <option value="">All Sources</option>
              {INCOME_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button
              type="button"
              onClick={() => {
                setPeriod('month')
                setSourceFilter('')
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
              <span style={{ fontSize: 14, fontWeight: 600 }}>Income Trend</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label htmlFor="income-trend-type" style={{ fontSize: 12, color: 'var(--text-muted)' }}>Chart:</label>
                <select
                  id="income-trend-type"
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

          {/* Breakdown by Source: chart + fixed total + scrollable list */}
          <div className="income-expense-category-section premium-section">
            <CardHeaderWithAction
              title="By Source"
              titleAs="h3"
              actions={
                bySource.length > 0 ? (
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
            ) : bySource.length === 0 ? (
              <span style={{ fontSize: 13, color: 'var(--text-muted)', paddingTop: 4 }}>No data.</span>
            ) : (
              <div className="income-expense-category-content">
                <div className="income-expense-category-chart-row">
                  {availableCategoryTypes?.length ? (
                    <div className="income-expense-chart-wrapper income-expense-pie-chart-container" style={{ flexShrink: 0, marginBottom: 12 }}>
                      <FinancialChart
                        type={safeCategoryType}
                        labels={sourceChartData.labels}
                        dataset={sourceChartData.values}
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
                    Total: ₱{totalIncome.toLocaleString()}
                  </div>
                </div>
                <div className="income-expense-breakdown-scroll">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {bySource.map((s, i) => {
                      const pct = (s.total / totalIncome) * 100
                      return (
                        <div key={s.source}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                            <span style={{ fontWeight: 500 }}>{s.source}</span>
                            <span style={{ color: 'var(--text-muted)' }}>{pct.toFixed(0)}% · ₱{s.total.toLocaleString()}</span>
                          </div>
                          <div style={{ height: 4, background: 'var(--border-muted)', borderRadius: 2 }}>
                            <div style={{ height: '100%', width: `${(s.total / maxSourceVal) * 100}%`, background: BAR_COLORS[i % BAR_COLORS.length], borderRadius: 2 }} />
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
            ) : records.length === 0 ? (
              <div className="income-expense-table-body-empty">
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  <p style={{ margin: '0 0 6px' }}>No income recorded for {PERIOD_LABELS[period].toLowerCase()}.</p>
                  <p style={{ margin: 0, fontSize: 12 }}>Try adjusting your filter or add income.</p>
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
                      <th>Income source</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                      <th style={{ width: 1, textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r, i) => (
                      <tr key={r.id ?? `${r.date}-${i}`}>
                        <td>{r.date}</td>
                        <td>{r.income_source || '—'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--color-success)', fontVariantNumeric: 'tabular-nums' }}>₱{Number(r.total_amount).toLocaleString()}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <div className="goal-card-premium-actions" style={{ display: 'flex', gap: 8, flexWrap: 'nowrap', alignItems: 'center' }}>
                            <button
                              type="button"
                              className="goal-card-premium-btn goal-card-premium-btn-edit"
                              onClick={() => {
                                setEditingRecord({ id: r.id, total_amount: r.total_amount, date: r.date, income_source: r.income_source ?? null })
                                setModalOpen(true)
                              }}
                              title="Edit"
                              aria-label="Edit"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="goal-card-premium-btn goal-card-premium-btn-delete"
                              onClick={async () => {
                                if (!confirm('Delete this income record?')) return
                                const res = await fetch(`/api/income/${r.id}`, { method: 'DELETE', credentials: 'include' })
                                if (!res.ok) {
                                  const data = await res.json().catch(() => ({}))
                                  alert((data?.error as string) ?? 'Could not delete.')
                                  return
                                }
                                setRefreshTrigger((n) => n + 1)
                                dispatchDashboardTransactionsRefresh()
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
                      <td colSpan={2}>Total</td>
                      <td style={{ textAlign: 'right', color: 'var(--color-success)' }}>₱{totalIncome.toLocaleString()}</td>
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

      <IncomeAllocationModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditingRecord(null) }}
        onSaved={(opts) => {
          setRefreshTrigger((n) => n + 1)
          setEditingRecord(null)
          dispatchDashboardTransactionsRefresh()
          if (opts?.allocationsChanged) dispatchDashboardGoalsRefresh()
        }}
        initialRecord={editingRecord}
      />
    </div>
  )
}
