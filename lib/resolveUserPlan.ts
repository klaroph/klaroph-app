import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveSubscriptionState } from '@/lib/subscriptionState'
import type { NormalizedSubscription } from '@/lib/subscriptionState'

/**
 * Single source of truth for plan entitlements used by API routes.
 * FREE: 2 goals, 90-day analytics, no export, basic charts; budgeting only first 30 days (see entitlements.ts).
 * PRO:  20 goals, unlimited history, export, advanced charts, full budgeting always.
 */
export type ResolvedPlan = {
  plan_name: 'free' | 'pro'
  max_goals: number
  max_rows_per_tool: number
  export_enabled: boolean
  advanced_analytics: boolean
  /** From plans.has_budgeting: plan includes full budgeting (no time limit). Used with 30-day free rule in entitlements. */
  full_budgeting_entitled: boolean
  /** True when in 3-day grace (payment failed); full access but cannot create goals */
  is_grace?: boolean
  /** False when is_grace or at goal limit */
  can_create_goals: boolean
}

const FREE_PLAN: ResolvedPlan = {
  plan_name: 'free',
  max_goals: 2,
  max_rows_per_tool: 300,
  export_enabled: false,
  advanced_analytics: false,
  full_budgeting_entitled: false,
  is_grace: false,
  can_create_goals: true,
}

const PRO_PLAN_BASE: Omit<ResolvedPlan, 'is_grace' | 'can_create_goals'> = {
  plan_name: 'pro',
  max_goals: 20,
  max_rows_per_tool: Number.MAX_SAFE_INTEGER,
  export_enabled: true,
  advanced_analytics: true,
  full_budgeting_entitled: true,
}

/**
 * Derives plan from already-resolved subscription state (avoids duplicate subscription query).
 * Use when the caller has already called resolveSubscriptionState.
 */
export async function resolveUserPlanFromSubscription(sub: NormalizedSubscription): Promise<ResolvedPlan> {
  try {
    if (sub.state === 'NONE' || sub.state === 'EXPIRED' || !sub.planId) {
      return FREE_PLAN
    }
    const planRow = await getPlanRow(sub.planId)
    if (!planRow) return FREE_PLAN
    const planName = String(planRow?.name ?? 'free').trim().toLowerCase()
    const isProPlan = planName === 'pro' || planName === 'clarity_premium'
    if (!isProPlan) return FREE_PLAN
    const maxGoals = typeof planRow?.max_goals === 'number' ? planRow.max_goals : PRO_PLAN_BASE.max_goals
    const exportEnabled =
      typeof planRow?.has_export === 'boolean' ? planRow.has_export : PRO_PLAN_BASE.export_enabled
    const advancedAnalytics =
      typeof planRow?.has_analytics === 'boolean' ? planRow.has_analytics : PRO_PLAN_BASE.advanced_analytics
    const fullBudgetingEntitled =
      typeof planRow?.has_budgeting === 'boolean' ? planRow.has_budgeting : PRO_PLAN_BASE.full_budgeting_entitled
    return {
      plan_name: 'pro',
      max_goals: maxGoals,
      max_rows_per_tool: PRO_PLAN_BASE.max_rows_per_tool,
      export_enabled: exportEnabled,
      advanced_analytics: advancedAnalytics,
      full_budgeting_entitled: fullBudgetingEntitled,
      is_grace: sub.state === 'GRACE',
      can_create_goals: sub.state !== 'GRACE',
    }
  } catch {
    return FREE_PLAN
  }
}

async function getPlanRow(planId: string) {
  const { data: planRow, error: planError } = await supabaseAdmin
    .from('plans')
    .select('id, name, max_goals, has_export, has_analytics, has_budgeting')
    .eq('id', planId)
    .maybeSingle()
  if (planError) return null
  return planRow as {
    id?: string
    name?: string
    max_goals?: number | null
    has_export?: boolean | null
    has_analytics?: boolean | null
    has_budgeting?: boolean | null
  } | null
}

export async function resolveUserPlan(userId: string): Promise<ResolvedPlan> {
  if (!userId) return FREE_PLAN
  const sub = await resolveSubscriptionState(userId)
  return resolveUserPlanFromSubscription(sub)
}
