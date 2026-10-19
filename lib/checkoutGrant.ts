/**
 * Server-only checkout grant. The amount and whether lifetime applies are decided here,
 * then stored on the PayMongo intent or session. The webhook verifies the paid amount
 * against that server decision and does not trust a typed promo code.
 */

import { applyPromoToCentavos, type CheckoutPromo } from '@/lib/checkoutPromo'
import { FOUNDER_FINAL_CENTAVOS, FOUNDER_PROMO_CODE } from '@/lib/founderPromo'

export type CheckoutGrant = 'lifetime' | 'monthly' | 'annual'
export type CheckoutPlanType = 'monthly' | 'annual'

export type ResolvedCheckoutGrant = {
  grant: CheckoutGrant
  amountCentavos: number
}

const GRANTS: readonly CheckoutGrant[] = ['lifetime', 'monthly', 'annual']

export type WithholdReason = 'missing_metadata' | 'malformed_metadata' | 'amount_mismatch'

export type PaidGrantDecision =
  | {
      ok: true
      grant: CheckoutGrant
      expectedAmountCentavos: number
      planType: CheckoutPlanType
    }
  | { ok: false; reason: WithholdReason }

function isCheckoutGrant(value: unknown): value is CheckoutGrant {
  return typeof value === 'string' && (GRANTS as readonly string[]).includes(value)
}

function planTypeForGrant(grant: CheckoutGrant, selected: CheckoutPlanType): CheckoutPlanType {
  switch (grant) {
    case 'lifetime':
      return selected
    case 'monthly':
      return 'monthly'
    case 'annual':
      return 'annual'
    default: {
      const unexpected: never = grant
      return unexpected
    }
  }
}

/**
 * Expected amount and grant for a checkout the server is about to create.
 * `appliedPromoCode` must be the voucher row's code after a successful lookup, never the raw body.
 * A founder code is a fixed final price. Every other applied voucher discounts the server base
 * (tester or retail) exactly once.
 */
export function resolveCheckoutGrant(params: {
  planType: CheckoutPlanType
  baseCentavos: number
  promo: CheckoutPromo | null
  appliedPromoCode: string | null
  context: string
}): ResolvedCheckoutGrant {
  const normalizedCode = (params.appliedPromoCode ?? '').trim().toUpperCase()
  if (normalizedCode === FOUNDER_PROMO_CODE) {
    console.log('[CheckoutPromo]', params.context, {
      mode: 'founder_final_price',
      baseCentavos: params.baseCentavos,
      finalCentavos: FOUNDER_FINAL_CENTAVOS,
      finalPesoApprox: (FOUNDER_FINAL_CENTAVOS / 100).toFixed(2),
    })
    return { grant: 'lifetime', amountCentavos: FOUNDER_FINAL_CENTAVOS }
  }

  return {
    grant: params.planType,
    amountCentavos: applyPromoToCentavos(params.baseCentavos, params.promo, params.context),
  }
}

export function buildCheckoutMetadata(input: {
  userId: string
  planType: CheckoutPlanType
  grant: CheckoutGrant
  expectedAmountCentavos: number
  appliedPromoCode: string | null
}): Record<string, string> {
  return {
    user_id: String(input.userId),
    plan: 'pro',
    plan_type: input.planType,
    grant: input.grant,
    expected_amount_centavos: String(input.expectedAmountCentavos),
    promoCode: input.appliedPromoCode ?? '',
  }
}

function parseExpectedCentavos(raw: unknown): number | null {
  if (typeof raw !== 'string' || !/^[1-9][0-9]*$/.test(raw)) return null
  const amount = Number(raw)
  if (!Number.isSafeInteger(amount)) return null
  return amount
}

/**
 * Read the server-set grant. Lifetime's expected amount is recomputed from the server
 * constant; a stored figure that disagrees is malformed. Monthly and annual amounts are
 * the integers this server wrote at checkout.
 */
export function verifyPaidGrant(
  metadata: Record<string, unknown> | null | undefined,
  paidCentavos: number | null
): PaidGrantDecision {
  if (metadata == null || typeof metadata !== 'object') {
    return { ok: false, reason: 'missing_metadata' }
  }

  const grantRaw = metadata.grant
  const amountRaw = metadata.expected_amount_centavos
  if (grantRaw == null || grantRaw === '' || amountRaw == null || amountRaw === '') {
    return { ok: false, reason: 'missing_metadata' }
  }
  if (!isCheckoutGrant(grantRaw)) {
    return { ok: false, reason: 'malformed_metadata' }
  }

  const storedExpected = parseExpectedCentavos(amountRaw)
  if (storedExpected == null) {
    return { ok: false, reason: 'malformed_metadata' }
  }

  const expectedAmountCentavos = grantRaw === 'lifetime' ? FOUNDER_FINAL_CENTAVOS : storedExpected
  if (grantRaw === 'lifetime' && storedExpected !== FOUNDER_FINAL_CENTAVOS) {
    return { ok: false, reason: 'malformed_metadata' }
  }

  if (paidCentavos == null || paidCentavos !== expectedAmountCentavos) {
    return { ok: false, reason: 'amount_mismatch' }
  }

  const selected: CheckoutPlanType = metadata.plan_type === 'annual' ? 'annual' : 'monthly'
  return {
    ok: true,
    grant: grantRaw,
    expectedAmountCentavos,
    planType: planTypeForGrant(grantRaw, selected),
  }
}
