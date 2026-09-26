import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { EmailPreferencesCard } from './EmailPreferencesSection'

const render = (productUpdates: boolean, error: string | null = null) =>
  renderToStaticMarkup(
    <EmailPreferencesCard productUpdates={productUpdates} saving={false} error={error} onToggle={() => {}} />
  )

describe('EmailPreferencesCard', () => {
  it('renders subscribed as an on switch', () => {
    const html = render(true)
    expect(html).toContain('role="switch"')
    expect(html).toContain('aria-checked="true"')
    expect(html).toContain('Product updates')
    expect(html).toContain('You can change this anytime.')
  })

  it('renders unsubscribed as an off switch', () => {
    expect(render(false)).toContain('aria-checked="false"')
  })

  it('shows save errors in place of the helper text', () => {
    const html = render(true, 'Could not save your preference. Please try again.')
    expect(html).toContain('Could not save your preference.')
    expect(html).not.toContain('You can change this anytime.')
  })
})
