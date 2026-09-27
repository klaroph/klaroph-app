'use client'

/**
 * Review, edit, or remove the individual allocations behind a goal's total.
 * Mutations go through /api/goal-allocations/[id]; income records themselves are never changed.
 */

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import Modal from '@/components/ui/Modal'
import { formatCurrency } from '@/lib/format'
import type { GoalForActions } from './GoalList'

type AllocationRow = {
  id: string
  amount: number
  incomeDate: string | null
  incomeSource: string | null
}

type AllocationQueryRow = {
  id: string
  amount: number
  income_records: { date: string; income_source: string | null } | { date: string; income_source: string | null }[] | null
}

/** Mount with `key={goal.id}` so each goal starts from a fresh load. */
type GoalAllocationsModalProps = {
  goal: GoalForActions
  onClose: () => void
  onChanged: () => void
}

function toRow(row: AllocationQueryRow): AllocationRow {
  const income = Array.isArray(row.income_records) ? row.income_records[0] : row.income_records
  return {
    id: row.id,
    amount: Number(row.amount) || 0,
    incomeDate: income?.date ?? null,
    incomeSource: income?.income_source ?? null,
  }
}

async function mutate(id: string, init: RequestInit): Promise<string | null> {
  const res = await fetch(`/api/goal-allocations/${id}`, { ...init, credentials: 'include' })
  if (res.ok) return null
  const data = await res.json().catch(() => ({}))
  return (data?.error as string) ?? 'Something went wrong.'
}

export default function GoalAllocationsModal({ goal, onClose, onChanged }: GoalAllocationsModalProps) {
  const [rows, setRows] = useState<AllocationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [confirmRow, setConfirmRow] = useState<AllocationRow | null>(null)
  const [saving, setSaving] = useState(false)
  const goalId = goal.id

  useEffect(() => {
    let mounted = true
    supabase
      .from('income_allocations')
      .select('id, amount, income_records(date, income_source)')
      .eq('goal_id', goalId)
      .order('created_at', { ascending: false })
      .then(({ data, error: loadError }) => {
        if (!mounted) return
        if (loadError) setError('Could not load allocations.')
        setRows(((data ?? []) as AllocationQueryRow[]).map(toRow))
        setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [goalId])

  const handleClose = () => {
    if (saving) return
    onClose()
  }

  const startEdit = (row: AllocationRow) => {
    setError(null)
    setEditingId(row.id)
    setEditValue(String(row.amount))
  }

  const saveEdit = async (row: AllocationRow) => {
    setSaving(true)
    setError(null)
    const failure = await mutate(row.id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: editValue }),
    })
    setSaving(false)
    if (failure) {
      setError(failure)
      return
    }
    const amount = Math.round(Number(editValue) * 100) / 100
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, amount } : r)))
    setEditingId(null)
    onChanged()
  }

  const confirmRemove = async () => {
    if (!confirmRow) return
    setSaving(true)
    setError(null)
    const failure = await mutate(confirmRow.id, { method: 'DELETE' })
    setSaving(false)
    if (failure) {
      setError(failure)
      return
    }
    setRows((prev) => prev.filter((r) => r.id !== confirmRow.id))
    setConfirmRow(null)
    onChanged()
  }

  const total = rows.reduce((sum, r) => sum + r.amount, 0)

  return (
    <Modal isOpen onClose={handleClose} title={`${goal.name} allocations`}>
      {confirmRow ? (
        <div className="goal-alloc-confirm">
          <p className="goal-alloc-confirm-title">Remove {formatCurrency(confirmRow.amount)} allocation?</p>
          <p className="goal-alloc-confirm-copy">
            This will reduce the amount currently allocated to {goal.name}. Your original income record will remain
            unchanged.
          </p>
          {error && <p role="alert" className="goal-alloc-error">{error}</p>}
          <div className="goal-alloc-confirm-actions">
            <button type="button" className="btn-secondary" onClick={() => setConfirmRow(null)} disabled={saving}>
              Cancel
            </button>
            <button type="button" className="btn-danger" onClick={confirmRemove} disabled={saving}>
              {saving ? 'Removing…' : 'Remove Allocation'}
            </button>
          </div>
        </div>
      ) : loading ? (
        <p className="klaro-page-header-desc">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="klaro-page-header-desc">No allocations for this goal yet.</p>
      ) : (
        <>
          <p className="goal-alloc-total">
            <span>Total allocated</span>
            <strong className="tabular-nums">{formatCurrency(total)}</strong>
          </p>
          <ul className="goal-alloc-list">
            {rows.map((row) => (
              <li key={row.id} className="goal-alloc-row">
                {editingId === row.id ? (
                  <form
                    className="goal-alloc-edit"
                    onSubmit={(e) => {
                      e.preventDefault()
                      saveEdit(row)
                    }}
                  >
                    <label className="sr-only" htmlFor={`alloc-amount-${row.id}`}>
                      Allocation amount
                    </label>
                    <input
                      id={`alloc-amount-${row.id}`}
                      className="klaro-field-input"
                      type="number"
                      inputMode="decimal"
                      min="0.01"
                      step="0.01"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      autoFocus
                    />
                    <button type="submit" className="goal-card-premium-btn goal-card-premium-btn-edit" disabled={saving}>
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button type="button" className="goal-card-premium-btn" onClick={() => setEditingId(null)} disabled={saving}>
                      Cancel
                    </button>
                  </form>
                ) : (
                  <>
                    <div className="goal-alloc-info">
                      <span className="goal-alloc-amount tabular-nums">{formatCurrency(row.amount)}</span>
                      <span className="goal-alloc-meta">
                        {row.incomeSource || 'Income'}
                        {row.incomeDate ? ` · ${row.incomeDate}` : ''}
                      </span>
                    </div>
                    <div className="goal-card-premium-actions">
                      <button
                        type="button"
                        className="goal-card-premium-btn goal-card-premium-btn-edit"
                        onClick={() => startEdit(row)}
                        aria-label={`Edit ${formatCurrency(row.amount)} allocation`}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="goal-card-premium-btn goal-card-premium-btn-delete"
                        onClick={() => {
                          setError(null)
                          setConfirmRow(row)
                        }}
                        aria-label={`Remove ${formatCurrency(row.amount)} allocation`}
                      >
                        Remove
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
          {error && <p role="alert" className="goal-alloc-error">{error}</p>}
        </>
      )}
    </Modal>
  )
}
