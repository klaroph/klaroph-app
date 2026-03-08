/** User feature set from backend (/api/features). Do not hardcode plan logic in frontend. */
export interface UserFeatures {
  plan_name: string
  max_goals: number
  has_simulator: boolean
  has_scenarios: boolean
  has_smart_insights: boolean
  has_export: boolean
  has_analytics: boolean
  /** Monthly budgeting: Pro always; Free only during first 30 days after account creation */
  has_budget_editing: boolean
  /** True when in 3-day grace after payment failure; full access but cannot create goals */
  is_grace?: boolean
  /** False when is_grace or at goal limit */
  can_create_goals?: boolean
}

/** Extended features + subscription state (one source for premium UI). */
export interface UserFeaturesWithSubscription extends UserFeatures {
  isPro: boolean
  subscriptionStatus: string
  currentPeriodEnd: string | null
  plan: string
  /** For free users: date string (YYYY-MM-DD) - analytics limited to on or after this date. Premium: null. */
  analyticsCutoffDate: string | null
  /** Successful CSV imports used (free: 2 max; Pro: unlimited). */
  import_used: number
  /** Free = 2; Pro = null (unlimited). */
  import_limit: number | null
}
