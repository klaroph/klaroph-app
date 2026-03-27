/**
 * Server-only: subscription pricing in centavos (PHP).
 * Retail (verified): ₱99/mo → CLARITY_PREMIUM_MONTHLY_CENTAVOS=9900; ₱999/yr → CLARITY_PREMIUM_ANNUAL_CENTAVOS=99900.
 * NEXT_PUBLIC_*_PESOS stays 99 / 999 for UI only.
 *
 * Amounts are determined by the authenticated user's profile.user_type from the DB.
 * Never trust frontend or request body for user_type — always fetch server-side.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin'

const TESTER_CENTAVOS = 500 // ₱5 for internal testers

/**
 * If CLARITY_*_CENTAVOS is accidentally set to the same number as the public *pesos* display
 * (e.g. 999 for ₱999/year), treat it as pesos and convert to centavos (×100).
 * Otherwise ₱999/year becomes 999 centavos (₱9.99) and promos yield unusable PayMongo amounts.
 */
function normalizeCentavosVsPesosTypo(
  centavos: number,
  publicPesosHint: number
): number {
  if (
    centavos > 0 &&
    centavos === publicPesosHint &&
    centavos < 50_000 &&
    publicPesosHint >= 10
  ) {
    console.warn(
      '[getSubscriptionPricing] CLARITY_*_CENTAVOS matches NEXT_PUBLIC_*_PESOS; multiplying by 100 (centavos).'
    )
    return centavos * 100
  }
  return centavos
}

const HINT_MONTHLY_PESOS =
  Number(process.env.NEXT_PUBLIC_CLARITY_PREMIUM_MONTHLY_PESOS) || 99
const HINT_ANNUAL_PESOS =
  Number(process.env.NEXT_PUBLIC_CLARITY_PREMIUM_ANNUAL_PESOS) || 999

const PRODUCTION_MONTHLY_CENTAVOS = normalizeCentavosVsPesosTypo(
  Number(process.env.CLARITY_PREMIUM_MONTHLY_CENTAVOS) || 9900,
  HINT_MONTHLY_PESOS
)
const PRODUCTION_ANNUAL_CENTAVOS = normalizeCentavosVsPesosTypo(
  Number(process.env.CLARITY_PREMIUM_ANNUAL_CENTAVOS) || 99900,
  HINT_ANNUAL_PESOS
)

export type SubscriptionPricing = {
  monthlyCentavos: number
  annualCentavos: number
  /** True when profile.user_type is tester (₱5 / 500 centavos); promos can push totals below PayMongo minimum. */
  isTesterPricing: boolean
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
      isTesterPricing: false,
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
      isTesterPricing: true,
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
    isTesterPricing: false,
  }
}
