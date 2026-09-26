'use client'

import { Fragment, useState, useEffect } from 'react'
import GoalList from '../../../components/goals/GoalList'
import GoalMomentumHero from '../../../components/goals/GoalMomentumHero'
import NewGoalModal from '../../../components/dashboard/NewGoalModal'
import type { GoalForEdit } from '../../../components/dashboard/NewGoalModal'
import AllocateToGoalModal from '../../../components/goals/AllocateToGoalModal'
import UpgradeCTA from '../../../components/ui/UpgradeCTA'
import PremiumBadge from '../../../components/ui/PremiumBadge'
import { useSubscription } from '@/contexts/SubscriptionContext'
import { PLAN_LIMITS } from '@/lib/planLimits'
import { DASHBOARD_REFRESH_EVENT, DASHBOARD_GOALS_REFRESH_EVENT, dispatchDashboardGoalsRefresh } from '@/lib/dashboardRefresh'
import KlaroPageHeader from '@/components/layout/KlaroPageHeader'
import { useGoalsData } from '@/hooks/useGoalsData'

export default function GoalsPage() {
  const { features, isPro, loading: subscriptionLoading } = useSubscription()
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [modalOpen, setModalOpen] = useState(false)
  const [allocateOpen, setAllocateOpen] = useState(false)
  const [editingGoal, setEditingGoal] = useState<GoalForEdit | null>(null)
  const goalsData = useGoalsData(refreshTrigger)
  const goalCount = goalsData.goals.length
  const momentumSummary = goalsData.summary

  const maxGoals = features?.max_goals ?? PLAN_LIMITS.free.maxGoals
  /** Banner, hero, and list reveal together once goals and plan are both known. */
  const contentReady = goalsData.hasLoaded && (features !== null || !subscriptionLoading)
  const atLimit = contentReady && !isPro && goalCount >= maxGoals

  useEffect(() => {
    const onRefresh = () => setRefreshTrigger((n) => n + 1)
    window.addEventListener(DASHBOARD_REFRESH_EVENT, onRefresh)
    window.addEventListener(DASHBOARD_GOALS_REFRESH_EVENT, onRefresh)
    return () => {
      window.removeEventListener(DASHBOARD_REFRESH_EVENT, onRefresh)
      window.removeEventListener(DASHBOARD_GOALS_REFRESH_EVENT, onRefresh)
    }
  }, [])

  /** Insight CTAs: ?new=1 opens Add Goal; ?allocate=1 opens Allocate to Goal */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const wantsNew = params.get('new') === '1'
    const wantsAllocate = params.get('allocate') === '1'
    if (!wantsNew && !wantsAllocate) return
    const frame = requestAnimationFrame(() => {
      if (wantsAllocate) setAllocateOpen(true)
      else if (wantsNew && !atLimit) {
        setEditingGoal(null)
        setModalOpen(true)
      }
      window.history.replaceState(null, '', window.location.pathname)
    })
    return () => cancelAnimationFrame(frame)
  }, [atLimit])

  const handleGoalCreated = () => {
    setModalOpen(false)
    setEditingGoal(null)
    setRefreshTrigger((n) => n + 1)
  }

  const handleEditGoal = (goal: GoalForEdit) => {
    setEditingGoal(goal)
    setModalOpen(true)
  }

  const handleDeleteGoal = async (goal: GoalForEdit) => {
    if (!confirm(`Delete goal "${goal.name}"? This cannot be undone.`)) return
    const res = await fetch(`/api/goals/${goal.id}`, { method: 'DELETE', credentials: 'include' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert((data?.error as string) ?? 'Could not delete goal.')
      return
    }
    setRefreshTrigger((n) => n + 1)
    dispatchDashboardGoalsRefresh()
  }

  const headerActions = (
    <>
      {goalCount > 0 && (
        <button
          type="button"
          className="btn-secondary header-add-btn-desktop-only"
          onClick={() => setAllocateOpen(true)}
        >
          Allocate to goal
        </button>
      )}
      {atLimit ? (
        <span
          title="Create up to 20 goals with Pro"
          className="goals-page-add-disabled"
          aria-disabled="true"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          Add Goal
          <PremiumBadge size="sm" />
        </span>
      ) : (
        <button
          type="button"
          className="btn-primary header-add-btn-desktop-only"
          onClick={() => {
            setEditingGoal(null)
            setModalOpen(true)
          }}
        >
          + Add Goal
        </button>
      )}
    </>
  )

  return (
    <div className="goals-page klaro-page-shell">
      <KlaroPageHeader
        title="Goals"
        description="Turn your plans into milestones."
        actions={headerActions}
      />

      {/* Distinct keys: the loaded tree replaces the skeleton rather than shifting its nodes. */}
      <Fragment key={contentReady ? 'goals-ready' : 'goals-loading'}>
        {atLimit && (
          <div
            role="status"
            className="goals-page-limit-banner"
          >
            <div className="goals-page-limit-title">
              You&apos;ve reached your Free plan limit (2/2 goals).
            </div>
            <p className="goals-page-limit-desc">
              Explore KlaroPH Pro to create up to 20 goals.
            </p>
            <UpgradeCTA variant="compact" />
          </div>
        )}

        <GoalMomentumHero
          totalSaved={momentumSummary.totalSaved}
          totalTarget={momentumSummary.totalTarget}
          activeGoals={momentumSummary.activeGoals}
          overallPercent={momentumSummary.overallPercent}
          strongestGoal={momentumSummary.strongestGoal}
          loading={!contentReady}
        />

        <div className="dash-card goals-page-cards-wrap">
          <div className="dash-card-header">
            <h3 className="dash-card-title">Your Goals</h3>
          </div>
          <GoalList
            goals={goalsData.goals}
            allocationsByGoal={goalsData.allocationsByGoal}
            runwayByGoal={goalsData.runwayByGoal}
            loading={!contentReady || goalsData.loading}
            error={goalsData.error}
            onEdit={handleEditGoal}
            onDelete={handleDeleteGoal}
            onAddClick={
              atLimit
                ? undefined
                : () => {
                    setEditingGoal(null)
                    setModalOpen(true)
                  }
            }
          />
        </div>
      </Fragment>

      <NewGoalModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditingGoal(null) }}
        onGoalCreated={handleGoalCreated}
        initialGoal={editingGoal}
      />

      <AllocateToGoalModal
        isOpen={allocateOpen}
        onClose={() => setAllocateOpen(false)}
        onSaved={() => {
          setRefreshTrigger((n) => n + 1)
          dispatchDashboardGoalsRefresh()
        }}
      />
    </div>
  )
}
