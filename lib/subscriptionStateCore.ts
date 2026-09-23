export type SubscriptionState = 'ACTIVE' | 'GRACE' | 'EXPIRED' | 'NONE'

export type NormalizedSubscription = {
  state: SubscriptionState
  planId: string | null
  currentPeriodEnd: Date | null
  graceUntil: Date | null
  autoRenew: boolean
  isLifetime: boolean
}

export const NONE_SUBSCRIPTION: NormalizedSubscription = {
  state: 'NONE',
  planId: null,
  currentPeriodEnd: null,
  graceUntil: null,
  autoRenew: false,
  isLifetime: false,
}

export type SubscriptionStateRow = {
  status?: string | null
  plan_id?: string | null
  current_period_end?: string | null
  grace_period_until?: string | null
  auto_renew?: boolean | null
  is_lifetime?: boolean | null
}

/**
 * Prepaid Pro entitlement from a subscriptions row.
 * Lifetime access is independent of current_period_end.
 * auto_renew is stored metadata only — it does not mean KlaroPH charges automatically.
 */
export function normalizeSubscriptionFromRow(
  data: SubscriptionStateRow | null | undefined,
  now: Date = new Date()
): NormalizedSubscription {
  if (!data) return NONE_SUBSCRIPTION

  const rawStatus = data.status ?? null
  const status = rawStatus ? rawStatus.toLowerCase() : null

  const rawCurrentPeriodEnd = data.current_period_end
  const currentPeriodEnd =
    rawCurrentPeriodEnd != null ? new Date(rawCurrentPeriodEnd) : null

  const rawGracePeriodUntil = data.grace_period_until
  const graceUntil =
    rawGracePeriodUntil != null ? new Date(rawGracePeriodUntil) : null
  const isLifetime = Boolean(data.is_lifetime)

  let state: SubscriptionState = 'NONE'

  if (!status) {
    state = 'NONE'
  } else if (status === 'active' && isLifetime) {
    state = 'ACTIVE'
  } else if (status === 'active' && currentPeriodEnd && currentPeriodEnd > now) {
    state = 'ACTIVE'
  } else if (status === 'past_due' && graceUntil && now < graceUntil) {
    state = 'GRACE'
  } else if (
    (status === 'active' && currentPeriodEnd && currentPeriodEnd <= now) ||
    status === 'expired' ||
    status === 'cancelled' ||
    status === 'canceled' ||
    (status === 'past_due' && (!graceUntil || now >= graceUntil))
  ) {
    state = 'EXPIRED'
  } else {
    state = 'NONE'
  }

  return {
    state,
    planId: data.plan_id ?? null,
    currentPeriodEnd,
    graceUntil,
    autoRenew: Boolean(data.auto_renew),
    isLifetime,
  }
}

export function isPremiumPlanName(planName: string | null | undefined): boolean {
  const name = (planName ?? '').trim().toLowerCase()
  return name === 'pro' || name === 'clarity_premium'
}

/** True when the user already has valid prepaid Pro (including lifetime and grace). */
export function shouldBlockNewProPurchase(
  sub: NormalizedSubscription,
  planName: string | null | undefined
): boolean {
  if (sub.state !== 'ACTIVE' && sub.state !== 'GRACE') return false
  if (planName == null || String(planName).trim() === '') return true
  return isPremiumPlanName(planName)
}
