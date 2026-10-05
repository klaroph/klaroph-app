'use client'

import { useEffect, useRef } from 'react'
import { useSubscription } from '@/contexts/SubscriptionContext'
import { useUpgradeTriggerOptional } from '@/contexts/UpgradeTriggerContext'

/**
 * Entitlement-gated upgrade opens only.
 * Activity milestones (100 transactions, a second completed goal) must not auto-open Pro.
 */

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
