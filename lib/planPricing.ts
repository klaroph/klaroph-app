/**
 * Client-safe Pro display price (pesos).
 * Checkout amounts are computed server-side by getSubscriptionPricing.
 */

import { formatPeso } from '@/lib/format'

export const PRO_ONE_TIME_PESOS = 999

export const PRO_ONE_TIME_LINE =
  'Pay once. No subscription. Pro stays on your account for as long as KlaroPH runs.'

export function formatPlanPeso(n: number): string {
  return formatPeso(Math.round(n), 'en-PH')
}
