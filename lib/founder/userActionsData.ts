/**
 * Server-only Supabase access for founder user actions (service role).
 * The account, its email and its subscription are always read here — never taken from the browser.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin'
import type { TargetSubscription, UserActionStore } from '@/lib/founder/userActions'

const SUBSCRIPTION_FIELDS =
  'id, user_id, plan_id, status, current_period_end, grace_period_until, auto_renew, is_lifetime, payment_provider, plan_type, plan:plans(name)'
const UNIQUE_VIOLATION = '23505'
/** user_id columns without a foreign key to auth.users (audited), so the auth-user cascade cannot reach them. */
const UNLINKED_USER_TABLES = ['premium_confirmation_emails'] as const

type SubscriptionRow = Omit<TargetSubscription, 'plan_name'> & { plan: { name: string } | null }

export const supabaseUserActionStore: UserActionStore = {
  async getAccount(userId) {
    const { data: auth, error: authError } = await supabaseAdmin.auth.admin.getUserById(userId)
    if (authError && authError.status !== 404) throw new Error(`auth user: ${authError.message}`)
    if (!auth?.user) return null

    const [profile, subscription] = await Promise.all([
      supabaseAdmin.from('profiles').select('nickname, full_name').eq('id', userId).maybeSingle(),
      supabaseAdmin.from('subscriptions').select(SUBSCRIPTION_FIELDS).eq('user_id', userId).maybeSingle(),
    ])
    if (profile.error) throw new Error(`profiles: ${profile.error.message}`)
    if (subscription.error) throw new Error(`subscriptions: ${subscription.error.message}`)

    const sub = subscription.data as unknown as SubscriptionRow | null
    const names = profile.data as { nickname: string | null; full_name: string | null } | null
    return {
      id: auth.user.id,
      email: auth.user.email ?? null,
      nickname: names?.nickname ?? null,
      full_name: names?.full_name ?? null,
      subscription: sub ? { ...sub, plan_name: sub.plan?.name ?? null } : null,
    }
  },

  async getProPlanId() {
    const { data, error } = await supabaseAdmin.from('plans').select('id').eq('name', 'pro').single()
    if (error || !data) throw new Error(`plans: ${error?.message ?? 'pro plan missing'}`)
    return data.id as string
  },

  async applyGrant(userId, expected, row) {
    if (!expected) {
      const { error } = await supabaseAdmin.from('subscriptions').insert({ user_id: userId, ...row })
      if (!error) return 'applied'
      if (error.code === UNIQUE_VIOLATION) return 'conflict'
      throw new Error(`subscriptions: ${error.message}`)
    }
    const { data, error } = await supabaseAdmin
      .from('subscriptions')
      .update(row)
      .eq('id', expected.id)
      .eq('user_id', userId)
      .eq('plan_id', expected.plan_id)
      .eq('status', expected.status ?? '')
      .eq('current_period_end', expected.current_period_end ?? '')
      .select('id')
    if (error) throw new Error(`subscriptions: ${error.message}`)
    return (data ?? []).length === 1 ? 'applied' : 'conflict'
  },

  async deleteUnlinkedRows(userId) {
    for (const table of UNLINKED_USER_TABLES) {
      const { error } = await supabaseAdmin.from(table).delete().eq('user_id', userId)
      if (error) throw new Error(`${table}: ${error.message}`)
    }
  },

  async deleteAuthUser(userId) {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (error) throw new Error(`auth user: ${error.message}`)
  },
}
