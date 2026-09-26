/**
 * Client-safe Pro display prices (pesos) for pricing cards and the upgrade modal.
 * Checkout amounts are always computed server-side by getSubscriptionPricing.
 */

import { formatPeso } from '@/lib/format'

export const PRO_MONTHLY_PESOS = Number(process.env.NEXT_PUBLIC_CLARITY_PREMIUM_MONTHLY_PESOS) || 99
export const PRO_ANNUAL_PESOS = Number(process.env.NEXT_PUBLIC_CLARITY_PREMIUM_ANNUAL_PESOS) || 999

export function formatPlanPeso(n: number): string {
  return formatPeso(Math.round(n), 'en-PH')
}
