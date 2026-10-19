/**
 * Client-safe Pro display price (pesos) for the upgrade screens.
 * Checkout amounts are computed server-side by getSubscriptionPricing.
 *
 * PRO_MONTHLY_PESOS and PRO_ANNUAL_PESOS remain for the public pricing pages.
 * Those pages change in a later pass. Buying screens use PRO_ONE_TIME_PESOS.
 */

import { formatPeso } from '@/lib/format'

export const PRO_ONE_TIME_PESOS = 999

export const PRO_ONE_TIME_LINE =
  'Pay once. No subscription. Pro stays on your account for as long as KlaroPH runs.'

export const PRO_MONTHLY_PESOS = Number(process.env.NEXT_PUBLIC_CLARITY_PREMIUM_MONTHLY_PESOS) || 99
export const PRO_ANNUAL_PESOS = Number(process.env.NEXT_PUBLIC_CLARITY_PREMIUM_ANNUAL_PESOS) || 999

export function formatPlanPeso(n: number): string {
  return formatPeso(Math.round(n), 'en-PH')
}
