/**
 * Server-only Pro price in centavos (PHP).
 * Retail is ₱999 once (99900). Testers (profiles.user_type = 'tester') pay ₱5 (500).
 * Never trust the request body for the amount or for user_type.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const PRO_PRICE_CENTAVOS = 99_900
export const TESTER_PRICE_CENTAVOS = 500

export type SubscriptionPricing = {
  amountCentavos: number
  /** True when profile.user_type is tester (₱5 / 500 centavos). */
  isTesterPricing: boolean
}

/**
 * Price for the authenticated user. Tester rows pay ₱5; everyone else pays ₱999.
 * A profile lookup failure charges the retail price.
 */
export async function getSubscriptionPricing(userId: string): Promise<SubscriptionPricing> {
  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('user_type')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    console.error('[getSubscriptionPricing]', error.message)
    return { amountCentavos: PRO_PRICE_CENTAVOS, isTesterPricing: false }
  }

  if (profile?.user_type === 'tester') {
    return { amountCentavos: TESTER_PRICE_CENTAVOS, isTesterPricing: true }
  }

  return { amountCentavos: PRO_PRICE_CENTAVOS, isTesterPricing: false }
}
