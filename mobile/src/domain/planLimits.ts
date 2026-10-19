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

/** Cap the caller resolved for this account. Free display copy uses the name "Free". */
export type ResolvedPlanCap = {
  name: string
  maxGoals: number
}

export const FREE_PLAN_CAP: ResolvedPlanCap = {
  name: 'Free',
  maxGoals: FREE_PLAN_MAX_GOALS,
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
  if (input.localGoals + input.serverGoals <= input.plan.maxGoals) return null
  return `${input.plan.name} allows ${input.plan.maxGoals} goals; you have ${input.localGoals} here and ${input.serverGoals} in your account. Remove some to continue.`
}
