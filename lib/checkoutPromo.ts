/**
 * Apply voucher promo to a base amount in centavos (PHP).
 * Fixed-type values are in pesos (same as voucher DB / upgrade UI).
 * Discount is applied at most once per call (single subtraction).
 */

export type CheckoutPromo = { type: 'percentage' | 'fixed'; value: number }

/**
 * @param baseCentavos - price from getSubscriptionPricing (e.g. 14900 = ₱149.00)
 * @param promo - from client; fixed.value is pesos off
 * @param context - label for server logs (which route called)
 */
export function applyPromoToCentavos(
  baseCentavos: number,
  promo: CheckoutPromo | null,
  context = 'applyPromoToCentavos'
): number {
  let discountCentavos = 0
  let finalCentavos: number

  if (!promo) {
    finalCentavos = baseCentavos
  } else if (promo.type === 'percentage') {
    const pct = Math.min(100, Math.max(0, promo.value))
    discountCentavos = Math.round(baseCentavos * (pct / 100))
    finalCentavos = Math.max(baseCentavos - discountCentavos, 0)
  } else {
    discountCentavos = Math.round(promo.value * 100)
    finalCentavos = Math.max(baseCentavos - discountCentavos, 0)
  }

  // Whole pesos only (nearest peso in centavos). Matches UpgradeModal / PaymentQRModal and scanner-facing amounts.
  if (finalCentavos > 0) {
    finalCentavos = Math.round(finalCentavos / 100) * 100
  }

  console.log('[CheckoutPromo]', context, {
    baseCentavos,
    basePesoApprox: (baseCentavos / 100).toFixed(2),
    'promo.type': promo?.type ?? null,
    'promo.value': promo?.value ?? null,
    discountCentavos,
    finalCentavos,
    finalPesoApprox: (finalCentavos / 100).toFixed(2),
    discountAppliedOnce: true,
  })

  if (baseCentavos > 0 && baseCentavos < 100) {
    console.warn(
      '[CheckoutPromo] baseCentavos < 100 — expected integer centavos (e.g. 14900 for ₱149). Check getSubscriptionPricing.',
      { context, baseCentavos }
    )
  }
  if (finalCentavos > 0 && finalCentavos < 100) {
    console.warn(
      '[CheckoutPromo] finalCentavos < 100 — below ₱1.00; gateways may reject or round.',
      { context, baseCentavos, discountCentavos, finalCentavos }
    )
  }

  return finalCentavos
}
