/**
 * Server-only: resolve voucher by code for pricing. Does not trust client discount fields.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin'
import type { CheckoutPromo } from '@/lib/checkoutPromo'

export function parsePromoCodeFromBody(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw !== 'string') return null
  const s = raw.trim().toUpperCase()
  return s || null
}

export type AppliedPromoPayload = {
  code: string
  type: 'percentage' | 'fixed'
  value: number
}

/**
 * Looks up `vouchers` by normalized code. On any validation failure, returns null (caller charges full price).
 */
export async function resolveVoucherForCheckout(
  promoCode: string | null | undefined
): Promise<{ promo: CheckoutPromo; applied: AppliedPromoPayload } | null> {
  if (promoCode == null) return null
  const normalized = String(promoCode).trim().toUpperCase()
  if (!normalized) return null

  const { data, error } = await supabaseAdmin
    .from('vouchers')
    .select('code, type, value, is_active, expires_at, max_uses, used_count')
    .eq('code', normalized)
    .maybeSingle()

  if (error || !data) return null

  const row = data as {
    code: string
    type: string
    value: number
    is_active: boolean
    expires_at: string | null
    max_uses: number | null
    used_count: number
  }

  if (!row.is_active) return null

  if (row.expires_at != null) {
    const exp = new Date(row.expires_at)
    if (Number.isNaN(exp.getTime()) || exp <= new Date()) return null
  }

  if (row.max_uses != null) {
    const used = Number(row.used_count)
    const maxU = Number(row.max_uses)
    if (Number.isFinite(maxU) && Number.isFinite(used) && used >= maxU) return null
  }

  if (row.type !== 'percentage' && row.type !== 'fixed') return null

  const value = Number(row.value)
  if (!Number.isFinite(value) || value < 0) return null

  const type = row.type as 'percentage' | 'fixed'
  const promo: CheckoutPromo = { type, value }

  return {
    promo,
    applied: {
      code: row.code,
      type,
      value,
    },
  }
}
