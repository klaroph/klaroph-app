/**
 * Single source of truth for Free vs Pro plan features.
 * Use these labels everywhere (landing page, upgrade modal) for consistent pricing communication.
 */

/** Core plan features — same label in both plans where applicable */
export const FREE_PLAN_FEATURES = [
  '2 Active Goals',
  'Income Tracker',
  'Expense Tracker',
  'Monthly Budgeting (first 30 days only)',
  '90-Day Analytics View',
  'Basic Charts',
  'Import CSV (Income and Expenses) — up to 2 imports only',
] as const

/** Financial Clarity Tools — each on its own line (strong selling points) */
export const FREE_PLAN_TOOLS = [
  'Salary Calculator',
  '13th Month Pay Calculator',
  'Loan Calculator',
  'Financial Health Check',
] as const

/** Pro core features. premium: true = show premium indicator (badge/icon) */
export const PRO_PLAN_FEATURES: ReadonlyArray<{ label: string; premium: boolean }> = [
  { label: '20 Active Goals', premium: false },
  { label: 'Income Tracker', premium: false },
  { label: 'Expense Tracker', premium: false },
  { label: 'Monthly Budgeting', premium: true },
  { label: 'Unlimited History & Insights', premium: true },
  { label: 'Export CSV (Income and Expenses)', premium: true },
  { label: 'Import CSV (Income and Expenses)', premium: true },
  { label: 'Advanced Charts', premium: true },
]

/** Pro Financial Clarity Tools — shared tools plus Pro-only */
export const PRO_PLAN_TOOLS: ReadonlyArray<{ label: string; premium: boolean }> = [
  { label: 'Salary Calculator', premium: false },
  { label: '13th Month Pay Calculator', premium: false },
  { label: 'Loan Calculator', premium: false },
  { label: 'Financial Health Check', premium: false },
  { label: 'Early Access to New Financial Tools', premium: true },
  { label: 'Advanced Financial Metrics', premium: true },
]

/** Section label used in both landing and modal */
export const PLAN_SECTION_TOOLS_LABEL = 'Financial Clarity Tools'

/** Ordered for upgrade modal: strongest Pro differentiators first for conversion */
export const UPGRADE_MODAL_PRO_FIRST_FEATURES = [
  'Unlimited History & Insights',
  'Monthly Budgeting',
  'Advanced Charts',
  'Export CSV (Income and Expenses)',
  '20 Active Goals',
  'Income Tracker',
  'Expense Tracker',
] as const

export const UPGRADE_MODAL_PRO_FIRST_TOOLS = [
  'Salary Calculator',
  '13th Month Pay Calculator',
  'Loan Calculator',
  'Financial Health Check',
  'Early Access to New Financial Tools',
  'Advanced Financial Metrics',
] as const
