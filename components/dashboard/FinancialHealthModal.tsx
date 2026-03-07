'use client'

import { useState } from 'react'
import Modal from '../ui/Modal'
import FinancialSnapshotSection from './FinancialSnapshotSection'

type Props = {
  isOpen: boolean
  onClose: () => void
}

/** Rule-based financial health assessment from snapshot numbers. No external API. */
function getAssessmentText(assetsSum: number, liabilitiesSum: number, netWorth: number): string {
  if (assetsSum === 0 && liabilitiesSum === 0) {
    return "You haven't entered assets or liabilities yet. Use \"Manage assets & liabilities\" to add your numbers. Once you do, I can give you a clearer read on your financial health."
  }
  const ratio = liabilitiesSum > 0 ? assetsSum / liabilitiesSum : 2
  if (netWorth < 0) {
    return "Your liabilities currently exceed your assets. Focus on paying down high-interest debt first and building a small emergency fund. You're taking the right step by tracking — clarity is the first step to change."
  }
  if (netWorth === 0) {
    return "Your assets and liabilities are balanced. Next step: build a buffer. Even a small emergency fund (e.g. 1–2 months of expenses) will improve your financial resilience."
  }
  if (ratio < 1.5 && netWorth > 0) {
    return "You have positive net worth — good. Consider reducing liabilities or growing assets so your ratio improves. Aim for at least 3–6 months of expenses in liquid assets as an emergency fund."
  }
  if (netWorth > 0 && ratio >= 1.5) {
    return "Your financial position looks solid: positive net worth and a healthy assets-to-liabilities ratio. Keep building your emergency fund and goals. Review this snapshot regularly to stay on track."
  }
  return "You're building clarity. Keep updating your assets and liabilities so you can see progress over time. Small steps add up."
}

export default function FinancialHealthModal({ isOpen, onClose }: Props) {
  const [showAssessment, setShowAssessment] = useState(false)
  const [snapshotData, setSnapshotData] = useState<{ assetsSum: number; liabilitiesSum: number; net: number } | null>(null)

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Financial Health Check" contentMaxWidth={680}>
      <p style={{ margin: '0 0 16px', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        Update your assets and liabilities below so your snapshot is accurate. Then use the assessment to get a quick read on your financial health.
      </p>

      <FinancialSnapshotSection
        onDataChange={() => setSnapshotData(null)}
        onSnapshotTotals={(assetsSum, liabilitiesSum, net) =>
          setSnapshotData({ assetsSum, liabilitiesSum, net })
        }
      />

      <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
        <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
          Free assessment
        </p>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-secondary)' }}>
          Get a short, AI-style assessment of your financial health based on your current snapshot. Stay in this modal — no external services.
        </p>
        {!showAssessment ? (
          <button
            type="button"
            onClick={() => setShowAssessment(true)}
            style={{
              padding: '10px 18px',
              fontSize: 14,
              fontWeight: 500,
              border: 'none',
              borderRadius: 8,
              background: 'var(--color-primary)',
              color: '#fff',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Assess my financial health
          </button>
        ) : (
          <div className="health-assessment-panel">
            <AssessmentChat
              assetsSum={snapshotData?.assetsSum ?? 0}
              liabilitiesSum={snapshotData?.liabilitiesSum ?? 0}
              netWorth={snapshotData?.net ?? 0}
            />
          </div>
        )}
      </div>
    </Modal>
  )
}

function AssessmentChat({
  assetsSum,
  liabilitiesSum,
  netWorth,
}: {
  assetsSum: number
  liabilitiesSum: number
  netWorth: number
}) {
  const text = getAssessmentText(assetsSum, liabilitiesSum, netWorth)
  return (
    <div
      style={{
        padding: 16,
        background: 'var(--border-muted)',
        borderRadius: 8,
        border: '1px solid var(--border)',
      }}
    >
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Assessment</div>
      <p style={{ margin: 0, fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.6 }}>{text}</p>
    </div>
  )
}
