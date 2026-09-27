'use client'

import { useState, useTransition } from 'react'
import { sendEmailSampleAction } from '@/app/admin/founder/marketing/actions'
import { ActionResultNote, type ActionResult } from '@/components/founder/DockUI'

const SAMPLES = [
  { kind: 'paid', label: 'Paid Pro' },
  { kind: 'complimentary', label: 'Complimentary Pro' },
  { kind: 'founder-report', label: 'Founder report' },
  { kind: 'support-alert', label: 'Support alert' },
  { kind: 'payment-received', label: 'Payment received' },
  { kind: 'payment-failed', label: 'Payment failed' },
] as const

export default function EmailSamples({ testEmailConfigured }: { testEmailConfigured: boolean }) {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<ActionResult | null>(null)

  return (
    <div className="fd-card">
      <div className="fd-actions-row">
        {SAMPLES.map((sample) => (
          <button
            key={sample.kind}
            type="button"
            className="fd-btn fd-btn-ghost"
            disabled={pending || !testEmailConfigured}
            title={!testEmailConfigured ? 'MARKETING_TEST_EMAIL is not configured' : undefined}
            onClick={() =>
              startTransition(async () => {
                setResult(null)
                setResult(await sendEmailSampleAction(sample.kind))
              })
            }
          >
            {sample.label}
          </button>
        ))}
      </div>
      <ActionResultNote result={result} />
    </div>
  )
}
