/**
 * Apply voucher promo to a base amount in centavos (PHP).
 * Fixed-type values are in pesos (same as voucher DB / upgrade UI).
 */

export type CheckoutPromo = { type: 'percentage' | 'fixed'; value: number }

/**
 * @param baseCentavos - price from getSubscriptionPricing
 * @param promo - from client; fixed.value is pesos off
 */
export function applyPromoToCentavos(baseCentavos: number, promo: CheckoutPromo | null): number {
  if (!promo) return baseCentavos
  if (promo.type === 'percentage') {
    const pct = Math.min(100, Math.max(0, promo.value))
    const discount = Math.round(baseCentavos * (pct / 100))
    return Math.max(baseCentavos - discount, 0)
  }
  const discountCentavos = Math.round(promo.value * 100)
  return Math.max(baseCentavos - discountCentavos, 0)
}
