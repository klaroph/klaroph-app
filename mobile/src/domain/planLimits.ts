/**
 * Free-plan goal cap.
 *
 * Source of truth on the server:
 * - `plans` seed `name = 'free'` sets `max_goals = 2`
 *   (supabase/migrations/20250225000000_klaroph_plans_subscriptions_profiles.sql)
 * - `enforce_goal_plan_limit` defaults `v_max_goals` to 2 when there is no
 *   active Pro / lifetime subscription
 *   (supabase/migrations/20261019120000_exclude_soft_deleted_reads.sql)
 *
 * Local-only mode has no subscription row, so the trigger uses that default
 * once the goals are uploaded. Stay at or under it before sign-in.
 */
export const FREE_PLAN_MAX_GOALS = 2

export const GOAL_LIMIT_REACHED = 'GOAL_LIMIT_REACHED'
