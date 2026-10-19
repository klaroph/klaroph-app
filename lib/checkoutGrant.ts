/**
 * Server-only checkout grant. The amount is decided here, then stored on the
 * PayMongo intent. The webhook grants only when the paid amount matches that
 * server price exactly.
 */

import { PRO_PRICE_CENTAVOS, TESTER_PRICE_CENTAVOS } from '@/lib/getSubscriptionPricing'

export type CheckoutGrant = 'lifetime'

export type ResolvedCheckoutGrant = {
  grant: CheckoutGrant
  amountCentavos: number
}

const SERVER_PRICES: readonly number[] = [PRO_PRICE_CENTAVOS, TESTER_PRICE_CENTAVOS]

export type WithholdReason = 'missing_metadata' | 'malformed_metadata' | 'amount_mismatch'

export type PaidGrantDecision =
  | { ok: true; grant: 'lifetime'; expectedAmountCentavos: number }
  | { ok: false; reason: WithholdReason }

/** `amountCentavos` must already be the server price from getSubscriptionPricing. */
export function resolveCheckoutGrant(amountCentavos: number): ResolvedCheckoutGrant {
  if (!SERVER_PRICES.includes(amountCentavos)) {
    throw new Error('Checkout amount is not the server price')
  }
  return { grant: 'lifetime', amountCentavos }
}

export function buildCheckoutMetadata(input: {
  userId: string
  expectedAmountCentavos: number
}): Record<string, string> {
  return {
    user_id: String(input.userId),
    plan: 'pro',
    grant: 'lifetime',
    expected_amount_centavos: String(input.expectedAmountCentavos),
  }
}

function parseExpectedCentavos(raw: unknown): number | null {
  if (typeof raw !== 'string' || !/^[1-9][0-9]*$/.test(raw)) return null
  const amount = Number(raw)
  if (!Number.isSafeInteger(amount)) return null
  return amount
}

/**
 * The stored expected amount is recomputed against the server prices.
 * Anything else is malformed. The paid amount must equal that price.
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
  if (grantRaw !== 'lifetime') {
    return { ok: false, reason: 'malformed_metadata' }
  }

  const storedExpected = parseExpectedCentavos(amountRaw)
  if (storedExpected == null || !SERVER_PRICES.includes(storedExpected)) {
    return { ok: false, reason: 'malformed_metadata' }
  }

  if (paidCentavos == null || paidCentavos !== storedExpected) {
    return { ok: false, reason: 'amount_mismatch' }
  }

  return { ok: true, grant: 'lifetime', expectedAmountCentavos: storedExpected }
}
