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
  if (!token || token !== expected) {
    return { ok: false, status: 401, error: 'Unauthorized' }
  }

  return { ok: true }
}
