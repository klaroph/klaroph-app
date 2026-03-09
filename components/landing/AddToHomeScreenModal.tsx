'use client'

import type { RefObject } from 'react'
import { useEffect, useState } from 'react'

export type BeforeInstallPromptEvent = Event & { prompt: () => Promise<{ outcome: string }> }

export default function AddToHomeScreenModal({
  isOpen,
  onClose,
  deferredPromptRef,
}: {
  isOpen: boolean
  onClose: () => void
  deferredPromptRef: RefObject<BeforeInstallPromptEvent | null>
}) {
  const [isIOS, setIsIOS] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    if (typeof navigator === 'undefined') return
    setIsIOS(/iPhone|iPad|iPod/i.test(navigator.userAgent))
    setIsStandalone(
      (window as Window & { standalone?: boolean }).standalone === true ||
      document.referrer.includes('android-app')
    )
  }, [])

  useEffect(() => {
    if (!isOpen) return
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onEscape)
    return () => document.removeEventListener('keydown', onEscape)
  }, [isOpen, onClose])

  const handleContinue = async () => {
    const prompt = deferredPromptRef?.current
    if (prompt?.prompt) {
      await prompt.prompt()
      onClose()
    } else {
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="pwa-cta-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pwa-cta-title"
      onClick={onClose}
    >
      <div className="pwa-cta-modal" onClick={(e) => e.stopPropagation()}>
        <h2 id="pwa-cta-title" className="pwa-cta-title">
          Add KlaroPH to your Home Screen
        </h2>
        <p className="pwa-cta-subtitle">
          Get app-like access for faster expense tracking, budgeting, and tools — no App Store download needed.
        </p>
        <div className="pwa-cta-icon-wrap">
          <img src="/icon-512.png" alt="" width={96} height={96} className="pwa-cta-icon" />
        </div>
        {isIOS && !isStandalone && (
          <div className="pwa-cta-instruction">
            <p className="pwa-cta-instruction-text">Tap <strong>Share</strong> → <strong>Add to Home Screen</strong></p>
          </div>
        )}
        <div className="pwa-cta-actions">
          <button type="button" className="pwa-cta-btn pwa-cta-primary" onClick={handleContinue}>
            Continue
          </button>
          <button type="button" className="pwa-cta-btn pwa-cta-secondary" onClick={onClose}>
            Maybe later
          </button>
        </div>
      </div>
    </div>
  )
}
