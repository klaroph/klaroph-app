'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import {
  DASHBOARD_REFRESH_EVENT,
  DASHBOARD_GOALS_REFRESH_EVENT,
  DASHBOARD_TRANSACTIONS_REFRESH_EVENT,
  dispatchDashboardRefresh,
} from '@/lib/dashboardRefresh'
import type { GoalRow, GoalWithSaved } from '@/types/database'
import GoalMomentumSection from '@/components/dashboard/GoalMomentumSection'
import ActivationCelebration from '@/components/dashboard/ActivationCelebration'

/* SSR enabled so first paint reserves real markup; still code-split. Avoids empty → pop-in CLS from ssr:false. */
const ExpensesTrendChartCard = dynamic(
  () => import('@/components/dashboard/ExpensesTrendChartCard'),
  {
    loading: () => <div className="dashboard-expenses-trend-placeholder" aria-hidden />,
  },
)
const BudgetOverview = dynamic(
  () => import('@/components/dashboard/BudgetOverview'),
  {
    loading: () => (
      <div
        className="card dash-card budget-overview-card budget-overview-loading-skeleton budget-overview-dynamic-placeholder"
        aria-hidden
      />
    ),
  },
)
const IncomeExpenseFlow = dynamic(
  () => import('@/components/dashboard/IncomeExpenseFlow'),
  {
    loading: () => <div className="dashboard-income-expense-flow-placeholder" aria-hidden />,
  },
)
const ManageGoalsModal = dynamic(
  () => import('@/components/dashboard/ManageGoalsModal'),
  { ssr: false },
)
const NewGoalModal = dynamic(
  () => import('@/components/dashboard/NewGoalModal'),
  { ssr: false },
)
import CardHeaderWithAction from '@/components/cards/CardHeaderWithAction'
import { useSubscription } from '@/contexts/SubscriptionContext'
import { useUpgradeTrigger } from '@/contexts/UpgradeTriggerContext'
import { PLAN_LIMITS } from '@/lib/planLimits'
import { toLocalDateString } from '@/lib/format'
import Link from 'next/link'
import UpgradeCTA from '@/components/ui/UpgradeCTA'
import DashboardMobileHeaderLogo from '@/components/layout/DashboardMobileHeaderLogo'
import { useDashboardActions } from './DashboardLayoutClient'

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
  const [loading, setLoading] = useState(true)
  const [manageGoalsOpen, setManageGoalsOpen] = useState(false)
  const [addGoalOpen, setAddGoalOpen] = useState(false)

  useEffect(() => {
    refresh()
  }, [refresh])

  const loadData = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
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
  const maxGoals = features?.max_goals ?? PLAN_LIMITS.free.maxGoals
  const { openAddIncome, openAddExpense } = useDashboardActions()

  return (
    <div
      className={`dashboard-page w-full max-w-md mx-auto px-4 max-lg:flex max-lg:flex-col max-lg:gap-3 lg:max-w-none lg:mx-0 lg:px-0${isPro ? ' dashboard-premium' : ''}`}
      aria-busy={loading || subscriptionLoading}
      aria-live="polite"
      role="region"
      aria-label="Dashboard content"
    >
      <div className="page-header page-header-with-actions dashboard-page-header max-lg:order-0 max-lg:items-start max-lg:gap-0 max-lg:mb-0 lg:gap-3">
        <div className="min-w-0 flex-1 max-lg:w-full">
          <div className="max-lg:flex max-lg:items-center max-lg:justify-between max-lg:gap-2 max-lg:overflow-visible">
            <h2 className="max-lg:text-lg max-lg:font-semibold max-lg:leading-tight max-lg:mb-0">Dashboard</h2>
            <DashboardMobileHeaderLogo />
          </div>
          <p className="max-lg:mt-1 max-lg:text-xs max-lg:leading-snug max-lg:mb-0 max-lg:text-[var(--text-muted,#64748b)]">
            Financial clarity, without complexity.
          </p>
        </div>
        <div className="dashboard-header-actions-desktop page-header-actions">
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
      <div className="w-full max-lg:order-1">
        <ActivationCelebration isPro={isPro} />
      </div>

      {!isPro && (
        <div
          className="free-plan-banner premium-banner max-lg:flex-col max-lg:items-stretch max-lg:gap-3 max-lg:order-last w-full"
          role="status"
        >
          <span className="max-lg:text-sm">
            You can already track expenses, log income, manage goals, and do basic budgeting — all for free. Upgrade to KlaroPH Pro anytime to unlock deeper insights, extended history, and advanced tools.
          </span>
          <UpgradeCTA variant="compact" className="!w-full max-lg:!h-12 max-lg:!rounded-xl lg:!w-auto lg:!h-auto lg:!rounded-lg" />
        </div>
      )}

      <div className="dashboard-top-cluster max-lg:order-4 w-full">
        <div className="dashboard-top-row">
          <div className="dashboard-col-left">
            <div className="dashboard-left-module">
              <GoalMomentumSection
                totalGoals={goals.length}
                totalSaved={totalSaved}
                totalTarget={totalTarget}
              />
              <div className="hidden lg:block">
                <ExpensesTrendChartCard refreshTrigger={refreshTrigger} />
              </div>
            </div>
          </div>
          <div className="dashboard-col-budget">
            <BudgetOverview
              selectedMonth={budgetMonth}
              onMonthChange={setBudgetMonth}
              budgetRefreshKey={refreshTrigger}
              maxCategories={8}
              breakdownTitle="Top 8 Spending to Watch"
              breakdownTitleMobile="Top 3 Spending to Watch"
              showBudgetEditorButtons={false}
              headerAction={
                <Link href="/dashboard/expenses" className="card-outline-link dashboard-card-link max-lg:hidden">
                  Expenses Page →
                </Link>
              }
            />
          </div>
        </div>
      </div>

      <div className="card dash-card dash-card-no-border max-lg:rounded-xl max-lg:order-3 max-lg:mt-0 w-full">
        <CardHeaderWithAction
          title="Income & Expenses"
          titleAs="h3"
          actions={
            <>
              <Link href="/dashboard/income" className="card-outline-link max-lg:hidden">
                Income Page →
              </Link>
              <Link href="/dashboard/expenses" className="card-outline-link max-lg:hidden">
                Expenses Page →
              </Link>
            </>
          }
        />
        <IncomeExpenseFlow
          refreshTrigger={refreshTrigger}
          showTitle={false}
          monthFirst={budgetMonth}
          onMonthChange={setBudgetMonth}
          className="income-expense-flow--dashboard-page"
        />
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
