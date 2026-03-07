'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import Modal from '../ui/Modal'
import NewGoalModal from './NewGoalModal'
import UpgradeCTA from '../ui/UpgradeCTA'
import { getIconKeyForGoalName } from '../../lib/goalPresets'

type Goal = { id: string; name: string; target_amount: number }
type AllocationRow = { goal_id: string; amount: number }

function GoalIcon({ iconKey }: { iconKey: string }) {
  const style = { width: 20, height: 20, color: 'var(--color-blue)' }
  if (iconKey === 'travel') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={style}>
        <path d="M21 16V8a2 2 0 0 0-1.2-1.82l-7-3.5a2 2 0 0 0-1.6 0L3.2 6.18A2 2 0 0 0 2 8v8a2 2 0 0 0 1.2 1.82l7 3.5a2 2 0 0 0 1.6 0l7-3.5A2 2 0 0 0 21 16Z" />
      </svg>
    )
  }
  if (iconKey === 'money') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={style}>
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    )
  }
  if (iconKey === 'education') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={style}>
        <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
      </svg>
    )
  }
  if (iconKey === 'house') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={style}>
        <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={style}>
      <circle cx="12" cy="12" r="10" />
    </svg>
  )
}

type ManageGoalsModalProps = {
  isOpen: boolean
  onClose: () => void
  onGoalsChange: () => void
  /** From backend features; used to show Add goal vs Upgrade. */
  maxGoals?: number
  /** When true, upgrade CTA is hidden. */
  isPro?: boolean
  onUpgradeClick?: () => void
}

export default function ManageGoalsModal({ isOpen, onClose, onGoalsChange, maxGoals = 2, isPro, onUpgradeClick }: ManageGoalsModalProps) {
  const [goals, setGoals] = useState<Goal[]>([])
  const [allocationsByGoal, setAllocationsByGoal] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editTarget, setEditTarget] = useState('')
  const [inspirationMessage, setInspirationMessage] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setGoals([])
      setLoading(false)
      return
    }
    const { data: goalsData, error: goalsErr } = await supabase.from('goals').select('*')
    if (goalsErr) {
      setError(goalsErr.message)
      setGoals([])
      setLoading(false)
      return
    }
    const list = (goalsData || []) as Goal[]
    setGoals(list)
    if (list.length === 0) {
      setAllocationsByGoal({})
      setLoading(false)
      return
    }
    const goalIds = list.map((g) => g.id)
    const { data: allocData } = await supabase.from('income_allocations').select('goal_id, amount').in('goal_id', goalIds)
    const rows = (allocData || []) as AllocationRow[]
    const byGoal: Record<string, number> = {}
    for (const row of rows) byGoal[row.goal_id] = (byGoal[row.goal_id] ?? 0) + Number(row.amount)
    setAllocationsByGoal(byGoal)
    setLoading(false)
  }

  useEffect(() => {
    if (isOpen) load()
  }, [isOpen])

  const handleGoalCreated = () => {
    setAddModalOpen(false)
    setInspirationMessage("You're one step closer! Keep building — every peso counts.")
    setTimeout(() => setInspirationMessage(null), 5000)
    load()
    onGoalsChange()
  }

  const startEdit = (g: Goal) => {
    setEditingId(g.id)
    setEditName(g.name)
    setEditTarget(String(g.target_amount))
  }

  const saveEdit = async () => {
    if (!editingId) return
    const raw = editTarget.replace(/,/g, '').trim()
    const amount = parseFloat(raw)
    if (!editName.trim() || !raw || isNaN(amount) || amount <= 0) return
    const { error: err } = await supabase.from('goals').update({ name: editName.trim(), target_amount: amount }).eq('id', editingId)
    if (err) setError(err.message)
    else {
      setEditingId(null)
      load()
      onGoalsChange()
    }
  }

  const handleDelete = async (goalId: string) => {
    setDeletingId(goalId)
    const { error: err } = await supabase.from('goals').delete().eq('id', goalId)
    if (err) setError(err.message)
    else {
      load()
      onGoalsChange()
    }
    setDeletingId(null)
  }

  const inputStyle: React.CSSProperties = {
    padding: '8px 10px',
    fontSize: 13,
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    width: '100%',
  }

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="Manage goals" contentMaxWidth={520}>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          We encourage keeping goals until completed. Add, edit, or remove goals below.
        </p>
        {inspirationMessage && (
          <p style={{ margin: '0 0 16px', padding: 12, fontSize: 14, background: 'var(--color-success-muted)', color: 'var(--color-success)', borderRadius: 8 }}>
            {inspirationMessage}
          </p>
        )}
        {error && <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-error)' }}>{error}</p>}
        {loading ? (
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)' }}>Loading...</p>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              {goals.map((g) => {
                const allocated = allocationsByGoal[g.id] ?? 0
                const target = Number(g.target_amount) || 0
                const pct = target > 0 ? Math.min(100, (allocated / target) * 100) : 0
                const isEditing = editingId === g.id
                return (
                  <div
                    key={g.id}
                    style={{
                      padding: 12,
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      background: 'var(--surface)',
                    }}
                  >
                    {isEditing ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="Goal name"
                          style={inputStyle}
                        />
                        <input
                          type="text"
                          inputMode="decimal"
                          value={editTarget}
                          onChange={(e) => setEditTarget(e.target.value)}
                          onBlur={() => {
                            const raw = editTarget.replace(/,/g, '').trim()
                            const num = parseFloat(raw)
                            if (raw !== '' && !isNaN(num) && num > 0) {
                              setEditTarget(num.toLocaleString('en-PH', { maximumFractionDigits: 0 }))
                            }
                          }}
                          placeholder="Target (₱)"
                          style={inputStyle}
                        />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button type="button" onClick={saveEdit} style={{ padding: '8px 14px', fontSize: 13, fontWeight: 500, background: 'var(--color-success)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                            Save
                          </button>
                          <button type="button" onClick={() => setEditingId(null)} style={{ padding: '8px 14px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', cursor: 'pointer' }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <GoalIcon iconKey={getIconKeyForGoalName(g.name)} />
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>{g.name}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>₱{allocated.toLocaleString()} / ₱{target.toLocaleString()} ({pct.toFixed(0)}%)</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button type="button" onClick={() => startEdit(g)} style={{ padding: '6px 12px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', cursor: 'pointer' }}>
                            Edit
                          </button>
                          <button type="button" onClick={() => handleDelete(g.id)} disabled={deletingId === g.id} style={{ padding: '6px 12px', fontSize: 12, border: '1px solid var(--color-error)', color: 'var(--color-error)', borderRadius: 6, background: 'transparent', cursor: deletingId === g.id ? 'not-allowed' : 'pointer' }}>
                            {deletingId === g.id ? '...' : 'Delete'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {goals.length < maxGoals ? (
              <button
                type="button"
                onClick={() => setAddModalOpen(true)}
                style={{ padding: '10px 18px', fontSize: 14, fontWeight: 500, background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
              >
                Add goal
              </button>
            ) : onUpgradeClick && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  You&apos;ve reached your limit of {maxGoals} goals. Upgrade to add more.
                </span>
                <UpgradeCTA variant="compact" />
              </div>
            )}
          </>
        )}
      </Modal>
      <NewGoalModal isOpen={addModalOpen} onClose={() => setAddModalOpen(false)} onGoalCreated={handleGoalCreated} />
    </>
  )
}
