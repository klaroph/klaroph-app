import { describe, expect, it } from 'vitest'
import {
  NICKNAME_MAX_LENGTH,
  NICKNAME_REQUIRED_ERROR,
  NICKNAME_TOO_LONG_ERROR,
  displayName,
  nicknameForWrite,
  onboardingNamePrefill,
  profileNicknameUpdate,
} from './displayName'

describe('displayName', () => {
  it('prefers a trimmed nickname over a Google name and an email', () => {
    expect(
      displayName(
        { nickname: '  Jun  ', fullName: 'Juan Dela Cruz', email: 'juan@gmail.com' },
        'there',
      ),
    ).toBe('Jun')
  })

  it('uses a Google full name when nickname is missing', () => {
    expect(
      displayName({ nickname: null, fullName: 'Juan Dela Cruz', email: 'juan@gmail.com' }, 'there'),
    ).toBe('Juan Dela Cruz')
  })

  it('does not show a nickname that is an email address', () => {
    expect(
      displayName({ nickname: 'juan@gmail.com', fullName: 'Juan Dela Cruz', email: 'juan@gmail.com' }, 'there'),
    ).toBe('Juan Dela Cruz')
  })

  it('uses the email local part when full_name is an email address', () => {
    expect(displayName({ nickname: null, fullName: 'juan.delacruz@gmail.com' }, 'there')).toBe(
      'juan.delacruz',
    )
    expect(displayName({ fullName: 'juan.delacruz@gmail.com' }, 'there')).not.toContain('@')
  })

  it('uses the per-site fallback when every value is empty', () => {
    expect(displayName({ nickname: null, fullName: null, email: null }, 'there')).toBe('there')
    expect(displayName({ nickname: '', fullName: '', email: '' }, 'You')).toBe('You')
    expect(displayName({}, 'You')).toBe('You')
  })

  it('lets a nickname of only spaces fall through to the next value', () => {
    expect(
      displayName({ nickname: '   ', fullName: 'Ana Reyes', email: 'ana@example.com' }, 'You'),
    ).toBe('Ana Reyes')
  })

  it('lets an empty full_name fall through to the email local part', () => {
    expect(displayName({ nickname: null, fullName: '', email: 'ana@example.com' }, 'You')).toBe('ana')
    expect(displayName({ fullName: '' }, 'You')).toBe('You')
  })

  it('treats a full_name with an @ in the middle as no name and uses the email local part', () => {
    expect(
      displayName(
        { nickname: null, fullName: 'Juan @ Work', email: 'maria.santos@example.com' },
        'You',
      ),
    ).toBe('maria.santos')
  })

  it('returns a very long nickname unchanged', () => {
    const nickname = `${'Maria'.repeat(30)} Clara`
    expect(nickname.length).toBeGreaterThan(40)
    expect(
      displayName({ nickname, fullName: 'Other Person', email: 'other@example.com' }, 'You'),
    ).toBe(nickname)
  })

  it('pre-fills onboarding from a nickname, or only the first name of a real full name', () => {
    expect(onboardingNamePrefill({ nickname: '  Jun  ', fullName: 'Juan Dela Cruz' })).toBe('Jun')
    expect(onboardingNamePrefill({ nickname: 'Mary Ann', fullName: 'Juan Dela Cruz' })).toBe('Mary Ann')
    expect(onboardingNamePrefill({ nickname: null, fullName: '  Juan Dela Cruz  ' })).toBe('Juan')
    expect(onboardingNamePrefill({ nickname: '   ', fullName: 'Maria Clara Santos' })).toBe('Maria')
    expect(onboardingNamePrefill({ fullName: 'Juan' })).toBe('Juan')
    expect(onboardingNamePrefill({ fullName: `${'A'.repeat(50)} Cruz` })).toBe('A'.repeat(NICKNAME_MAX_LENGTH))
    expect(onboardingNamePrefill({ nickname: '   ', fullName: 'Juan @ Work' })).toBe('')
    expect(onboardingNamePrefill({ nickname: null, fullName: 'ada@example.com' })).toBe('')
    expect(onboardingNamePrefill({ fullName: '' })).toBe('')
  })

  it('cuts a pre-fill longer than 15 so the field value is always valid', () => {
    expect(NICKNAME_MAX_LENGTH).toBe(15)
    expect('Christopher').toHaveLength(11)
    expect(onboardingNamePrefill({ fullName: 'Christopher Santos' })).toBe('Christopher')
    expect(nicknameForWrite(onboardingNamePrefill({ fullName: 'Christopher Santos' }))).toEqual({
      ok: true,
      nickname: 'Christopher',
    })

    const twoWords = 'Christopher John'
    expect(twoWords).toHaveLength(16)
    const cut = onboardingNamePrefill({ nickname: twoWords, fullName: 'Someone Else' })
    expect(cut).toBe('Christopher Joh')
    expect(cut).toHaveLength(NICKNAME_MAX_LENGTH)
    expect(nicknameForWrite(cut)).toEqual({ ok: true, nickname: cut })
    expect(onboardingNamePrefill({ fullName: `${'Ñ'.repeat(20)} Cruz` })).toHaveLength(NICKNAME_MAX_LENGTH)
  })

  it('shows a stored nickname that is longer than the edit cap', () => {
    const nickname = 'Christopher John'
    expect(nickname.length).toBeGreaterThan(NICKNAME_MAX_LENGTH)
    expect(
      displayName({ nickname, fullName: 'Other Person', email: 'other@example.com' }, 'You'),
    ).toBe(nickname)
  })

  it('still greets with a first name longer than the nickname cap', () => {
    const first = 'A'.repeat(16)
    expect(
      displayName({ fullName: `${first} Cruz`, email: 'ada@example.com' }, 'there', { firstName: true }),
    ).toBe(first)
  })

  it('keeps greeting sites on the first word of a Google name', () => {
    expect(
      displayName({ fullName: '  Juan Dela Cruz  ', email: 'juan@gmail.com' }, 'there', {
        firstName: true,
      }),
    ).toBe('Juan')
    expect(
      displayName({ nickname: '  Jun  ', fullName: 'Juan Dela Cruz' }, 'there', { firstName: true }),
    ).toBe('Jun')
  })
})

describe('nicknameForWrite', () => {
  it('trims and accepts a name within 15 characters', () => {
    expect(nicknameForWrite('  Christopher  ')).toEqual({ ok: true, nickname: 'Christopher' })
    expect(nicknameForWrite('A'.repeat(NICKNAME_MAX_LENGTH))).toEqual({
      ok: true,
      nickname: 'A'.repeat(NICKNAME_MAX_LENGTH),
    })
  })

  it('rejects empty and whitespace without inventing a name', () => {
    for (const value of ['', '   ', null, undefined, 12]) {
      expect(nicknameForWrite(value)).toEqual({ ok: false, error: NICKNAME_REQUIRED_ERROR })
    }
  })

  it('rejects more than 15 characters and does not return a shorter name', () => {
    const parsed = nicknameForWrite(`  ${'A'.repeat(16)}  `)
    expect(parsed).toEqual({ ok: false, error: NICKNAME_TOO_LONG_ERROR })
    expect(parsed).not.toHaveProperty('nickname')
  })

  it('counts UTF-16 code units, the same way input maxLength does', () => {
    const emoji = '😊'
    expect(emoji).toHaveLength(2)
    expect(nicknameForWrite(emoji.repeat(7) + 'X')).toEqual({
      ok: true,
      nickname: emoji.repeat(7) + 'X',
    })
    expect(nicknameForWrite(emoji.repeat(8))).toEqual({ ok: false, error: NICKNAME_TOO_LONG_ERROR })
    expect(nicknameForWrite('José')).toEqual({ ok: true, nickname: 'José' })
  })
})

describe('profileNicknameUpdate', () => {
  it('leaves a long or missing stored nickname out of the patch', () => {
    const long = 'Christopher John'
    expect(long.length).toBeGreaterThan(NICKNAME_MAX_LENGTH)
    expect(profileNicknameUpdate(long, long)).toEqual({ error: null })
    expect(profileNicknameUpdate(`  ${long}  `, long)).toEqual({ error: null })
    expect(profileNicknameUpdate('', null)).toEqual({ error: null })
    expect(profileNicknameUpdate('   ', undefined)).toEqual({ error: null })
  })

  it('rejects clearing and an edit past 15, and does not include a nickname', () => {
    expect(profileNicknameUpdate('', 'Jun')).toEqual({ error: NICKNAME_REQUIRED_ERROR })
    expect(profileNicknameUpdate('   ', 'Jun')).toEqual({ error: NICKNAME_REQUIRED_ERROR })
    const tooLong = profileNicknameUpdate('A'.repeat(16), 'Jun')
    expect(tooLong).toEqual({ error: NICKNAME_TOO_LONG_ERROR })
    expect(tooLong).not.toHaveProperty('nickname')
    expect(profileNicknameUpdate('A'.repeat(16), 'A'.repeat(20))).toEqual({
      error: NICKNAME_TOO_LONG_ERROR,
    })
  })

  it('trims a changed nickname that fits', () => {
    expect(profileNicknameUpdate('  Chris  ', 'Jun')).toEqual({ nickname: 'Chris', error: null })
    expect(profileNicknameUpdate('Christopher', null)).toEqual({
      nickname: 'Christopher',
      error: null,
    })
  })
})
