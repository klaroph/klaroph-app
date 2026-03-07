'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { EXPENSE_CATEGORIES } from '@/lib/expenseCategories'
import { useSubscriptionOptional } from '@/contexts/SubscriptionContext'
import { useUpgradeTriggerOptional } from '@/contexts/UpgradeTriggerContext'

type EffectiveItem = { category: string; amount: number }

type BudgetOverviewProps = {
  spendingByCategory?: Record<string, number>
  budgetRefreshKey?: number
  onSetBudget?: () => void
  onEditThisMonth?: (month: string) => void
  /** When set, month picker is controlled by parent; use with onMonthChange */
  selectedMonth?: string
  /** Called when user selects a different month in the dropdown */
  onMonthChange?: (monthFirst: string) => void
  /** Max category rows (e.g. 10 for Top 10) */
  maxCategories?: number
  /** Breakdown section title (e.g. "Top 10 Spending to Watch") */
  breakdownTitle?: string
  /** Optional header action, e.g. "Expenses Page →" */
  headerAction?: React.ReactNode
  /** Hide budget editor buttons while keeping the standard card layout */
  showBudgetEditorButtons?: boolean
}

function formatPeso(n: number) {
  return `₱${Math.abs(n).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`
}

function getCurrentMonthFirst(): string {
  const d = new Date()
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}

function getCurrentMonthRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  }
}

function getMonthRange(monthFirst: string): { start: string; end: string } {
  const [y, m] = monthFirst.split('-').map(Number)
  const start = new Date(y, (m ?? 1) - 1, 1)
  const end = new Date(y, (m ?? 1), 0)
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  }
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function formatMonthLabel(monthStr: string): string {
  const [y, m] = monthStr.split('-').map(Number)
  return `${MONTH_NAMES[(m ?? 1) - 1]} ${y}`
}

/** Fraction of the month elapsed (0–1) for the given month first-day string. Current month = day/days; past = 1; future = 0. */
function getMonthProgress(monthFirst: string): number {
  const [y, m] = monthFirst.split('-').map(Number)
  const now = new Date()
  const monthStart = new Date(y, (m ?? 1) - 1, 1)
  const monthEnd = new Date(y, (m ?? 1), 0)
  if (now > monthEnd) return 1
  if (now < monthStart) return 0
  const dayOfMonth = now.getDate()
  const daysInMonth = monthEnd.getDate()
  return daysInMonth > 0 ? dayOfMonth / daysInMonth : 0
}

const currentMonthFirst = getCurrentMonthFirst()

const DONUT_VIEWBOX_SIZE = 200
const DONUT_CENTER = DONUT_VIEWBOX_SIZE / 2
const DONUT_RADIUS = 82
const DONUT_STROKE = 16
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS

function BudgetHealthDonut({ spentPct, color }: { spentPct: number; color: string }) {
  const dash = Math.min(100, spentPct) / 100
  const strokeDashoffset = DONUT_CIRCUMFERENCE - dash * DONUT_CIRCUMFERENCE
  const gradientId = `budget-donut-${color.replace(/[^a-z0-9]/gi, '')}`
  return (
    <svg
      className="budget-health-donut-svg"
      viewBox={`0 0 ${DONUT_VIEWBOX_SIZE} ${DONUT_VIEWBOX_SIZE}`}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity={1} />
          <stop offset="100%" stopColor={color} stopOpacity={0.85} />
        </linearGradient>
      </defs>
      <circle
        className="budget-health-donut-track"
        cx={DONUT_CENTER}
        cy={DONUT_CENTER}
        r={DONUT_RADIUS}
        fill="none"
        strokeWidth={DONUT_STROKE}
      />
      <circle
        className="budget-health-donut-fill"
        cx={DONUT_CENTER}
        cy={DONUT_CENTER}
        r={DONUT_RADIUS}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={DONUT_STROKE}
        strokeDasharray={DONUT_CIRCUMFERENCE}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
        transform={`rotate(-90 ${DONUT_CENTER} ${DONUT_CENTER})`}
        style={{ transition: 'stroke-dashoffset 200ms ease' }}
      />
    </svg>
  )
}

export default function BudgetOverview({
  spendingByCategory: spendingByCategoryProp,
  budgetRefreshKey = 0,
  onSetBudget,
  onEditThisMonth,
  selectedMonth: selectedMonthProp,
  onMonthChange,
  maxCategories,
  breakdownTitle: breakdownTitleProp,
  headerAction,
  showBudgetEditorButtons = true,
}: BudgetOverviewProps) {
  const [internalMonth, setInternalMonth] = useState(currentMonthFirst)
  const isControlled = selectedMonthProp !== undefined
  const selectedMonth = isControlled ? selectedMonthProp : internalMonth
  const setSelectedMonth = (value: string | ((prev: string) => string)) => {
    const next = typeof value === 'function' ? value(selectedMonth) : value
    if (onMonthChange) onMonthChange(next)
    if (!isControlled) setInternalMonth(next)
  }
  const [selectableMonths, setSelectableMonths] = useState<{ value: string; label: string }[]>(() => [
    { value: currentMonthFirst, label: formatMonthLabel(currentMonthFirst) },
  ])
  const [effectiveBudgets, setEffectiveBudgets] = useState<EffectiveItem[]>([])
  const [loading, setLoading] = useState(true)
  const [spendingByCategoryFetched, setSpendingByCategoryFetched] = useState<Record<string, number>>({})

  const isCurrentMonth = selectedMonth === currentMonthFirst
  const spendingByCategory =
    isCurrentMonth && spendingByCategoryProp !== undefined
      ? spendingByCategoryProp
      : spendingByCategoryFetched

  useEffect(() => {
    let mounted = true
    setLoading(true)
    fetch(`/api/budget-effective?month=${selectedMonth}`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (mounted && Array.isArray(data)) setEffectiveBudgets(data)
      })
      .catch(() => mounted && setEffectiveBudgets([]))
      .finally(() => mounted && setLoading(false))
    return () => { mounted = false }
  }, [selectedMonth, budgetRefreshKey])

  useEffect(() => {
    let mounted = true
    const { start, end } = getMonthRange(selectedMonth)
    const useProp = isCurrentMonth && spendingByCategoryProp !== undefined
    if (useProp) return
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!mounted || !user) return
      supabase
        .from('expenses')
        .select('category, amount')
        .eq('user_id', user.id)
        .gte('date', start)
        .lte('date', end)
        .then(({ data }) => {
          if (!mounted) return
          const byCat: Record<string, number> = {}
          for (const row of data ?? []) {
            const r = row as { category: string; amount: number }
            const cat = r.category || 'Other'
            byCat[cat] = (byCat[cat] ?? 0) + Number(r.amount)
          }
          setSpendingByCategoryFetched(byCat)
        })
    })
    return () => { mounted = false }
  }, [selectedMonth, budgetRefreshKey, isCurrentMonth, spendingByCategoryProp])

  useEffect(() => {
    let mounted = true
    fetch('/api/expense-months', { credentials: 'include' })
      .then((res) => {
        if (!res.ok) return res.json().then(() => [])
        return res.json()
      })
      .then((data: unknown) => {
        if (!mounted) return
        const list = Array.isArray(data) ? (data as string[]) : []
        const set = new Set(list)
        set.add(currentMonthFirst)
        const months = Array.from(set)
          .sort()
          .reverse()
          .map((m) => ({ value: m, label: formatMonthLabel(m) }))
        setSelectableMonths(months)
        if (!isControlled) setInternalMonth((prev) => (set.has(prev) ? prev : currentMonthFirst))
      })
      .catch(() => {})
    return () => { mounted = false }
  }, [budgetRefreshKey, loading])

  /** Categories with a budget allocation, plus any category with spending and no budget (amount 0) so actual expenses match the breakdown. */
  const mergedBudgets = useMemo(() => {
    const byCategory = new Map<string, number>()
    for (const b of effectiveBudgets) byCategory.set(b.category, b.amount)
    for (const cat of Object.keys(spendingByCategory)) {
      if (!byCategory.has(cat)) byCategory.set(cat, 0)
    }
    return Array.from(byCategory.entries()).map(([category, amount]) => ({ category, amount }))
  }, [effectiveBudgets, spendingByCategory])

  /** Sort: 1) Unbudgeted spending, 2) Overspending, 3) Highest usage ratio */
  const sortedBudgets = useMemo(() => {
    return [...mergedBudgets].sort((a, b) => {
      const spentA = spendingByCategory[a.category] ?? 0
      const spentB = spendingByCategory[b.category] ?? 0
      const unbudgetedA = a.amount === 0 && spentA > 0 ? 1 : 0
      const unbudgetedB = b.amount === 0 && spentB > 0 ? 1 : 0
      if (unbudgetedA !== unbudgetedB) return unbudgetedB - unbudgetedA
      const overA = a.amount > 0 && spentA > a.amount ? 1 : 0
      const overB = b.amount > 0 && spentB > b.amount ? 1 : 0
      if (overA !== overB) return overB - overA
      const usageA = a.amount > 0 ? spentA / a.amount : 0
      const usageB = b.amount > 0 ? spentB / b.amount : 0
      if (usageA !== usageB) return usageB - usageA
      return spentB - spentA
    })
  }, [mergedBudgets, spendingByCategory])

  const summary = useMemo(() => {
    const totalBudget = effectiveBudgets.reduce((s, b) => s + b.amount, 0)
    const totalSpent = Object.values(spendingByCategory).reduce((s, v) => s + v, 0)
    const remaining = totalBudget - totalSpent
    const usagePct = totalBudget > 0 ? Math.min(150, (totalSpent / totalBudget) * 100) : 0
    return { totalBudget, totalSpent, remaining, usagePct }
  }, [effectiveBudgets, spendingByCategory])

  const features = useSubscriptionOptional()?.features ?? null
  const canEditBudget = features?.has_budget_editing ?? true
  const openUpgrade = useUpgradeTriggerOptional()?.openUpgradeModal

  if (loading && effectiveBudgets.length === 0) {
    return (
      <div className="card dash-card" style={{ padding: 24 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 600 }}>Monthly Budget Overview</h3>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 14 }}>Loading…</p>
      </div>
    )
  }

  if (mergedBudgets.length === 0) {
    return (
      <div className="card dash-card" style={{ padding: 24 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 600 }}>Monthly Budget Overview</h3>
        <p style={{ margin: '0 0 16px', color: 'var(--text-secondary)', fontSize: 14 }}>
          You have not set any spending limits yet.
        </p>
        {onSetBudget && canEditBudget && (
          <button type="button" className="btn-primary" onClick={onSetBudget} style={{ padding: '10px 20px', fontSize: 14 }}>
            Set Budget
          </button>
        )}
        {onSetBudget && !canEditBudget && openUpgrade && (
          <button type="button" className="btn-secondary" onClick={openUpgrade} style={{ padding: '10px 20px', fontSize: 14 }}>
            Upgrade to set budget
          </button>
        )}
      </div>
    )
  }

  const budgetUsedPct = summary.totalBudget > 0 ? (summary.totalSpent / summary.totalBudget) * 100 : 0
  const monthProgressPct = getMonthProgress(selectedMonth) * 100
  const spendingFasterThanTime = budgetUsedPct > monthProgressPct
  const usedPctLabel = summary.totalBudget > 0 ? Math.round((summary.totalSpent / summary.totalBudget) * 100) : 0

  const healthLabel =
    summary.totalBudget > 0
      ? `${usedPctLabel}% Used`
      : summary.totalSpent > 0
        ? 'Unplanned Spending'
        : 'No Budget Set'

  const displayBudgets = maxCategories != null ? sortedBudgets.slice(0, maxCategories) : sortedBudgets
  const sectionTitle = breakdownTitleProp ?? 'Category Breakdown'

  return (
    <div className="card dash-card budget-overview-card">
      <div className="budget-overview-header">
        <h3 className="budget-overview-title">Monthly Budget Overview</h3>
        <div className="budget-overview-controls">
          <label htmlFor="budget-month-picker" style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Month:
          </label>
          <select
            id="budget-month-picker"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            style={{
              fontSize: 13,
              padding: '6px 10px',
              border: '1px solid var(--border)',
              borderRadius: 6,
              fontFamily: 'inherit',
              color: 'var(--text-primary)',
              backgroundColor: 'var(--surface)',
            }}
          >
            {selectableMonths.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {showBudgetEditorButtons && onEditThisMonth && canEditBudget && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => onEditThisMonth(selectedMonth)}
              style={{ padding: '8px 14px', fontSize: 13 }}
            >
              {isCurrentMonth ? 'Edit This Month' : `Edit ${formatMonthLabel(selectedMonth)}`}
            </button>
          )}
          {showBudgetEditorButtons && onSetBudget && canEditBudget && (
            <button type="button" className="btn-primary" onClick={onSetBudget} style={{ padding: '8px 16px', fontSize: 13 }}>
              Edit Spending Plan
            </button>
          )}
          {showBudgetEditorButtons && !canEditBudget && openUpgrade && (
            <button type="button" className="btn-secondary" onClick={openUpgrade} style={{ padding: '8px 16px', fontSize: 13 }}>
              Upgrade to edit budget
            </button>
          )}
          {headerAction}
        </div>
      </div>

      {/* 2 nested sections: Budget Health card (left) | Category Breakdown card (right) */}
      <div className="budget-overview-two-col">
        {/* Left: Budget Health — inner card with donut + simplified text + burn bars */}
        <div className="budget-health-card">
          <h4 className="budget-section-title">Budget Health</h4>
          <div className="budget-health-donut-block">
            <div className="budget-health-donut-ring">
              <div className="budget-health-donut-wrap">
                <BudgetHealthDonut
                spentPct={summary.totalBudget > 0 ? budgetUsedPct : 0}
                color={
                  summary.totalBudget === 0
                    ? 'var(--text-muted, #94a3b8)'
                    : summary.usagePct > 100
                      ? '#dc2626'
                      : summary.usagePct >= 90
                        ? '#ea580c'
                        : summary.usagePct >= 60
                          ? '#eab308'
                          : '#16a34a'
                }
              />
              <div className="budget-health-donut-center">
                <span className="budget-health-donut-pct">
                  {summary.totalBudget > 0 ? `${usedPctLabel}%` : '—'}
                </span>
              </div>
              </div>
            </div>
          </div>
          <p className="budget-health-used-label">{healthLabel}</p>
          <div className="budget-health-numbers">
            <div className="budget-health-row">
              <span className="budget-health-label">Spent</span>
              <span className="budget-health-value">{formatPeso(summary.totalSpent)}</span>
            </div>
            <div className="budget-health-row">
              <span className="budget-health-label">Budget</span>
              <span className="budget-health-value">{formatPeso(summary.totalBudget)}</span>
            </div>
            <div className="budget-health-row">
              <span className="budget-health-label">Remaining</span>
              <span className={`budget-health-value ${summary.remaining < 0 ? 'budget-health-value-over' : ''}`}>
                {summary.remaining >= 0 ? formatPeso(summary.remaining) : `-${formatPeso(-summary.remaining)}`}
              </span>
            </div>
          </div>

          <div className="budget-burn-indicator">
            <div className="budget-burn-row">
              <span className="budget-burn-label">Budget Used</span>
              <div className="budget-burn-bar-track">
                <div
                  className={`budget-burn-bar-fill ${spendingFasterThanTime ? 'budget-burn-bar-warning' : ''} ${spendingFasterThanTime ? 'budget-burn-shimmer' : ''}`}
                  style={{ width: `${Math.min(100, budgetUsedPct)}%` }}
                />
              </div>
            </div>
            <div className="budget-burn-row">
              <span className="budget-burn-label">Month Progress</span>
              <div className="budget-burn-bar-track">
                <div className="budget-burn-bar-fill budget-burn-bar-month" style={{ width: `${monthProgressPct}%` }} />
              </div>
            </div>
            {spendingFasterThanTime && (
              <p className="budget-burn-warning">Spending faster than expected</p>
            )}
          </div>
        </div>

        {/* Right: Category Breakdown / Top N Spending to Watch */}
        <div className="budget-breakdown-card">
          <h4 className="budget-section-title">{sectionTitle}</h4>
          <div className="budget-overview-rows">
            {displayBudgets.map((b) => {
              const spent = spendingByCategory[b.category] ?? 0
              const budget = b.amount
              const label = EXPENSE_CATEGORIES.find((c) => c.value === b.category)?.label ?? b.category

              const isNormal = budget > 0 && spent <= budget
              const isOverspent = budget > 0 && spent > budget
              const isNoBudgetNoSpend = budget === 0 && spent === 0
              const isUnbudgeted = budget === 0 && spent > 0

              const pct = budget > 0 ? (spent / budget) * 100 : 0
              let barPct = 0
              let barColor = 'var(--text-muted, #94a3b8)'

              if (isNormal) {
                barPct = Math.min(100, pct)
                if (pct < 60) barColor = '#16a34a'
                else if (pct < 90) barColor = '#eab308'
                else barColor = '#ea580c'
              } else if (isOverspent) {
                barPct = Math.min(100, (spent / budget) * 100)
                barColor = '#dc2626'
              } else if (isUnbudgeted) {
                barPct = 100
                barColor = '#ea580c'
              }
              const overAmount = isOverspent ? spent - budget : 0
              const remaining = isNormal ? budget - spent : 0
              const insightLabel = isUnbudgeted
                ? 'Unbudgeted spending'
                : isOverspent
                  ? 'Over'
                  : isNormal
                    ? 'Remaining'
                    : 'No activity'
              const insightValue = isUnbudgeted
                ? formatPeso(spent)
                : isOverspent
                  ? formatPeso(overAmount)
                  : isNormal
                    ? formatPeso(remaining)
                    : '₱0'

              return (
                <div key={b.category} className="budget-category-item">
                  <div className="budget-category-name">{label}</div>
                  {(isNormal || isOverspent) && (
                    <div className="budget-category-amount">
                      {formatPeso(spent)} / {formatPeso(budget)}
                    </div>
                  )}
                  {isNoBudgetNoSpend && (
                    <div className="budget-category-amount budget-category-muted">No budget this month</div>
                  )}
                  {isUnbudgeted && (
                    <>
                      <div className="budget-category-amount">
                        {formatPeso(spent)} spent
                      </div>
                    </>
                  )}
                  <div className="budget-category-insight-row">
                    <span className="budget-category-insight-label" style={{ color: barColor }}>
                      {insightLabel}
                    </span>
                    <span className="budget-category-insight-value" style={{ color: barColor }}>
                      {insightValue}
                    </span>
                  </div>
                  <div
                    className="budget-overview-bar"
                    role="progressbar"
                    aria-valuenow={isNoBudgetNoSpend ? 0 : Math.round(Math.min(100, barPct))}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="budget-overview-bar-fill"
                      style={{ width: `${barPct}%`, backgroundColor: barColor }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
