import { readFileSync } from 'fs'
import path from 'path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import PasswordInput from './PasswordInput'

const FOCUSABLE_TAG = /<(input|button|a|select|textarea)\b[^>]*>/g

/** Keyboard TAB order of static markup: focusable elements in DOM order, minus tabindex="-1" and disabled. */
function tabSequence(html: string): string[] {
  return [...html.matchAll(FOCUSABLE_TAG)]
    .map((m) => m[0])
    .filter((tag) => !/tabindex="-1"/.test(tag) && !/\sdisabled=""/.test(tag))
    .filter((tag) => !tag.startsWith('<a') || /\shref=/.test(tag))
    .map((tag) => tag.match(/\sid="([^"]+)"/)?.[1] ?? tag.match(/^<(\w+)/)![1])
}

const source = (file: string) => readFileSync(path.resolve(__dirname, '..', '..', file), 'utf8')

function focusablesBetween(src: string, from: string, to: string): string[] {
  const start = src.indexOf(from)
  const end = src.indexOf(to, start)
  expect(start, `${from} present`).toBeGreaterThan(-1)
  expect(end, `${to} follows ${from}`).toBeGreaterThan(start)
  const slice = src.slice(start + from.length, src.lastIndexOf('<', end))
  return [...slice.matchAll(/<(input|button|a|select|textarea|PasswordInput)\b/g)].map((m) => m[1])
}

describe('PasswordInput', () => {
  const html = renderToStaticMarkup(<PasswordInput id="pw" value="" onChange={() => {}} />)

  it('renders a masked password input followed by the toggle', () => {
    expect(html).toMatch(/<input[^>]*type="password"[^>]*id="pw"|<input[^>]*id="pw"[^>]*type="password"/)
    expect(html.indexOf('<input')).toBeLessThan(html.indexOf('<button'))
  })

  it('keeps the visibility toggle out of the TAB sequence without disabling it', () => {
    const button = html.match(/<button[^>]*>/)![0]
    expect(button).toContain('tabindex="-1"')
    expect(button).toContain('type="button"')
    expect(button).not.toContain('disabled')
  })

  it('labels the toggle for assistive tech', () => {
    const button = html.match(/<button[^>]*>/)![0]
    expect(button).toContain('aria-label="Show password"')
    expect(button).toContain('aria-pressed="false"')
  })

  it('moves Email → Password → Confirm → Submit in a form', () => {
    const form = renderToStaticMarkup(
      <form>
        <input id="email" type="email" />
        <PasswordInput id="password" />
        <PasswordInput id="confirm" />
        <button id="submit" type="submit">Create</button>
      </form>
    )
    expect(tabSequence(form)).toEqual(['email', 'password', 'confirm', 'submit'])
  })
})

describe('auth form tab order (source)', () => {
  const signUp = source('components/auth/SignUpModal.tsx')
  const landing = source('components/landing/LandingPageClient.tsx')

  it('uses no positive tabIndex values', () => {
    for (const src of [signUp, landing, source('components/auth/PasswordInput.tsx')]) {
      expect(src).not.toMatch(/tabIndex=\{\s*[1-9]/)
    }
  })

  it('Create Account: Email → Password → Confirm with nothing in between', () => {
    expect(focusablesBetween(signUp, 'id="signup-email"', 'id="signup-password"')).toEqual([])
    expect(focusablesBetween(signUp, 'id="signup-password"', 'id="signup-confirm"')).toEqual([])
  })

  it('Create Account: only the required terms consent sits between Confirm and submit', () => {
    expect(focusablesBetween(signUp, 'id="signup-confirm"', 'type="submit"')).toEqual(['input', 'a', 'a'])
    expect(signUp).toMatch(/type="checkbox"/)
  })

  it('Sign In: Email → Password → Sign in, with Forgot password after the submit button', () => {
    expect(focusablesBetween(landing, 'id="login-email"', 'id="login-password"')).toEqual([])
    expect(focusablesBetween(landing, 'id="login-password"', 'type="submit"')).toEqual([])
    expect(landing.indexOf('type="submit"')).toBeLessThan(landing.indexOf('Forgot password?'))
  })
})
