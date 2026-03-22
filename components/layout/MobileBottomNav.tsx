'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

type MobileBottomNavProps = {
  onOpenMenu: () => void
  onAddIncome: () => void
  onAddExpense: () => void
}

const ICON = 24

function IconHome() {
  return (
    <svg className="mobile-bottom-nav-svg" width={ICON} height={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}

function IconTransactions() {
  return (
    <svg className="mobile-bottom-nav-svg" width={ICON} height={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 15h6M7 11h10" />
    </svg>
  )
}

function IconPlus() {
  return (
    <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function IconGoals() {
  return (
    <svg className="mobile-bottom-nav-svg" width={ICON} height={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" x2="4" y1="22" y2="15" />
    </svg>
  )
}

function IconMenu() {
  return (
    <svg className="mobile-bottom-nav-svg" width={ICON} height={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  )
}

export default function MobileBottomNav({ onOpenMenu, onAddIncome, onAddExpense }: MobileBottomNavProps) {
  const pathname = usePathname() ?? ''
  const router = useRouter()
  const [txOpen, setTxOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  const closeSheets = useCallback(() => {
    setTxOpen(false)
    setAddOpen(false)
  }, [])

  useEffect(() => {
    if (!txOpen && !addOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSheets()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [txOpen, addOpen, closeSheets])

  const homeActive = pathname === '/dashboard'
  const txActive = pathname.startsWith('/dashboard/income') || pathname.startsWith('/dashboard/expenses')
  const goalsActive = pathname.startsWith('/dashboard/goals')

  const goIncome = () => {
    closeSheets()
    router.push('/dashboard/income')
  }
  const goExpenses = () => {
    closeSheets()
    router.push('/dashboard/expenses')
  }

  const tapAddIncome = () => {
    closeSheets()
    onAddIncome()
  }
  const tapAddExpense = () => {
    closeSheets()
    onAddExpense()
  }

  return (
    <>
      <nav className="mobile-bottom-nav" aria-label="Primary">
        <div className="mobile-bottom-nav-track">
          <button
            type="button"
            className="mobile-bottom-nav-fab"
            onClick={() => {
              setTxOpen(false)
              setAddOpen((o) => !o)
            }}
            aria-expanded={addOpen}
            aria-haspopup="dialog"
            aria-label="Add income or expense"
          >
            <IconPlus />
          </button>

          <div className="mobile-bottom-nav-row">
            <Link
              href="/dashboard"
              className={`mobile-bottom-nav-item${homeActive ? ' active' : ''}`}
              aria-current={homeActive ? 'page' : undefined}
            >
              <span className="mobile-bottom-nav-icon" aria-hidden>
                <IconHome />
              </span>
              <span className="mobile-bottom-nav-label">Home</span>
            </Link>

            <button
              type="button"
              className={`mobile-bottom-nav-item${txActive ? ' active' : ''}`}
              onClick={() => {
                setAddOpen(false)
                setTxOpen((o) => !o)
              }}
              aria-expanded={txOpen}
              aria-haspopup="dialog"
            >
              <span className="mobile-bottom-nav-icon" aria-hidden>
                <IconTransactions />
              </span>
              <span className="mobile-bottom-nav-label">Transactions</span>
            </button>

            <div className="mobile-bottom-nav-fab-placeholder" aria-hidden="true" />

            <Link
              href="/dashboard/goals"
              className={`mobile-bottom-nav-item${goalsActive ? ' active' : ''}`}
              aria-current={goalsActive ? 'page' : undefined}
            >
              <span className="mobile-bottom-nav-icon" aria-hidden>
                <IconGoals />
              </span>
              <span className="mobile-bottom-nav-label">Goals</span>
            </Link>

            <button
              type="button"
              className="mobile-bottom-nav-item mobile-bottom-nav-item--menu"
              onClick={() => {
                closeSheets()
                onOpenMenu()
              }}
              aria-label="Open full menu"
            >
              <span className="mobile-bottom-nav-icon" aria-hidden>
                <IconMenu />
              </span>
              <span className="mobile-bottom-nav-label">Menu</span>
            </button>
          </div>
        </div>
      </nav>

      {(txOpen || addOpen) && (
        <button
          type="button"
          className="mobile-bottom-nav-sheet-backdrop"
          aria-label="Close"
          onClick={closeSheets}
        />
      )}

      {txOpen && (
        <div className="mobile-bottom-nav-sheet" role="dialog" aria-modal="true" aria-labelledby="mobile-nav-tx-title">
          <p id="mobile-nav-tx-title" className="mobile-bottom-nav-sheet-title">
            Transactions
          </p>
          <p className="mobile-bottom-nav-sheet-sub">Where do you want to go?</p>
          <button type="button" className="mobile-bottom-nav-sheet-action" onClick={goIncome}>
            <span className="mobile-bottom-nav-sheet-action-label">Income</span>
            <span className="mobile-bottom-nav-sheet-action-hint">View &amp; manage income</span>
          </button>
          <button type="button" className="mobile-bottom-nav-sheet-action" onClick={goExpenses}>
            <span className="mobile-bottom-nav-sheet-action-label">Expenses</span>
            <span className="mobile-bottom-nav-sheet-action-hint">View &amp; manage expenses</span>
          </button>
        </div>
      )}

      {addOpen && (
        <div className="mobile-bottom-nav-sheet" role="dialog" aria-modal="true" aria-labelledby="mobile-nav-add-title">
          <p id="mobile-nav-add-title" className="mobile-bottom-nav-sheet-title">
            Quick add
          </p>
          <p className="mobile-bottom-nav-sheet-sub">Log a new entry</p>
          <button type="button" className="mobile-bottom-nav-sheet-action mobile-bottom-nav-sheet-action-accent" onClick={tapAddIncome}>
            <span className="mobile-bottom-nav-sheet-action-label">Add Income</span>
          </button>
          <button type="button" className="mobile-bottom-nav-sheet-action mobile-bottom-nav-sheet-action-warn" onClick={tapAddExpense}>
            <span className="mobile-bottom-nav-sheet-action-label">Add Expense</span>
          </button>
        </div>
      )}
    </>
  )
}
