/**
 * Best-effort voucher usage bump after PayMongo payment. Never throws.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin'

function extractPromoCode(metadata: Record<string, string>): string | null {
  const raw = metadata.promoCode ?? metadata.promo_code
  if (raw == null) return null
  const s = String(raw).trim().toUpperCase()
  return s || null
}

/**
 * Increments vouchers.used_count when metadata includes a non-empty promo code.
 * Failures are logged only; subscription fulfillment must not depend on this.
 */
export async function tryIncrementVoucherUsedCountFromMetadata(
  metadata: Record<string, string>
): Promise<void> {
  try {
    const code = extractPromoCode(metadata)
    if (!code) return

    const { error } = await supabaseAdmin.rpc('increment_voucher_used_count', {
      p_code: code,
    })
    if (error) {
      console.error('[Voucher] increment_voucher_used_count failed:', error.message)
    }
  } catch (e) {
    console.error('[Voucher] increment_voucher_used_count exception:', e)
  }
}
