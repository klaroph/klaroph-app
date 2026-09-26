/**
 * Signed, non-expiring marketing unsubscribe tokens: `<userId>.<hmac>`.
 * Unsubscribe links must keep working long after the email is sent, so there is no expiry.
 */

import { createHmac, timingSafeEqual } from 'crypto'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MIN_SECRET_LENGTH = 32

function sign(userId: string, secret: string): string {
  return createHmac('sha256', secret).update(`marketing-unsubscribe:${userId}`).digest('base64url')
}

export function getUnsubscribeSecret(env: Record<string, string | undefined> = process.env): string | null {
  const secret = env.MARKETING_UNSUBSCRIBE_SECRET?.trim()
  return secret && secret.length >= MIN_SECRET_LENGTH ? secret : null
}

export function createUnsubscribeToken(userId: string, secret: string): string {
  return `${userId}.${sign(userId, secret)}`
}

/** Returns the user id when the token is authentic, otherwise null. */
export function verifyUnsubscribeToken(token: string | null | undefined, secret: string): string | null {
  if (!token) return null
  const [userId, signature, extra] = token.split('.')
  if (extra !== undefined || !userId || !signature || !UUID_RE.test(userId)) return null

  const expected = Buffer.from(sign(userId, secret))
  const actual = Buffer.from(signature)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null
  return userId
}

/** Human-facing page with a confirm button (link scanners cannot unsubscribe by prefetching). */
export function buildUnsubscribePageUrl(appUrl: string, token: string): string {
  return `${appUrl}/unsubscribe?token=${encodeURIComponent(token)}`
}

/** RFC 8058 one-click endpoint used in the List-Unsubscribe header. */
export function buildOneClickUnsubscribeUrl(appUrl: string, token: string): string {
  return `${appUrl}/api/email/unsubscribe?token=${encodeURIComponent(token)}`
}
