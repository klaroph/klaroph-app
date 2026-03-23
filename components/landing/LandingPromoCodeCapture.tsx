'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { KlaroPromoBundle } from '@/lib/klaroPromoStorage'
import { readKlaroPromo, writeKlaroPromo } from '@/lib/klaroPromoStorage'

const AUTO_HIDE_MS = 5200

const GENERIC_BANNER =
  '🎉 Promo unlocked! Sign up to claim your discount'

const CLAIM_SUFFIX = ' Create your account to claim it'

function formatPesoAmount(n: number) {
  return Math.round(n).toLocaleString('en-PH')
}

/** Priority: voucher `promo` (accurate) → parse `promoCode` → generic. */
function buildPromoBannerMessage(bundle: KlaroPromoBundle | null): string {
  if (!bundle?.promoCode) return GENERIC_BANNER

  const { promoCode, promo } = bundle

  if (promo) {
    if (promo.type === 'percentage') {
      return `🎉 ${promo.value}% OFF unlocked!${CLAIM_SUFFIX}`
    }
    if (promo.type === 'fixed') {
      return `🎉 ₱${formatPesoAmount(promo.value)} OFF unlocked!${CLAIM_SUFFIX}`
    }
  }

  const match = promoCode.match(/\d+/)
  if (!match) return GENERIC_BANNER

  // Pre-login: first number as % off. Codes with "%" use the same line; accurate ₱ fixed needs promo.type from redeem.
  return `🎉 ${match[0]}% OFF unlocked!${CLAIM_SUFFIX}`
}

function LandingPromoCodeCaptureInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const hasStored = useRef(false)
  const pathWhenStored = useRef<string | null>(null)

  const [showMessage, setShowMessage] = useState(false)
  const [bannerMessage, setBannerMessage] = useState('')

  useEffect(() => {
    if (hasStored.current) return
    const urlCode = searchParams.get('code')?.trim().toUpperCase() ?? ''
    if (!urlCode) return
    hasStored.current = true
    writeKlaroPromo({ promoCode: urlCode, promo: null })
    setBannerMessage(buildPromoBannerMessage(readKlaroPromo()))
    pathWhenStored.current = pathname || '/'
    router.replace(pathname || '/', { scroll: false })
    setShowMessage(true)
  }, [searchParams, router, pathname])

  useEffect(() => {
    if (!showMessage) return
    const t = window.setTimeout(() => setShowMessage(false), AUTO_HIDE_MS)
    return () => window.clearTimeout(t)
  }, [showMessage])

  useEffect(() => {
    if (!showMessage || pathWhenStored.current === null) return
    const current = pathname || '/'
    if (current !== pathWhenStored.current) {
      setShowMessage(false)
    }
  }, [pathname, showMessage])

  return (
    <>
      {showMessage && bannerMessage ? (
        <div className="promo-banner" role="status" aria-live="polite">
          {bannerMessage}
        </div>
      ) : null}
    </>
  )
}

/** Persists `?code=` for post-login upgrade; does not call redeem. */
export function LandingPromoCodeCapture() {
  return (
    <Suspense fallback={null}>
      <LandingPromoCodeCaptureInner />
    </Suspense>
  )
}
