import { supabaseAdmin } from '@/lib/supabaseAdmin'

export type SubscriptionState = 'ACTIVE' | 'GRACE' | 'EXPIRED' | 'NONE'

export type NormalizedSubscription = {
  state: SubscriptionState
  planId: string | null
  currentPeriodEnd: Date | null
  graceUntil: Date | null
  autoRenew: boolean
}

const NONE_SUBSCRIPTION: NormalizedSubscription = {
  state: 'NONE',
  planId: null,
  currentPeriodEnd: null,
  graceUntil: null,
  autoRenew: false,
}

export async function resolveSubscriptionState(userId: string): Promise<NormalizedSubscription> {
  if (!userId) return NONE_SUBSCRIPTION

  try {
    const now = new Date()

    const { data, error } = await supabaseAdmin
      .from('subscriptions')
      .select('status, plan_id, current_period_end, grace_period_until, auto_renew')
      .eq('user_id', userId)
      .order('current_period_end', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error || !data) return NONE_SUBSCRIPTION

    const rawStatus = (data as { status?: string | null }).status ?? null
    const status = rawStatus ? rawStatus.toLowerCase() : null

    const rawCurrentPeriodEnd =
      (data as { current_period_end?: string | null }).current_period_end
    const currentPeriodEnd =
      rawCurrentPeriodEnd != null ? new Date(rawCurrentPeriodEnd) : null

    const rawGracePeriodUntil =
      (data as { grace_period_until?: string | null }).grace_period_until
    const graceUntil =
      rawGracePeriodUntil != null ? new Date(rawGracePeriodUntil) : null

    let state: SubscriptionState = 'NONE'

    if (!status) {
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
      planId: (data as { plan_id?: string | null }).plan_id ?? null,
      currentPeriodEnd,
      graceUntil,
      autoRenew: Boolean((data as { auto_renew?: boolean | null }).auto_renew),
    }
  } catch {
    return NONE_SUBSCRIPTION
  }
}

