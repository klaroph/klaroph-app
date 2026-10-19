import { describe, expect, it } from 'vitest'
import { displayName } from './displayName'

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
