'use client'

import { useState, useTransition } from 'react'
import { sendSupportReplyAction, setSupportStatusAction } from '@/app/admin/founder/support/actions'
import { ActionResultNote, type ActionResult } from '@/components/founder/DockUI'

export function SupportStatusButton({ requestId, status }: { requestId: string; status: 'open' | 'resolved' }) {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<ActionResult | null>(null)
  const next = status === 'open' ? 'resolved' : 'open'

  return (
    <div className="fd-support-status">
      <button
        type="button"
        className="fd-btn fd-btn-ghost"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setResult(null)
            const state = await setSupportStatusAction(requestId, next)
            if (!state.ok) setResult(state)
          })
        }
      >
        {pending ? 'Saving…' : status === 'open' ? 'Resolve' : 'Reopen'}
      </button>
      <ActionResultNote result={result} />
    </div>
  )
}

/** Resends an unconfirmed reply with its original id and body, so Resend never delivers it twice. */
export function RetryReplyButton({ requestId, replyId, body }: { requestId: string; replyId: string; body: string }) {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<ActionResult | null>(null)

  return (
    <div className="fd-support-status">
      <button
        type="button"
        className="fd-btn fd-btn-ghost"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setResult(null)
            setResult(await sendSupportReplyAction({ requestId, replyId, body, resolveAfter: false }))
          })
        }
      >
        {pending ? 'Retrying…' : 'Retry delivery'}
      </button>
      <ActionResultNote result={result} />
    </div>
  )
}

/**
 * A resubmitted, unchanged draft reuses its reply id, so the server and Resend treat it as the
 * same reply and the email goes out once. Editing the draft starts a new reply id.
 */
export function SupportReplyForm({ requestId, recipient, maxLength }: { requestId: string; recipient: string; maxLength: number }) {
  const [pending, startTransition] = useTransition()
  const [body, setBody] = useState('')
  const [resolveAfter, setResolveAfter] = useState(false)
  const [attempt, setAttempt] = useState<{ replyId: string; body: string } | null>(null)
  const [result, setResult] = useState<ActionResult | null>(null)
  const trimmed = body.trim()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (pending || !trimmed) return
    const replyId = attempt?.body === trimmed ? attempt.replyId : crypto.randomUUID()
    setAttempt({ replyId, body: trimmed })
    startTransition(async () => {
      setResult(null)
      const state = await sendSupportReplyAction({ requestId, replyId, body: trimmed, resolveAfter })
      setResult(state)
      if (state.ok) {
        setBody('')
        setResolveAfter(false)
        setAttempt(null)
      }
    })
  }

  return (
    <form className="fd-support-composer" onSubmit={submit}>
      <label className="fd-field">
        <span className="fd-field-label">Reply to {recipient}</span>
        <textarea
          className="fd-input fd-textarea"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a reply…"
          rows={5}
          maxLength={maxLength}
          disabled={pending}
        />
      </label>
      <div className="fd-support-composer-row">
        <label className="fd-check">
          <input type="checkbox" checked={resolveAfter} onChange={(e) => setResolveAfter(e.target.checked)} disabled={pending} />
          Resolve after sending
        </label>
        <span className="fd-muted">
          {body.length} / {maxLength}
        </span>
        <button type="submit" className="fd-btn fd-btn-action" disabled={pending || !trimmed}>
          {pending ? 'Sending…' : 'Send reply'}
        </button>
      </div>
      <ActionResultNote result={result} />
    </form>
  )
}
