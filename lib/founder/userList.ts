/**
 * Founder Users list model: the row shape, plan labels, the filter/search rule and the
 * user-action constants. Dependency-free so the Users page can use it in the browser.
 */

export type PlanKind = 'free' | 'paid' | 'lifetime' | 'complimentary'
export type AccountStatus = 'active' | 'dormant' | 'unconfirmed' | 'banned'

export type FounderUser = {
  id: string
  /** Display name (nickname, else full name). Null when the profile has no real name (signup can store the email as full_name). */
  name: string | null
  /** Full name when it differs from the display name, so search still finds it. */
  fullName: string | null
  email: string
  isTester: boolean
  plan: PlanKind
  planType: 'monthly' | 'annual' | null
  /** Period end for time-limited Pro (paid or complimentary); null for free and lifetime. */
  proEndsAt: string | null
  signedUpAt: string
  lastSignInAt: string | null
  status: AccountStatus
  isNew: boolean
  unsubscribed: boolean
}

export const PLAN_LABELS: Record<PlanKind, string> = {
  free: 'Free',
  paid: 'Pro',
  lifetime: 'Lifetime Pro',
  complimentary: 'Pro (complimentary)',
}

export const STATUS_LABELS: Record<AccountStatus, string> = {
  active: 'Active',
  dormant: 'Dormant',
  unconfirmed: 'Unconfirmed',
  banned: 'Banned',
}

export const STATUS_TONES: Record<AccountStatus, 'ok' | 'unknown' | 'warn' | 'bad'> = {
  active: 'ok',
  dormant: 'unknown',
  unconfirmed: 'warn',
  banned: 'bad',
}

export function isPro(plan: PlanKind): boolean {
  return plan !== 'free'
}

export const USER_FILTERS = ['all', 'free', 'pro', 'new', 'active', 'dormant', 'testers'] as const
export type UserFilter = (typeof USER_FILTERS)[number]

export function isUserFilter(value: unknown): value is UserFilter {
  return typeof value === 'string' && (USER_FILTERS as readonly string[]).includes(value)
}

export function filterUsers(users: FounderUser[], filter: UserFilter, query = ''): FounderUser[] {
  const q = query.trim().toLowerCase()
  return users.filter((u) => {
    if (filter === 'testers' ? !u.isTester : u.isTester) return false
    if (filter === 'free' && u.plan !== 'free') return false
    if (filter === 'pro' && !isPro(u.plan)) return false
    if (filter === 'new' && !u.isNew) return false
    if (filter === 'active' && u.status !== 'active') return false
    if (filter === 'dormant' && u.status !== 'dormant') return false
    return !q || [u.name, u.fullName, u.email].some((field) => field?.toLowerCase().includes(q))
  })
}

export const DELETE_CONFIRMATION_PHRASE = 'DELETE USER'

/** Complimentary Pro mirrors paid Pro's row shape (payment_provider 'manual'); the founder picks the length. */
export const COMPLIMENTARY_DURATIONS = {
  '1m': { months: 1, planType: 'monthly', label: '1 month' },
  '3m': { months: 3, planType: 'monthly', label: '3 months' },
  '12m': { months: 12, planType: 'annual', label: '1 year' },
} as const
export type ComplimentaryDuration = keyof typeof COMPLIMENTARY_DURATIONS

export function isComplimentaryDuration(value: unknown): value is ComplimentaryDuration {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(COMPLIMENTARY_DURATIONS, value)
}
