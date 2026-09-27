import { describe, expect, it } from 'vitest'
import { renderSupportReplyEmail } from './supportReplyTemplate'

describe('renderSupportReplyEmail', () => {
  const email = renderSupportReplyEmail({
    firstName: 'Maria',
    reply: 'Fixed <b>now</b>.\n\nThanks!',
    originalSubject: 'Payment issue',
    originalMessage: 'I was charged <script>x</script>',
    submittedOn: 'Sep 20, 2026',
  })

  it('is a branded KlaroPH support reply that includes the original request', () => {
    expect(email.subject).toBe('Re: Payment issue')
    expect(email.html).toContain('KlaroPH Support')
    expect(email.html).toContain('Hi Maria,')
    expect(email.text).toContain('Fixed <b>now</b>.')
    expect(email.text).toContain('I was charged')
  })

  it('escapes founder and user text in HTML', () => {
    expect(email.html).toContain('Fixed &lt;b&gt;now&lt;/b&gt;.')
    expect(email.html).not.toContain('<script>')
  })

  it('is transactional: no unsubscribe link or campaign tracking', () => {
    expect(email.html.toLowerCase()).not.toContain('unsubscribe')
    expect(email.text.toLowerCase()).not.toContain('unsubscribe')
  })

  it('uses a generic subject when the request had none', () => {
    expect(renderSupportReplyEmail({ firstName: null, reply: 'Hi', originalSubject: null, originalMessage: 'Help', submittedOn: 'Sep 1, 2026' }).subject).toBe(
      'Re: Your KlaroPH support request'
    )
  })
})
