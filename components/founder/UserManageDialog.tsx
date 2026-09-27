'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { deleteUserAction, grantComplimentaryProAction } from '@/app/admin/founder/users/actions'
import {
  COMPLIMENTARY_DURATIONS,
  DELETE_CONFIRMATION_PHRASE,
  isPro,
  PLAN_LABELS,
  STATUS_LABELS,
  STATUS_TONES,
  type ComplimentaryDuration,
  type FounderUser,
} from '@/lib/founder/userList'
import { formatDate } from '@/lib/founder/format'
import { ActionResultNote, Pill, type ActionResult } from '@/components/founder/DockUI'

type Step = 'view' | 'grant' | 'delete'

type Props = {
  user: FounderUser
  isFounder: boolean
  onClose: () => void
  onDeleted: (result: ActionResult) => void
}

/**
 * Per-user actions. Grant needs one confirmation; delete needs a separate step, the exact
 * account email and the confirmation phrase before its button unlocks. The server re-checks all of it.
 */
export default function UserManageDialog({ user, isFounder, onClose, onDeleted }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [step, setStep] = useState<Step>('view')
  const [duration, setDuration] = useState<ComplimentaryDuration>('3m')
  const [typedEmail, setTypedEmail] = useState('')
  const [typedPhrase, setTypedPhrase] = useState('')
  const [result, setResult] = useState<ActionResult | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  const label = user.name ?? 'No name'
  const hasPro = isPro(user.plan)
  const deleteUnlocked = typedEmail.trim().toLowerCase() === user.email.toLowerCase() && typedPhrase === DELETE_CONFIRMATION_PHRASE

  const goTo = (next: Step) => {
    setResult(null)
    setTypedEmail('')
    setTypedPhrase('')
    setStep(next)
  }

  const grant = () =>
    startTransition(async () => {
      const state = await grantComplimentaryProAction({ userId: user.id, duration })
      setResult(state)
      if (state.ok) setStep('view')
    })

  const remove = () =>
    startTransition(async () => {
      const state = await deleteUserAction({ userId: user.id, confirmEmail: typedEmail, confirmPhrase: typedPhrase })
      if (state.ok) onDeleted(state)
      else setResult(state)
    })

  return (
    <dialog
      ref={dialogRef}
      className="fd-dialog"
      aria-labelledby="fd-user-dialog-title"
      onClose={onClose}
      onCancel={(e) => {
        if (pending) e.preventDefault()
      }}
    >
      <div className="fd-dialog-head">
        <div>
          <p className="fd-eyebrow">Manage user</p>
          <h2 id="fd-user-dialog-title" className="fd-dialog-title">
            {label}
            {user.isTester && <span className="fd-tag">Tester</span>}
          </h2>
          <p className="fd-user-email">{user.email}</p>
        </div>
        <button type="button" className="fd-dialog-close" onClick={() => dialogRef.current?.close()} disabled={pending} aria-label="Close">
          ×
        </button>
      </div>

      {step === 'view' && (
        <>
          <dl className="fd-dialog-facts">
            <div>
              <dt>Plan</dt>
              <dd>
                <Pill tone={hasPro ? 'info' : 'unknown'}>{PLAN_LABELS[user.plan]}</Pill>
                {user.proEndsAt && <span className="fd-cell-sub">Until {formatDate(user.proEndsAt)}</span>}
              </dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <Pill tone={STATUS_TONES[user.status]}>{STATUS_LABELS[user.status]}</Pill>
              </dd>
            </div>
            <div>
              <dt>Product updates</dt>
              <dd>
                <Pill tone={user.unsubscribed ? 'unknown' : 'ok'}>{user.unsubscribed ? 'Unsubscribed' : 'Subscribed'}</Pill>
              </dd>
            </div>
            <div>
              <dt>Signed up</dt>
              <dd>{formatDate(user.signedUpAt)}</dd>
            </div>
          </dl>

          <ActionResultNote result={result} />

          <section className="fd-dialog-section" aria-label="Pro access">
            {hasPro ? (
              <p className="fd-dialog-state">
                <strong>Already Pro.</strong> {PLAN_LABELS[user.plan]}
                {user.proEndsAt ? ` until ${formatDate(user.proEndsAt)}` : ''} — nothing to grant.
              </p>
            ) : (
              <button type="button" className="fd-btn fd-btn-action" onClick={() => goTo('grant')}>
                Grant Complimentary Pro
              </button>
            )}
          </section>

          <section className="fd-dialog-section fd-danger-zone" aria-label="Danger zone">
            {isFounder ? (
              <p className="fd-muted">This is the founder account. It cannot be deleted from Mission Control.</p>
            ) : (
              <>
                <p className="fd-muted">Permanently delete this account and its KlaroPH data.</p>
                <button type="button" className="fd-btn fd-btn-danger-ghost" onClick={() => goTo('delete')}>
                  Delete User
                </button>
              </>
            )}
          </section>
        </>
      )}

      {step === 'grant' && (
        <section className="fd-dialog-confirm" aria-labelledby="fd-grant-title">
          <h3 id="fd-grant-title" className="fd-dialog-subtitle">
            Grant Complimentary Pro?
          </h3>
          <UserIdentity label={label} email={user.email} />
          <p className="fd-dialog-copy">This will give this user Pro access without payment. It ends automatically and never charges them. They will get an email confirming it.</p>
          <label className="fd-field">
            <span className="fd-field-label">Length</span>
            <select className="fd-input" value={duration} onChange={(e) => setDuration(e.target.value as ComplimentaryDuration)} disabled={pending}>
              {(Object.keys(COMPLIMENTARY_DURATIONS) as ComplimentaryDuration[]).map((key) => (
                <option key={key} value={key}>
                  {COMPLIMENTARY_DURATIONS[key].label}
                </option>
              ))}
            </select>
          </label>
          <ActionResultNote result={result} />
          <div className="fd-dialog-actions">
            <button type="button" className="fd-btn fd-btn-ghost" onClick={() => goTo('view')} disabled={pending}>
              Cancel
            </button>
            <button type="button" className="fd-btn fd-btn-action" onClick={grant} disabled={pending}>
              {pending ? 'Granting…' : 'Grant Pro'}
            </button>
          </div>
        </section>
      )}

      {step === 'delete' && (
        <section className="fd-dialog-confirm fd-dialog-danger" aria-labelledby="fd-delete-title">
          <h3 id="fd-delete-title" className="fd-dialog-subtitle">
            Delete this user?
          </h3>
          <UserIdentity label={label} email={user.email} />
          <p className="fd-dialog-copy">
            This permanently deletes the user&apos;s KlaroPH account and associated application data — profile, plan, income, expenses,
            budgets, goals, Ask Klaro history, support requests and email preferences. It cannot be undone.
          </p>
          <label className="fd-field">
            <span className="fd-field-label">Type the user&apos;s email to confirm</span>
            <input
              className="fd-input"
              value={typedEmail}
              onChange={(e) => setTypedEmail(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder={user.email}
              disabled={pending}
            />
          </label>
          <label className="fd-field">
            <span className="fd-field-label">
              Type <strong>{DELETE_CONFIRMATION_PHRASE}</strong> to continue
            </span>
            <input className="fd-input" value={typedPhrase} onChange={(e) => setTypedPhrase(e.target.value)} autoComplete="off" spellCheck={false} disabled={pending} />
          </label>
          <ActionResultNote result={result} />
          <div className="fd-dialog-actions">
            <button type="button" className="fd-btn fd-btn-ghost" onClick={() => goTo('view')} disabled={pending}>
              Cancel
            </button>
            <button type="button" className="fd-btn fd-btn-danger" onClick={remove} disabled={pending || !deleteUnlocked}>
              {pending ? 'Deleting…' : 'Permanently Delete User'}
            </button>
          </div>
        </section>
      )}
    </dialog>
  )
}

function UserIdentity({ label, email }: { label: string; email: string }) {
  return (
    <div className="fd-dialog-identity">
      <span className="fd-user-name">{label}</span>
      <span className="fd-user-email">{email}</span>
    </div>
  )
}
