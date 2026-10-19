import { describe, expect, it } from 'vitest'
import { renderOperationalEmail, type OperationalEmailContent, type OperationalTone } from './transactionalLayout'

const TONE_COLOR: Record<OperationalTone, string> = {
  attention: '#0038A8',
  positive: '#15803d',
  warning: '#b45309',
  neutral: '#64748b',
}

function render(tone: OperationalTone) {
  const content: OperationalEmailContent = {
    preheader: 'Preview',
    label: 'Status',
    headline: 'Headline',
    tone,
    intro: ['Hello'],
    sections: [],
    cta: { label: 'Open', url: 'https://klaroph.com/dashboard' },
    footerReason: 'Because you have an account.',
  }
  return renderOperationalEmail(content)
}

describe('operational email tone', () => {
  it('renders a neutral eyebrow and keeps attention, positive, and warning on their own colors', () => {
    for (const tone of ['attention', 'positive', 'warning', 'neutral'] as const) {
      expect(render(tone).html).toContain(`color:${TONE_COLOR[tone]};">Status`)
    }
    const neutral = render('neutral').html
    expect(neutral).not.toContain('color:#0038A8;">Status')
    expect(neutral).not.toContain('color:#15803d;">Status')
    expect(neutral).not.toContain('color:#b45309;">Status')
  })
})
