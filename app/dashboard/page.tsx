'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
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
import ExpensesTrendChartCard from '@/components/dashboard/ExpensesTrendChartCard'
import IncomeExpenseFlow from '@/components/dashboard/IncomeExpenseFlow'
import BudgetOverview from '@/components/dashboard/BudgetOverview'
import ManageGoalsModal from '@/components/dashboard/ManageGoalsModal'
import NewGoalModal from '@/components/dashboard/NewGoalModal'
import ActivationCelebration from '@/components/dashboard/ActivationCelebration'
import CardHeaderWithAction from '@/components/cards/CardHeaderWithAction'
import { useSubscription } from '@/contexts/SubscriptionContext'
import { useUpgradeTrigger } from '@/contexts/UpgradeTriggerContext'
import { PLAN_LIMITS } from '@/lib/planLimits'
import { toLocalDateString } from '@/lib/format'
import Link from 'next/link'
import UpgradeCTA from '@/components/ui/UpgradeCTA'
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
      className={`dashboard-page${isPro ? ' dashboard-premium' : ''}`}
      aria-busy={loading || subscriptionLoading}
      aria-live="polite"
      role="region"
      aria-label="Dashboard content"
    >
      <div className="page-header page-header-with-actions">
        <div>
          <h2>Dashboard</h2>
          <p>Financial clarity, without complexity.</p>
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
      <ActivationCelebration isPro={isPro} />

      {!isPro && (
        <div className="free-plan-banner premium-banner" role="status">
          <span>Free plan includes 2 goals and 90-day analytics. Upgrade to unlock 20 goals, unlimited history, budgeting, and more.</span>
          <UpgradeCTA variant="compact" />
        </div>
      )}

      <div className="dashboard-top-cluster">
        <div className="dashboard-top-row">
          <div className="dashboard-col-left">
            <div className="dashboard-left-module">
              <GoalMomentumSection
                totalGoals={goals.length}
                totalSaved={totalSaved}
                totalTarget={totalTarget}
              />
              <ExpensesTrendChartCard refreshTrigger={refreshTrigger} />
            </div>
          </div>
          <div className="dashboard-col-budget">
            <BudgetOverview
              selectedMonth={budgetMonth}
              onMonthChange={setBudgetMonth}
              budgetRefreshKey={refreshTrigger}
              maxCategories={8}
              breakdownTitle="Top 8 Spending to Watch"
              showBudgetEditorButtons={false}
              headerAction={
                <Link href="/dashboard/expenses" className="card-outline-link dashboard-card-link">
                  Expenses Page →
                </Link>
              }
            />
          </div>
        </div>
      </div>

      <div className="card dash-card dash-card-no-border">
        <CardHeaderWithAction
          title="Income & Expenses"
          titleAs="h3"
          actions={
            <>
              <Link href="/dashboard/income" className="card-outline-link">
                Income Page →
              </Link>
              <Link href="/dashboard/expenses" className="card-outline-link">
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
