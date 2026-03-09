'use client'

import { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import { EXPENSE_CATEGORIES } from '@/lib/expenseCategories'
import { useUpgradeTriggerOptional } from '@/contexts/UpgradeTriggerContext'
import { BUDGET_LOCK_UPGRADE_MESSAGE } from '@/lib/budgetLockMessage'

type MonthOverrideModalProps = {
  isOpen: boolean
  onClose: () => void
  onSaved: () => void
  month: string
}

type EffectiveItem = { category: string; amount: number }

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function formatMonthLabel(monthStr: string): string {
  const [y, m] = monthStr.split('-').map(Number)
  return `${MONTH_NAMES[(m ?? 1) - 1]} ${y}`
}

export default function MonthOverrideModal({
  isOpen,
  onClose,
  onSaved,
  month,
}: MonthOverrideModalProps) {
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [fetchLoading, setFetchLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const openUpgrade = useUpgradeTriggerOptional()?.openUpgradeModal

  useEffect(() => {
    if (!isOpen || !month) return
    setError(null)
    setFetchLoading(true)
    fetch(`/api/budget-effective?month=${month}`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data: EffectiveItem[]) => {
        const next: Record<string, string> = {}
        for (const item of data ?? []) {
          next[item.category] = String(item.amount)
        }
        setAmounts(next)
      })
      .catch(() => setAmounts({}))
      .finally(() => setFetchLoading(false))
  }, [isOpen, month])

  const handleClose = () => {
    setError(null)
    onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const categoriesToSave = Object.keys(amounts)

    try {
      for (const category of categoriesToSave) {
        const amount = parseFloat(String(amounts[category]).replace(/[^0-9.]/g, '')) || 0
        if (amount < 0) continue
        const res = await fetch('/api/budget-overrides', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ category, amount, month }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          if (data?.locked && data?.reason === 'budget') {
            openUpgrade?.({ message: BUDGET_LOCK_UPGRADE_MESSAGE })
            setError((data?.error as string) || BUDGET_LOCK_UPGRADE_MESSAGE)
          } else {
            setError((data?.error as string) || 'Failed to save override.')
          }
          setLoading(false)
          return
        }
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
    width: 100,
    fontSize: 14,
    border: '1px solid var(--border)',
    borderRadius: 8,
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  }

  const categoriesToShow = Object.keys(amounts)
  const hasAny = categoriesToShow.length > 0

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Edit ${formatMonthLabel(month)}`}
      contentMaxWidth={420}
    >
      {fetchLoading ? (
        <p style={{ margin: 0, color: 'var(--text-muted)' }}>Loading…</p>
      ) : !hasAny ? (
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 14 }}>
          Set your default spending plan first. Then you can override amounts for {formatMonthLabel(month)} here.
        </p>
      ) : (
        <form onSubmit={handleSubmit}>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
            Override budget amounts for {formatMonthLabel(month)} only.
          </p>
          <div style={{ maxHeight: 320, overflow: 'auto', marginBottom: 16 }}>
            {categoriesToShow.map((category) => {
              const label = EXPENSE_CATEGORIES.find((c) => c.value === category)?.label ?? category
              const value = amounts[category] ?? ''
              const num = parseFloat(String(value).replace(/[^0-9.]/g, '')) || 0
              const isZero = num === 0
              return (
                <div
                  key={category}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
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
                      {label}
                    </label>
                    <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>₱</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={value}
                      onChange={(e) =>
                        setAmounts((prev) => ({ ...prev, [category]: e.target.value }))
                      }
                      style={inputStyle}
                    />
                  </div>
                  {isZero && (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 0 }}>
                      No budget this month
                    </span>
                  )}
                </div>
              )
            })}
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
            {loading ? 'Saving…' : 'Save Overrides'}
          </button>
        </form>
      )}
    </Modal>
  )
}
