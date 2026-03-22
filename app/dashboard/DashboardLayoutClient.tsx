'use client'

import { createContext, useContext, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '../../components/layout/Sidebar'
import MobileBottomNav from '../../components/layout/MobileBottomNav'
import HowKlaroPHWorksModal, { hasSeenOnboarding } from '../../components/onboarding/HowKlaroPHWorksModal'
import UpgradeModal from '../../components/dashboard/UpgradeModal'
import PaymentQRModal from '../../components/dashboard/PaymentQRModal'
import GraceBanner from '../../components/dashboard/GraceBanner'
import NewGoalModal from '../../components/dashboard/NewGoalModal'
import IncomeAllocationModal from '../../components/dashboard/IncomeAllocationModal'
import AddExpenseModal from '../../components/dashboard/AddExpenseModal'
import Footer from '../../components/Footer'
import { SubscriptionProvider } from '@/contexts/SubscriptionContext'
import { UpgradeTriggerProvider, useUpgradeTrigger } from '@/contexts/UpgradeTriggerContext'
import { DashboardProfileProvider } from '@/contexts/DashboardProfileContext'
import { useSubscription } from '@/contexts/SubscriptionContext'
import { dispatchDashboardRefresh, dispatchDashboardTransactionsRefresh, dispatchDashboardGoalsRefresh } from '@/lib/dashboardRefresh'
import type { ProfileWithComputed } from '@/types/profile'

const DashboardActionsContext = createContext<{
  openAddIncome: () => void
  openAddExpense: () => void
} | null>(null)

export function useDashboardActions() {
  const ctx = useContext(DashboardActionsContext)
  return ctx ?? { openAddIncome: () => {}, openAddExpense: () => {} }
}

function UpgradeModalGate() {
  const { isUpgradeModalOpen, upgradeModalMessage, closeUpgradeModal } = useUpgradeTrigger()
  const { refresh: refreshSubscription, isPro } = useSubscription()
  const [paymentQROpen, setPaymentQROpen] = useState(false)
  const [paymentPlanType, setPaymentPlanType] = useState<'monthly' | 'annual'>('monthly')
  return (
    <>
      <UpgradeModal
        isOpen={isUpgradeModalOpen}
        onClose={closeUpgradeModal}
        message={upgradeModalMessage ?? undefined}
        onUpgrade={() => {}}
        onOpenPaymentModal={(planType) => {
          setPaymentPlanType(planType ?? 'monthly')
          setPaymentQROpen(true)
        }}
      />
      <PaymentQRModal
        isOpen={paymentQROpen}
        onClose={() => setPaymentQROpen(false)}
        refreshSubscription={refreshSubscription}
        isPro={isPro}
        planType={paymentPlanType}
      />
    </>
  )
}

export default function DashboardLayoutClient({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [onboardingChecked, setOnboardingChecked] = useState(false)
  const [profile, setProfile] = useState<ProfileWithComputed | null>(null)
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
          const data = await res.json() as ProfileWithComputed
          setProfile(data)
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

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return
    let lastDispatch = 0
    const MIN_INTERVAL_MS = 3000
    const maybeDispatch = () => {
      const now = Date.now()
      if (now - lastDispatch < MIN_INTERVAL_MS) return
      lastDispatch = now
      dispatchDashboardRefresh()
    }
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      maybeDispatch()
    }
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) maybeDispatch()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', onPageShow)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', onPageShow)
    }
  }, [])

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
            <DashboardProfileProvider profile={profile}>
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
              <Footer variant="default" className="footer-dashboard-mobile" />
            </div>
            <MobileBottomNav
              onOpenMenu={() => setDrawerOpen(true)}
              onAddIncome={() => setFabIncomeOpen(true)}
              onAddExpense={() => setFabExpenseOpen(true)}
            />
            <HowKlaroPHWorksModal
              isOpen={showOnboarding}
              onClose={handleOnboardingClose}
              markSeenOnAccept
            />
            <UpgradeModalGate />
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
              onSaved={(opts) => {
                setFabIncomeOpen(false)
                dispatchDashboardTransactionsRefresh()
                if (opts?.allocationsChanged) dispatchDashboardGoalsRefresh()
              }}
              initialRecord={null}
            />
            <AddExpenseModal
              isOpen={fabExpenseOpen}
              onClose={() => setFabExpenseOpen(false)}
              onSaved={() => {
                setFabExpenseOpen(false)
                dispatchDashboardTransactionsRefresh()
              }}
            />
            </DashboardActionsContext.Provider>
            </DashboardProfileProvider>
          </UpgradeTriggerProvider>
        </SubscriptionProvider>
    </div>
  )
}
