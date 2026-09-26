/**
 * Ask Klaro chat limits — separate from Klaro Insight generation caps.
 * Do not change Insight FREE/PRO daily values here.
 */

export const KLARO_AI_CHAT_LIMITS = {
  FREE_DAILY_MESSAGES: 3,
  PRO_DAILY_MESSAGES: 30,
  FREE_COOLDOWN_MS: 30_000,
  PRO_COOLDOWN_MS: 10_000,
  MAX_MESSAGE_LENGTH: 1000,
  HISTORY_WINDOW: 10,
  MAX_RESPONSE_CHARS: 2000,
  MAX_OUTPUT_TOKENS: 512,
} as const

export function chatDailyLimitForPlan(planName: 'free' | 'pro'): number {
  return planName === 'pro'
    ? KLARO_AI_CHAT_LIMITS.PRO_DAILY_MESSAGES
    : KLARO_AI_CHAT_LIMITS.FREE_DAILY_MESSAGES
}

export function chatCooldownMsForPlan(planName: 'free' | 'pro'): number {
  return planName === 'pro'
    ? KLARO_AI_CHAT_LIMITS.PRO_COOLDOWN_MS
    : KLARO_AI_CHAT_LIMITS.FREE_COOLDOWN_MS
}
