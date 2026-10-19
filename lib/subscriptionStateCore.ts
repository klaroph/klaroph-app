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
 * Pro entitlement from a subscriptions row.
 * is_lifetime is Pro on its own: the period end is not read.
 * A row without that flag still uses its period (complimentary access, or a
 * monthly or annual row that has not bought the one-time plan yet).
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
  const isLifetime = data.is_lifetime === true

  let state: SubscriptionState = 'NONE'

  if (isLifetime) {
    state = 'ACTIVE'
  } else if (!status) {
    state = 'NONE'
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

/**
 * Only an existing lifetime row blocks another purchase.
 * An active monthly or annual period can still buy the one-time plan.
 */
export function shouldBlockNewProPurchase(sub: NormalizedSubscription): boolean {
  return sub.isLifetime
}
