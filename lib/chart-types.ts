/**
 * Central source of truth for chart type constants and plan gating.
 * Prevents TREND_CHART_TYPES / CATEGORY_CHART_TYPES undefined runtime errors.
 */

export type PlanType = 'free' | 'premium'

export type TrendChartType = 'line' | 'bar' | 'area' | 'multiLine'
export type CategoryChartType = 'pie' | 'doughnut' | 'radar'

export const TREND_CHART_TYPES: Record<PlanType, TrendChartType[]> = {
  free: ['line'],
  premium: ['line', 'bar', 'area', 'multiLine'],
}

export const CATEGORY_CHART_TYPES: Record<PlanType, CategoryChartType[]> = {
  free: ['pie'],
  premium: ['pie', 'doughnut', 'radar'],
}

/** All trend types (for dropdown when premium) */
export const TREND_CHART_TYPES_PREMIUM: TrendChartType[] = TREND_CHART_TYPES.premium
/** All category types (for dropdown when premium) */
export const CATEGORY_CHART_TYPES_PREMIUM: CategoryChartType[] = CATEGORY_CHART_TYPES.premium
