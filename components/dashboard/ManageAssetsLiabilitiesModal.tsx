'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import Modal from '../ui/Modal'
import AddAssetLiabilityModal from './AddAssetLiabilityModal'

type AssetRow = { id: string; name: string; amount: number }
type LiabilityRow = { id: string; name: string; amount: number }

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
  const [assets, setAssets] = useState<AssetRow[]>([])
  const [liabilities, setLiabilities] = useState<LiabilityRow[]>([])
  const [loading, setLoading] = useState(true)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editAmount, setEditAmount] = useState('')
  const [editTable, setEditTable] = useState<'assets' | 'liabilities'>('assets')

  const load = async () => {
    if (!isOpen) return
    setLoading(true)
    const { data: a } = await supabase.from('assets').select('id, name, amount')
    const { data: l } = await supabase.from('liabilities').select('id, name, amount')
    setAssets((a as AssetRow[]) || [])
    setLiabilities((l as LiabilityRow[]) || [])
    setLoading(false)
  }

  useEffect(() => {
    if (isOpen) load()
  }, [isOpen])

  const handleAddSaved = () => {
    setAddModalOpen(false)
    load()
    onSaved()
  }

  const startEdit = (row: { id: string; name: string; amount: number }, table: 'assets' | 'liabilities') => {
    setEditingId(row.id)
    setEditTable(table)
    setEditName(row.name)
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
      .from(editTable)
      .update({ name: editName.trim(), amount: num })
      .eq('id', editingId)
    if (!error) {
      cancelEdit()
      load()
      onSaved()
    }
  }

  const deleteRow = async (id: string, table: 'assets' | 'liabilities') => {
    if (!confirm('Remove this item?')) return
    await supabase.from(table).delete().eq('id', id)
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
                      {editingId === row.id && editTable === 'assets' ? (
                        <>
                          <input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            style={{ ...inputStyle, flex: 1 }}
                            placeholder="Name"
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
                          <span style={{ flex: 1, fontSize: 14 }}>{row.name}</span>
                          <span style={{ fontSize: 14, color: '#374151' }}>
                            ₱{Number(row.amount).toLocaleString()}
                          </span>
                          <button
                            type="button"
                            onClick={() => startEdit(row, 'assets')}
                            style={{ fontSize: 12, padding: '4px 8px' }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteRow(row.id, 'assets')}
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
                      {editingId === row.id && editTable === 'liabilities' ? (
                        <>
                          <input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            style={{ ...inputStyle, flex: 1 }}
                            placeholder="Name"
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
                          <span style={{ flex: 1, fontSize: 14 }}>{row.name}</span>
                          <span style={{ fontSize: 14, color: '#374151' }}>
                            ₱{Number(row.amount).toLocaleString()}
                          </span>
                          <button
                            type="button"
                            onClick={() => startEdit(row, 'liabilities')}
                            style={{ fontSize: 12, padding: '4px 8px' }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteRow(row.id, 'liabilities')}
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
