'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabaseClient'
import Modal from '../ui/Modal'
import { INCOME_SOURCES, type IncomeSource } from '../../lib/incomeSources'

type Goal = { id: string; name: string; target_amount: number }

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

  const handleClose = () => {
    setAmount('')
    setDate(new Date().toISOString().slice(0, 10))
    setIncomeSource(INCOME_SOURCES[0])
    setAllocateGoalId('')
    setAllocateAmount('')
    setError(null)
    onClose()
  }

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
      const res = await fetch(`/api/income/${initialRecord.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          total_amount: incomeNum,
          date,
          income_source: incomeSource || null,
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
      onSaved({})
      return
    }

    const allocNum = allocateGoalId && allocateAmount ? parseFloat(allocateAmount) : 0
    const allocated = !isNaN(allocNum) && allocNum > 0 ? allocNum : 0
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
              </div>
            )}
          </>
        )}
        {error && <p style={{ margin: 0, marginBottom: 16, fontSize: 13, color: '#b91c1c' }}>{error}</p>}
        <button
          type="submit"
          disabled={loading}
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
