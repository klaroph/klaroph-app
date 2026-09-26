import { describe, expect, it } from 'vitest'
import { createUnsubscribeToken, getUnsubscribeSecret, verifyUnsubscribeToken } from './unsubscribeToken'

const SECRET = 'a'.repeat(40)
const USER_ID = '0a9851e6-db5d-4fcf-8010-34cb6b0d02b3'

describe('unsubscribe tokens', () => {
  it('round-trips a signed user id', () => {
    const token = createUnsubscribeToken(USER_ID, SECRET)
    expect(verifyUnsubscribeToken(token, SECRET)).toBe(USER_ID)
  })

  it('rejects tampered, foreign, or malformed tokens', () => {
    const token = createUnsubscribeToken(USER_ID, SECRET)
    const otherUser = '11111111-2222-3333-4444-555555555555'
    expect(verifyUnsubscribeToken(token.replace(USER_ID, otherUser), SECRET)).toBeNull()
    expect(verifyUnsubscribeToken(token, 'b'.repeat(40))).toBeNull()
    expect(verifyUnsubscribeToken(`${token}.extra`, SECRET)).toBeNull()
    expect(verifyUnsubscribeToken('not-a-token', SECRET)).toBeNull()
    expect(verifyUnsubscribeToken(null, SECRET)).toBeNull()
  })

  it('requires a configured secret of at least 32 characters', () => {
    expect(getUnsubscribeSecret({})).toBeNull()
    expect(getUnsubscribeSecret({ MARKETING_UNSUBSCRIBE_SECRET: 'short' })).toBeNull()
    expect(getUnsubscribeSecret({ MARKETING_UNSUBSCRIBE_SECRET: SECRET })).toBe(SECRET)
  })
})
