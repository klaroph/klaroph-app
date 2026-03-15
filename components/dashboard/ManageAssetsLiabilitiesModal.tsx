'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import Modal from '../ui/Modal'
import AddAssetLiabilityModal from './AddAssetLiabilityModal'
import { getAccountDisplayLabel, type FinancialAccount } from '@/lib/financialAccounts'

type ManageAssetsLiabilitiesModalProps = {
  isOpen: boolean
  onClose: () => void
  onSaved: () => void
}

export default function ManageAssetsLiabilitiesModal({
  isOpen,
  onClose,
  onSaved,
}: ManageAssetsLiabilitiesModalProps) {
  const [accounts, setAccounts] = useState<FinancialAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editAmount, setEditAmount] = useState('')
  const [editingType, setEditingType] = useState<'asset' | 'liability'>('asset')

  const load = async () => {
    if (!isOpen) return
    setLoading(true)
    const { data } = await supabase
      .from('financial_accounts')
      .select('id, user_id, type, subtype, institution_name, custom_name, amount, notes, created_at, updated_at')
    setAccounts((data as FinancialAccount[]) || [])
    setLoading(false)
  }

  const assets = accounts.filter((a) => a.type === 'asset')
  const liabilities = accounts.filter((a) => a.type === 'liability')

  useEffect(() => {
    if (isOpen) load()
  }, [isOpen])

  const handleAddSaved = () => {
    setAddModalOpen(false)
    load()
    onSaved()
  }

  const startEdit = (row: FinancialAccount) => {
    setEditingId(row.id)
    setEditingType(row.type as 'asset' | 'liability')
    setEditName(row.custom_name?.trim() || row.institution_name?.trim() || '')
    setEditAmount(String(row.amount))
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditName('')
    setEditAmount('')
  }

  const saveEdit = async () => {
    if (!editingId) return
    const num = parseFloat(editAmount)
    if (isNaN(num) || num < 0) return
    const { error } = await supabase
      .from('financial_accounts')
      .update({ custom_name: editName.trim() || null, amount: num, updated_at: new Date().toISOString() })
      .eq('id', editingId)
    if (!error) {
      cancelEdit()
      load()
      onSaved()
    }
  }

  const deleteRow = async (id: string) => {
    if (!confirm('Remove this item?')) return
    await supabase.from('financial_accounts').delete().eq('id', id)
    load()
    onSaved()
  }

  const inputStyle: React.CSSProperties = {
    padding: '6px 10px',
    fontSize: 13,
    border: '1px solid #e5e7eb',
    borderRadius: 6,
    width: '100%',
    boxSizing: 'border-box',
  }

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="Assets & Liabilities">
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            marginBottom: 16,
          }}
        >
          <button
            type="button"
            onClick={() => setAddModalOpen(true)}
            style={{
              padding: '8px 16px',
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
        {loading ? (
          <p style={{ margin: 0, fontSize: 14, color: '#6b7280' }}>Loading...</p>
        ) : (
          <>
            <div style={{ marginBottom: 24 }}>
              <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: '#374151' }}>
                Assets
              </h4>
              {assets.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>No assets yet.</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {assets.map((row) => (
                    <li
                      key={row.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '10px 0',
                        borderBottom: '1px solid #f3f4f6',
                      }}
                    >
                      {editingId === row.id && editingType === 'asset' ? (
                        <>
                          <input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            style={{ ...inputStyle, flex: 1 }}
                            placeholder="Name (optional)"
                          />
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={editAmount}
                            onChange={(e) => setEditAmount(e.target.value)}
                            style={{ ...inputStyle, width: 100 }}
                          />
                          <button type="button" onClick={saveEdit} style={{ fontSize: 12, padding: '4px 10px' }}>
                            Save
                          </button>
                          <button type="button" onClick={cancelEdit} style={{ fontSize: 12, padding: '4px 10px' }}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <span style={{ flex: 1, fontSize: 14 }}>{getAccountDisplayLabel(row)}</span>
                          <span style={{ fontSize: 14, color: '#374151' }}>
                            ₱{Number(row.amount).toLocaleString()}
                          </span>
                          <button
                            type="button"
                            onClick={() => startEdit(row)}
                            style={{ fontSize: 12, padding: '4px 8px' }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteRow(row.id)}
                            style={{ fontSize: 12, padding: '4px 8px', color: '#b91c1c' }}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: '#374151' }}>
                Liabilities
              </h4>
              {liabilities.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>No liabilities yet.</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {liabilities.map((row) => (
                    <li
                      key={row.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '10px 0',
                        borderBottom: '1px solid #f3f4f6',
                      }}
                    >
                      {editingId === row.id && editingType === 'liability' ? (
                        <>
                          <input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            style={{ ...inputStyle, flex: 1 }}
                            placeholder="Name (optional)"
                          />
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={editAmount}
                            onChange={(e) => setEditAmount(e.target.value)}
                            style={{ ...inputStyle, width: 100 }}
                          />
                          <button type="button" onClick={saveEdit} style={{ fontSize: 12, padding: '4px 10px' }}>
                            Save
                          </button>
                          <button type="button" onClick={cancelEdit} style={{ fontSize: 12, padding: '4px 10px' }}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <span style={{ flex: 1, fontSize: 14 }}>{getAccountDisplayLabel(row)}</span>
                          <span style={{ fontSize: 14, color: '#374151' }}>
                            ₱{Number(row.amount).toLocaleString()}
                          </span>
                          <button
                            type="button"
                            onClick={() => startEdit(row)}
                            style={{ fontSize: 12, padding: '4px 8px' }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteRow(row.id)}
                            style={{ fontSize: 12, padding: '4px 8px', color: '#b91c1c' }}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </Modal>
      <AddAssetLiabilityModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSaved={handleAddSaved}
      />
    </>
  )
}
