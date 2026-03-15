'use client'

import { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import { EXPENSE_CATEGORIES } from '@/lib/expenseCategories'
import { getBudgetNotePlaceholder } from '@/lib/budgetNotePlaceholders'
import { useUpgradeTriggerOptional } from '@/contexts/UpgradeTriggerContext'
import { BUDGET_LOCK_UPGRADE_MESSAGE } from '@/lib/budgetLockMessage'

type BudgetPlannerProps = {
  isOpen: boolean
  onClose: () => void
  onSaved: () => void
}

type PlanRow = { category: string; amount: number; note?: string | null }

export default function BudgetPlanner({
  isOpen,
  onClose,
  onSaved,
}: BudgetPlannerProps) {
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [fetchLoading, setFetchLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const openUpgrade = useUpgradeTriggerOptional()?.openUpgradeModal

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setError(null)
    setLoadError(null)
    setFetchLoading(true)

    async function loadPlan() {
      try {
        const res = await fetch('/api/budget-plan', { credentials: 'include' })
        if (cancelled) return
        if (!res.ok) {
          setLoadError('Could not load your existing spending plan. Please try again.')
          return
        }
        const body = await res.json()
        if (cancelled) return

        if (!Array.isArray(body)) {
          if (!cancelled) setLoadError('Unexpected spending plan format. Please try again.')
          return
        }
        const rows: PlanRow[] = body

        const nextAmt: Record<string, string> = {}
        const nextNotes: Record<string, string> = {}
        for (const row of rows) {
          if (!row || typeof row.category !== 'string') continue
          const key = row.category.trim()
          const amt = Number(row.amount)
          nextAmt[key] = String(Number.isNaN(amt) ? 0 : amt)
          nextNotes[key] = (typeof row.note === 'string' ? row.note : '').trim()
        }
        for (const c of EXPENSE_CATEGORIES) {
          if (nextAmt[c.value] === undefined) nextAmt[c.value] = ''
          if (nextNotes[c.value] === undefined) nextNotes[c.value] = ''
        }

        // Temporary: diagnose row.category vs EXPENSE_CATEGORIES.value (spacing, capitalization, slash)
        const categoryValues = EXPENSE_CATEGORIES.map((x) => x.value)
        console.log('[BudgetPlanner] rows', rows.map((r) => ({ category: r.category, categoryRepr: JSON.stringify(r.category), amount: r.amount })))
        console.log('[BudgetPlanner] nextAmt keys', Object.keys(nextAmt).map((k) => ({ key: k, repr: JSON.stringify(k) })))
        console.log('[BudgetPlanner] EXPENSE_CATEGORIES values', categoryValues.map((v) => ({ value: v, repr: JSON.stringify(v) })))
        for (const row of rows) {
          const key = row.category?.trim()
          const match = categoryValues.includes(key ?? '')
          console.log('[BudgetPlanner] match?', { rowCategory: key, match, inNextAmt: key != null && nextAmt[key] !== undefined })
        }

        setAmounts(nextAmt)
        setNotes(nextNotes)
      } catch {
        if (!cancelled) {
          setLoadError('Could not load your existing spending plan. Please try again.')
        }
      } finally {
        if (!cancelled) setFetchLoading(false)
      }
    }

    loadPlan()
    return () => { cancelled = true }
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
    }).map((c) => {
      const noteStr = (notes[c.value] ?? '').trim().slice(0, 150)
      return {
        category: c.value,
        amount: parseFloat(String(amounts[c.value]).replace(/[^0-9.]/g, '')) || 0,
        note: noteStr === '' ? null : noteStr,
      }
    })

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
    border: '1px solid var(--border, #d1d5db)',
    borderRadius: 8,
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    outline: 'none',
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
    outline: 'none',
  }
  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Monthly Spending Plan"
      contentMaxWidth={480}
      closeOnOutsideClick={false}
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
                  flexDirection: 'column',
                  gap: 0,
                  marginBottom: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
                    placeholder={loadError ? '' : '0'}
                    value={amounts[c.value] ?? ''}
                    onChange={(e) =>
                      setAmounts((prev) => ({ ...prev, [c.value]: e.target.value }))
                    }
                    className="budget-planner-amount-input"
                    style={{ ...inputStyle, width: 100, flexShrink: 0 }}
                  />
                </div>
                <input
                  type="text"
                  placeholder={`Optional reminder (e.g. ${getBudgetNotePlaceholder(c.value)})`}
                  maxLength={150}
                  value={notes[c.value] ?? ''}
                  onChange={(e) => setNotes((prev) => ({ ...prev, [c.value]: e.target.value }))}
                  className="budget-planner-note-input"
                  style={{ ...noteInputStyle, marginTop: 8 }}
                  aria-label={`Note for ${c.label}`}
                />
              </div>
            ))}
          </div>
          {(loadError || error) && (
            <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-error)' }}>
              {loadError || error}
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
