/**
 * Free-plan goal cap.
 *
 * Source of truth on the server:
 * - `plans` seed `name = 'free'` sets `max_goals = 2`
 *   (supabase/migrations/20250225000000_klaroph_plans_subscriptions_profiles.sql)
 * - `enforce_goal_plan_limit` defaults `v_max_goals` to 2 when there is no
 *   active Pro / lifetime subscription
 *   (supabase/migrations/20261019120000_exclude_soft_deleted_reads.sql)
 * - trigger `goals_enforce_plan_limit` is the only insert limit in production
 *
 * `max_rows_per_tool` (300) is not an insert trigger. The device does not cap
 * expenses or other rows at 300.
 *
 * Local-only mode has no subscription row, so the trigger uses the free
 * default once the goals are uploaded. Stay at or under it before sign-in.
 */
export const FREE_PLAN_MAX_GOALS = 2

export const GOAL_LIMIT_REACHED = 'GOAL_LIMIT_REACHED'

/** Server trigger `enforce_goal_plan_limit` raises this while a subscription is past due and still in grace. */
export const GOAL_CREATION_GRACE = 'GOAL_CREATION_GRACE'

export const GOAL_GRACE_BLOCK_MESSAGE = 'Your Pro payment is past due. Update it to add goals.'

/** Cap the caller resolved for this account. Free display copy uses the name "Free". */
export type ResolvedPlanCap = {
  name: string
  maxGoals: number
  /**
   * Past-due grace. `maxGoals` is 0 for new inserts. Edits and deletes of
   * goals the server has already acknowledged are not capped by this flag.
   */
  blocksNewGoals?: boolean
}

export const FREE_PLAN_CAP: ResolvedPlanCap = {
  name: 'Free',
  maxGoals: FREE_PLAN_MAX_GOALS,
}

export const FREE_GOAL_CAP_MESSAGE = "You've reached 2 goals on Free. Upgrade to Pro for up to 20."

export const PRO_GOAL_CAP_MESSAGE = "You've reached the 20-goal limit."

/** On-screen cap. Never includes the column name `max_goals`. */
export function goalCapMessage(plan: { name: string } | null | undefined): string {
  if (plan && plan.name.trim().toLowerCase() !== 'free') return PRO_GOAL_CAP_MESSAGE
  return FREE_GOAL_CAP_MESSAGE
}

const PREMIUM_PLAN_NAMES = new Set(['pro', 'clarity_premium'])

/**
 * `enforce_goal_plan_limit` uses `COALESCE(plans.max_goals, 20)` after it has
 * already chosen a pro or clarity_premium row. The seeded rows are 20
 * (supabase/migrations/20260308000000_plans_has_budgeting.sql). This is only
 * the null fallback from that trigger, not a second cap.
 */
const PREMIUM_MAX_GOALS_WHEN_NULL = 20

/** One `plans` row, as readable by `authenticated` (`plans_select_all`). */
export type PlanConfig = {
  id: string
  name: string
  maxGoals: number | null
  /** `plans.has_budgeting`. Null when the column was not in the payload. */
  hasBudgeting: boolean | null
}

/** One `subscriptions` row, the caller's own row under `subscriptions_select_own`. */
export type SubscriptionSnapshot = {
  status: string | null
  planId: string | null
  currentPeriodEnd: string | null
  gracePeriodUntil: string | null
  isLifetime: boolean
}

function planName(plan: PlanConfig): string {
  return plan.name.trim().toLowerCase()
}

function premiumRank(name: string): number {
  if (name === 'pro') return 0
  if (name === 'clarity_premium') return 1
  return 2
}

function premiumMax(plan: PlanConfig | undefined): number {
  if (plan?.maxGoals == null || !Number.isInteger(plan.maxGoals)) return PREMIUM_MAX_GOALS_WHEN_NULL
  return plan.maxGoals
}

function fullBudgeting(plan: PlanConfig | undefined, fallback: boolean): boolean {
  if (typeof plan?.hasBudgeting === 'boolean') return plan.hasBudgeting
  return fallback
}

function instant(value: string | null): number {
  if (value == null) return Number.NaN
  return Date.parse(value)
}

/**
 * Goal cap from `enforce_goal_plan_limit` (latest body in
 * `20261019120000_exclude_soft_deleted_reads.sql`) and `plans.max_goals`.
 *
 * Lifetime uses the pro row, then clarity_premium, even when the subscription
 * points at free. An active period on pro or clarity_premium uses that row's
 * `max_goals`. Every other row keeps the free default of 2. Past-due grace
 * (the trigger raises `GOAL_CREATION_GRACE`) sets the new-goal cap to 0 and
 * still keeps `has_budgeting` so budget edits match the web routes.
 * A missing subscription is Free.
 */
export function accountPlanFromSubscription(
  subscription: SubscriptionSnapshot | null,
  plans: readonly PlanConfig[],
  now: Date,
): { plan: ResolvedPlanCap; fullBudgeting: boolean } {
  if (!subscription) return { plan: FREE_PLAN_CAP, fullBudgeting: false }

  const status = (subscription.status ?? '').trim().toLowerCase()
  const linked = plans.find((plan) => plan.id === subscription.planId)

  if (subscription.isLifetime) {
    const premium = plans
      .filter((plan) => PREMIUM_PLAN_NAMES.has(planName(plan)))
      .slice()
      .sort((a, b) => premiumRank(planName(a)) - premiumRank(planName(b)))
    const chosen = premium[0]
    return {
      plan: { name: 'Pro', maxGoals: premiumMax(chosen) },
      fullBudgeting: fullBudgeting(chosen, true),
    }
  }

  const periodEnd = instant(subscription.currentPeriodEnd)
  const activePremium = status === 'active'
    && subscription.planId != null
    && Number.isFinite(periodEnd)
    && periodEnd > now.getTime()
    && linked != null
    && PREMIUM_PLAN_NAMES.has(planName(linked))

  if (activePremium) {
    return {
      plan: { name: 'Pro', maxGoals: premiumMax(linked) },
      fullBudgeting: fullBudgeting(linked, true),
    }
  }

  const graceUntil = instant(subscription.gracePeriodUntil)
  const inGrace = status === 'past_due'
    && Number.isFinite(graceUntil)
    && now.getTime() < graceUntil
    && linked != null
    && PREMIUM_PLAN_NAMES.has(planName(linked))

  if (inGrace) {
    return {
      plan: { name: 'Pro', maxGoals: 0, blocksNewGoals: true },
      fullBudgeting: fullBudgeting(linked, true),
    }
  }

  return { plan: FREE_PLAN_CAP, fullBudgeting: false }
}

/**
 * Blocks keep-both adoption when unsynced device goals plus live account goals
 * would exceed the plan. Equal to the cap is allowed. There is no partial upload.
 */
export function goalAdoptionBlockMessage(input: {
  plan: ResolvedPlanCap
  localGoals: number
  serverGoals: number
}): string | null {
  if (input.plan.blocksNewGoals) {
    return input.localGoals > 0 ? GOAL_GRACE_BLOCK_MESSAGE : null
  }
  if (input.localGoals + input.serverGoals <= input.plan.maxGoals) return null
  return `${input.plan.name} allows ${input.plan.maxGoals} goals; you have ${input.localGoals} here and ${input.serverGoals} in your account. Remove some to continue.`
}
