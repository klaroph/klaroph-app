/**
 * Client-only: persisted promo code (and optional redeemed voucher display) for checkout / QR.
 */

export const KLARO_PROMO_KEY = 'klaroPromo'

export type KlaroPromoBundle = {
  promoCode: string
  /** Null when code was saved pre-login / pre-redeem; set after successful redeem. */
  promo: { type: 'percentage' | 'fixed'; value: number } | null
}

export function readKlaroPromo(): KlaroPromoBundle | null {
  if (typeof window === 'undefined') return null
  try {
    const s = localStorage.getItem(KLARO_PROMO_KEY)
    if (!s) return null
    const p = JSON.parse(s) as unknown
    if (!p || typeof p !== 'object') return null
    const o = p as Record<string, unknown>
    if (typeof o.promoCode !== 'string') return null
    const code = o.promoCode.trim().toUpperCase()
    if (!code) return null

    if (o.promo === null || o.promo === undefined) {
      return { promoCode: code, promo: null }
    }

    if (typeof o.promo !== 'object') return null
    const pr = o.promo as Record<string, unknown>
    if (pr.type !== 'percentage' && pr.type !== 'fixed') return null
    const value = Number(pr.value)
    if (!Number.isFinite(value) || value < 0) return null
    return {
      promoCode: code,
      promo: { type: pr.type, value },
    }
  } catch {
    return null
  }
}

export function readKlaroPromoCode(): string | null {
  return readKlaroPromo()?.promoCode ?? null
}

export function writeKlaroPromo(bundle: KlaroPromoBundle) {
  if (typeof window === 'undefined') return
  localStorage.setItem(
    KLARO_PROMO_KEY,
    JSON.stringify({
      promoCode: bundle.promoCode.trim().toUpperCase(),
      promo: bundle.promo,
    })
  )
}

export function clearKlaroPromo() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(KLARO_PROMO_KEY)
}
