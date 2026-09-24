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
import IncomeExpenseFlow from '@/components/dashboard/IncomeExpenseFlow'
/** Static import: full card shell + title paint in initial bundle (LCP); data hydrates inside the component. */
import BudgetOverview from '@/components/dashboard/BudgetOverview'
import ActivationCelebration from '@/components/dashboard/ActivationCelebration'
import { useSubscription } from '@/contexts/SubscriptionContext'
import { useUpgradeTrigger } from '@/contexts/UpgradeTriggerContext'
import { PLAN_LIMITS } from '@/lib/planLimits'
import { toLocalDateString } from '@/lib/format'
import Link from 'next/link'
import UpgradeCTA from '@/components/ui/UpgradeCTA'
import DashboardMobileHeaderLogo from '@/components/layout/DashboardMobileHeaderLogo'
import { useDashboardActions } from './DashboardLayoutClient'

const GoalMomentumSection = dynamic(
  () => import('@/components/dashboard/GoalMomentumSection'),
  {
    loading: () => <div className="goal-momentum-section-placeholder" aria-hidden />,
  },
)

/* SSR enabled so first paint reserves real markup; still code-split. Avoids empty → pop-in CLS from ssr:false. */
const ExpensesTrendChartCard = dynamic(
  () => import('@/components/dashboard/ExpensesTrendChartCard'),
  {
    loading: () => <div className="dashboard-expenses-trend-placeholder" aria-hidden />,
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
  const [showDetails, setShowDetails] = useState(false)

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
  /** false on first paint so header + Income/Expenses summary are not blocked by goals fetch */
  const [loading, setLoading] = useState(false)
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
      className={`dashboard-page dashboard-page--composed w-full max-w-md mx-auto px-4 max-lg:flex max-lg:flex-col max-lg:gap-3 lg:max-w-none lg:mx-0 lg:px-0${isPro ? ' dashboard-premium' : ''}`}
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
            Savings first. One clear next step.
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
            className="btn-secondary header-add-btn-desktop-only"
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

      {/* Primary: one metric + one CTA */}
      <section
        className="dashboard-primary max-lg:order-2 w-full"
        aria-labelledby="dashboard-primary-heading"
      >
        <div className="dashboard-primary-metric">
          <GoalMomentumSection
            totalGoals={goals.length}
            totalSaved={totalSaved}
            totalTarget={totalTarget}
          />
        </div>
        <div className="dashboard-primary-cta">
          <p id="dashboard-primary-heading" className="dashboard-primary-cta-label">
            Next step
          </p>
          <button
            type="button"
            className="btn-primary dashboard-primary-cta-btn"
            onClick={openAddIncome}
          >
            Log income toward your goals
          </button>
          <button
            type="button"
            className="dashboard-primary-cta-secondary"
            onClick={openAddExpense}
          >
            Or log an expense
          </button>
        </div>
      </section>

      {/* Secondary: budget only — supporting context */}
      <section className="dashboard-secondary max-lg:order-3 w-full" aria-label="Monthly budget">
        <BudgetOverview
          selectedMonth={budgetMonth}
          onMonthChange={setBudgetMonth}
          budgetRefreshKey={refreshTrigger}
          maxCategories={8}
          breakdownTitle="Top spending to watch"
          breakdownTitleMobile="Top 3 spending"
          showBudgetEditorButtons={false}
          headerAction={
            <Link href="/dashboard/expenses" className="card-outline-link dashboard-card-link max-lg:hidden">
              Expenses →
            </Link>
          }
        />
      </section>

      {/* Deferred: trend + cashflow — opt-in on mobile, quieter chrome on desktop */}
      <section className="dashboard-deferred max-lg:order-4 w-full">
        <button
          type="button"
          className="dashboard-deferred-toggle lg:hidden"
          aria-expanded={showDetails}
          onClick={() => setShowDetails((v) => !v)}
        >
          {showDetails ? 'Hide cashflow details' : 'Show income, expenses & trends'}
        </button>
        <div className={`dashboard-deferred-body${showDetails ? ' is-open' : ''}`}>
          <div className="dashboard-deferred-trend hidden lg:block">
            <ExpensesTrendChartCard refreshTrigger={refreshTrigger} />
          </div>
          <div className="dashboard-deferred-flow">
            <h3 className="dashboard-deferred-title">This month’s cashflow</h3>
            <p className="dashboard-deferred-desc">
              Income in, expenses out — without another card stack.
            </p>
            <div className="dashboard-deferred-links max-lg:hidden">
              <Link href="/dashboard/income" className="card-outline-link">
                Income →
              </Link>
              <Link href="/dashboard/expenses" className="card-outline-link">
                Expenses →
              </Link>
            </div>
            <IncomeExpenseFlow
              refreshTrigger={refreshTrigger}
              showTitle={false}
              monthFirst={budgetMonth}
              onMonthChange={setBudgetMonth}
              className="income-expense-flow--dashboard-page"
            />
          </div>
        </div>
      </section>

      {!isPro && (
        <div
          className="free-plan-banner free-plan-banner--quiet premium-banner max-lg:flex-col max-lg:items-stretch max-lg:gap-3 max-lg:order-last w-full"
          role="status"
        >
          <span className="max-lg:text-sm">
            Free covers tracking, goals, and basic budgeting. Pro unlocks deeper history and export.
          </span>
          <UpgradeCTA variant="compact" className="!w-full max-lg:!h-12 max-lg:!rounded-xl lg:!w-auto lg:!h-auto lg:!rounded-lg" />
        </div>
      )}

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
