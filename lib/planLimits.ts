/**
 * Centralized plan limits for display and fallback.
 * Actual enforcement: backend resolveUserPlan + lib/entitlements (budget 30-day, export, goals).
 * Keep in sync with lib/planFeatures.ts (product copy) and lib/entitlements.ts (backend rules).
 */

export const PLAN_LIMITS = {
  free: {
    maxGoals: 2,
    maxRowsPerTool: 300,
    exportEnabled: false,
    advancedAnalytics: false,
    /** Free users get full budgeting for first 30 days after signup; then view-only. */
    budgetFreeTrialDays: 30,
    analyticsDays: 90,
  },
  pro: {
    maxGoals: 20,
    maxRowsPerTool: Number.MAX_SAFE_INTEGER,
    exportEnabled: true,
    advancedAnalytics: true,
    budgetFreeTrialDays: null,
    analyticsDays: null,
  },
} as const

export type PlanKey = keyof typeof PLAN_LIMITS
