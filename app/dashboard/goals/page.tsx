'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import GoalList from '../../../components/goals/GoalList'
import type { GoalSummary } from '../../../components/goals/GoalList'
import GoalMomentumHero from '../../../components/goals/GoalMomentumHero'
import NewGoalModal from '../../../components/dashboard/NewGoalModal'
import type { GoalForEdit } from '../../../components/dashboard/NewGoalModal'
import UpgradeCTA from '../../../components/ui/UpgradeCTA'
import PremiumBadge from '../../../components/ui/PremiumBadge'
import { useSubscription } from '@/contexts/SubscriptionContext'
import { PLAN_LIMITS } from '@/lib/planLimits'
import { DASHBOARD_REFRESH_EVENT } from '@/lib/dashboardRefresh'

const defaultSummary: GoalSummary = {
  totalSaved: 0,
  totalTarget: 0,
  activeGoals: 0,
  overallPercent: 0,
  strongestGoal: null,
}

export default function GoalsPage() {
  const { features, isPro } = useSubscription()
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingGoal, setEditingGoal] = useState<GoalForEdit | null>(null)
  const [goalCount, setGoalCount] = useState(0)
  const [momentumSummary, setMomentumSummary] = useState<GoalSummary>(defaultSummary)

  const maxGoals = features?.max_goals ?? PLAN_LIMITS.free.maxGoals
  const atLimit = !isPro && goalCount >= maxGoals

  useEffect(() => {
    const onRefresh = () => setRefreshTrigger((n) => n + 1)
    window.addEventListener(DASHBOARD_REFRESH_EVENT, onRefresh)
    return () => window.removeEventListener(DASHBOARD_REFRESH_EVENT, onRefresh)
  }, [])

  useEffect(() => {
    let mounted = true
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!mounted || !user) {
        if (mounted) setGoalCount(0)
        return
      }
      supabase
        .from('goals')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .then(({ count }) => {
          if (mounted) setGoalCount(count ?? 0)
        })
    })
    return () => { mounted = false }
  }, [refreshTrigger])

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
  }

  return (
    <div className="goals-page">
      <div className="page-header">
        <h2>Goals</h2>
        <p>Track your savings targets. One goal at a time.</p>
      </div>

      {atLimit && (
        <div
          role="status"
          className="goals-page-limit-banner"
        >
          <div className="goals-page-limit-title">
            You&apos;ve reached your Free plan limit (2/2 goals).
          </div>
          <p className="goals-page-limit-desc">
            Upgrade to Pro to create up to 20 goals.
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
      />

      <div className="dash-card goals-page-cards-wrap">
        <div className="dash-card-header">
          <h3 className="dash-card-title">Your Goals</h3>
          {atLimit ? (
            <span
              title="Create up to 20 goals with Pro"
              className="goals-page-add-disabled header-add-btn-desktop-only"
              aria-disabled="true"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Add New Goal
              <PremiumBadge size="sm" />
            </span>
          ) : (
            <button className="btn-primary header-add-btn-desktop-only" onClick={() => { setEditingGoal(null); setModalOpen(true) }}>
              + Add New Goal
            </button>
          )}
        </div>
        <GoalList
          refreshTrigger={refreshTrigger}
          onEdit={handleEditGoal}
          onDelete={handleDeleteGoal}
          onDataLoaded={setMomentumSummary}
        />
      </div>

      <NewGoalModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditingGoal(null) }}
        onGoalCreated={handleGoalCreated}
        initialGoal={editingGoal}
      />
    </div>
  )
}
