import { describe, expect, it } from 'vitest'
import { renderComplimentaryProEmail } from './complimentaryProTemplate'

describe('renderComplimentaryProEmail', () => {
  it('greets by first name, states the real end date and links back to KlaroPH', () => {
    const { subject, html, text } = renderComplimentaryProEmail({ firstName: 'Juan', validUntil: 'December 26, 2026' })
    expect(subject).toContain('KlaroPH Pro')
    expect(text).toContain('Hi Juan,')
    expect(text).toContain('complimentary access to KlaroPH Pro')
    expect(text).toContain('active until December 26, 2026')
    expect(html).toContain('https://klaroph.com/dashboard')
    expect(html).toContain('logo-klaroph-blue.png')
  })

  it('never claims lifetime access, and carries no marketing unsubscribe link or founder details', () => {
    const { html, text } = renderComplimentaryProEmail({ firstName: null, validUntil: 'December 26, 2026' })
    expect(text).toContain('Hi there,')
    for (const body of [html, text]) {
      expect(body).not.toMatch(/lifetime/i)
      expect(body).not.toMatch(/unsubscribe/i)
      expect(body).not.toMatch(/founder|admin/i)
    }
  })

  it('escapes names in HTML', () => {
    expect(renderComplimentaryProEmail({ firstName: '<b>Jo</b>', validUntil: 'x' }).html).toContain('Hi &lt;b&gt;Jo&lt;/b&gt;,')
  })
})
