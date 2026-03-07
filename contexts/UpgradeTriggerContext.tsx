'use client'

import { createContext, useCallback, useContext, useState } from 'react'

type UpgradeTriggerContextValue = {
  isUpgradeModalOpen: boolean
  openUpgradeModal: () => void
  closeUpgradeModal: () => void
}

const UpgradeTriggerContext = createContext<UpgradeTriggerContextValue | null>(null)

export function UpgradeTriggerProvider({ children }: { children: React.ReactNode }) {
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false)
  const openUpgradeModal = useCallback(() => setIsUpgradeModalOpen(true), [])
  const closeUpgradeModal = useCallback(() => setIsUpgradeModalOpen(false), [])
  return (
    <UpgradeTriggerContext.Provider
      value={{ isUpgradeModalOpen, openUpgradeModal, closeUpgradeModal }}
    >
      {children}
    </UpgradeTriggerContext.Provider>
  )
}

export function useUpgradeTrigger(): UpgradeTriggerContextValue {
  const ctx = useContext(UpgradeTriggerContext)
  if (!ctx) {
    throw new Error('useUpgradeTrigger must be used within UpgradeTriggerProvider')
  }
  return ctx
}

export function useUpgradeTriggerOptional(): UpgradeTriggerContextValue | null {
  return useContext(UpgradeTriggerContext)
}
