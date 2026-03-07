import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { resolveUserPlan } from '@/lib/resolveUserPlan'
import { resolveSubscriptionState } from '@/lib/subscriptionState'
import { getBudgetEditingAllowed } from '@/lib/entitlements'
import type { UserFeaturesWithSubscription } from '@/types/features'

const FREE_ANALYTICS_DAYS = 90

function toFeaturesResponse(
  plan: Awaited<ReturnType<typeof resolveUserPlan>>,
  subscriptionStatus: string,
  currentPeriodEnd: string | null,
  planLabel: string,
  userCreatedAt: string | null | undefined
): UserFeaturesWithSubscription {
  const d = new Date()
  d.setDate(d.getDate() - FREE_ANALYTICS_DAYS)
  const analyticsCutoffDate = plan.plan_name === 'free' ? d.toISOString().slice(0, 10) : null
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
    subscriptionStatus,
    currentPeriodEnd,
    plan: planLabel,
    analyticsCutoffDate,
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
      can_create_goals: true,
    },
    'none',
    null,
    'free'
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

    const plan = await resolveUserPlan(user.id)

    const sub = await resolveSubscriptionState(user.id)
    const subscriptionStatus =
      sub.state === 'ACTIVE'
        ? 'active'
        : sub.state === 'GRACE'
          ? 'grace'
          : sub.state === 'EXPIRED'
            ? 'expired'
            : 'none'
    const currentPeriodEnd = sub.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null

    const planLabel = plan.plan_name === 'pro' ? 'pro' : 'free'
    const userCreatedAt = (user as { created_at?: string }).created_at ?? null
    const features = toFeaturesResponse(
      plan,
      subscriptionStatus,
      currentPeriodEnd,
      planLabel,
      userCreatedAt
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
