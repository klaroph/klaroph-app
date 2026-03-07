import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveSubscriptionState } from '@/lib/subscriptionState'

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

export async function resolveUserPlan(userId: string): Promise<ResolvedPlan> {
  try {
    if (!userId) return FREE_PLAN

    const sub = await resolveSubscriptionState(userId)

    if (sub.state === 'NONE' || sub.state === 'EXPIRED' || !sub.planId) {
      return FREE_PLAN
    }

    const { data: planRow, error: planError } = await supabaseAdmin
      .from('plans')
      .select('id, name, max_goals, has_export, has_analytics, has_budgeting')
      .eq('id', sub.planId)
      .maybeSingle()

    if (planError) return FREE_PLAN

    const row = planRow as {
      id?: string
      name?: string
      max_goals?: number | null
      has_export?: boolean | null
      has_analytics?: boolean | null
      has_budgeting?: boolean | null
    } | null

    const planName = String(row?.name ?? 'free').trim().toLowerCase()
    const isProPlan = planName === 'pro' || planName === 'clarity_premium'

    if (!isProPlan) return FREE_PLAN

    const maxGoals = typeof row?.max_goals === 'number' ? row.max_goals : PRO_PLAN_BASE.max_goals
    const exportEnabled =
      typeof row?.has_export === 'boolean' ? row.has_export : PRO_PLAN_BASE.export_enabled
    const advancedAnalytics =
      typeof row?.has_analytics === 'boolean' ? row.has_analytics : PRO_PLAN_BASE.advanced_analytics
    const fullBudgetingEntitled =
      typeof row?.has_budgeting === 'boolean' ? row.has_budgeting : PRO_PLAN_BASE.full_budgeting_entitled

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
