'use client'

import { useEffect, useState } from 'react'
import {
  DASHBOARD_REFRESH_EVENT,
  DASHBOARD_TRANSACTIONS_REFRESH_EVENT,
} from '@/lib/dashboardRefresh'

/** Shared refresh counter for income/expenses pages listening to dashboard events. */
export function useDashboardTransactionRefresh() {
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  useEffect(() => {
    const onRefresh = () => setRefreshTrigger((n) => n + 1)
    window.addEventListener(DASHBOARD_REFRESH_EVENT, onRefresh)
    window.addEventListener(DASHBOARD_TRANSACTIONS_REFRESH_EVENT, onRefresh)
    return () => {
      window.removeEventListener(DASHBOARD_REFRESH_EVENT, onRefresh)
      window.removeEventListener(DASHBOARD_TRANSACTIONS_REFRESH_EVENT, onRefresh)
    }
  }, [])

  return { refreshTrigger, setRefreshTrigger } as const
}

export function useMobilePortrait() {
  const [isMobilePortrait, setIsMobilePortrait] = useState(false)

  useEffect(() => {
    const checkOrientation = () => {
      const isMobile = window.innerWidth <= 768
      const isPortrait = window.innerHeight > window.innerWidth
      setIsMobilePortrait(isMobile && isPortrait)
    }
    checkOrientation()
    window.addEventListener('resize', checkOrientation)
    return () => window.removeEventListener('resize', checkOrientation)
  }, [])

  return isMobilePortrait
}
