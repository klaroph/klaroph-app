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
  const [isAndroid, setIsAndroid] = useState(false)
  const [isEdge, setIsEdge] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [showDesktopFallback, setShowDesktopFallback] = useState(false)

  useEffect(() => {
    if (typeof navigator === 'undefined') return
    const ua = navigator.userAgent
    setIsIOS(/iPhone|iPad|iPod/i.test(ua))
    setIsAndroid(/Android/i.test(ua))
    setIsEdge(/Edg/i.test(ua))
    setIsStandalone(
      (window as Window & { standalone?: boolean }).standalone === true ||
      document.referrer.includes('android-app')
    )
  }, [])

  useEffect(() => {
    if (!isOpen) return
    setShowDesktopFallback(false)
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onEscape)
    return () => document.removeEventListener('keydown', onEscape)
  }, [isOpen, onClose])

  const isDesktop = !isIOS && !isAndroid

  const handleContinue = async () => {
    const event = deferredPromptRef?.current
    if (event && typeof event.prompt === 'function') {
      await event.prompt()
      onClose()
    } else if (isDesktop) {
      setShowDesktopFallback(true)
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
          {isIOS ? 'Add KlaroPH manually' : isAndroid ? 'Add KlaroPH to your Home Screen' : 'Create a desktop shortcut'}
        </h2>
        {showDesktopFallback ? (
          <div className="pwa-cta-subtitle pwa-cta-desktop-fallback">
            <p>The install dialog wasn’t shown. You can create the shortcut manually:</p>
            <p className="pwa-cta-desktop-steps">
              {isEdge ? (
                <>Click the <strong>⋮ menu</strong> (top right) → <strong>More tools</strong> → <strong>Apps</strong> → <strong>Install this site as an app</strong>.</>
              ) : (
                <>Look for the <strong>Install</strong> or <strong>Install app</strong> icon in the address bar (quickest). Or: <strong>⋮ menu</strong> → <strong>Cast, save, and share</strong> → <strong>Install page as app…</strong></>
              )}
            </p>
          </div>
        ) : (
          <p className="pwa-cta-subtitle">
            Get app-like access for faster expense tracking, budgeting, and tools — no App Store download needed.
          </p>
        )}
        <div className="pwa-cta-icon-wrap">
          <img src="/icon-512.png" alt="" width={96} height={96} className="pwa-cta-icon" />
        </div>
        {isIOS && !isStandalone && (
          <div className="pwa-cta-instruction">
            <p className="pwa-cta-instruction-text">Tap <strong>Share</strong> → <strong>Add to Home Screen</strong></p>
          </div>
        )}
        <div className="pwa-cta-actions">
          {showDesktopFallback ? (
            <button type="button" className="pwa-cta-btn pwa-cta-primary" onClick={onClose}>
              Got it
            </button>
          ) : (
            <button type="button" className="pwa-cta-btn pwa-cta-primary" onClick={handleContinue}>
              Continue
            </button>
          )}
          <button type="button" className="pwa-cta-btn pwa-cta-secondary" onClick={onClose}>
            Maybe later
          </button>
        </div>
      </div>
    </div>
  )
}
