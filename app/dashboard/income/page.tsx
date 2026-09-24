'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { INCOME_SOURCES } from '../../../lib/incomeSources'
import IncomeAllocationModal from '../../../components/dashboard/IncomeAllocationModal'
import type { IncomeRecordForEdit } from '../../../components/dashboard/IncomeAllocationModal'
import ImportCSVModal from '@/components/dashboard/ImportCSVModal'
import CardHeaderWithAction from '@/components/cards/CardHeaderWithAction'
import PeriodFilterPills from '@/components/dashboard/PeriodFilterPills'
import ExportCsvButton from '@/components/dashboard/ExportCsvButton'
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
import DashboardMobileHeaderLogo from '@/components/layout/DashboardMobileHeaderLogo'
import UpgradeCTA from '@/components/ui/UpgradeCTA'
import { useSubscription } from '@/contexts/SubscriptionContext'
import { usePremiumGate } from '@/hooks/usePremiumGate'
import { useUpgradeTrigger } from '@/contexts/UpgradeTriggerContext'
import { useTriggerDateRangeBeyond90 } from '@/hooks/useSmartUpgradeTriggers'
import { getAllTimeRangeAndGrouping, type AllTimeRangeResult } from '@/lib/allTimeRange'
import {
  dispatchDashboardTransactionsRefresh,
  dispatchDashboardGoalsRefresh,
} from '@/lib/dashboardRefresh'
import { toLocalDateString } from '@/lib/format'
import { useDashboardProfile } from '@/contexts/DashboardProfileContext'
import { buildTrendSeries, topNWithOthers } from '@/lib/buildTrendSeries'
import {
  type FilterPeriod,
  PERIOD_LABELS,
  getRange,
  getTrendGrouping,
} from '@/lib/transactionPeriod'
import {
  useDashboardTransactionRefresh,
  useMobilePortrait,
} from '@/hooks/useTransactionPageShared'

type IncomeRecord = {
  id: string
  total_amount: number
  date: string
  income_source: string | null
  description?: string | null
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
  const profileData = useDashboardProfile()
  const [modalOpen, setModalOpen] = useState(false)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<IncomeRecordForEdit | null>(null)
  const [records, setRecords] = useState<IncomeRecord[]>([])
  const [loading, setLoading] = useState(true)
  const { refreshTrigger, setRefreshTrigger } = useDashboardTransactionRefresh()
  const [period, setPeriod] = useState<FilterPeriod>('month')
  const [sourceFilter, setSourceFilter] = useState('')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [trendChartType, setTrendChartType] = useState<TrendChartType>('line')
  const [categoryChartType, setCategoryChartType] = useState<CategoryChartType>('pie')
  const [attemptedProTrendType, setAttemptedProTrendType] = useState<TrendChartType | null>(null)
  const [attemptedProCategoryType, setAttemptedProCategoryType] = useState<CategoryChartType | null>(null)
  const [allTimeRange, setAllTimeRange] = useState<AllTimeRangeResult | null>(null)
  const isMobilePortrait = useMobilePortrait()

  const { isPro, features } = useSubscription()



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
      const { data } = await query
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

  const { labels: trendLabels, values: trendValues } = useMemo(
    () =>
      buildTrendSeries(
        records.map((r) => ({ date: r.date, amount: Number(r.total_amount) })),
        range,
        trendGrouping
      ),
    [records, range, trendGrouping]
  )

  const sourceChartData = useMemo(
    () => topNWithOthers(bySource, 'source'),
    [bySource]
  )

  const labelStyle: React.CSSProperties = { fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }
  const valueStyle: React.CSSProperties = { fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }

  return (
    <div className="income-page premium-page">
      <div className="page-header page-header-with-actions dashboard-page-header max-lg:order-0 max-lg:items-start max-lg:gap-0 max-lg:mb-0 lg:gap-3">
        <div className="min-w-0 flex-1 max-lg:w-full">
          <div className="max-lg:flex max-lg:items-center max-lg:justify-between max-lg:gap-2 max-lg:overflow-visible">
            <h2 className="max-lg:text-lg max-lg:font-semibold max-lg:leading-tight max-lg:mb-0">Income</h2>
            <DashboardMobileHeaderLogo />
          </div>
          <p className="max-lg:mt-1 max-lg:text-xs max-lg:leading-snug max-lg:mb-0 max-lg:text-[var(--text-muted,#64748b)]">
            Track your income over time. Every peso logged moves you closer to clarity.
          </p>
        </div>
        <div className="page-header-actions income-expenses-page-header-actions">
          <ExportCsvButton isPro={isPro} />
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
          <PeriodFilterPills
            period={period}
            isPro={isPro}
            onLockedClick={openUpgradeModal}
            onSelect={setPeriod}
          />
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
            ) : trendLabels.length === 0 ? (
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
                    <span>Explore KlaroPH Pro to unlock advanced chart types and deeper insights.</span>
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
                          <span>Explore KlaroPH Pro to unlock advanced chart types and deeper insights.</span>
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
        suggestedAmount={editingRecord ? null : (profileData?.profile?.monthly_income ?? null)}
        suggestedSavingsPercent={editingRecord ? null : (profileData?.profile?.savings_percent ?? null)}
      />
    </div>
  )
}
