'use client'

import { useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'

const MESSAGE_MAX = 1000

type SupportModalProps = {
  isOpen: boolean
  onClose: () => void
}

export default function SupportModal({ isOpen, onClose }: SupportModalProps) {
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (typeof document === 'undefined') return
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const resetForm = useCallback(() => {
    setSubject('')
    setMessage('')
    setError(null)
    setSuccess(false)
  }, [])

  const handleClose = useCallback(() => {
    if (!loading) {
      resetForm()
      onClose()
    }
  }, [loading, resetForm, onClose])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const trimmed = message.trim()
    if (!trimmed) {
      setError('Please enter your message.')
      return
    }
    if (trimmed.length > MESSAGE_MAX) {
      setError(`Message must be at most ${MESSAGE_MAX} characters.`)
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          subject: subject.trim() || undefined,
        }),
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError((data.error as string) || 'Something went wrong. Please try again.')
        return
      }
      setSuccess(true)
      setSubject('')
      setMessage('')
      setError(null)
    } finally {
      setLoading(false)
    }
  }

  const modalContent = (
    <div
      className="modal-backdrop"
      onClick={!loading ? handleClose : undefined}
      role="presentation"
    >
      <div
        className="modal-panel support-modal-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="support-modal-title"
      >
        <div className="modal-panel-header">
          <h3
            id="support-modal-title"
            style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--color-primary)' }}
          >
            Need help or found an issue?
          </h3>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            style={{
              padding: 4,
              border: 'none',
              background: 'none',
              fontSize: 20,
              color: 'var(--text-muted)',
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
        <div className="modal-panel-body" style={{ padding: 24 }}>
          <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--text-muted)' }}>
            We&apos;re building KlaroPH for you. Tell us what we can improve.
          </p>

          {success ? (
            <div
              style={{
                padding: '24px 0',
                textAlign: 'center',
                fontSize: 15,
                color: 'var(--text-secondary)',
              }}
            >
              Thank you. Our team will review your concern.
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="klaro-field" style={{ marginBottom: 16 }}>
                <label htmlFor="support-subject" className="klaro-field-label">
                  Subject (optional)
                </label>
                <input
                  id="support-subject"
                  type="text"
                  className="klaro-field-input"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Brief topic"
                  disabled={loading}
                  maxLength={500}
                />
              </div>
              <div className="klaro-field" style={{ marginBottom: 16 }}>
                <label htmlFor="support-message" className="klaro-field-label">
                  Message (required)
                </label>
                <textarea
                  id="support-message"
                  className="klaro-field-textarea"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Describe your concern or suggestion..."
                  rows={4}
                  disabled={loading}
                  maxLength={MESSAGE_MAX}
                />
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, textAlign: 'right' }}>
                  {message.length} / {MESSAGE_MAX}
                </div>
              </div>
              {error && (
                <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-error, #dc2626)' }}>
                  {error}
                </p>
              )}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={handleClose}
                  className="btn-secondary"
                  style={{ padding: '8px 16px', fontSize: 14 }}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ padding: '8px 16px', fontSize: 14 }}
                  disabled={loading || !message.trim()}
                >
                  {loading ? 'Sending…' : 'Send'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )

  if (!isOpen) return null
  if (typeof document === 'undefined') return null

  return createPortal(modalContent, document.body)
}
