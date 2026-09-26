import { describe, expect, it } from 'vitest'
import { authorizeFounderDashboardRequest, isFounderUser } from './founderDashboardAuth'

describe('authorizeFounderDashboardRequest', () => {
  it('requires a configured secret — missing secret is not public access', () => {
    const result = authorizeFounderDashboardRequest('Bearer anything', undefined)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.status).toBe(401)
  })

  it('rejects a missing or wrong bearer token', () => {
    expect(authorizeFounderDashboardRequest(null, 'secret').ok).toBe(false)
    expect(authorizeFounderDashboardRequest('Bearer other', 'secret').ok).toBe(false)
    expect(authorizeFounderDashboardRequest('Bearer secret-longer', 'secret').ok).toBe(false)
  })

  it('accepts the matching bearer token', () => {
    expect(authorizeFounderDashboardRequest('Bearer secret', 'secret').ok).toBe(true)
  })
})

describe('isFounderUser', () => {
  const confirmed = '2026-01-01T00:00:00Z'

  it('locks the dock for everyone when FOUNDER_EMAIL is unset', () => {
    expect(isFounderUser({ email: 'founder@klaroph.com', email_confirmed_at: confirmed }, undefined)).toBe(false)
    expect(isFounderUser({ email: 'founder@klaroph.com', email_confirmed_at: confirmed }, '  ')).toBe(false)
  })

  it('matches the founder email case-insensitively', () => {
    expect(isFounderUser({ email: 'Founder@KlaroPH.com', email_confirmed_at: confirmed }, 'founder@klaroph.com')).toBe(true)
  })

  it('rejects other users, unconfirmed emails, and missing users', () => {
    expect(isFounderUser({ email: 'someone@klaroph.com', email_confirmed_at: confirmed }, 'founder@klaroph.com')).toBe(false)
    expect(isFounderUser({ email: 'founder@klaroph.com', email_confirmed_at: null }, 'founder@klaroph.com')).toBe(false)
    expect(isFounderUser(null, 'founder@klaroph.com')).toBe(false)
  })
})
