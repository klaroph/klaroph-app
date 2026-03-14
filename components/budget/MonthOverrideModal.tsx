'use client'

import { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import { EXPENSE_CATEGORIES } from '@/lib/expenseCategories'
import { getBudgetNotePlaceholder } from '@/lib/budgetNotePlaceholders'
import { useUpgradeTriggerOptional } from '@/contexts/UpgradeTriggerContext'
import { BUDGET_LOCK_UPGRADE_MESSAGE } from '@/lib/budgetLockMessage'

type MonthOverrideModalProps = {
  isOpen: boolean
  onClose: () => void
  onSaved: () => void
  month: string
}

type EffectiveItem = { category: string; amount: number; note?: string | null }

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
  const [notes, setNotes] = useState<Record<string, string>>({})
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
        const nextAmt: Record<string, string> = {}
        const nextNotes: Record<string, string> = {}
        for (const item of data ?? []) {
          nextAmt[item.category] = String(item.amount)
          nextNotes[item.category] = (item.note ?? '').trim()
        }
        setAmounts(nextAmt)
        setNotes(nextNotes)
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
        const noteStr = (notes[category] ?? '').trim().slice(0, 150)
        const res = await fetch('/api/budget-overrides', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            category,
            amount,
            month,
            note: noteStr === '' ? null : noteStr,
          }),
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
    border: '1px solid var(--border, #d1d5db)',
    borderRadius: 8,
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  }
  const noteInputStyle: React.CSSProperties = {
    padding: '6px 10px',
    width: '100%',
    fontSize: 12,
    border: '1px solid var(--border-muted, #d1d5db)',
    borderRadius: 6,
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    color: 'var(--text-muted, #64748b)',
  }

  const categoriesToShow = Object.keys(amounts)
  const hasAny = categoriesToShow.length > 0
  const hiddenCategories = EXPENSE_CATEGORIES.filter((c) => !(c.value in amounts))

  const handleAddCategory = (categoryValue: string) => {
    if (!categoryValue) return
    setAmounts((prev) => ({ [categoryValue]: '0', ...prev }))
    setNotes((prev) => ({ ...prev, [categoryValue]: '' }))
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Edit ${formatMonthLabel(month)}`}
      contentMaxWidth={420}
      closeOnOutsideClick={false}
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
          {hiddenCategories.length > 0 && (
            <div
              style={{
                marginBottom: 16,
                paddingBottom: 16,
                borderBottom: '1px solid var(--border-muted, #e2e8f0)',
              }}
            >
              <label
                htmlFor="month-override-add-category"
                style={{
                  display: 'block',
                  marginBottom: 10,
                  fontSize: 14,
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                }}
              >
                Add category for this month
              </label>
              <select
                id="month-override-add-category"
                value=""
                onChange={(e) => {
                  const v = e.target.value
                  if (v) handleAddCategory(v)
                  e.target.value = ''
                }}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  fontSize: 14,
                  border: '1px solid var(--border, #d1d5db)',
                  borderRadius: 8,
                  fontFamily: 'inherit',
                  backgroundColor: 'var(--surface, #fff)',
                  color: 'var(--text-secondary)',
                }}
                aria-label="Add category for this month"
              >
                <option value="">Select a category to add…</option>
                {hiddenCategories.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          )}
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
                    gap: 0,
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
                      className="budget-planner-amount-input"
                      style={inputStyle}
                    />
                  </div>
                  <input
                    type="text"
                    placeholder={`Optional reminder (e.g. ${getBudgetNotePlaceholder(category)})`}
                    maxLength={150}
                    value={notes[category] ?? ''}
                    onChange={(e) => setNotes((prev) => ({ ...prev, [category]: e.target.value }))}
                    className="budget-planner-note-input"
                    style={{ ...noteInputStyle, marginTop: 8 }}
                    aria-label={`Note for ${label}`}
                  />
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
