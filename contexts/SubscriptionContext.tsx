'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { fetchUserFeatures } from '@/lib/features'
import type { UserFeaturesWithSubscription } from '@/types/features'

type SubscriptionContextValue = {
  features: UserFeaturesWithSubscription | null
  isPro: boolean
  is_grace: boolean
  subscriptionStatus: string
  currentPeriodEnd: string | null
  plan: string
  loading: boolean
  refresh: () => Promise<void>
}

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null)

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const [features, setFeatures] = useState<UserFeaturesWithSubscription | null>(null)
  const [loading, setLoading] = useState(true)
  const inFlightRef = useRef(false)

  const load = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    setLoading(true)
    try {
      const data = await fetchUserFeatures()
      setFeatures(data ?? null)
    } finally {
      inFlightRef.current = false
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const value: SubscriptionContextValue = {
    features,
    isPro: features?.isPro ?? false,
    is_grace: features?.is_grace ?? false,
    subscriptionStatus: features?.subscriptionStatus ?? 'none',
    currentPeriodEnd: features?.currentPeriodEnd ?? null,
    plan: features?.plan ?? 'free',
    loading,
    refresh: load,
  }

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  )
}

export function useSubscription(): SubscriptionContextValue {
  const ctx = useContext(SubscriptionContext)
  if (!ctx) {
    throw new Error('useSubscription must be used within SubscriptionProvider')
  }
  return ctx
}

export function useSubscriptionOptional(): SubscriptionContextValue | null {
  return useContext(SubscriptionContext)
}
