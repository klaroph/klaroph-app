import { describe, expect, it } from 'vitest'
import { forgetTokenKey, rememberTokenKey, secureStorageKey, tokenKeysFromIndex } from './tokenStore'

describe('secure token index', () => {
  it('remembers keys and clears them from the index', () => {
    const indexed = rememberTokenKey(null, 'sb-klaro-auth-token')
    expect(tokenKeysFromIndex(indexed)).toEqual(['sb-klaro-auth-token'])
    expect(tokenKeysFromIndex(forgetTokenKey(indexed, 'sb-klaro-auth-token'))).toEqual([])
  })

  it('keeps storage keys inside the SecureStore alphabet', () => {
    expect(secureStorageKey('sb/klaro auth')).toBe('klaro.auth.sb_klaro_auth')
  })
})
