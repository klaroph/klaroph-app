'use client'

import { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import { EXPENSE_CATEGORIES } from '@/lib/expenseCategories'
import { useUpgradeTriggerOptional } from '@/contexts/UpgradeTriggerContext'
import { BUDGET_LOCK_UPGRADE_MESSAGE } from '@/lib/budgetLockMessage'

type BudgetPlannerProps = {
  isOpen: boolean
  onClose: () => void
  onSaved: () => void
}

type PlanRow = { category: string; amount: number }

export default function BudgetPlanner({
  isOpen,
  onClose,
  onSaved,
}: BudgetPlannerProps) {
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [fetchLoading, setFetchLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const openUpgrade = useUpgradeTriggerOptional()?.openUpgradeModal

  useEffect(() => {
    if (!isOpen) return
    setError(null)
    setFetchLoading(true)
    fetch('/api/budget-plan', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        const next: Record<string, string> = {}
        for (const c of EXPENSE_CATEGORIES) {
          next[c.value] = ''
        }
        if (Array.isArray(data)) {
          for (const row of data as PlanRow[]) {
            next[row.category] = String(row.amount)
          }
        } else if (data?.data && Array.isArray(data.data)) {
          for (const row of data.data as PlanRow[]) {
            next[row.category] = String(row.amount)
          }
        }
        setAmounts(next)
      })
      .catch(() => setAmounts(Object.fromEntries(
        EXPENSE_CATEGORIES.map((c) => [c.value, ''])
      )))
      .finally(() => setFetchLoading(false))
  }, [isOpen])

  const handleClose = () => {
    setError(null)
    onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const items = EXPENSE_CATEGORIES.filter((c) => {
      const v = amounts[c.value]
      const n = parseFloat(String(v).replace(/[^0-9.]/g, '')) || 0
      return n > 0
    }).map((c) => ({
      category: c.value,
      amount: parseFloat(String(amounts[c.value]).replace(/[^0-9.]/g, '')) || 0,
    }))

    try {
      const res = await fetch('/api/budget-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(items),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (data?.locked && data?.reason === 'budget') {
          openUpgrade?.({ message: BUDGET_LOCK_UPGRADE_MESSAGE })
          setError((data?.error as string) || BUDGET_LOCK_UPGRADE_MESSAGE)
        } else {
          setError((data?.error as string) || 'Failed to save plan.')
        }
        setLoading(false)
        return
      }
      handleClose()
      onSaved()
    } catch {
      setError('Something went wrong.')
    }
    setLoading(false)
  }

  const inputStyle: React.CSSProperties = {
    padding: '10px 12px',
    width: '100%',
    fontSize: 14,
    border: '1px solid var(--border)',
    borderRadius: 8,
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Monthly Spending Plan"
      contentMaxWidth={480}
    >
      {fetchLoading ? (
        <p style={{ margin: 0, color: 'var(--text-muted)' }}>Loading…</p>
      ) : (
        <form onSubmit={handleSubmit}>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
            Set your default monthly budget per category. You can override a specific month later.
          </p>
          <div style={{ maxHeight: 360, overflow: 'auto', marginBottom: 16 }}>
            {EXPENSE_CATEGORIES.map((c) => (
              <div
                key={c.value}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  marginBottom: 10,
                }}
              >
                <label
                  style={{
                    flex: '1 1 0',
                    minWidth: 0,
                    fontSize: 14,
                    color: 'var(--text-primary)',
                  }}
                >
                  {c.label}
                </label>
                <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>₱</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={amounts[c.value] ?? ''}
                  onChange={(e) =>
                    setAmounts((prev) => ({ ...prev, [c.value]: e.target.value }))
                  }
                  style={{ ...inputStyle, width: 100, flexShrink: 0 }}
                />
              </div>
            ))}
          </div>
          {error && (
            <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-error)' }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="btn-primary"
            style={{ padding: '10px 20px', fontSize: 14 }}
          >
            {loading ? 'Saving…' : 'Save Spending Plan'}
          </button>
        </form>
      )}
    </Modal>
  )
}
