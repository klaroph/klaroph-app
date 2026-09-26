import { describe, expect, it } from 'vitest'
import {
  selectEligibleRecipients,
  isValidMarketingEmail,
  type AudienceAuthUser,
  type AudienceProfile,
} from './marketingAudience'

const NOW = new Date('2026-09-26T12:00:00Z')
const RECENT = '2026-09-20T00:00:00Z'
const LONG_AGO = '2026-03-01T00:00:00Z'

function user(id: string, overrides: Partial<AudienceAuthUser> = {}): AudienceAuthUser {
  return { id, email: `${id}@example.com`, email_confirmed_at: '2026-01-01T00:00:00Z', last_sign_in_at: RECENT, ...overrides }
}

function profile(id: string, overrides: Partial<AudienceProfile> = {}): AudienceProfile {
  return { id, full_name: null, nickname: null, user_type: 'user', marketing_emails_unsubscribed_at: null, ...overrides }
}

function eligibleIds(authUsers: AudienceAuthUser[], profiles: AudienceProfile[], extra: object = {}) {
  return selectEligibleRecipients({ authUsers, profiles, segment: 'all', now: NOW, ...extra }).map((r) => r.userId)
}

describe('selectEligibleRecipients', () => {
  it('includes a confirmed, subscribed real user', () => {
    expect(eligibleIds([user('u1')], [profile('u1')])).toEqual(['u1'])
  })

  it('never includes users who unsubscribed', () => {
    expect(
      eligibleIds([user('u1'), user('u2')], [profile('u1'), profile('u2', { marketing_emails_unsubscribed_at: RECENT })])
    ).toEqual(['u1'])
  })

  it('excludes invalid, missing, and duplicate emails', () => {
    const users = [
      user('u1', { email: 'not-an-email' }),
      user('u2', { email: null }),
      user('u3', { email: 'Same@Example.com' }),
      user('u4', { email: 'same@example.com' }),
    ]
    expect(eligibleIds(users, users.map((u) => profile(u.id)))).toEqual(['u3'])
  })

  it('excludes testers, users without a profile, unconfirmed, banned, and deleted accounts', () => {
    const users = [
      user('tester'),
      user('noprofile'),
      user('unconfirmed', { email_confirmed_at: null }),
      user('banned', { banned_until: '2099-01-01T00:00:00Z' }),
      user('deleted', { deleted_at: RECENT }),
      user('ok'),
    ]
    const profiles = [
      profile('tester', { user_type: 'tester' }),
      profile('unconfirmed'),
      profile('banned'),
      profile('deleted'),
      profile('ok'),
    ]
    expect(eligibleIds(users, profiles)).toEqual(['ok'])
  })

  it('excludes users already claimed for the campaign', () => {
    expect(eligibleIds([user('u1'), user('u2')], [profile('u1'), profile('u2')], { excludeUserIds: new Set(['u1']) })).toEqual(['u2'])
  })

  it('splits active and dormant users by last sign-in', () => {
    const users = [user('active'), user('dormant', { last_sign_in_at: LONG_AGO }), user('never', { last_sign_in_at: null })]
    const profiles = users.map((u) => profile(u.id))
    const ids = (segment: 'active' | 'dormant') =>
      selectEligibleRecipients({ authUsers: users, profiles, segment, now: NOW }).map((r) => r.userId)
    expect(ids('active')).toEqual(['active'])
    expect(ids('dormant')).toEqual(['dormant', 'never'])
  })

  it('personalizes with nickname, then full name, and nothing else', () => {
    const [recipient] = selectEligibleRecipients({
      authUsers: [user('u1')],
      profiles: [profile('u1', { full_name: 'Maria Clara Santos' })],
      segment: 'all',
      now: NOW,
    })
    expect(recipient).toEqual({ userId: 'u1', email: 'u1@example.com', firstName: 'Maria' })
  })
})

describe('isValidMarketingEmail', () => {
  it('accepts normal addresses and rejects junk', () => {
    expect(isValidMarketingEmail('juan.dela.cruz@gmail.com')).toBe(true)
    expect(isValidMarketingEmail('juan@localhost')).toBe(false)
    expect(isValidMarketingEmail('juan @gmail.com')).toBe(false)
    expect(isValidMarketingEmail(undefined)).toBe(false)
  })
})
