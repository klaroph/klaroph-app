'use client'

import { useState } from 'react'
import Modal from '../ui/Modal'

export type RecordDetail = { label: string; value: React.ReactNode }

/** Props that make a table row open RecordActionsModal on tap, Enter or Space. */
export function clickableRowProps(onOpen: () => void) {
  return {
    className: 'income-expense-row-clickable',
    tabIndex: 0,
    'aria-haspopup': 'dialog' as const,
    onClick: onOpen,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onOpen()
      }
    },
  }
}

type RecordActionsModalProps = {
  title: string
  details: RecordDetail[]
  deleteWarning: string
  onClose: () => void
  onEdit: () => void
  /** Resolves to an error message, or null on success. */
  onDelete: () => Promise<string | null>
}

export default function RecordActionsModal({ title, details, deleteWarning, onClose, onEdit, onDelete }: RecordActionsModalProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDelete = async () => {
    setDeleting(true)
    setError(null)
    const message = await onDelete()
    setDeleting(false)
    if (message) {
      setError(message)
      return
    }
    onClose()
  }

  return (
    <Modal isOpen onClose={onClose} title={title}>
      <dl style={{ margin: '0 0 20px', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 16px', fontSize: 14 }}>
        {details.map((d) => (
          <div key={d.label} style={{ display: 'contents' }}>
            <dt style={{ color: 'var(--text-muted)' }}>{d.label}</dt>
            <dd style={{ margin: 0, color: 'var(--text-primary)', textAlign: 'right', overflowWrap: 'anywhere' }}>{d.value}</dd>
          </div>
        ))}
      </dl>

      {confirmingDelete ? (
        <>
          <p
            role="alert"
            style={{
              margin: '0 0 16px',
              padding: '10px 12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(248, 113, 113, 0.28)',
              background: 'var(--pastel-coral)',
              color: '#be123c',
              fontSize: 13,
              lineHeight: 1.4,
            }}
          >
            {deleteWarning}
          </p>
          {error && <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-error)' }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn-danger" onClick={handleDelete} disabled={deleting} style={{ flex: 1 }}>
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setConfirmingDelete(false)} disabled={deleting} style={{ flex: 1 }}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn-primary" onClick={onEdit} style={{ flex: 1 }}>
            Edit
          </button>
          <button type="button" className="btn-secondary" onClick={() => setConfirmingDelete(true)} style={{ flex: 1, color: 'var(--color-danger)' }}>
            Delete
          </button>
        </div>
      )}
    </Modal>
  )
}
