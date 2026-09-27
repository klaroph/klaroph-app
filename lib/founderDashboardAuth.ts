import { createHash, timingSafeEqual } from 'crypto'

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

/**
 * Founder metrics use the service role. Require a configured shared secret
 * and a matching Bearer token. Never treat a missing secret as public access.
 */
export function authorizeFounderDashboardRequest(
  authorizationHeader: string | null | undefined,
  secret: string | undefined | null
): { ok: true } | { ok: false; status: 401; error: string } {
  const expected = typeof secret === 'string' ? secret.trim() : ''
  if (!expected) {
    return { ok: false, status: 401, error: 'Unauthorized' }
  }

  const auth = authorizationHeader ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token || !timingSafeEqual(digest(token), digest(expected))) {
    return { ok: false, status: 401, error: 'Unauthorized' }
  }

  return { ok: true }
}

/**
 * Founder Dock (browser) access: the verified, email-confirmed Supabase user must
 * match FOUNDER_EMAIL. An unset FOUNDER_EMAIL locks the dock for everyone.
 */
export function isFounderUser(
  user: { email?: string | null; email_confirmed_at?: string | null } | null | undefined,
  founderEmail: string | undefined | null
): boolean {
  const expected = founderEmail?.trim().toLowerCase()
  const email = user?.email?.trim().toLowerCase()
  if (!expected || !email || !user?.email_confirmed_at) return false
  return timingSafeEqual(digest(email), digest(expected))
}

/** Where a verified session lands after sign-in: the founder in Mission Control, everyone else on their dashboard. */
export function postAuthPath(
  user: { email?: string | null; email_confirmed_at?: string | null } | null | undefined,
  founderEmail: string | undefined | null
): '/admin/founder' | '/dashboard' {
  return isFounderUser(user, founderEmail) ? '/admin/founder' : '/dashboard'
}
