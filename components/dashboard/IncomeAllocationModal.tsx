'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabaseClient'
import Modal from '../ui/Modal'
import { INCOME_SOURCES, type IncomeSource } from '../../lib/incomeSources'

type Goal = { id: string; name: string; target_amount: number }

/** One allocation row in the edit UI (amount as string for input). */
export type AllocationRow = { goal_id: string; goal_name: string; amount: string }

export type IncomeRecordForEdit = {
  id: string
  total_amount: number
  date: string
  income_source: string | null
}

export type IncomeSavedOptions = { allocationsChanged?: boolean }

type IncomeAllocationModalProps = {
  isOpen: boolean
  onClose: () => void
  /** Called after save. Pass allocationsChanged: true when income_allocations were written (goal allocation added). */
  onSaved: (options?: IncomeSavedOptions) => void
  /** When set, modal is in edit mode: title "Edit income", pre-fill, submit = PUT */
  initialRecord?: IncomeRecordForEdit | null
}

export default function IncomeAllocationModal({
  isOpen,
  onClose,
  onSaved,
  initialRecord = null,
}: IncomeAllocationModalProps) {
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [incomeSource, setIncomeSource] = useState<string>(INCOME_SOURCES[0])
  const [allocateGoalId, setAllocateGoalId] = useState('')
  const [allocateAmount, setAllocateAmount] = useState('')
  const [goals, setGoals] = useState<Goal[]>([])
  const [allocationsEdit, setAllocationsEdit] = useState<AllocationRow[]>([])
  const [addGoalId, setAddGoalId] = useState('')
  const [addAmount, setAddAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEditMode = Boolean(initialRecord?.id)

  useEffect(() => {
    if (isOpen && initialRecord) {
      setAmount(String(initialRecord.total_amount))
      setDate(initialRecord.date)
      const validSource =
        initialRecord.income_source &&
        (INCOME_SOURCES as readonly string[]).includes(initialRecord.income_source)
      setIncomeSource((validSource ? initialRecord.income_source : INCOME_SOURCES[0]) as IncomeSource)
      setAllocateGoalId('')
      setAllocateAmount('')
      setAllocationsEdit([])
      setAddGoalId('')
      setAddAmount('')
    }
  }, [isOpen, initialRecord])

  useEffect(() => {
    if (!isOpen) return
    const load = async () => {
      const { data } = await supabase.from('goals').select('id, name, target_amount')
      setGoals((data as Goal[]) || [])
    }
    load()
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !initialRecord?.id || goals.length === 0) {
      if (!isOpen || !initialRecord) setAllocationsEdit([])
      return
    }
    const loadAllocations = async () => {
      const { data } = await supabase
        .from('income_allocations')
        .select('goal_id, amount')
        .eq('income_record_id', initialRecord.id)
      const rows = (data ?? []) as { goal_id: string; amount: number }[]
      const goalMap = new Map(goals.map((g) => [g.id, g.name]))
      setAllocationsEdit(
        rows.map((r) => ({
          goal_id: r.goal_id,
          goal_name: goalMap.get(r.goal_id) ?? 'Goal',
          amount: String(r.amount),
        }))
      )
    }
    loadAllocations()
  }, [isOpen, initialRecord?.id, goals])

  const handleClose = () => {
    setAmount('')
    setDate(new Date().toISOString().slice(0, 10))
    setIncomeSource(INCOME_SOURCES[0])
    setAllocateGoalId('')
    setAllocateAmount('')
    setAllocationsEdit([])
    setAddGoalId('')
    setAddAmount('')
    setError(null)
    onClose()
  }

  const incomeNumOrZero = (() => {
    const n = parseFloat(amount)
    return !Number.isNaN(n) && n > 0 ? n : 0
  })()
  const allocationsSum = allocationsEdit.reduce((s, row) => {
    const n = parseFloat(row.amount)
    return s + (!Number.isNaN(n) && n >= 0 ? n : 0)
  }, 0)
  const remaining = Math.max(0, incomeNumOrZero - allocationsSum)
  const allocationExceedsIncome = incomeNumOrZero > 0 && allocationsSum > incomeNumOrZero

  const goalsNotAllocated = goals.filter((g) => !allocationsEdit.some((a) => a.goal_id === g.id))
  const canAddAllocation = goalsNotAllocated.length > 0

  const addModeAllocAmount =
    !isEditMode && allocateGoalId && allocateAmount ? parseFloat(allocateAmount) : 0
  const addModeAllocExceeds =
    !isEditMode &&
    incomeNumOrZero > 0 &&
    !Number.isNaN(addModeAllocAmount) &&
    addModeAllocAmount > 0 &&
    addModeAllocAmount > incomeNumOrZero

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('Not authenticated.')
      setLoading(false)
      return
    }
    const incomeNum = parseFloat(amount)
    if (isNaN(incomeNum) || incomeNum <= 0) {
      setError('Enter a valid income amount.')
      setLoading(false)
      return
    }

    if (isEditMode && initialRecord) {
      const goalIds = new Set(goals.map((g) => g.id))
      const allocPayload = allocationsEdit
        .filter((a) => goalIds.has(a.goal_id))
        .map((a) => ({ goal_id: a.goal_id, amount: parseFloat(a.amount) }))
        .filter((a) => !Number.isNaN(a.amount) && a.amount > 0)
      const totalAlloc = allocPayload.reduce((s, a) => s + a.amount, 0)
      if (totalAlloc > incomeNum) {
        setError('Total allocations cannot exceed income amount.')
        setLoading(false)
        return
      }
      const res = await fetch(`/api/income/${initialRecord.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          total_amount: incomeNum,
          date,
          income_source: incomeSource || null,
          allocations: allocPayload,
        }),
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))
      setLoading(false)
      if (!res.ok) {
        setError((data?.error as string) ?? 'Could not update income.')
        return
      }
      handleClose()
      onSaved({ allocationsChanged: true })
      return
    }

    const allocNum = allocateGoalId && allocateAmount ? parseFloat(allocateAmount) : 0
    const allocated = !isNaN(allocNum) && allocNum > 0 ? allocNum : 0
    if (allocated > incomeNum) {
      setError('Allocated amount cannot exceed income amount.')
      setLoading(false)
      return
    }
    const disposableAmount = Math.max(0, incomeNum - allocated)

    const { data: incomeData, error: incomeErr } = await supabase.from('income_records').insert({
      user_id: user.id,
      total_amount: incomeNum,
      disposable_amount: disposableAmount,
      date,
      income_source: incomeSource || null,
    }).select('id').single()
    if (incomeErr) {
      setError(incomeErr.message)
      setLoading(false)
      return
    }
    let allocationsChanged = false
    if (allocateGoalId && allocateAmount && allocated > 0 && incomeData) {
      const { error: allocErr } = await supabase.from('income_allocations').insert({
        income_record_id: incomeData.id,
        goal_id: allocateGoalId,
        amount: allocated,
      })
      if (allocErr) {
        setError(allocErr.message)
        setLoading(false)
        return
      }
      allocationsChanged = true
    }
    setLoading(false)
    handleClose()
    onSaved({ allocationsChanged })
  }

  const inputStyle: React.CSSProperties = {
    padding: '10px 12px',
    width: '100%',
    fontSize: 14,
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={isEditMode ? 'Edit income' : 'Add income / allocate'}>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#374151' }}>
            Income amount (₱)
          </label>
          <input
            type="number"
            min="0.01"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#374151' }}>
            Income source
          </label>
          <select
            value={incomeSource}
            onChange={(e) => setIncomeSource(e.target.value)}
            style={inputStyle}
          >
            {INCOME_SOURCES.map((src) => (
              <option key={src} value={src}>{src}</option>
            ))}
          </select>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#374151' }}>
            Date
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={inputStyle}
          />
        </div>
        {isEditMode && goals.length > 0 && (
          <>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#374151', fontWeight: 500 }}>
                Goal allocations (optional)
              </label>
              {allocationsEdit.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>No allocations. Add one below if you want to allocate part of this income to a goal.</p>
              ) : (
                <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                  {allocationsEdit.map((row) => (
                    <li
                      key={row.goal_id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 8,
                        padding: '8px 0',
                        borderBottom: '1px solid var(--border, #e5e7eb)',
                      }}
                    >
                      <span style={{ flex: '1 1 auto', fontSize: 14, color: '#374151' }}>{row.goal_name}</span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={row.amount}
                        onChange={(e) =>
                          setAllocationsEdit((prev) =>
                            prev.map((a) => (a.goal_id === row.goal_id ? { ...a, amount: e.target.value } : a))
                          )
                        }
                        style={{ ...inputStyle, width: 100, marginBottom: 0 }}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setAllocationsEdit((prev) => prev.filter((a) => a.goal_id !== row.goal_id))
                        }
                        style={{
                          padding: '6px 10px',
                          fontSize: 13,
                          border: '1px solid #e5e7eb',
                          borderRadius: 8,
                          background: '#fff',
                          color: '#6b7280',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: allocationExceedsIncome ? '#b91c1c' : '#374151' }}>
              Remaining unallocated: ₱{remaining.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              {allocationExceedsIncome && ' — Total allocations exceed income amount.'}
            </p>
            {canAddAllocation && (
              <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
                <div style={{ flex: '1 1 140px', minWidth: 0 }}>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#6b7280' }}>Add to goal</label>
                  <select
                    value={addGoalId}
                    onChange={(e) => setAddGoalId(e.target.value)}
                    style={inputStyle}
                  >
                    <option value="">Select goal</option>
                    {goalsNotAllocated.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
                <div style={{ width: 100 }}>
                  <label style={{ display: 'block', marginBottom: 4, fontSize: 12, color: '#6b7280' }}>Amount (₱)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={addAmount}
                    onChange={(e) => setAddAmount(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!addGoalId || !addAmount) return
                    const n = parseFloat(addAmount)
                    if (Number.isNaN(n) || n <= 0) return
                    const goal = goals.find((g) => g.id === addGoalId)
                    if (!goal) return
                    setAllocationsEdit((prev) => [...prev, { goal_id: addGoalId, goal_name: goal.name, amount: addAmount }])
                    setAddGoalId('')
                    setAddAmount('')
                  }}
                  disabled={!addGoalId || !addAmount || parseFloat(addAmount) <= 0}
                  style={{
                    padding: '10px 14px',
                    fontSize: 14,
                    border: 'none',
                    borderRadius: 8,
                    backgroundColor: '#059669',
                    color: '#fff',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Add
                </button>
              </div>
            )}
          </>
        )}
        {goals.length > 0 && !isEditMode && (
          <>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#374151' }}>
                Allocate to goal (optional)
              </label>
              <select
                value={allocateGoalId}
                onChange={(e) => setAllocateGoalId(e.target.value)}
                style={inputStyle}
              >
                <option value="">None</option>
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
            {allocateGoalId && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#374151' }}>
                  Amount to allocate (₱)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={allocateAmount}
                  onChange={(e) => setAllocateAmount(e.target.value)}
                  style={inputStyle}
                />
                {addModeAllocExceeds && (
                  <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--color-danger, #b91c1c)' }}>
                    Allocated amount cannot exceed income amount. Lower the amount or increase income to save.
                  </p>
                )}
              </div>
            )}
          </>
        )}
        {error && <p style={{ margin: 0, marginBottom: 16, fontSize: 13, color: '#b91c1c' }}>{error}</p>}
        <button
          type="submit"
          disabled={loading || (isEditMode && allocationExceedsIncome) || addModeAllocExceeds}
          style={{
            padding: '10px 18px',
            fontSize: 14,
            border: 'none',
            borderRadius: 8,
            backgroundColor: '#059669',
            color: '#fff',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {loading ? (isEditMode ? 'Saving...' : 'Saving...') : (isEditMode ? 'Save changes' : 'Save income')}
        </button>
      </form>
    </Modal>
  )
}
