import { supabaseAdmin } from './supabaseAdmin'
import {
  NONE_SUBSCRIPTION,
  normalizeSubscriptionFromRow,
  type NormalizedSubscription,
  type SubscriptionState,
} from './subscriptionStateCore'

export type { NormalizedSubscription, SubscriptionState }
export { NONE_SUBSCRIPTION, normalizeSubscriptionFromRow } from '@/lib/subscriptionStateCore'

export async function resolveSubscriptionState(userId: string): Promise<NormalizedSubscription> {
  if (!userId) return NONE_SUBSCRIPTION

  try {
    const { data, error } = await supabaseAdmin
      .from('subscriptions')
      .select('status, plan_id, current_period_end, grace_period_until, auto_renew, is_lifetime')
      .eq('user_id', userId)
      .order('current_period_end', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error || !data) return NONE_SUBSCRIPTION

    return normalizeSubscriptionFromRow(data)
  } catch {
    return NONE_SUBSCRIPTION
  }
}
