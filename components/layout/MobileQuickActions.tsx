'use client'

import { useState, useCallback, useEffect } from 'react'

type MobileQuickActionsProps = {
  onAddGoal: () => void
  onAddIncome: () => void
  onAddExpense: () => void
}

export default function MobileQuickActions({
  onAddGoal,
  onAddIncome,
  onAddExpense,
}: MobileQuickActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  const closeMenu = useCallback(() => setMenuOpen(false), [])

  const handleAddGoal = useCallback(() => {
    closeMenu()
    onAddGoal()
  }, [closeMenu, onAddGoal])

  const handleAddIncome = useCallback(() => {
    closeMenu()
    onAddIncome()
  }, [closeMenu, onAddIncome])

  const handleAddExpense = useCallback(() => {
    closeMenu()
    onAddExpense()
  }, [closeMenu, onAddExpense])

  useEffect(() => {
    if (!menuOpen) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [menuOpen, closeMenu])

  return (
    <>
      {menuOpen && (
        <div
          className="mobile-fab-backdrop"
          onClick={closeMenu}
          aria-hidden
        />
      )}
      {menuOpen && (
        <div className="mobile-fab-menu" role="menu">
          <button
            type="button"
            className="mobile-fab-menu-item"
            onClick={handleAddGoal}
            role="menuitem"
          >
            Add Goal
          </button>
          <button
            type="button"
            className="mobile-fab-menu-item"
            onClick={handleAddIncome}
            role="menuitem"
          >
            Add Income
          </button>
          <button
            type="button"
            className="mobile-fab-menu-item"
            onClick={handleAddExpense}
            role="menuitem"
          >
            Add Expense
          </button>
        </div>
      )}
      <button
        type="button"
        className="mobile-fab"
        onClick={() => setMenuOpen((open) => !open)}
        aria-label={menuOpen ? 'Close quick actions' : 'Open quick actions'}
        aria-expanded={menuOpen}
      >
        <svg width={24} height={24} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </button>
    </>
  )
}
