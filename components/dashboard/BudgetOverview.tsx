'use client'

import { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { EXPENSE_CATEGORIES } from '@/lib/expenseCategories'
import { useSubscriptionOptional } from '@/contexts/SubscriptionContext'
import { useUpgradeTriggerOptional } from '@/contexts/UpgradeTriggerContext'
import { toLocalDateString } from '@/lib/format'
import { BUDGET_LOCK_UPGRADE_MESSAGE } from '@/lib/budgetLockMessage'
import LockIcon from '@/components/ui/LockIcon'

type EffectiveItem = { category: string; amount: number; note?: string | null }

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
  return toLocalDateString(new Date(d.getFullYear(), d.getMonth(), 1))
}

function getCurrentMonthRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return {
    start: toLocalDateString(start),
    end: toLocalDateString(end),
  }
}

function getMonthRange(monthFirst: string): { start: string; end: string } {
  const [y, m] = monthFirst.split('-').map(Number)
  const start = new Date(y, (m ?? 1) - 1, 1)
  const end = new Date(y, (m ?? 1), 0)
  return {
    start: toLocalDateString(start),
    end: toLocalDateString(end),
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
  const [noteTooltipCategory, setNoteTooltipCategory] = useState<string | null>(null)
  const [noteHoverCategory, setNoteHoverCategory] = useState<string | null>(null)
  const [noteTooltipPlacement, setNoteTooltipPlacement] = useState<'right' | 'left'>('right')
  const notePopoverRef = useRef<HTMLElement>(null)
  const noteTooltipAnchorRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!noteTooltipCategory) return
    const handleClickOutside = (e: MouseEvent) => {
      const el = notePopoverRef.current
      if (el && !el.contains(e.target as Node)) setNoteTooltipCategory(null)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [noteTooltipCategory])

  useLayoutEffect(() => {
    const anchor = noteTooltipAnchorRef.current
    if (!anchor) return
    const anchorRect = anchor.getBoundingClientRect()
    const gap = 8
    const padding = 16
    const maxTooltipWidth = 220
    const wouldOverflowRight = anchorRect.right + gap + maxTooltipWidth > window.innerWidth - padding
    const wouldOverflowLeft = anchorRect.left - gap - maxTooltipWidth < padding
    if (wouldOverflowRight && !wouldOverflowLeft) {
      setNoteTooltipPlacement('left')
    } else {
      setNoteTooltipPlacement('right')
    }
  }, [noteTooltipCategory, noteHoverCategory])

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
    const byCategory = new Map<string, { amount: number; note?: string | null }>()
    for (const b of effectiveBudgets) byCategory.set(b.category, { amount: b.amount, note: b.note ?? undefined })
    for (const cat of Object.keys(spendingByCategory)) {
      if (!byCategory.has(cat)) byCategory.set(cat, { amount: 0 })
    }
    return Array.from(byCategory.entries()).map(([category, { amount, note }]) => ({ category, amount, note }))
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
          <button
            type="button"
            className="btn-secondary"
            onClick={() => openUpgrade({ message: BUDGET_LOCK_UPGRADE_MESSAGE })}
            style={{ padding: '10px 20px', fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            <LockIcon size={14} />
            Set Budget
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
          {showBudgetEditorButtons && onEditThisMonth && !canEditBudget && openUpgrade && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => openUpgrade({ message: BUDGET_LOCK_UPGRADE_MESSAGE })}
              style={{ padding: '8px 14px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <LockIcon size={12} />
              {isCurrentMonth ? 'Edit This Month' : `Edit ${formatMonthLabel(selectedMonth)}`}
            </button>
          )}
          {showBudgetEditorButtons && onSetBudget && canEditBudget && (
            <button type="button" className="btn-primary" onClick={onSetBudget} style={{ padding: '8px 16px', fontSize: 13 }}>
              Edit Spending Plan
            </button>
          )}
          {showBudgetEditorButtons && onSetBudget && !canEditBudget && openUpgrade && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => openUpgrade({ message: BUDGET_LOCK_UPGRADE_MESSAGE })}
              style={{ padding: '8px 16px', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <LockIcon size={12} />
              Edit Spending Plan
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

              const noteText = b.note?.trim()
              const showNoteTooltip = noteText && (noteHoverCategory === b.category || noteTooltipCategory === b.category)
              return (
                <div
                  key={b.category}
                  className="budget-category-item"
                  onMouseEnter={() => {
                    if (noteText) {
                      setNoteHoverCategory(b.category)
                      setNoteTooltipCategory(null)
                    }
                  }}
                  onMouseLeave={() => setNoteHoverCategory(null)}
                >
                  <div className="budget-category-name" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {label}
                    {noteText ? (
                      <span
                        ref={(el) => {
                          if (showNoteTooltip && el) noteTooltipAnchorRef.current = el
                          if (el && noteTooltipCategory === b.category) notePopoverRef.current = el
                          if (el && noteTooltipCategory !== b.category && notePopoverRef.current === el) notePopoverRef.current = null
                        }}
                        style={{ position: 'relative', display: 'inline-flex' }}
                      >
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); setNoteHoverCategory(null); setNoteTooltipCategory((prev) => (prev === b.category ? null : b.category)) }}
                          className="budget-note-icon-btn"
                          style={{
                            padding: 4,
                            margin: -4,
                            border: 'none',
                            background: 'none',
                            cursor: 'pointer',
                            color: '#475569',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: 4,
                            transition: 'color 0.15s ease, background-color 0.15s ease',
                          }}
                          aria-label={`Note: ${noteText}`}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                            <polyline points="10 9 9 9 8 9" />
                          </svg>
                        </button>
                        {showNoteTooltip && (
                          <div
                            role="tooltip"
                            style={{
                              position: 'absolute',
                              ...(noteTooltipPlacement === 'right'
                                ? { left: '100%', marginLeft: 8 }
                                : { right: '100%', marginRight: 8, left: 'auto' }),
                              top: '50%',
                              transform: 'translateY(-50%)',
                              padding: '8px 12px',
                              minWidth: 140,
                              maxWidth: 220,
                              fontSize: 12,
                              lineHeight: 1.45,
                              color: 'var(--text-muted, #64748b)',
                              backgroundColor: 'var(--surface, #fff)',
                              border: '1px solid var(--border, #e5e7eb)',
                              borderRadius: 8,
                              boxShadow: '0 6px 16px rgba(0,0,0,0.1)',
                              whiteSpace: 'normal',
                              zIndex: 10,
                            }}
                          >
                            {noteText}
                          </div>
                        )}
                      </span>
                    ) : null}
                  </div>
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
