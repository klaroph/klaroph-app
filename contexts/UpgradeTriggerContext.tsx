'use client'

import { createContext, useCallback, useContext, useState } from 'react'

type UpgradeTriggerContextValue = {
  isUpgradeModalOpen: boolean
  upgradeModalMessage: string | null
  openUpgradeModal: (options?: { message?: string }) => void
  closeUpgradeModal: () => void
}

const UpgradeTriggerContext = createContext<UpgradeTriggerContextValue | null>(null)

export function UpgradeTriggerProvider({ children }: { children: React.ReactNode }) {
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false)
  const [upgradeModalMessage, setUpgradeModalMessage] = useState<string | null>(null)
  const openUpgradeModal = useCallback((options?: { message?: string }) => {
    setUpgradeModalMessage(options?.message ?? null)
    setIsUpgradeModalOpen(true)
  }, [])
  const closeUpgradeModal = useCallback(() => {
    setIsUpgradeModalOpen(false)
    setUpgradeModalMessage(null)
  }, [])
  return (
    <UpgradeTriggerContext.Provider
      value={{ isUpgradeModalOpen, upgradeModalMessage, openUpgradeModal, closeUpgradeModal }}
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
