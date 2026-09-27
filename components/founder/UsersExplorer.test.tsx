import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { FounderUser } from '@/lib/founder/userList'

vi.mock('@/app/admin/founder/users/actions', () => ({ grantComplimentaryProAction: vi.fn(), deleteUserAction: vi.fn() }))

const { default: UsersExplorer } = await import('./UsersExplorer')

const NOW = '2026-09-26T04:00:00Z'
const user = (over: Partial<FounderUser>): FounderUser => ({
  id: 'u',
  name: null,
  fullName: null,
  email: 'u@example.com',
  isTester: false,
  plan: 'free',
  planType: null,
  proEndsAt: null,
  signedUpAt: '2026-09-01T00:00:00Z',
  lastSignInAt: '2026-09-25T00:00:00Z',
  status: 'active',
  isNew: false,
  unsubscribed: false,
  ...over,
})
const users = [
  user({ id: 'pau-pro', name: 'Pau', fullName: 'Paulina Reyes', email: 'pau@example.com', plan: 'complimentary', proEndsAt: '2026-12-26T04:00:00Z' }),
  user({ id: 'pau-free', name: 'Paulo', email: 'paulo@example.com' }),
  user({ id: 'juan', name: 'Juan', email: 'juan@example.com', status: 'dormant', unsubscribed: true }),
  user({ id: 'tester', name: 'QA Pau', email: 'qa@example.com', isTester: true }),
]

const render = (initialFilter: 'all' | 'pro' | 'testers', initialQuery: string) =>
  renderToStaticMarkup(<UsersExplorer users={users} now={NOW} founderId="founder" initialFilter={initialFilter} initialQuery={initialQuery} />)
const emails = (html: string) => [...html.matchAll(/class="fd-user-email">([^<]+)</g)].map((m) => m[1])

describe('UsersExplorer', () => {
  it('renders a live search field, not a submit form', () => {
    const html = render('all', '')
    expect(html).toContain('placeholder="Search name or email…"')
    expect(html).not.toContain('<form')
    expect(html).not.toContain('type="submit"')
  })

  it('shows every real user for an empty search and filters rows by the typed text', () => {
    expect(emails(render('all', ''))).toEqual(['pau@example.com', 'paulo@example.com', 'juan@example.com'])
    expect(emails(render('all', 'pau'))).toEqual(['pau@example.com', 'paulo@example.com'])
    expect(emails(render('all', 'reyes'))).toEqual(['pau@example.com'])
  })

  it('composes search with the segment filter while keeping full-segment counts', () => {
    const html = render('pro', 'pau')
    expect(emails(html)).toEqual(['pau@example.com'])
    expect(html).toMatch(/aria-pressed="true"[^>]*>Pro<span class="fd-chip-count">1</)
    expect(html).toMatch(/>All<span class="fd-chip-count">3</)
    expect(html).toMatch(/>Testers<span class="fd-chip-count">1</)
    expect(emails(render('testers', 'pau'))).toEqual(['qa@example.com'])
  })

  it('uses semantic pills for status and product updates, plus one Manage action per row', () => {
    const html = render('all', 'juan')
    expect(html).toContain('<span class="fd-pill fd-pill-unknown">Dormant</span>')
    expect(html).toContain('<span class="fd-pill fd-pill-unknown">Unsubscribed</span>')
    expect(html.match(/>Manage</g)).toHaveLength(1)
  })

  it('shows an empty state when nothing matches', () => {
    expect(render('all', 'zzz')).toContain('No users match this view.')
  })
})
