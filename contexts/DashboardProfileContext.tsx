'use client'

import { createContext, useContext } from 'react'
import type { ProfileWithComputed } from '@/types/profile'

/**
 * Profile data fetched once by DashboardLayoutClient and shared to Sidebar (and other consumers).
 * Avoids duplicate GET /api/profile requests.
 */
const DashboardProfileContext = createContext<ProfileWithComputed | null>(null)

export function DashboardProfileProvider({
  profile,
  children,
}: {
  profile: ProfileWithComputed | null
  children: React.ReactNode
}) {
  return (
    <DashboardProfileContext.Provider value={profile}>
      {children}
    </DashboardProfileContext.Provider>
  )
}

export function useDashboardProfile(): ProfileWithComputed | null {
  return useContext(DashboardProfileContext)
}
