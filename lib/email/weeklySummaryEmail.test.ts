import { describe, expect, it } from 'vitest'
import { listMarketingCampaigns } from './campaigns'
import { manilaWeekWindow, weeklyCampaignId } from './manilaWeek'
import { verifyUnsubscribeToken } from './unsubscribeToken'
import {
  WEEKLY_SUMMARY_CTA,
  WEEKLY_SUMMARY_PREVIEW,
  WEEKLY_SUMMARY_SUBJECT,
  buildWeeklySummaryMessage,
  partitionWeeklyActivity,
  renderWeeklySummaryEmail,
  spendingDirection,
  summarizeUserWeek,
  weeklyDashboardUrl,
  type LedgerEntry,
  type WeeklySummaryFacts,
} from './weeklySummaryEmail'

/** Monday 08:00 Asia/Manila on Oct 19, 2026. Covered week is Oct 12–18. */
const NOW = new Date('2026-10-19T00:00:00.000Z')
const WINDOW = manilaWeekWindow(NOW)

const COVERED_AMOUNT = 975310864.12
const PREVIOUS_AMOUNT = 864201357.89
const MONDAY_AMOUNT = 135790246.75
const AMOUNT_DIGITS = ['975310864', '864201357', '135790246', '975,310,864', '864,201,357', '135,790,246']

const links = {
  appUrl: 'https://klaroph.com',
  unsubscribeSecret: 's'.repeat(40),
}

function expense(date: string, amount: number, category = 'Groceries', userId = 'u1'): LedgerEntry {
  return { userId, date, kind: 'expense', category, amount }
}

function renderFacts(facts: WeeklySummaryFacts, greetingName: string | null = 'Jun') {
  return renderWeeklySummaryEmail({
    facts,
    greetingName,
    links: {
      dashboardUrl: weeklyDashboardUrl(links.appUrl),
      unsubscribeUrl: 'https://klaroph.com/unsubscribe?token=weekly-token',
    },
  })
}

function surfaces(email: { subject: string; previewText: string; html: string; text: string }): string[] {
  return [email.subject, email.previewText, email.html, email.text]
}

describe('spendingDirection', () => {
  it('says higher, lower, or about the same from the totals alone', () => {
    expect(spendingDirection(200, 100, 1)).toBe('higher')
    expect(spendingDirection(100, 200, 1)).toBe('lower')
    expect(spendingDirection(100, 100, 2)).toBe('same')
  })

  it('does not compare when the previous week had no expense entries', () => {
    expect(spendingDirection(86420135789, 0, 0)).toBeNull()
    expect(spendingDirection(0, 0, 0)).toBeNull()
  })
})

describe('summarizeUserWeek', () => {
  it('counts a Sunday Manila entry and excludes the following Monday', () => {
    const facts = summarizeUserWeek(
      [expense('2026-10-18', COVERED_AMOUNT, 'Food'), expense('2026-10-19', MONDAY_AMOUNT, 'Rent')],
      'u1',
      WINDOW,
    )
    expect(facts).toEqual({ entryCount: 1, direction: null, topCategory: 'Food' })
  })

  it('counts Sunday income and ignores income dated the following Monday', () => {
    const facts = summarizeUserWeek(
      [
        { userId: 'u1', date: '2026-10-18', kind: 'income' },
        { userId: 'u1', date: '2026-10-19', kind: 'income' },
      ],
      'u1',
      WINDOW,
    )
    expect(facts).toEqual({ entryCount: 1, direction: null, topCategory: null })
  })

  it('compares covered spending with the previous week and hides the amounts', () => {
    const higher = summarizeUserWeek(
      [expense('2026-10-14', COVERED_AMOUNT), expense('2026-10-07', PREVIOUS_AMOUNT)],
      'u1',
      WINDOW,
    )
    const lower = summarizeUserWeek(
      [expense('2026-10-14', PREVIOUS_AMOUNT), expense('2026-10-07', COVERED_AMOUNT)],
      'u1',
      WINDOW,
    )
    const same = summarizeUserWeek(
      [expense('2026-10-14', COVERED_AMOUNT), expense('2026-10-07', COVERED_AMOUNT, 'Transport')],
      'u1',
      WINDOW,
    )
    expect(higher).toMatchObject({ entryCount: 1, direction: 'higher', topCategory: 'Groceries' })
    expect(lower).toMatchObject({ direction: 'lower' })
    expect(same).toMatchObject({ direction: 'same', topCategory: 'Groceries' })
    expect(JSON.stringify({ higher, lower, same })).not.toContain('864201357')
  })

  it('breaks category ties alphabetically and ignores another user', () => {
    const facts = summarizeUserWeek(
      [
        expense('2026-10-14', 100, 'Transport'),
        expense('2026-10-15', 100, 'Bills'),
        expense('2026-10-14', 999, 'Rent', 'someone-else'),
      ],
      'u1',
      WINDOW,
    )
    expect(facts?.topCategory).toBe('Bills')
    expect(facts?.entryCount).toBe(2)
  })

  it('skips a previous week with zero expense entries instead of calling spending higher', () => {
    const facts = summarizeUserWeek([expense('2026-10-14', COVERED_AMOUNT, 'Food')], 'u1', WINDOW)
    expect(facts?.direction).toBeNull()
    const email = renderFacts(facts!)
    for (const surface of surfaces(email)) {
      expect(surface).not.toMatch(/higher|lower|about the same/i)
    }
    expect(email.text).toContain('You logged 1 entry this week.')
    expect(email.text).toContain('Your top spending category was Food.')
  })
})

describe('partitionWeeklyActivity', () => {
  it('skips users with zero income and zero expenses in the covered week', () => {
    const plan = partitionWeeklyActivity(
      [{ userId: 'quiet' }, { userId: 'income-only' }, { userId: 'expense-only' }],
      [
        { userId: 'income-only', date: '2026-10-13', kind: 'income' },
        expense('2026-10-13', 40, 'Food', 'expense-only'),
        expense('2026-10-19', MONDAY_AMOUNT, 'Rent', 'quiet'),
        expense('2026-10-06', PREVIOUS_AMOUNT, 'Rent', 'quiet'),
      ],
      WINDOW,
    )
    expect(plan.skippedNoActivity.map((recipient) => recipient.userId)).toEqual(['quiet'])
    expect(plan.wouldSend.map((item) => item.recipient.userId)).toEqual(['income-only', 'expense-only'])
  })
})

describe('renderWeeklySummaryEmail', () => {
  const facts: WeeklySummaryFacts = { entryCount: 3, direction: 'higher', topCategory: 'Groceries' }

  it('uses the neutral subject, preview, greeting, and dashboard button', () => {
    const email = renderFacts(facts, 'Jun')
    expect(email.subject).toBe(WEEKLY_SUMMARY_SUBJECT)
    expect(email.subject).toBe('Your week in KlaroPH')
    expect(email.previewText).toBe(WEEKLY_SUMMARY_PREVIEW)
    expect(email.previewText).toBe('A short recap of what you logged last week.')
    expect(email.text).toBe(
      [
        'WEEKLY SUMMARY',
        'Your week in KlaroPH',
        '',
        'Hi Jun,',
        '',
        'Here is a quick look at last week.',
        '',
        'You logged 3 entries this week.',
        '',
        'Spending was higher than the week before.',
        '',
        'Your top spending category was Groceries.',
        '',
        'See your week in KlaroPH: https://klaroph.com/dashboard',
        '',
        '— KlaroPH · Clearer money habits start here. · klaroph.com',
        "You're receiving this because you have a KlaroPH account.",
        'Unsubscribe: https://klaroph.com/unsubscribe?token=weekly-token',
      ].join('\n'),
    )
    expect(email.html).toContain('Hi Jun,')
    expect(email.html).toContain(WEEKLY_SUMMARY_PREVIEW)
    expect(email.html).toContain(`>${WEEKLY_SUMMARY_CTA}</a>`)
    expect(email.html).toContain('href="https://klaroph.com/dashboard"')
    expect(email.html).toContain('Unsubscribe from KlaroPH updates')
    expect(email.html).toContain('alt="KlaroPH"')
  })

  it('falls back to a neutral greeting and escapes the name and category', () => {
    expect(renderFacts(facts, null).text).toContain('Hi there,')
    const email = renderFacts({ ...facts, topCategory: '<Food>' }, '<Jun>')
    expect(email.html).toContain('Hi &lt;Jun&gt;,')
    expect(email.html).toContain('&lt;Food&gt;')
    expect(email.html).not.toContain('<Jun>')
    expect(email.html).not.toContain('<Food>')
  })

  it('keeps peso amounts out of the subject, preview, html, text, alt text, and links', () => {
    const factsFromLedger = summarizeUserWeek(
      [
        expense('2026-10-14', COVERED_AMOUNT, 'Groceries'),
        expense('2026-10-15', 20, 'Transport'),
        { userId: 'u1', date: '2026-10-16', kind: 'income' },
        expense('2026-10-07', PREVIOUS_AMOUNT, 'Rent'),
        expense('2026-10-19', MONDAY_AMOUNT, 'Rent'),
      ],
      'u1',
      WINDOW,
    )
    expect(factsFromLedger).toMatchObject({ entryCount: 3, direction: 'higher', topCategory: 'Groceries' })
    const email = renderFacts(factsFromLedger!)
    const joined = surfaces(email).join('\n')
    expect(joined).not.toMatch(/₱|peso|PHP/i)
    expect(`${email.subject}\n${email.previewText}\n${email.text}`).not.toContain('%')
    for (const digits of AMOUNT_DIGITS) expect(joined).not.toContain(digits)

    const hrefs = [...email.html.matchAll(/href="([^"]*)"/g)].map((match) => match[1])
    expect(hrefs).toContain('https://klaroph.com/dashboard')
    expect(hrefs).toContain('https://klaroph.com/unsubscribe?token=weekly-token')
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

describe('buildWeeklySummaryMessage', () => {
  it('adds campaign unsubscribe headers and puts no amounts in either link', () => {
    const facts = summarizeUserWeek(
      [expense('2026-10-14', COVERED_AMOUNT), expense('2026-10-07', PREVIOUS_AMOUNT)],
      'u1',
      WINDOW,
    )!
    const message = buildWeeklySummaryMessage(
      facts,
      { userId: '0a9851e6-db5d-4fcf-8010-34cb6b0d02b3', email: 'jun@example.com', greetingName: 'Jun' },
      links,
      weeklyCampaignId(WINDOW),
    )
    expect(message.subject).toBe('Your week in KlaroPH')
    expect(message.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    expect(message.tags).toEqual([
      { name: 'category', value: 'marketing' },
      { name: 'campaign', value: 'week-2026-10-12' },
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
    expect(listMarketingCampaigns().some((campaign) => campaign.id === 'week-2026-10-12')).toBe(false)
  })
})
