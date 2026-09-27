import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const html = readFileSync(
  path.resolve(__dirname, '..', '..', 'supabase', 'email-templates', 'confirm-signup.html'),
  'utf8'
)

describe('Supabase confirm-signup template', () => {
  it('links the CTA and the fallback to the Supabase confirmation URL', () => {
    expect(html.match(/href="\{\{ \.ConfirmationURL \}\}"/g)).toHaveLength(2)
    expect(html).toContain('>{{ .ConfirmationURL }}</a>')
    expect(html).toContain('Copy and paste this link')
  })

  it('uses the KlaroPH V2 transactional look', () => {
    expect(html).toContain('background-color:#eef5ff')
    expect(html).toContain('background-color:#FCD116')
    expect(html).toContain('https://klaroph.com/logo-klaroph-blue.png')
    expect(html).toContain('Confirm your email</h1>')
    expect(html).toContain('name="viewport"')
  })

  it('stays transactional', () => {
    expect(html).not.toMatch(/unsubscribe|utm_|upgrade|Pro plan/i)
  })
})
