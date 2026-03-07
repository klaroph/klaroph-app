'use client'

type ModalProps = {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  contentMaxWidth?: number
  /** If false, clicking backdrop does not close. Default true. */
  closeOnOutsideClick?: boolean
}

export default function Modal({ isOpen, onClose, title, children, contentMaxWidth = 420, closeOnOutsideClick = true }: ModalProps) {
  if (!isOpen) return null
  return (
    <div
      className="modal-backdrop modal-backdrop-premium"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 24,
      }}
      onClick={closeOnOutsideClick ? onClose : undefined}
    >
      <div
        className="modal-panel modal-panel-premium"
        style={{
          backgroundColor: 'var(--surface, #fff)',
          borderRadius: 14,
          boxShadow: '0 24px 48px rgba(0,0,0,0.12), 0 8px 24px rgba(0,0,0,0.08)',
          maxWidth: contentMaxWidth,
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="modal-panel-header"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '22px 26px',
            borderBottom: '1px solid var(--border-soft, #e5e7eb)',
          }}
        >
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 650, letterSpacing: '-0.01em', color: 'var(--text-primary, #111827)' }}>
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="modal-close-btn"
            style={{
              padding: 6,
              border: 'none',
              background: 'none',
              fontSize: 22,
              color: 'var(--text-muted, #6b7280)',
              cursor: 'pointer',
              lineHeight: 1,
              borderRadius: 8,
            }}
          >
            ×
          </button>
        </div>
        <div className="modal-panel-body" style={{ padding: '26px 26px 28px' }}>{children}</div>
      </div>
    </div>
  )
}
