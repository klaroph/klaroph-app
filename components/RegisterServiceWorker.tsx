'use client'

import { useEffect } from 'react'

/**
 * Registers the minimal service worker so Chrome can show the PWA install prompt.
 * Runs once on mount; safe to call on every page.
 */
export default function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
    window.navigator.serviceWorker.register('/sw.js').catch(() => {})
  }, [])
  return null
}
