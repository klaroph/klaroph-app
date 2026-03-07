'use client'

import { createContext, useContext, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '../../components/layout/Sidebar'
import MobileQuickActions from '../../components/layout/MobileQuickActions'
import HowKlaroPHWorksModal, { hasSeenOnboarding } from '../../components/onboarding/HowKlaroPHWorksModal'
import UpgradeModal from '../../components/dashboard/UpgradeModal'
import GraceBanner from '../../components/dashboard/GraceBanner'
import NewGoalModal from '../../components/dashboard/NewGoalModal'
import IncomeAllocationModal from '../../components/dashboard/IncomeAllocationModal'
import AddExpenseModal from '../../components/dashboard/AddExpenseModal'
import { SubscriptionProvider } from '@/contexts/SubscriptionContext'
import { UpgradeTriggerProvider, useUpgradeTrigger } from '@/contexts/UpgradeTriggerContext'
import { dispatchDashboardRefresh } from '@/lib/dashboardRefresh'

const DashboardActionsContext = createContext<{
  openAddIncome: () => void
  openAddExpense: () => void
} | null>(null)

export function useDashboardActions() {
  const ctx = useContext(DashboardActionsContext)
  return ctx ?? { openAddIncome: () => {}, openAddExpense: () => {} }
}

function UpgradeModalGate() {
  const { isUpgradeModalOpen, closeUpgradeModal } = useUpgradeTrigger()
  return <UpgradeModal isOpen={isUpgradeModalOpen} onClose={closeUpgradeModal} onUpgrade={() => {}} />
}

export default function DashboardLayoutClient({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [onboardingChecked, setOnboardingChecked] = useState(false)
  const [fabGoalOpen, setFabGoalOpen] = useState(false)
  const [fabIncomeOpen, setFabIncomeOpen] = useState(false)
  const [fabExpenseOpen, setFabExpenseOpen] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    let cancelled = false
    async function check() {
      try {
        const res = await fetch('/api/profile', { credentials: 'include' })
        if (cancelled) return
        if (res.ok) {
          const data = await res.json()
          const completed = data?.profile?.onboarding_completed === true
          if (!completed) {
            setOnboardingChecked(true)
            router.replace('/onboarding')
            return
          }
        }
      } catch {
        if (cancelled) return
      }
      if (cancelled) return
      if (!hasSeenOnboarding()) {
        setShowOnboarding(true)
      }
      setOnboardingChecked(true)
    }
    check()
    return () => { cancelled = true }
  }, [router])

  const handleOnboardingClose = () => {
    setShowOnboarding(false)
  }

  const closeDrawer = () => setDrawerOpen(false)

  if (!onboardingChecked) {
    return (
      <div style={{ display: 'flex', minHeight: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <span className="text-secondary" style={{ fontSize: 14 }}>Loading...</span>
      </div>
    )
  }

  const dashboardActions = {
    openAddIncome: () => setFabIncomeOpen(true),
    openAddExpense: () => setFabExpenseOpen(true),
  }

  return (
    <div className="dashboard-layout" style={{ display: 'flex', minHeight: '100%' }}>
      <SubscriptionProvider>
          <UpgradeTriggerProvider>
            <DashboardActionsContext.Provider value={dashboardActions}>
            <Sidebar
              drawerOpen={drawerOpen}
              onDrawerClose={closeDrawer}
            />
            <div
              className="main-wrapper"
              aria-hidden={drawerOpen}
            >
              <GraceBanner />
              <button
                type="button"
                className="drawer-menu-btn"
                onClick={() => setDrawerOpen((open) => !open)}
                aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={drawerOpen}
              >
                <svg width={24} height={24} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
              </button>
              <div
                className={`drawer-backdrop ${drawerOpen ? 'visible' : ''}`}
                onClick={closeDrawer}
                onKeyDown={(e) => e.key === 'Escape' && closeDrawer()}
                role="button"
                tabIndex={-1}
                aria-label="Close menu"
              />
              <main className="main-content">
                {children}
              </main>
              <footer className="dashboard-footer">
                © 2026 KlaroPH. Established 2025. Developed by JDS.
              </footer>
            </div>
            <HowKlaroPHWorksModal
              isOpen={showOnboarding}
              onClose={handleOnboardingClose}
              markSeenOnAccept
            />
            <UpgradeModalGate />
            <MobileQuickActions
              onAddGoal={() => setFabGoalOpen(true)}
              onAddIncome={() => setFabIncomeOpen(true)}
              onAddExpense={() => setFabExpenseOpen(true)}
            />
            <NewGoalModal
              isOpen={fabGoalOpen}
              onClose={() => setFabGoalOpen(false)}
              onGoalCreated={() => {
                setFabGoalOpen(false)
                router.refresh()
                dispatchDashboardRefresh()
              }}
            />
            <IncomeAllocationModal
              isOpen={fabIncomeOpen}
              onClose={() => setFabIncomeOpen(false)}
              onSaved={() => {
                setFabIncomeOpen(false)
                router.refresh()
                dispatchDashboardRefresh()
              }}
              initialRecord={null}
            />
            <AddExpenseModal
              isOpen={fabExpenseOpen}
              onClose={() => setFabExpenseOpen(false)}
              onSaved={() => {
                setFabExpenseOpen(false)
                router.refresh()
                dispatchDashboardRefresh()
              }}
            />
            </DashboardActionsContext.Provider>
          </UpgradeTriggerProvider>
        </SubscriptionProvider>
    </div>
  )
}
