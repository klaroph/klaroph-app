'use client'

import Modal from '../ui/Modal'

const STORAGE_KEY = 'klaroph_onboarding_seen'

export function hasSeenOnboarding(): boolean {
  if (typeof window === 'undefined') return true
  return !!localStorage.getItem(STORAGE_KEY)
}

export function markOnboardingSeen(): void {
  if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, '1')
}

type HowKlaroPHWorksModalProps = {
  isOpen: boolean
  onClose: () => void
  /** When true, closing (or CTA) also marks onboarding as seen so it won't auto-show again. */
  markSeenOnAccept?: boolean
}

export default function HowKlaroPHWorksModal({
  isOpen,
  onClose,
  markSeenOnAccept = false,
}: HowKlaroPHWorksModalProps) {
  const handleAccept = () => {
    if (markSeenOnAccept) markOnboardingSeen()
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="How KlaroPH Works" contentMaxWidth={560}>
      <div className="onboarding-content">
        <section className="onboarding-section">
          <h4 className="onboarding-heading">The Purpose</h4>
          <p>
            KlaroPH exists to help Filipinos gain financial clarity and build discipline. It is not just a tracker—it is a <strong>savings-first</strong> system. You decide where your money goes before it slips away.
          </p>
        </section>

        <section className="onboarding-section">
          <h4 className="onboarding-heading">Savings Comes First</h4>
          <p>
            When you receive income, you allocate to your goals first. Goals may include your emergency fund, retirement fund, MP2, investments, stocks, business capital, or any future target. Savings is intentional. Savings is not leftover.
          </p>
        </section>

        <section className="onboarding-section">
          <h4 className="onboarding-heading">What Expenses Tracking Is For</h4>
          <p>
            Expenses are tracked from residual income. The purpose is to understand stability, observe spending habits, see needs vs wants, and identify areas for improvement. It is not about guilt—it is about clarity.
          </p>
        </section>

        <section className="onboarding-section">
          <h4 className="onboarding-heading">The Philosophy</h4>
          <p>
            Money without direction disappears. Money with direction builds freedom. Every peso should have a purpose.
          </p>
        </section>

        <div className="onboarding-actions">
          <button type="button" className="onboarding-cta" onClick={handleAccept}>
            I Understand — Let&apos;s Build
          </button>
          <button type="button" className="onboarding-close-link" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  )
}
