/**
 * Client-only: persisted promo code (and optional redeemed voucher display) for checkout / QR.
 */

export const KLARO_PROMO_KEY = 'klaroPromo'

export type KlaroPromoVoucher = {
  type: 'percentage' | 'fixed'
  value: number
  /**
   * Server validate result. `lifetime` is a fixed final price.
   * Undefined means a legacy stored promo that should be validated again.
   */
  offer?: 'lifetime' | null
  finalPesos?: number | null
}

export type KlaroPromoBundle = {
  promoCode: string
  /** Null when code was saved pre-login / pre-redeem; set after successful redeem. */
  promo: KlaroPromoVoucher | null
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

    const hasOffer = Object.prototype.hasOwnProperty.call(pr, 'offer')
    const offer = pr.offer === 'lifetime' ? 'lifetime' : null
    const finalPesosRaw = Number(pr.finalPesos)
    const finalPesos =
      offer === 'lifetime' && Number.isFinite(finalPesosRaw) && finalPesosRaw > 0 ? finalPesosRaw : null

    return {
      promoCode: code,
      promo: hasOffer
        ? { type: pr.type, value, offer, finalPesos }
        : { type: pr.type, value },
    }
  } catch {
    return null
  }
}

export function readKlaroPromoCode(): string | null {
  return readKlaroPromo()?.promoCode ?? null
}

function storedPromo(promo: KlaroPromoVoucher) {
  const stored: {
    type: KlaroPromoVoucher['type']
    value: number
    offer?: 'lifetime' | null
    finalPesos?: number | null
  } = { type: promo.type, value: promo.value }
  if (promo.offer === undefined) return stored
  stored.offer = promo.offer === 'lifetime' ? 'lifetime' : null
  stored.finalPesos = promo.offer === 'lifetime' ? promo.finalPesos ?? null : null
  return stored
}

export function writeKlaroPromo(bundle: KlaroPromoBundle) {
  if (typeof window === 'undefined') return
  localStorage.setItem(
    KLARO_PROMO_KEY,
    JSON.stringify({
      promoCode: bundle.promoCode.trim().toUpperCase(),
      promo: bundle.promo ? storedPromo(bundle.promo) : null,
    })
  )
}

export function clearKlaroPromo() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(KLARO_PROMO_KEY)
}
