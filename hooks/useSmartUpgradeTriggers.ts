'use client'

import { useEffect, useRef } from 'react'
import { useSubscription } from '@/contexts/SubscriptionContext'
import { useUpgradeTriggerOptional } from '@/contexts/UpgradeTriggerContext'

const STORAGE_KEYS = {
  secondGoalCompleted: 'klaroph_upgrade_trigger_second_goal_done',
  hundredTransactions: 'klaroph_upgrade_trigger_100_txns',
}

/**
 * Call when date range start is before the free-user cutoff (90 days).
 * Opens upgrade modal if free and range extends beyond 90 days.
 */
export function useTriggerDateRangeBeyond90(
  rangeStart: string | undefined,
  analyticsCutoffDate: string | null | undefined
) {
  const { isPro } = useSubscription()
  const open = useUpgradeTriggerOptional()?.openUpgradeModal
  const triggered = useRef(false)
  useEffect(() => {
    if (isPro || !open || !rangeStart || !analyticsCutoffDate) return
    if (rangeStart >= analyticsCutoffDate) return
    if (triggered.current) return
    triggered.current = true
    open()
  }, [isPro, open, rangeStart, analyticsCutoffDate])
}

/**
 * Call after loading goals; if free user has 2+ goals at 100%, show upgrade modal once.
 */
export function useTriggerSecondGoalCompleted(
  goals: { saved_amount?: number; target_amount?: number }[] | undefined
) {
  const { isPro } = useSubscription()
  const open = useUpgradeTriggerOptional()?.openUpgradeModal
  const triggered = useRef(false)
  useEffect(() => {
    if (isPro || !open || !goals?.length) return
    if (typeof window === 'undefined') return
    if (localStorage.getItem(STORAGE_KEYS.secondGoalCompleted) === '1') return
    const completed = goals.filter(
      (g) => Number(g.saved_amount ?? 0) >= Number(g.target_amount ?? 1)
    )
    if (completed.length < 2) return
    if (triggered.current) return
    triggered.current = true
    localStorage.setItem(STORAGE_KEYS.secondGoalCompleted, '1')
    open()
  }, [isPro, open, goals])
}

/**
 * Call after loading transaction counts; if free user has 100+ total, show upgrade modal once.
 */
export function useTrigger100Transactions(
  incomeCount: number,
  expenseCount: number
) {
  const { isPro } = useSubscription()
  const open = useUpgradeTriggerOptional()?.openUpgradeModal
  const triggered = useRef(false)
  useEffect(() => {
    if (isPro || !open) return
    if (incomeCount + expenseCount < 100) return
    if (typeof window === 'undefined') return
    if (localStorage.getItem(STORAGE_KEYS.hundredTransactions) === '1') return
    if (triggered.current) return
    triggered.current = true
    localStorage.setItem(STORAGE_KEYS.hundredTransactions, '1')
    open()
  }, [isPro, open, incomeCount, expenseCount])
}
