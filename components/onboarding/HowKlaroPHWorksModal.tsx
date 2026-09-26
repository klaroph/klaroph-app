'use client'

import type { CSSProperties, ReactNode } from 'react'
import Image from 'next/image'
import Modal from '../ui/Modal'
import { KLARO_ICONS, KlaroFlow, PrincipleCard, type KlaroTone } from '../brand/KlaroBrand'
import handMark from '@/public/logo-klaroph-hand.png'

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
}

const PRINCIPLES: { tone: KlaroTone; title: string; copy: string; icon: ReactNode }[] = [
  {
    tone: 'sky',
    title: 'Start With Clarity',
    copy: 'KlaroPH helps you see where your money is going, what you can safely spend, and what you’re building toward. Your income, expenses, budget, and goals work together so you can make clearer decisions.',
    icon: KLARO_ICONS.clarity,
  },
  {
    tone: 'sun',
    title: 'Give Every Peso a Purpose',
    copy: 'When income comes in, decide what matters first. Build your emergency fund, save for a goal, invest, or set aside money for something important to you. KlaroPH helps turn intentions into a plan.',
    icon: KLARO_ICONS.purpose,
  },
  {
    tone: 'lavender',
    title: 'Track Without the Guilt',
    copy: 'Expenses aren’t about judging every purchase. They’re there to help you understand your habits, spot patterns, and see whether your spending is supporting the things that matter to you.',
    icon: KLARO_ICONS.spend,
  },
  {
    tone: 'mint',
    title: 'Build Momentum',
    copy: 'Good finances aren’t built in one perfect month. KlaroPH helps you see your progress over time — from staying within your budget to reaching goals and building financial health.',
    icon: KLARO_ICONS.grow,
  },
]

export default function HowKlaroPHWorksModal({ isOpen, onClose }: HowKlaroPHWorksModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="How KlaroPH Works" contentMaxWidth={720}>
      <div className="onboarding-scroll">
        <header className="onboarding-hero klaro-sun">
          <Image src={handMark} alt="" width={36} height={36} className="onboarding-hero-mark" />
          <div>
            <h4 className="onboarding-hero-title">Your money, made Klaro.</h4>
            <p className="onboarding-hero-lead">Here&apos;s the simple idea behind KlaroPH.</p>
          </div>
        </header>

        <ul className="onboarding-principles">
          {PRINCIPLES.map((p, i) => (
            <PrincipleCard key={p.title} {...p} heading="h5" style={{ '--i': i } as CSSProperties} />
          ))}
        </ul>

        <KlaroFlow className="onboarding-flow" />
      </div>

      <div className="onboarding-actions">
        <button type="button" className="klaro-upgrade-cta onboarding-cta" onClick={onClose}>
          Let&apos;s Get Klaro <span aria-hidden>→</span>
        </button>
        <button type="button" className="onboarding-close-link" onClick={onClose}>
          Maybe later
        </button>
      </div>
    </Modal>
  )
}
