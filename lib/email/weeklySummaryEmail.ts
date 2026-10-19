/**
 * Weekly summary copy and ledger math.
 * Amounts decide direction and the top category, then they are dropped.
 * Nothing rendered here may contain a peso amount, a percentage, or an amount digit sequence.
 */

import type { ManilaWeekWindow } from '@/lib/email/manilaWeek'
import { manilaDateInRange } from '@/lib/email/manilaWeek'
import type { CampaignLinkConfig } from '@/lib/email/campaignSender'
import { renderOperationalEmail } from '@/lib/email/transactionalLayout'
import type { CampaignMessage } from '@/lib/email/resend'
import {
  buildOneClickUnsubscribeUrl,
  buildUnsubscribePageUrl,
  createUnsubscribeToken,
} from '@/lib/email/unsubscribeToken'

export const WEEKLY_SUMMARY_SUBJECT = 'Your week in KlaroPH'
export const WEEKLY_SUMMARY_PREVIEW = 'A short recap of what you logged last week.'
export const WEEKLY_SUMMARY_CTA = 'See your week in KlaroPH'

const INTRO = 'Here is a quick look at last week.'
const FOOTER_REASON = "You're receiving this because you have a KlaroPH account."

export type SpendingDirection = 'higher' | 'lower' | 'same'

/** Safe to render. No amounts. */
export type WeeklySummaryFacts = {
  entryCount: number
  /** Null when the previous week had no expense entries — say nothing about higher or lower. */
  direction: SpendingDirection | null
  topCategory: string | null
}

export type LedgerEntry = {
  userId: string
  date: string
  kind: 'income' | 'expense'
  category?: string | null
  amount?: number | string | null
}

export type WeeklySummaryLinks = { dashboardUrl: string; unsubscribeUrl: string }

export type RenderedWeeklySummary = { subject: string; previewText: string; html: string; text: string }

export function weeklyDashboardUrl(appUrl: string): string {
  return `${appUrl}/dashboard`
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function toCentavos(amount: number): number {
  return Math.round(amount * 100)
}

/** Direction only. A previous week with zero expense rows is not comparable. */
export function spendingDirection(
  currentCentavos: number,
  previousCentavos: number,
  previousExpenseCount: number,
): SpendingDirection | null {
  if (previousExpenseCount === 0) return null
  if (currentCentavos > previousCentavos) return 'higher'
  if (currentCentavos < previousCentavos) return 'lower'
  return 'same'
}

function comparisonLine(direction: SpendingDirection): string {
  switch (direction) {
    case 'higher':
      return 'Spending was higher than the week before.'
    case 'lower':
      return 'Spending was lower than the week before.'
    case 'same':
      return 'Spending was about the same as the week before.'
    default: {
      const exhaustive: never = direction
      return exhaustive
    }
  }
}

function entryLine(count: number): string {
  return `You logged ${count} ${count === 1 ? 'entry' : 'entries'} this week.`
}

function categoryLine(category: string): string {
  return `Your top spending category was ${category}.`
}

function topCategory(expenses: readonly { category: string | null; amount: number }[]): string | null {
  const totals = new Map<string, number>()
  for (const expense of expenses) {
    const name = expense.category?.trim()
    if (!name) continue
    totals.set(name, (totals.get(name) ?? 0) + toCentavos(expense.amount))
  }
  let top: string | null = null
  let topValue: number | null = null
  for (const [name, value] of totals) {
    const earlier = top !== null && value === topValue && name.localeCompare(top, 'en') < 0
    if (topValue === null || value > topValue || earlier) {
      top = name
      topValue = value
    }
  }
  return top
}

/**
 * Covered-week income rows + expense rows. Returns null when both are zero
 * (previous-week rows alone do not count as activity).
 */
export function summarizeUserWeek(
  entries: readonly LedgerEntry[],
  userId: string,
  window: ManilaWeekWindow,
): WeeklySummaryFacts | null {
  let incomeCount = 0
  const coveredExpenses: { category: string | null; amount: number }[] = []
  let previousExpenseCount = 0
  let previousCentavos = 0
  let currentCentavos = 0

  for (const entry of entries) {
    if (entry.userId !== userId) continue
    switch (entry.kind) {
      case 'income':
        if (manilaDateInRange(entry.date, window.covered)) incomeCount += 1
        break
      case 'expense': {
        const amount = toNumber(entry.amount)
        if (manilaDateInRange(entry.date, window.covered)) {
          coveredExpenses.push({ category: entry.category ?? null, amount })
          currentCentavos += toCentavos(amount)
        } else if (manilaDateInRange(entry.date, window.previous)) {
          previousExpenseCount += 1
          previousCentavos += toCentavos(amount)
        }
        break
      }
      default: {
        const exhaustive: never = entry.kind
        throw new Error(exhaustive)
      }
    }
  }

  const entryCount = incomeCount + coveredExpenses.length
  if (entryCount === 0) return null
  return {
    entryCount,
    direction: spendingDirection(currentCentavos, previousCentavos, previousExpenseCount),
    topCategory: topCategory(coveredExpenses),
  }
}

export function partitionWeeklyActivity<T extends { userId: string }>(
  recipients: readonly T[],
  entries: readonly LedgerEntry[],
  window: ManilaWeekWindow,
): { skippedNoActivity: T[]; wouldSend: { recipient: T; facts: WeeklySummaryFacts }[] } {
  const skippedNoActivity: T[] = []
  const wouldSend: { recipient: T; facts: WeeklySummaryFacts }[] = []
  for (const recipient of recipients) {
    const facts = summarizeUserWeek(entries, recipient.userId, window)
    if (!facts) skippedNoActivity.push(recipient)
    else wouldSend.push({ recipient, facts })
  }
  return { skippedNoActivity, wouldSend }
}

function greeting(name: string | null): string {
  return name ? `Hi ${name},` : 'Hi there,'
}

export function renderWeeklySummaryEmail(input: {
  facts: WeeklySummaryFacts
  greetingName: string | null
  links: WeeklySummaryLinks
}): RenderedWeeklySummary {
  const paragraphs = [greeting(input.greetingName), INTRO, entryLine(input.facts.entryCount)]
  if (input.facts.direction) paragraphs.push(comparisonLine(input.facts.direction))
  if (input.facts.topCategory) paragraphs.push(categoryLine(input.facts.topCategory))

  const { html, text } = renderOperationalEmail({
    preheader: WEEKLY_SUMMARY_PREVIEW,
    label: 'Weekly summary',
    headline: WEEKLY_SUMMARY_SUBJECT,
    tone: 'attention',
    intro: paragraphs,
    sections: [],
    cta: { label: WEEKLY_SUMMARY_CTA, url: input.links.dashboardUrl },
    footerReason: FOOTER_REASON,
    unsubscribeUrl: input.links.unsubscribeUrl,
  })

  return { subject: WEEKLY_SUMMARY_SUBJECT, previewText: WEEKLY_SUMMARY_PREVIEW, html, text }
}

export function buildWeeklySummaryMessage(
  facts: WeeklySummaryFacts,
  recipient: { userId: string; email: string; greetingName: string | null },
  links: CampaignLinkConfig,
  campaignId: string,
): CampaignMessage {
  const token = createUnsubscribeToken(recipient.userId, links.unsubscribeSecret)
  const rendered = renderWeeklySummaryEmail({
    facts,
    greetingName: recipient.greetingName,
    links: {
      dashboardUrl: weeklyDashboardUrl(links.appUrl),
      unsubscribeUrl: buildUnsubscribePageUrl(links.appUrl, token),
    },
  })
  return {
    to: recipient.email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    headers: {
      'List-Unsubscribe': `<${buildOneClickUnsubscribeUrl(links.appUrl, token)}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    tags: [
      { name: 'category', value: 'marketing' },
      { name: 'campaign', value: campaignId },
    ],
  }
}
