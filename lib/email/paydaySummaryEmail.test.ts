import { describe, expect, it } from 'vitest'
import { listMarketingCampaigns } from './campaigns'
import { manilaHalfMonth, paydayCampaignId } from './manilaHalfMonth'
import { verifyUnsubscribeToken } from './unsubscribeToken'
import {
  PAYDAY_SUMMARY_CTA,
  PAYDAY_SUMMARY_PREVIEW,
  PAYDAY_SUMMARY_SUBJECT,
  buildPaydaySummaryMessage,
  loggedDaysLine,
  partitionPaydayActivity,
  renderPaydaySummaryEmail,
  summarizePayday,
  paydayDashboardUrl,
  type LedgerEntry,
  type PaydaySummaryFacts,
} from './paydaySummaryEmail'

/** 08:00 Asia/Manila on Oct 15, 2026. Half a is Sep 30–Oct 14. */
const NOW = new Date('2026-10-15T00:00:00.000Z')
const WINDOW = manilaHalfMonth(NOW)!

const COVERED_AMOUNT = 975310864.12
const OUTSIDE_AMOUNT = 864201357.89
const BOUNDARY_AMOUNT = 135790246.75
const AMOUNT_DIGITS = ['975310864', '864201357', '135790246', '975,310,864', '864,201,357', '135,790,246']

const links = {
  appUrl: 'https://klaroph.com',
  unsubscribeSecret: 's'.repeat(40),
}

function expense(date: string, amount: number, category = 'Groceries', userId = 'u1'): LedgerEntry {
  return { userId, date, kind: 'expense', category, amount }
}

function renderFacts(facts: PaydaySummaryFacts, greetingName: string | null = 'Jun') {
  return renderPaydaySummaryEmail({
    facts,
    greetingName,
    links: {
      dashboardUrl: paydayDashboardUrl(links.appUrl),
      unsubscribeUrl: 'https://klaroph.com/unsubscribe?token=payday-token',
    },
  })
}

function surfaces(email: { subject: string; previewText: string; html: string; text: string }): string[] {
  return [email.subject, email.previewText, email.html, email.text]
}

describe('loggedDaysLine', () => {
  it('uses the singular day only when the window is one day', () => {
    expect(loggedDaysLine(1, 1)).toBe('You logged on 1 of 1 day.')
    expect(loggedDaysLine(1, 15)).toBe('You logged on 1 of 15 days.')
    expect(loggedDaysLine(8, 15)).toBe('You logged on 8 of 15 days.')
  })
})

describe('summarizePayday', () => {
  it('counts distinct dates across income and expenses, and ignores the surrounding days', () => {
    const facts = summarizePayday(
      [
        expense('2026-09-30', COVERED_AMOUNT, 'Groceries'),
        expense('2026-09-30', 20, 'Dining Out'),
        { userId: 'u1', date: '2026-09-30', kind: 'income' },
        { userId: 'u1', date: '2026-10-14', kind: 'income' },
        expense('2026-09-29', OUTSIDE_AMOUNT, 'Rent'),
        expense('2026-10-15', BOUNDARY_AMOUNT, 'Rent 15000'),
      ],
      'u1',
      WINDOW,
    )
    expect(facts).toEqual({ loggedDays: 2, windowDays: 15, topCategory: 'Groceries' })
  })

  it('breaks category ties alphabetically and ignores another user', () => {
    const facts = summarizePayday(
      [
        expense('2026-10-13', 100, 'Groceries'),
        expense('2026-10-14', 100, 'Dining Out'),
        expense('2026-10-14', 999, 'Rent', 'someone-else'),
      ],
      'u1',
      WINDOW,
    )
    expect(facts).toEqual({ loggedDays: 2, windowDays: 15, topCategory: 'Dining Out' })
  })

  it('drops a top category that is not one of the default names', () => {
    const facts = summarizePayday(
      [expense('2026-10-14', 15000, 'Rent 15000'), expense('2026-10-13', 10, 'Groceries')],
      'u1',
      WINDOW,
    )
    expect(facts?.topCategory).toBeNull()
    expect(facts?.loggedDays).toBe(2)
  })
})

describe('partitionPaydayActivity', () => {
  it('skips users with no income and no expenses in the covered half-month', () => {
    const plan = partitionPaydayActivity(
      [{ userId: 'quiet' }, { userId: 'income-only' }, { userId: 'expense-only' }],
      [
        { userId: 'income-only', date: '2026-10-13', kind: 'income' },
        expense('2026-10-13', 40, 'Groceries', 'expense-only'),
        expense('2026-10-15', BOUNDARY_AMOUNT, 'Rent', 'quiet'),
        expense('2026-09-29', OUTSIDE_AMOUNT, 'Rent', 'quiet'),
      ],
      WINDOW,
    )
    expect(plan.skippedNoActivity.map((recipient) => recipient.userId)).toEqual(['quiet'])
    expect(plan.wouldSend.map((item) => item.recipient.userId)).toEqual(['income-only', 'expense-only'])
  })
})

describe('renderPaydaySummaryEmail', () => {
  const facts: PaydaySummaryFacts = { loggedDays: 8, windowDays: 15, topCategory: 'Groceries' }

  it('uses the payday subject, preview, greeting, day count, and dashboard button', () => {
    const email = renderFacts(facts, 'Jun')
    expect(email.subject).toBe(PAYDAY_SUMMARY_SUBJECT)
    expect(email.subject).toBe('Your payday summary from KlaroPH')
    expect(email.previewText).toBe(PAYDAY_SUMMARY_PREVIEW)
    expect(email.previewText).toBe('A short recap of what you logged in your last pay period.')
    expect(email.text).toBe(
      [
        'PAYDAY SUMMARY',
        'Your payday summary from KlaroPH',
        '',
        'Hi Jun,',
        '',
        'Here is a quick look at your last pay period.',
        '',
        'You logged on 8 of 15 days.',
        '',
        'Your top spending category was Groceries.',
        '',
        'See your payday summary in KlaroPH: https://klaroph.com/dashboard',
        '',
        '— KlaroPH · Clearer money habits start here. · klaroph.com',
        "You're receiving this because you have a KlaroPH account.",
        'Unsubscribe: https://klaroph.com/unsubscribe?token=payday-token',
      ].join('\n'),
    )
    expect(email.html).toContain('Hi Jun,')
    expect(email.html).toContain(PAYDAY_SUMMARY_PREVIEW)
    expect(email.html).toContain(`>${PAYDAY_SUMMARY_CTA}</a>`)
    expect(email.html).toContain('href="https://klaroph.com/dashboard"')
    expect(email.html).toContain('Unsubscribe from KlaroPH updates')
    expect(email.html).toContain('alt="KlaroPH"')
    expect(email.html).toContain('color:#64748b;">Payday summary')
    expect(email.html).not.toContain('color:#0038A8;">Payday summary')
    expect(email.text).not.toMatch(/higher|lower|about the same|goal|tip/i)
    expect(email.text).not.toContain('%')
  })

  it('says 1 day when the window length is one', () => {
    expect(renderFacts({ loggedDays: 1, windowDays: 1, topCategory: null }).text).toContain('You logged on 1 of 1 day.')
  })

  it('falls back to a neutral greeting and escapes the name', () => {
    expect(renderFacts(facts, null).text).toContain('Hi there,')
    const email = renderFacts(facts, '<Jun>')
    expect(email.html).toContain('Hi &lt;Jun&gt;,')
    expect(email.html).not.toContain('<Jun>')
  })

  it('omits a top category that is not one of the default names, including one that contains an amount', () => {
    const email = renderFacts({ loggedDays: 2, windowDays: 15, topCategory: 'Rent 15000' })
    expect(email.text).not.toContain('top spending category')
    expect(email.text).not.toContain('Others')
    expect(email.text).toContain('You logged on 2 of 15 days.')
    for (const surface of surfaces(email)) expect(surface).not.toContain('15000')

    const named = summarizePayday([expense('2026-10-14', 40, 'Others (Needs)')], 'u1', WINDOW)
    expect(named?.topCategory).toBe('Others (Needs)')
    expect(renderFacts(named!).text).toContain('Your top spending category was Others (Needs).')
  })

  it('keeps peso amounts and percent signs out of the subject, preview, html, text, alt text, and links', () => {
    const factsFromLedger = summarizePayday(
      [
        expense('2026-10-14', COVERED_AMOUNT, 'Groceries'),
        expense('2026-10-13', 20, 'Dining Out'),
        { userId: 'u1', date: '2026-10-12', kind: 'income' },
        expense('2026-09-29', OUTSIDE_AMOUNT, 'Rent'),
        expense('2026-10-15', BOUNDARY_AMOUNT, 'Rent'),
      ],
      'u1',
      WINDOW,
    )
    expect(factsFromLedger).toEqual({ loggedDays: 3, windowDays: 15, topCategory: 'Groceries' })
    const email = renderFacts(factsFromLedger!)
    const joined = surfaces(email).join('\n')
    expect(joined).not.toMatch(/₱|peso|PHP/i)
    expect(`${email.subject}\n${email.previewText}\n${email.text}`).not.toContain('%')
    for (const digits of AMOUNT_DIGITS) expect(joined).not.toContain(digits)

    const hrefs = [...email.html.matchAll(/href="([^"]*)"/g)].map((match) => match[1])
    expect(hrefs).toContain('https://klaroph.com/dashboard')
    expect(hrefs).toContain('https://klaroph.com/unsubscribe?token=payday-token')
    for (const href of hrefs) {
      const url = new URL(href)
      expect(url.searchParams.has('amount')).toBe(false)
      if (url.pathname === '/dashboard') expect(url.search).toBe('')
      if (url.pathname === '/unsubscribe') expect([...url.searchParams.keys()]).toEqual(['token'])
      for (const digits of AMOUNT_DIGITS) expect(href).not.toContain(digits)
      expect(href).not.toMatch(/₱|peso/i)
    }
    for (const alt of email.html.match(/alt="[^"]*"/g) ?? []) {
      expect(alt).not.toMatch(/₱|\d|peso/i)
    }
    const textUrls = email.text.match(/https?:\/\/\S+/g) ?? []
    for (const raw of textUrls) {
      const url = new URL(raw)
      if (url.pathname === '/dashboard') expect(url.search).toBe('')
      if (url.pathname === '/unsubscribe') expect([...url.searchParams.keys()]).toEqual(['token'])
      for (const digits of AMOUNT_DIGITS) expect(raw).not.toContain(digits)
    }
  })
})

describe('buildPaydaySummaryMessage', () => {
  it('adds campaign unsubscribe headers and puts no amounts in either link', () => {
    const facts = summarizePayday([expense('2026-10-14', COVERED_AMOUNT), expense('2026-09-29', OUTSIDE_AMOUNT)], 'u1', WINDOW)!
    const message = buildPaydaySummaryMessage(
      facts,
      { userId: '0a9851e6-db5d-4fcf-8010-34cb6b0d02b3', email: 'jun@example.com', greetingName: 'Jun' },
      links,
      paydayCampaignId(WINDOW),
    )
    expect(message.subject).toBe('Your payday summary from KlaroPH')
    expect(message.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    expect(message.tags).toEqual([
      { name: 'category', value: 'marketing' },
      { name: 'campaign', value: 'half-2026-10-a' },
    ])

    const dashboard = message.html.match(/href="(https:\/\/klaroph\.com\/dashboard)"/)?.[1]
    expect(dashboard).toBe('https://klaroph.com/dashboard')
    expect(new URL(dashboard!).search).toBe('')

    const pageUrl = message.text.match(/Unsubscribe: (\S+)/)?.[1] ?? ''
    const oneClick = message.headers['List-Unsubscribe'].match(/^<(.+)>$/)?.[1] ?? ''
    for (const raw of [pageUrl, oneClick]) {
      const url = new URL(raw)
      expect([...url.searchParams.keys()]).toEqual(['token'])
      for (const digits of AMOUNT_DIGITS) expect(`${url.pathname}${url.search}`).not.toContain(digits)
      expect(raw).not.toMatch(/₱|amount=|peso/i)
    }
    expect(new URL(pageUrl).pathname).toBe('/unsubscribe')
    expect(new URL(oneClick).pathname).toBe('/api/email/unsubscribe')
    const token = decodeURIComponent(new URL(oneClick).searchParams.get('token') ?? '')
    expect(verifyUnsubscribeToken(token, links.unsubscribeSecret)).toBe('0a9851e6-db5d-4fcf-8010-34cb6b0d02b3')
    expect(listMarketingCampaigns().some((campaign) => campaign.id === 'half-2026-10-a')).toBe(false)
  })
})
