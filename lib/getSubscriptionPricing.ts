/**
 * Server-only: subscription pricing in centavos (PHP).
 * Amounts are determined by the authenticated user's profile.user_type from the DB.
 * Never trust frontend or request body for user_type — always fetch server-side.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin'

const TESTER_CENTAVOS = 500 // ₱5 for internal testers

const PRODUCTION_MONTHLY_CENTAVOS = Number(
  process.env.CLARITY_PREMIUM_MONTHLY_CENTAVOS
) || 14900
const PRODUCTION_ANNUAL_CENTAVOS = Number(
  process.env.CLARITY_PREMIUM_ANNUAL_CENTAVOS
) || 143000

export type SubscriptionPricing = {
  monthlyCentavos: number
  annualCentavos: number
}

/**
 * Returns subscription amounts in centavos for the given user.
 * Fetches profile.user_type from DB; tester gets ₱5 (500 centavos), else production env.
 * Call only from server (PayMongo amount creation). Do not pass user_type from request.
 */
export async function getSubscriptionPricing(
  userId: string
): Promise<SubscriptionPricing> {
  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('user_type')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    console.error('[getSubscriptionPricing]', error.message)
    if (process.env.NODE_ENV === 'development') {
      console.log(
        '[user pricing] user_id=%s user_type=fallback monthly=%s annual=%s',
        userId,
        PRODUCTION_MONTHLY_CENTAVOS,
        PRODUCTION_ANNUAL_CENTAVOS
      )
    }
    return {
      monthlyCentavos: PRODUCTION_MONTHLY_CENTAVOS,
      annualCentavos: PRODUCTION_ANNUAL_CENTAVOS,
    }
  }

  const userType = profile?.user_type === 'tester' ? 'tester' : 'user'
  if (userType === 'tester') {
    if (process.env.NODE_ENV === 'development') {
      console.log(
        '[user pricing] user_id=%s user_type=tester monthly=500 annual=500',
        userId
      )
    }
    return {
      monthlyCentavos: TESTER_CENTAVOS,
      annualCentavos: TESTER_CENTAVOS,
    }
  }

  if (process.env.NODE_ENV === 'development') {
    console.log(
      '[user pricing] user_id=%s user_type=user monthly=%s annual=%s',
      userId,
      PRODUCTION_MONTHLY_CENTAVOS,
      PRODUCTION_ANNUAL_CENTAVOS
    )
  }
  return {
    monthlyCentavos: PRODUCTION_MONTHLY_CENTAVOS,
    annualCentavos: PRODUCTION_ANNUAL_CENTAVOS,
  }
}
