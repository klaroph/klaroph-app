/**
 * Klaro AI v1 — configurable limits (not final product policy).
 * Free-tier Gemini protection: daily caps + short cooldown.
 */

export const KLARO_AI_LIMITS = {
  /** Free plan: AI insight generations per user per UTC day */
  FREE_DAILY_GENERATIONS: 1,
  /** Pro plan: AI insight generations per user per UTC day */
  PRO_DAILY_GENERATIONS: 20,
  /** Minimum ms between Gemini generations for the same user */
  COOLDOWN_MS: 30_000,
  /** Default Gemini model when GEMINI_MODEL is unset */
  DEFAULT_MODEL: 'gemini-3.8-flash',
  /** Conservative generation settings */
  TEMPERATURE: 0.35,
  MAX_OUTPUT_TOKENS: 280,
} as const

export function dailyLimitForPlan(planName: 'free' | 'pro'): number {
  return planName === 'pro'
    ? KLARO_AI_LIMITS.PRO_DAILY_GENERATIONS
    : KLARO_AI_LIMITS.FREE_DAILY_GENERATIONS
}
