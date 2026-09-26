/**
 * Single source of truth for Free vs Pro plan features.
 * Use these labels everywhere (landing page, upgrade modal) for consistent pricing communication.
 */

import { KLARO_AI_CHAT_LIMITS } from '@/lib/ai/chatLimits'
import { KLARO_AI_LIMITS } from '@/lib/ai/limits'

export const ASK_KLARO_FREE_LABEL = `Ask Klaro (Beta) — ${KLARO_AI_CHAT_LIMITS.FREE_DAILY_MESSAGES} messages/day`
export const ASK_KLARO_PRO_LABEL = `Ask Klaro (Beta) — ${KLARO_AI_CHAT_LIMITS.PRO_DAILY_MESSAGES} messages/day`
export const KLARO_INSIGHT_FREE_LABEL = `Klaro Insight — ${KLARO_AI_LIMITS.FREE_DAILY_GENERATIONS} per day`
export const KLARO_INSIGHT_PRO_LABEL = `Klaro Insight — ${KLARO_AI_LIMITS.PRO_DAILY_GENERATIONS} per day`

/** Core plan features — same label in both plans where applicable */
export const FREE_PLAN_FEATURES = [
  '2 Active Goals',
  'Income Tracker',
  'Expense Tracker',
  'Monthly Budgeting (first 30 days only)',
  '90-Day Analytics View',
  'Basic Charts',
  'Import CSV (Income and Expenses) — up to 2 imports only',
  ASK_KLARO_FREE_LABEL,
  KLARO_INSIGHT_FREE_LABEL,
] as const

/** Financial Clarity Tools — each on its own line (dashboard-native modules like Financial Health are not listed here) */
export const FREE_PLAN_TOOLS = [
  'Salary Calculator',
  '13th Month Pay Calculator',
  'Loan Calculator',
] as const

/** Pro core features. premium: true = show premium indicator (badge/icon) */
export const PRO_PLAN_FEATURES: ReadonlyArray<{ label: string; premium: boolean }> = [
  { label: '20 Active Goals', premium: false },
  { label: 'Income Tracker', premium: false },
  { label: 'Expense Tracker', premium: false },
  { label: 'Financial Health Insights', premium: true },
  { label: 'Monthly Budgeting', premium: true },
  { label: 'Unlimited History & Insights', premium: true },
  { label: 'Export CSV (Income and Expenses)', premium: true },
  { label: 'Import CSV (Income and Expenses)', premium: true },
  { label: 'Advanced Charts', premium: true },
  { label: ASK_KLARO_PRO_LABEL, premium: true },
  { label: KLARO_INSIGHT_PRO_LABEL, premium: true },
]

/** Pro Financial Clarity Tools — shared tools plus Pro-only (dashboard-native modules like Financial Health are not listed here) */
export const PRO_PLAN_TOOLS: ReadonlyArray<{ label: string; premium: boolean }> = [
  { label: 'Salary Calculator', premium: false },
  { label: '13th Month Pay Calculator', premium: false },
  { label: 'Loan Calculator', premium: false },
  { label: 'Early Access to New Financial Tools', premium: true },
  { label: 'Advanced Financial Metrics', premium: true },
]

/** Section label used in both landing and modal */
export const PLAN_SECTION_TOOLS_LABEL = 'Financial Clarity Tools'
