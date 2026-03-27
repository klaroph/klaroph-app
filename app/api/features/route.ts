import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { resolveUserPlanFromSubscription } from '@/lib/resolveUserPlan'
import { resolveSubscriptionState } from '@/lib/subscriptionState'
import { getBudgetEditingAllowed } from '@/lib/entitlements'
import { toLocalDateString } from '@/lib/format'
import type { UserFeaturesWithSubscription } from '@/types/features'

const FREE_ANALYTICS_DAYS = 90

function toFeaturesResponse(
  plan: Awaited<ReturnType<typeof resolveUserPlanFromSubscription>>,
  subscriptionStatus: string,
  currentPeriodEnd: string | null,
  isLifetime: boolean,
  planLabel: string,
  userCreatedAt: string | null | undefined,
  importCount: number
): UserFeaturesWithSubscription {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - FREE_ANALYTICS_DAYS)
  const analyticsCutoffDate = plan.plan_name === 'free' ? toLocalDateString(d) : null
  const has_budget_editing = getBudgetEditingAllowed(plan, userCreatedAt)
  return {
    plan_name: planLabel,
    max_goals: plan.max_goals,
    has_simulator: plan.plan_name === 'pro',
    has_scenarios: plan.plan_name === 'pro',
    has_smart_insights: plan.plan_name === 'pro',
    has_export: plan.export_enabled,
    has_analytics: plan.advanced_analytics,
    has_budget_editing,
    is_grace: plan.is_grace,
    can_create_goals: plan.can_create_goals,
    isPro: plan.plan_name === 'pro',
    isLifetime,
    subscriptionStatus,
    currentPeriodEnd,
    plan: planLabel,
    analyticsCutoffDate,
    import_used: importCount,
    import_limit: plan.plan_name === 'pro' ? null : 2,
  }
}

/** Safe FREE fallback when anything fails. Never throw. */
function freeFallback(): UserFeaturesWithSubscription {
  const d = new Date()
  d.setDate(d.getDate() - 90)
  return toFeaturesResponse(
    {
      plan_name: 'free',
      max_goals: 2,
      max_rows_per_tool: 300,
      export_enabled: false,
      advanced_analytics: false,
      full_budgeting_entitled: false,
      can_create_goals: true,
    },
    'none',
    null,
    false,
    'free',
    null,
    0
  )
}

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const sub = await resolveSubscriptionState(user.id)
    const plan = await resolveUserPlanFromSubscription(sub)
    const subscriptionStatus =
      sub.state === 'ACTIVE'
        ? 'active'
        : sub.state === 'GRACE'
          ? 'grace'
          : sub.state === 'EXPIRED'
            ? 'expired'
            : 'none'
    const currentPeriodEnd = sub.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null
    const isLifetime = sub.isLifetime === true

    const planLabel = plan.plan_name === 'pro' ? 'pro' : 'free'
    const userCreatedAt = (user as { created_at?: string }).created_at ?? null

    const { data: profile } = await supabase.from('profiles').select('import_count, simulate_budget_expired').eq('id', user.id).maybeSingle()
    const importCount = typeof (profile as { import_count?: number } | null)?.import_count === 'number' ? (profile as { import_count: number }).import_count : 0
    const simulateBudgetExpired = (profile as { simulate_budget_expired?: boolean } | null)?.simulate_budget_expired === true
    const effectiveCreatedAt = simulateBudgetExpired
      ? new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()
      : userCreatedAt

    const features = toFeaturesResponse(
      plan,
      subscriptionStatus,
      isLifetime ? null : currentPeriodEnd,
      isLifetime,
      planLabel,
      effectiveCreatedAt,
      importCount
    )
    return NextResponse.json(features, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
      },
    })
  } catch (e) {
    console.error('GET /api/features', e)
    return NextResponse.json(freeFallback())
  }
}
