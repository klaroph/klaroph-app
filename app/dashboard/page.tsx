'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { supabase, getBrowserUser } from '@/lib/supabaseClient'
import {
  DASHBOARD_REFRESH_EVENT,
  DASHBOARD_GOALS_REFRESH_EVENT,
  DASHBOARD_TRANSACTIONS_REFRESH_EVENT,
  dispatchDashboardRefresh,
} from '@/lib/dashboardRefresh'
import type { GoalRow, GoalWithSaved } from '@/types/database'
import BudgetOverview from '@/components/dashboard/BudgetOverview'
import MonthPicker from '@/components/dashboard/MonthPicker'
import ActivationCelebration from '@/components/dashboard/ActivationCelebration'
import { useSubscription } from '@/contexts/SubscriptionContext'
import { useUpgradeTrigger } from '@/contexts/UpgradeTriggerContext'
import { PLAN_LIMITS } from '@/lib/planLimits'
import { toLocalDateString } from '@/lib/format'
import Link from 'next/link'
import DashboardMobileHeaderLogo from '@/components/layout/DashboardMobileHeaderLogo'
import DashboardMonthStatStrip from '@/components/dashboard/DashboardMonthStatStrip'
import DashboardQuickTools from '@/components/dashboard/DashboardQuickTools'
import DashboardRecentTransactions from '@/components/dashboard/DashboardRecentTransactions'
import DashboardFinancialHealthCard from '@/components/dashboard/DashboardFinancialHealthCard'
import DashboardFinancialTrend from '@/components/dashboard/DashboardFinancialTrend'
import DashboardProCard from '@/components/dashboard/DashboardProCard'
import GoalMomentumSection from '@/components/dashboard/GoalMomentumSection'
import KlaroInsightCard from '@/components/dashboard/KlaroInsightCard'
import { deriveMonthInsights } from '@/lib/dashboardInsight'
import { useDashboardMonthMoney } from '@/hooks/useDashboardMonthMoney'
import { useDashboardProfile } from '@/contexts/DashboardProfileContext'
import { useDashboardActions } from './DashboardLayoutClient'

const ManageGoalsModal = dynamic(
  () => import('@/components/dashboard/ManageGoalsModal'),
  { ssr: false },
)
const NewGoalModal = dynamic(
  () => import('@/components/dashboard/NewGoalModal'),
  { ssr: false },
)

function getCurrentMonthFirst(): string {
  const d = new Date()
  return toLocalDateString(new Date(d.getFullYear(), d.getMonth(), 1))
}

export default function DashboardPage() {
  const router = useRouter()
  const { features, isPro, loading: subscriptionLoading, refresh } = useSubscription()
  const { openUpgradeModal } = useUpgradeTrigger()
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [goalsRefreshTrigger, setGoalsRefreshTrigger] = useState(0)
  const currentMonthFirst = useMemo(() => getCurrentMonthFirst(), [])
  const [budgetMonth, setBudgetMonth] = useState(currentMonthFirst)
  const { data: monthMoney, loading: monthMoneyLoading } = useDashboardMonthMoney(budgetMonth, refreshTrigger)

  useEffect(() => {
    const onFull = () => {
      setGoalsRefreshTrigger((n) => n + 1)
      setRefreshTrigger((n) => n + 1)
    }
    const onGoals = () => setGoalsRefreshTrigger((n) => n + 1)
    const onTransactions = () => setRefreshTrigger((n) => n + 1)
    window.addEventListener(DASHBOARD_REFRESH_EVENT, onFull)
    window.addEventListener(DASHBOARD_GOALS_REFRESH_EVENT, onGoals)
    window.addEventListener(DASHBOARD_TRANSACTIONS_REFRESH_EVENT, onTransactions)
    return () => {
      window.removeEventListener(DASHBOARD_REFRESH_EVENT, onFull)
      window.removeEventListener(DASHBOARD_GOALS_REFRESH_EVENT, onGoals)
      window.removeEventListener(DASHBOARD_TRANSACTIONS_REFRESH_EVENT, onTransactions)
    }
  }, [])
  const [goals, setGoals] = useState<GoalWithSaved[]>([])
  const [loading, setLoading] = useState(false)
  const [manageGoalsOpen, setManageGoalsOpen] = useState(false)
  const [addGoalOpen, setAddGoalOpen] = useState(false)
  const [aiInsight, setAiInsight] = useState<{
    text: string
    source: 'gemini' | 'fallback' | 'cache'
    loading: boolean
  } | null>({ text: '', source: 'fallback', loading: true })

  useEffect(() => {
    refresh()
  }, [refresh])

  const fetchAiInsight = useCallback(async (forceRefresh = false) => {
    setAiInsight((prev) => ({
      text: prev?.text ?? '',
      source: prev?.source ?? 'fallback',
      loading: true,
    }))
    try {
      const res = await fetch('/api/ai/insight', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period: budgetMonth, forceRefresh }),
      })
      const data = await res.json().catch(() => ({}))
      if (
        res.ok &&
        data?.success &&
        typeof data.insight === 'string' &&
        data.insight.trim().length > 0
      ) {
        const source =
          data.source === 'gemini' || data.source === 'cache' || data.source === 'fallback'
            ? data.source
            : 'fallback'
        setAiInsight({ text: data.insight.trim(), source, loading: false })
        return
      }
      setAiInsight((prev) => ({
        text: prev?.text ?? '',
        source: prev?.source ?? 'fallback',
        loading: false,
      }))
    } catch {
      setAiInsight((prev) => ({
        text: prev?.text ?? '',
        source: prev?.source ?? 'fallback',
        loading: false,
      }))
    }
  }, [budgetMonth])

  useEffect(() => {
    fetchAiInsight(false)
  }, [fetchAiInsight, refreshTrigger])

  const loadData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await getBrowserUser()
    if (!user) {
      setGoals([])
      setLoading(false)
      return
    }

    const { data: goalsData, error: goalsError } = await supabase
      .from('goals')
      .select('*')
      .eq('user_id', user.id)
    if (goalsError || !goalsData?.length) {
      setGoals([])
      setLoading(false)
      return
    }

    const goalIds = (goalsData as GoalRow[]).map((g) => g.id)
    const { data: allocData } = await supabase
      .from('income_allocations')
      .select('goal_id, amount')
      .in('goal_id', goalIds)

    const byGoal: Record<string, number> = {}
    for (const row of allocData ?? []) {
      const id = (row as { goal_id: string; amount: number }).goal_id
      const amt = Number((row as { goal_id: string; amount: number }).amount)
      byGoal[id] = (byGoal[id] ?? 0) + amt
    }

    const withSaved: GoalWithSaved[] = (goalsData as GoalRow[]).map((g) => ({
      ...g,
      saved: byGoal[g.id] ?? Number(g.saved_amount) ?? 0,
    }))
    setGoals(withSaved)
    setLoading(false)
  }, [goalsRefreshTrigger])

  useEffect(() => {
    loadData()
  }, [loadData])

  const totalSaved = goals.reduce((sum, g) => sum + g.saved, 0)
  const totalTarget = goals.reduce((sum, g) => sum + Number(g.target_amount || 0), 0)
  const goalsOnTrack = goals.filter((g) => {
    const target = Number(g.target_amount || 0)
    if (target <= 0) return false
    return g.saved > 0
  }).length
  const goalsProgressPct = totalTarget > 0 ? Math.min(100, (totalSaved / totalTarget) * 100) : 0
  const maxGoals = features?.max_goals ?? PLAN_LIMITS.free.maxGoals
  const { openAddIncome, openAddExpense } = useDashboardActions()
  const profile = useDashboardProfile()
  const displayName =
    profile?.profile?.nickname?.trim() ||
    profile?.profile?.full_name?.trim()?.split(/\s+/)[0] ||
    'there'
  const hour = new Date().getHours()
  const greeting =
    hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  const previewGoals = [...goals]
    .map((g) => ({
      id: g.id,
      name: g.name,
      saved: g.saved,
      target: Number(g.target_amount) || 0,
    }))
    .sort((a, b) => {
      const pa = a.target > 0 ? a.saved / a.target : 0
      const pb = b.target > 0 ? b.saved / b.target : 0
      return pb - pa
    })
    .slice(0, 3)

  const monthIncome = monthMoney?.income ?? 0
  const monthExpenses = monthMoney?.expenses ?? 0
  const insightStack = deriveMonthInsights({
    income: monthIncome,
    expenses: monthExpenses,
    goalsCount: goals.length,
    goalsProgressPct,
  })

  return (
    <div
      className={`dashboard-page dashboard-page--v2-command dashboard-page--one-glance w-full max-w-md mx-auto px-4 max-lg:flex max-lg:flex-col max-lg:gap-3 lg:max-w-none lg:mx-0 lg:px-0${isPro ? ' dashboard-premium' : ''}`}
      aria-busy={loading || subscriptionLoading}
      aria-live="polite"
      role="region"
      aria-label="Dashboard content"
    >
      <div className="page-header page-header-with-actions dashboard-page-header dash-one-glance-header max-lg:order-0 max-lg:items-start max-lg:gap-0 max-lg:mb-0 lg:gap-2">
        <div className="min-w-0 flex-1 max-lg:w-full">
          <div className="max-lg:flex max-lg:items-center max-lg:justify-between max-lg:gap-2 max-lg:overflow-visible">
            <h2 className="dashboard-greeting-title max-lg:text-lg max-lg:font-semibold max-lg:leading-tight max-lg:mb-0">
              {greeting}, {displayName}!
            </h2>
            <DashboardMobileHeaderLogo />
          </div>
          <p className="dashboard-greeting-sub max-lg:mt-1 max-lg:text-xs max-lg:leading-snug max-lg:mb-0">
            Small steps today. A brighter tomorrow.
          </p>
        </div>
        <div className="page-header-actions dashboard-header-controls">
          <MonthPicker
            id="dashboard-month-picker"
            className="dashboard-month-picker"
            value={budgetMonth}
            onChange={setBudgetMonth}
            refreshKey={refreshTrigger}
          />
          <div className="dashboard-header-actions-desktop">
            <button
              type="button"
              className="btn-primary header-add-btn-desktop-only"
              onClick={openAddIncome}
              aria-label="Add income"
            >
              + Add Income
            </button>
            <button
              type="button"
              className="btn-primary header-add-btn-desktop-only"
              onClick={openAddExpense}
              aria-label="Add expense"
            >
              + Add Expense
            </button>
          </div>
        </div>
      </div>

      <div className="w-full max-lg:order-1">
        <ActivationCelebration isPro={isPro} />
      </div>

      {/* ROW 1 — Snapshot */}
      <div className="w-full max-lg:order-2">
        <DashboardMonthStatStrip
          income={monthIncome}
          expenses={monthExpenses}
          loading={monthMoneyLoading}
          goalsCount={goals.length}
          goalsOnTrack={goalsOnTrack}
          goalsProgressPct={goalsProgressPct}
        />
      </div>

      {/* ROW 2 — Monthly Budget | Spending to Watch | Goal Momentum | Klaro Insight */}
      <div className="dash-one-glance-row dash-one-glance-row--main max-lg:order-3 w-full">
        <BudgetOverview
          spendingByCategory={monthMoney?.spendingByCategory ?? null}
          selectedMonth={budgetMonth}
          budgetRefreshKey={refreshTrigger}
          maxCategories={3}
          breakdownTitle="Top Spending to Watch"
          breakdownTitleMobile="Top Spending to Watch"
          showBudgetEditorButtons={false}
          showMonthPicker={false}
          onSetBudget={() => router.push('/dashboard/expenses?budget=setup')}
          breakdownAction={
            <Link href="/dashboard/expenses" className="card-outline-link dashboard-card-link">
              View all →
            </Link>
          }
        />
        <GoalMomentumSection
          totalGoals={goals.length}
          totalSaved={totalSaved}
          totalTarget={totalTarget}
          previewGoals={previewGoals}
        />
        <KlaroInsightCard
          stack={insightStack}
          aiInsight={aiInsight}
          onRefreshAi={() => fetchAiInsight(true)}
        />
      </div>

      {/* ROW 3 — Trend | Financial Health | Quick Tools */}
      <div className="dash-one-glance-row dash-one-glance-row--trend max-lg:order-4 w-full">
        <DashboardFinancialTrend refreshTrigger={refreshTrigger} />
        <DashboardFinancialHealthCard refreshTrigger={refreshTrigger} />
        <DashboardQuickTools />
      </div>

      {/* ROW 4 — Recent activity | Pro */}
      <div className="dash-one-glance-row dash-one-glance-row--activity max-lg:order-5 w-full">
        <DashboardRecentTransactions refreshTrigger={refreshTrigger} limit={5} />
        {!isPro && <DashboardProCard />}
      </div>

      <ManageGoalsModal
        isOpen={manageGoalsOpen}
        onClose={() => setManageGoalsOpen(false)}
        onGoalsChange={() => {
          setGoalsRefreshTrigger((n) => n + 1)
          setRefreshTrigger((n) => n + 1)
          dispatchDashboardRefresh()
        }}
        maxGoals={maxGoals}
        isPro={isPro}
        onUpgradeClick={isPro ? undefined : () => { setManageGoalsOpen(false); openUpgradeModal() }}
      />

      <NewGoalModal
        isOpen={addGoalOpen}
        onClose={() => setAddGoalOpen(false)}
        onGoalCreated={() => {
          setAddGoalOpen(false)
          setGoalsRefreshTrigger((n) => n + 1)
          setRefreshTrigger((n) => n + 1)
          router.refresh()
          dispatchDashboardRefresh()
        }}
      />
    </div>
  )
}
