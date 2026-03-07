/** Goal row from Supabase (public.goals). */
export interface GoalRow {
  id: string
  user_id: string
  name: string
  target_amount: number
  saved_amount: number
  created_at: string
  pinned_at?: string | null
}

/** Goal row with computed saved amount (from allocations). Used by dashboard. */
export type GoalWithSaved = GoalRow & { saved: number }

/** Subscription status. */
export type SubscriptionStatus = 'active' | 'canceled' | 'expired' | 'trial'

/** Financial stage for profile. */
export type FinancialStage = 'starter' | 'stabilizing' | 'building' | 'scaling'

/** Risk comfort level. */
export type RiskComfort = 'low' | 'medium' | 'high'

/** Profile row (public.profiles) — Financial Identity Hub. */
export interface ProfileRow {
  id: string
  full_name: string | null
  created_at: string
  updated_at?: string | null
  nickname: string | null
  avatar_url: string | null
  monthly_income: number | null
  monthly_income_range: string | null
  income_frequency: string | null
  savings_percent: number | null
  primary_goal_category: string | null
  financial_stage: FinancialStage | null
  savings_confidence: number | null
  risk_comfort: RiskComfort | null
  motivation_type: string | null
  dream_statement: string | null
  profile_completion_percentage: number | null
  clarity_level: number
  streak_days: number
  badges_json: unknown
}
