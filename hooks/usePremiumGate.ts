'use client'

import { useCallback } from 'react'
import { useSubscription } from '@/contexts/SubscriptionContext'

export type UsePremiumGateOptions = {
  onRequestPro?: () => void
}

export type UsePremiumGateReturn = {
  isPro: boolean
  plan: string
  /** Call when a free user attempts a pro feature; opens upgrade flow if onRequestPro provided */
  requestProFeature: () => void
}

/**
 * Hook for gating premium features. Use with UpgradeModal: pass setOpen from parent
 * so requestProFeature() opens the modal.
 */
export function usePremiumGate(options: UsePremiumGateOptions = {}): UsePremiumGateReturn {
  const { isPro, plan } = useSubscription() ?? { isPro: false, plan: 'free' }
  const onRequestPro = options.onRequestPro

  const requestProFeature = useCallback(() => {
    if (isPro) return
    onRequestPro?.()
  }, [isPro, onRequestPro])

  return {
    isPro,
    plan: plan ?? 'free',
    requestProFeature,
  }
}
