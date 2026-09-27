import { describe, expect, it } from 'vitest'
import { trapTarget } from './useDialogFocus'

const MODAL = [
  'close',
  'signup-email',
  'signup-password',
  'signup-confirm',
  'terms-checkbox',
  'privacy-link',
  'terms-link',
  'submit',
] as const

/** One TAB press: the trap's wrap target, otherwise the browser's native next/previous element. */
function press(items: readonly string[], active: string | null, shift = false): string {
  const wrapped = trapTarget(items, active, shift)
  if (wrapped) return wrapped
  const i = items.indexOf(active!)
  return items[shift ? i - 1 : i + 1]
}

describe('trapTarget', () => {
  it('leaves focus movement to the browser inside the dialog', () => {
    expect(trapTarget(MODAL, 'signup-email', false)).toBeNull()
    expect(trapTarget(MODAL, 'signup-password', true)).toBeNull()
  })

  it('wraps TAB from the last element to the first', () => {
    expect(trapTarget(MODAL, 'submit', false)).toBe('close')
  })

  it('wraps SHIFT+TAB from the first element to the last', () => {
    expect(trapTarget(MODAL, 'close', true)).toBe('submit')
  })

  it('pulls focus that escaped the dialog back in', () => {
    expect(trapTarget(MODAL, null, false)).toBe('close')
    expect(trapTarget(MODAL, null, true)).toBe('submit')
    expect(trapTarget(MODAL, 'landing-page-button' as never, false)).toBe('close')
  })

  it('returns null when nothing is focusable', () => {
    expect(trapTarget([], null, false)).toBeNull()
  })

  it('cycles TAB through the Create Account modal in DOM order without leaving it', () => {
    const visited: string[] = []
    let active = 'signup-email'
    for (let i = 0; i < MODAL.length; i++) {
      active = press(MODAL, active)
      visited.push(active)
    }
    expect(visited).toEqual([
      'signup-password',
      'signup-confirm',
      'terms-checkbox',
      'privacy-link',
      'terms-link',
      'submit',
      'close',
      'signup-email',
    ])
  })

  it('cycles SHIFT+TAB in exact reverse', () => {
    const visited: string[] = []
    let active = 'signup-email'
    for (let i = 0; i < MODAL.length; i++) {
      active = press(MODAL, active, true)
      visited.push(active)
    }
    expect(visited).toEqual([
      'close',
      'submit',
      'terms-link',
      'privacy-link',
      'terms-checkbox',
      'signup-confirm',
      'signup-password',
      'signup-email',
    ])
  })
})
