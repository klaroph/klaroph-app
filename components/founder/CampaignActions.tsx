'use client'

import { useState, useTransition } from 'react'
import { sendCampaignAction, sendTestEmailAction, type CampaignActionState } from '@/app/admin/founder/marketing/actions'

type Segment = 'all' | 'active' | 'dormant'
const SEGMENT_LABELS: Record<Segment, string> = { all: 'All', active: 'Active (30 days)', dormant: 'Dormant' }

export default function CampaignActions({
  campaignId,
  campaignName,
  eligible,
  sendsEnabled,
  testEmailConfigured,
  deliveryConfigured,
}: {
  campaignId: string
  campaignName: string
  eligible: Record<Segment, number>
  sendsEnabled: boolean
  testEmailConfigured: boolean
  deliveryConfigured: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<CampaignActionState | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [segment, setSegment] = useState<Segment>('all')
  const [typedId, setTypedId] = useState('')

  const count = eligible[segment]
  const canSend = sendsEnabled && deliveryConfigured && count > 0
  const hasEligible = eligible.all > 0

  const run = (action: () => Promise<CampaignActionState>) =>
    startTransition(async () => {
      setResult(null)
      const state = await action()
      setResult(state)
      if (state.ok) {
        setConfirming(false)
        setTypedId('')
      }
    })

  return (
    <div className="fd-campaign-actions">
      <div className="fd-actions-row">
        <a href={`/admin/founder/marketing/${campaignId}/preview`} target="_blank" rel="noreferrer" className="fd-btn fd-btn-ghost">
          Preview
        </a>
        <button
          type="button"
          className="fd-btn fd-btn-ghost"
          disabled={pending || !testEmailConfigured || !deliveryConfigured}
          title={!testEmailConfigured ? 'MARKETING_TEST_EMAIL is not configured' : undefined}
          onClick={() => run(() => sendTestEmailAction(campaignId))}
        >
          Send test
        </button>
        {hasEligible && !confirming && (
          <button type="button" className="fd-btn fd-btn-action" disabled={pending} onClick={() => setConfirming(true)}>
            Send campaign
          </button>
        )}
      </div>

      {confirming && (
        <div className="fd-confirm" role="group" aria-label="Confirm campaign send">
          <label className="fd-field">
            <span className="fd-field-label">Audience</span>
            <select className="fd-input" value={segment} onChange={(e) => setSegment(e.target.value as Segment)} disabled={pending}>
              {(Object.keys(SEGMENT_LABELS) as Segment[]).map((s) => (
                <option key={s} value={s}>
                  {SEGMENT_LABELS[s]} · {eligible[s]} eligible
                </option>
              ))}
            </select>
          </label>
          <label className="fd-field">
            <span className="fd-field-label">
              Type <code>{campaignId}</code> to confirm
            </span>
            <input className="fd-input" value={typedId} onChange={(e) => setTypedId(e.target.value)} autoComplete="off" disabled={pending} />
          </label>
          {!sendsEnabled && (
            <p className="fd-confirm-note">Sends are disabled. Set MARKETING_CAMPAIGN_SENDS_ENABLED=true in Vercel to launch.</p>
          )}
          <div className="fd-actions-row">
            <button
              type="button"
              className="fd-btn fd-btn-action"
              disabled={pending || !canSend || typedId !== campaignId}
              onClick={() =>
                run(() =>
                  sendCampaignAction(campaignId, { segment, confirmCampaignId: typedId, expectedRecipientCount: count })
                )
              }
            >
              {pending ? 'Sending…' : `Send ${campaignName} to ${count} ${count === 1 ? 'user' : 'users'}`}
            </button>
            <button type="button" className="fd-btn fd-btn-ghost" disabled={pending} onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {result && (
        <p className={`fd-action-result${result.ok ? ' is-ok' : ' is-error'}`} role="status">
          {result.message}
        </p>
      )}
    </div>
  )
}
