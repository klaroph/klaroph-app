'use client'

/**
 * Allocate existing income toward a goal (standalone — Goals page).
 * Uses the same income_allocations table as IncomeAllocationModal.
 */

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabaseClient'
import Modal from '@/components/ui/Modal'
import { formatPeso, formatCurrency } from '@/lib/format'

type Goal = { id: string; name: string; target_amount: number }
type IncomeOption = {
  id: string
  total_amount: number
  date: string
  income_source: string | null
  allocated: number
  remaining: number
}

type AllocateToGoalModalProps = {
  isOpen: boolean
  onClose: () => void
  onSaved: () => void
  /** Prefill a goal when opened from a specific card */
  initialGoalId?: string | null
}

export default function AllocateToGoalModal({
  isOpen,
  onClose,
  onSaved,
  initialGoalId = null,
}: AllocateToGoalModalProps) {
  const [goals, setGoals] = useState<Goal[]>([])
  const [incomes, setIncomes] = useState<IncomeOption[]>([])
  const [goalId, setGoalId] = useState('')
  const [incomeId, setIncomeId] = useState('')
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingData, setLoadingData] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    let mounted = true
    const load = async () => {
      setLoadingData(true)
      setError(null)
      const [{ data: goalsData }, { data: incomeData }, { data: allocData }] = await Promise.all([
        supabase.from('goals').select('id, name, target_amount').order('created_at', { ascending: true }),
        supabase
          .from('income_records')
          .select('id, total_amount, date, income_source')
          .order('date', { ascending: false })
          .limit(40),
        supabase.from('income_allocations').select('income_record_id, amount'),
      ])
      if (!mounted) return

      const allocatedByIncome: Record<string, number> = {}
      for (const row of allocData ?? []) {
        const id = (row as { income_record_id: string }).income_record_id
        const amt = Number((row as { amount: number }).amount) || 0
        allocatedByIncome[id] = (allocatedByIncome[id] ?? 0) + amt
      }

      const goalList = (goalsData as Goal[]) ?? []
      const incomeList: IncomeOption[] = ((incomeData as Omit<IncomeOption, 'allocated' | 'remaining'>[]) ?? [])
        .map((row) => {
          const total = Number(row.total_amount) || 0
          const allocated = allocatedByIncome[row.id] ?? 0
          return {
            ...row,
            total_amount: total,
            allocated,
            remaining: Math.max(0, total - allocated),
          }
        })
        .filter((row) => row.remaining > 0)

      setGoals(goalList)
      setIncomes(incomeList)
      setGoalId(initialGoalId && goalList.some((g) => g.id === initialGoalId) ? initialGoalId : goalList[0]?.id ?? '')
      setIncomeId(incomeList[0]?.id ?? '')
      setAmount('')
      setLoadingData(false)
    }
    load()
    return () => {
      mounted = false
    }
  }, [isOpen, initialGoalId])

  const selectedIncome = useMemo(
    () => incomes.find((i) => i.id === incomeId) ?? null,
    [incomes, incomeId]
  )
  const maxAmount = selectedIncome?.remaining ?? 0
  const amountNum = parseFloat(amount) || 0
  const exceeds = amountNum > maxAmount + 1e-9

  const handleClose = () => {
    if (loading) return
    setError(null)
    onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!goalId) {
      setError('Select a goal.')
      return
    }
    if (!incomeId || !selectedIncome) {
      setError('Select an income record with remaining funds.')
      return
    }
    if (!(amountNum > 0)) {
      setError('Enter an amount greater than zero.')
      return
    }
    if (exceeds) {
      setError(`Amount cannot exceed remaining ${formatPeso(maxAmount)}.`)
      return
    }

    setLoading(true)
    const { error: allocErr } = await supabase.from('income_allocations').insert({
      income_record_id: incomeId,
      goal_id: goalId,
      amount: amountNum,
    })
    if (allocErr) {
      setError(allocErr.message || 'Could not save allocation.')
      setLoading(false)
      return
    }

    const newAllocated = selectedIncome.allocated + amountNum
    const disposable = Math.max(0, selectedIncome.total_amount - newAllocated)
    await supabase
      .from('income_records')
      .update({ disposable_amount: disposable })
      .eq('id', incomeId)

    setLoading(false)
    handleClose()
    onSaved()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Allocate to a goal">
      <form onSubmit={handleSubmit}>
        {loadingData ? (
          <p className="klaro-page-header-desc">Loading…</p>
        ) : goals.length === 0 ? (
          <p className="klaro-page-header-desc">
            You need a goal first. Create one, then come back to allocate.
          </p>
        ) : incomes.length === 0 ? (
          <p className="klaro-page-header-desc">
            No income with remaining funds. Add income first, then allocate part of it to a goal.
          </p>
        ) : (
          <>
            <div className="klaro-field" style={{ marginBottom: 14 }}>
              <label className="klaro-field-label" htmlFor="allocate-goal">
                Goal
              </label>
              <select
                id="allocate-goal"
                className="klaro-field-select"
                value={goalId}
                onChange={(e) => setGoalId(e.target.value)}
              >
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="klaro-field" style={{ marginBottom: 14 }}>
              <label className="klaro-field-label" htmlFor="allocate-income">
                From income
              </label>
              <select
                id="allocate-income"
                className="klaro-field-select"
                value={incomeId}
                onChange={(e) => {
                  setIncomeId(e.target.value)
                  setAmount('')
                }}
              >
                {incomes.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.date} · {row.income_source || 'Income'} · {formatCurrency(row.remaining)} left
                  </option>
                ))}
              </select>
            </div>

            <div className="klaro-field" style={{ marginBottom: 8 }}>
              <label className="klaro-field-label" htmlFor="allocate-amount">
                Amount (₱)
              </label>
              <input
                id="allocate-amount"
                className="klaro-field-input"
                type="number"
                min="0.01"
                step="any"
                max={maxAmount || undefined}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
              {selectedIncome && (
                <p className="klaro-page-header-meta" style={{ marginTop: 6 }}>
                  Up to {formatCurrency(maxAmount)} remaining on this income.
                </p>
              )}
            </div>
          </>
        )}

        {error && (
          <p role="alert" style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--color-danger, #be123c)' }}>
            {error}
          </p>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" className="btn-secondary" onClick={handleClose} disabled={loading}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={loading || loadingData || goals.length === 0 || incomes.length === 0}
          >
            {loading ? 'Saving…' : 'Allocate'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
